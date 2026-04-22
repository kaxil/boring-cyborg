// Associations that mean the author has already contributed to this repo
// (merged commits) or is otherwise an established collaborator. Anyone in
// this set is never a first-time contributor for our purposes.
//
// CONTRIBUTOR is deliberately omitted: on the `pull_request.closed` event
// with merged=true, GitHub may already reflect the post-merge state, so a
// genuine first-time merger can show up as CONTRIBUTOR. For that event we
// rely on the commit-history check below instead of a fast-path skip.
const ROLE_BASED_NON_FIRST_TIME = new Set([
  'MEMBER',
  'OWNER',
  'COLLABORATOR'
])

/**
 * Check whether `user` looks like a bot or deleted-user account that should
 * never receive a first-time-contributor greeting.
 */
function isIneligibleUser (user) {
  if (!user || !user.login) return true
  if (user.type === 'Bot') return true
  if (user.login === 'ghost') return true
  return false
}

/**
 * Return true if the author has at least one commit on `targetRef` that is
 * not part of the given exclude set. Uses the repo commits endpoint rather
 * than the Issues Search index because search returns severely truncated
 * results for very large repos (e.g. apache/airflow).
 */
async function hasPriorCommits (context, author, targetRef, excludeShas) {
  const exclude = excludeShas || new Set()
  // GitHub caps per_page at 100 for the commits endpoint. If the exclude set
  // is larger (huge merge-commit PRs), we'll miss prior commits older than
  // the 100 most recent — accepted trade-off; those users are almost always
  // caught by the author_association fast-path anyway.
  const perPage = Math.min(100, exclude.size + 1)
  const params = { ...context.repo(), author, per_page: perPage }
  // omit sha → listCommits defaults to the repo's default branch
  if (targetRef) params.sha = targetRef
  const { data } = await context.octokit.repos.listCommits(params)
  return data.some(c => !exclude.has(c.sha))
}

/**
 * Return true if the author has any prior item of the requested kind in this
 * repo besides `excludeNumber`. `kind` is 'pr' or 'issue'.
 *
 * Uses `issues.listForRepo` (direct-from-DB, unlike the search index which
 * is truncated for very large repos) and filters client-side since the
 * endpoint mixes issues and PRs. Sorts by `created ASC` so we inspect the
 * user's *oldest* activity first — catches a single stale prior item even
 * when the user has opened many items of the opposite kind. Walks up to
 * `MAX_PAGES` pages of 100 to handle users with long histories mostly of
 * the opposite kind.
 */
const KIND_CHECK_MAX_PAGES = 3
async function hasPriorOfKind (context, author, excludeNumber, kind) {
  for (let page = 1; page <= KIND_CHECK_MAX_PAGES; page++) {
    const { data } = await context.octokit.issues.listForRepo({
      ...context.repo(),
      state: 'all',
      creator: author,
      sort: 'created',
      direction: 'asc',
      per_page: 100,
      page
    })
    if (data.length === 0) return false
    const match = data.some(item => {
      if (item.number === excludeNumber) return false
      const itemIsPr = item.pull_request != null
      return kind === 'pr' ? itemIsPr : !itemIsPr
    })
    if (match) return true
    if (data.length < 100) return false
  }
  return false
}

/**
 * Collect the SHAs introduced by this PR so we can exclude them from the
 * author's commit history. Covers `merge_commit_sha` plus every commit in
 * the PR (which lands on the base for merge-commit merges). Squash-merge
 * rewrites into a single sha that matches `merge_commit_sha`, so the PR's
 * original commits aren't on the base branch and the extra shas are
 * harmless. Rebase-merge rewrites into new shas; this function therefore
 * can't cover every rebase case, but it handles squash and merge-commit
 * (the two strategies almost every repo uses).
 */
async function collectPrShas (context, pr) {
  const shas = new Set()
  if (pr.merge_commit_sha) shas.add(pr.merge_commit_sha)
  try {
    const commits = await context.octokit.paginate(
      context.octokit.pulls.listCommits,
      { ...context.repo(), pull_number: pr.number, per_page: 100 }
    )
    commits.forEach(c => shas.add(c.sha))
  } catch (err) {
    context.log.warn(`Could not list PR commits for #${pr.number}: ${err.message}`)
  }
  return shas
}

