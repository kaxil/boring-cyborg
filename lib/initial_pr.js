const INITIAL_PR_BRANCH = 'boring-cyborg-initial-setup'

const CONFIG_FLAG = 'boringCyborgAsRecognisedContributor'

/**
 * Sleep for the specified number of milliseconds
 * @param {number} ms
 */
function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Wait for a fork to be ready by polling the repo endpoint
 * @param {import('@octokit/rest').Octokit} octokit
 * @param {string} owner
 * @param {string} repo
 * @param {object} log
 * @param {number} maxAttempts
 */
async function waitForFork (octokit, owner, repo, log, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await octokit.rest.repos.get({ owner, repo })
      log.info(`Fork ${owner}/${repo} is ready`)
      return
    } catch (e) {
      log.info(`Waiting for fork to be ready (attempt ${i + 1}/${maxAttempts})...`)
      await sleep(3000)
    }
  }
  throw new Error(`Fork ${owner}/${repo} was not ready after ${maxAttempts} attempts`)
}

/**
 * Check if boring-cyborg[bot] already has an open or merged PR in the repo
 * @param {import('@octokit/rest').Octokit} octokit
 * @param {string} owner
 * @param {string} repo
 * @param {object} log
 * @returns {boolean}
 */
async function hasExistingPR (octokit, owner, repo, log) {
  try {
    const searchResult = await octokit.rest.search.issuesAndPullRequests({
      q: `is:pr repo:${owner}/${repo} author:app/boring-cyborg`,
      per_page: 1
    })
    const count = searchResult.data.total_count
    log.info(`Found ${count} existing PRs from boring-cyborg in ${owner}/${repo}`)
    return count > 0
  } catch (e) {
    log.warn(`Failed to search for existing PRs: ${e.message}`)
    return false
  }
}

/**
 * Create an initial PR from a fork to establish boring-cyborg as a contributor.
 * Once merged, boring-cyborg's workflow runs will no longer require manual approval.
 *
 * This works by forking the repo (no contents:write needed on the target), pushing
 * a small config change to the fork, and opening a cross-fork PR.
 *
 * The PR is created when the config does not contain the
 * `boringCyborgAsRecognisedContributor: true` flag, indicating boring-cyborg
 * has not yet been established as a contributor via this mechanism.
 *
 * @param {import('@octokit/rest').Octokit} octokit
 * @param {string} owner
 * @param {string} repo
 * @param {string} defaultBranch
 * @param {object} log
 */