/**
 * Add a comment to welcome users when they open their first PR
 * @param {import('probot').Context} context
 * @param {import('probot').Context.config} config
 */
async function commentOnfirstPR (context, config) {
  const configKey = 'firstPRWelcomeComment'
  if (!(configKey in config)) return

  const pr = context.payload.pull_request
  if (isIneligibleUser(pr.user)) return
  // Pre-merge, CONTRIBUTOR reliably means prior merged commits, so treat it
  // as a fast-path skip here.
  if (ROLE_BASED_NON_FIRST_TIME.has(pr.author_association) ||
      pr.author_association === 'CONTRIBUTOR') {
    context.log.info(`Skipping first-PR comment: ${pr.user.login} is ${pr.author_association}`)
    return
  }

  if (await hasPriorCommits(context, pr.user.login, pr.base.ref)) {
    context.log.info(`Skipping first-PR comment: ${pr.user.login} has prior commits`)
    return
  }
  // Also catch users whose prior PRs were closed without merging (no commits
  // but not first-time).
  if (await hasPriorOfKind(context, pr.user.login, pr.number, 'pr')) {
    context.log.info(`Skipping first-PR comment: ${pr.user.login} has prior PRs`)
    return
  }

  try {
    const body = config[configKey]
    context.log.info(`Adding comment on ${pr.html_url}: ${body}`)
    await context.octokit.issues.createComment(context.issue({ body }))
  } catch (err) {
    if (err.status !== 404) {
      throw err
    }
  }
}

/**
 * Add a comment to congratulate Author when their first PR is merged
 * @param {import('probot').Context} context
 * @param {import('probot').Context.config} config
 */
async function commentOnfirstPRMerge (context, config) {
  const configKey = 'firstPRMergeComment'
  const pr = context.payload.pull_request
  if (!pr.merged) return
  if (!(configKey in config)) return
  const body = config[configKey]
  if (!body) return

  if (isIneligibleUser(pr.user)) return
  if (ROLE_BASED_NON_FIRST_TIME.has(pr.author_association)) {
    context.log.info(`Skipping first-merge comment: ${pr.user.login} is ${pr.author_association}`)
    return
  }

  const excludeShas = await collectPrShas(context, pr)
  // Check the default branch, not pr.base.ref, so prior merges to ANY
  // base branch count — matches the old repo-wide `is:pr is:merged`
  // semantics. Narrow edge case: a user whose only prior merges were to
  // non-default branches and is now opening a default-branch PR will be
  // welcomed as first-time; accepted.
  if (await hasPriorCommits(context, pr.user.login, undefined, excludeShas)) {
    context.log.info(`Skipping first-merge comment: ${pr.user.login} has prior commits`)
    return
  }

  try {
    context.log.info(`Adding comment on ${pr.html_url}: ${body}`)
    await context.octokit.issues.createComment(context.issue({ body }))
  } catch (err) {
    if (err.status !== 404) {
      throw err
    }
  }
}

/**
 * Add a comment to welcome users when they open their first Issue
 * @param {import('probot').Context} context
 * @param {import('probot').Context.config} config
 */
async function commentOnfirstIssue (context, config) {
  const configKey = 'firstIssueWelcomeComment'
  if (!(configKey in config)) return

  const issue = context.payload.issue
  if (isIneligibleUser(issue.user)) return
  if (ROLE_BASED_NON_FIRST_TIME.has(issue.author_association) ||
      issue.author_association === 'CONTRIBUTOR') {
    context.log.info(`Skipping first-issue comment: ${issue.user.login} is ${issue.author_association}`)
    return
  }

  if (await hasPriorCommits(context, issue.user.login)) {
    context.log.info(`Skipping first-issue comment: ${issue.user.login} has prior commits`)
    return
  }
  if (await hasPriorOfKind(context, issue.user.login, issue.number, 'issue')) {
    context.log.info(`Skipping first-issue comment: ${issue.user.login} has prior issues`)
    return
  }

  try {
    const body = config[configKey]
    context.log.info(`Adding comment on ${issue.html_url}: ${body}`)
    await context.octokit.issues.createComment(context.issue({ body }))
  } catch (err) {
    if (err.status !== 404) {
      throw err
    }
  }
}

module.exports = {
  commentOnfirstPR,
  commentOnfirstPRMerge,
  commentOnfirstIssue
}