async function createInitialPRForRepo (octokit, owner, repo, defaultBranch, log) {
  log.info(`Checking if initial PR is needed for ${owner}/${repo}`)

  // Read the existing boring-cyborg.yml content
  let existingContent = null
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: '.github/boring-cyborg.yml'
    })
    existingContent = Buffer.from(data.content, 'base64').toString()
  } catch (e) {
    log.info('No existing .github/boring-cyborg.yml found')
  }

  // Skip if the flag is set to true
  if (existingContent && existingContent.includes(`${CONFIG_FLAG}: true`)) {
    log.info(`${CONFIG_FLAG} is already true in boring-cyborg.yml, skipping`)
    return
  }

  // Skip if we already have a PR (open or merged)
  if (await hasExistingPR(octokit, owner, repo, log)) {
    log.info('Boring-cyborg already has a PR in this repo, skipping initial PR creation')
    return
  }

  log.info(`Creating initial PR for ${owner}/${repo} via fork`)

  // Fork the repo - the fork is created under the app's bot account
  let fork
  try {
    const response = await octokit.rest.repos.createFork({
      owner,
      repo,
      default_branch_only: true
    })
    fork = response.data
    log.info(`Fork created: ${fork.full_name}`)
  } catch (e) {
    log.error(`Failed to create fork: ${e.message}`)
    return
  }

  const forkOwner = fork.owner.login
  const forkRepo = fork.name

  // Wait for fork to be ready
  await waitForFork(octokit, forkOwner, forkRepo, log)

  // Get the SHA of the default branch in the fork
  let baseSha
  try {
    const { data: ref } = await octokit.rest.git.getRef({
      owner: forkOwner,
      repo: forkRepo,
      ref: `heads/${defaultBranch}`
    })
    baseSha = ref.object.sha
  } catch (e) {
    log.error(`Failed to get default branch ref in fork: ${e.message}`)
    return
  }

  // Create the branch in the fork
  try {
    await octokit.rest.git.createRef({
      owner: forkOwner,
      repo: forkRepo,
      ref: `refs/heads/${INITIAL_PR_BRANCH}`,
      sha: baseSha
    })
  } catch (e) {
    if (e.status === 422) {
      // Branch already exists, update it
      await octokit.rest.git.updateRef({
        owner: forkOwner,
        repo: forkRepo,
        ref: `heads/${INITIAL_PR_BRANCH}`,
        sha: baseSha,
        force: true
      })
    } else {
      log.error(`Failed to create branch in fork: ${e.message}`)
      return
    }
  }

  // Prepare the file content
  const flagLine = '# This flag indicates boring-cyborg[bot] is a recognised contributor whose\n' +
    '# workflow runs do not require manual approval.\n' +
    '# See: https://github.com/kaxil/boring-cyborg\n' +
    `${CONFIG_FLAG}: true\n`

  let newContent, commitMessage, prTitle, prBody
  if (existingContent) {
    newContent = flagLine + '\n' + existingContent
    commitMessage = `Add ${CONFIG_FLAG} flag to boring-cyborg configuration`
    prTitle = `Add ${CONFIG_FLAG} flag to boring-cyborg configuration`
    prBody =
      `This PR adds the \`${CONFIG_FLAG}: true\` flag to the existing ` +
      '`.github/boring-cyborg.yml` configuration file.\n\n' +
      '**Why is this needed?**\n\n' +
      'GitHub requires manual approval for workflow runs triggered by first-time ' +
      'contributors. By merging this PR, `boring-cyborg[bot]` becomes a recognised ' +
      'contributor to this repository, and its future workflow runs (e.g., labeling ' +
      'PRs) will no longer require manual approval.\n\n' +
      'The only change is a flag — no functional configuration changes.'
  } else {
    newContent = flagLine +
      '\n' +
      '# See https://github.com/kaxil/boring-cyborg#usage for configuration options.\n'
    commitMessage = 'Add initial boring-cyborg configuration'
    prTitle = 'Add initial boring-cyborg configuration'
    prBody =
      'This PR adds an initial `.github/boring-cyborg.yml` configuration file with ' +
      `the \`${CONFIG_FLAG}: true\` flag.\n\n` +
      '**Why is this needed?**\n\n' +
      'GitHub requires manual approval for workflow runs triggered by first-time ' +
      'contributors. By merging this PR, `boring-cyborg[bot]` becomes a recognised ' +
      'contributor to this repository, and its future workflow runs (e.g., labeling ' +
      'PRs) will no longer require manual approval.\n\n' +
      'Please customize the configuration to match your project\'s needs.'
  }

  // Get existing file SHA in the fork (needed for update)
  let fileSha = null
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner: forkOwner,
      repo: forkRepo,
      path: '.github/boring-cyborg.yml',
      ref: INITIAL_PR_BRANCH
    })
    fileSha = data.sha
  } catch (e) {
    // File doesn't exist in fork yet
  }

  // Create/update the file in the fork
  try {
    const fileParams = {
      owner: forkOwner,
      repo: forkRepo,
      path: '.github/boring-cyborg.yml',
      message: commitMessage,
      content: Buffer.from(newContent).toString('base64'),
      branch: INITIAL_PR_BRANCH
    }
    if (fileSha) {
      fileParams.sha = fileSha
    }
    await octokit.rest.repos.createOrUpdateFileContents(fileParams)
    log.info('File created/updated in fork')
  } catch (e) {
    log.error(`Failed to create/update file in fork: ${e.message}`)
    return
  }

  // Create the PR from the fork to the original repo
  try {
    const { data: pr } = await octokit.rest.pulls.create({
      owner,
      repo,
      title: prTitle,
      head: `${forkOwner}:${INITIAL_PR_BRANCH}`,
      base: defaultBranch,
      body: prBody,
      maintainer_can_modify: true
    })
    log.info(`Initial PR created: ${pr.html_url}`)
  } catch (e) {
    log.error(`Failed to create PR: ${e.message}`)
  }
}

/**
 * Handle initial PR creation triggered by pull_request events.
 * Uses context to extract repo info.
 *
 * @param {import('probot').Context} context
 */
async function createInitialPR (context) {
  const owner = context.payload.repository.owner.login
  const repo = context.payload.repository.name
  const defaultBranch = context.payload.repository.default_branch || 'main'
  await createInitialPRForRepo(context.octokit, owner, repo, defaultBranch, context.log)
}

/**
 * Handle initial PR creation triggered by installation events.
 * Iterates over all repositories in the installation.
 *
 * @param {import('probot').Context} context
 */
async function createInitialPROnInstall (context) {
  const repos = context.payload.repositories || context.payload.repositories_added || []
  const installationId = context.payload.installation.id
  const log = context.log

  log.info(`Installation event for ${repos.length} repos (installation ${installationId})`)

  for (const repoInfo of repos) {
    const [owner, repo] = repoInfo.full_name.split('/')
    try {
      // Get repo details to find default branch
      const { data: repoData } = await context.octokit.rest.repos.get({ owner, repo })
      await createInitialPRForRepo(context.octokit, owner, repo, repoData.default_branch, log)
    } catch (e) {
      log.error(`Failed to process ${repoInfo.full_name}: ${e.message}`)
    }
  }
}

module.exports = {
  createInitialPR,
  createInitialPRForRepo,
  createInitialPROnInstall,
  hasExistingPR,
  waitForFork,
  CONFIG_FLAG
}
