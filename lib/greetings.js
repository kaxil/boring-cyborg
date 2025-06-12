/**
 * Add a comment to welcome users when they open their first PR
 * @param {import('probot').Context} context
 * @param {import('probot').Context.config} config
 */
async function commentOnfirstPR (context, config) {
  const configKey = 'firstPRWelcomeComment'

  if (configKey in config) {
    const firstPRWelcomeComment = config[configKey]
    const author = context.payload.pull_request.user.login
    const repo = context.payload.repository.full_name

    context.log.info(`Fetching PRs for greetings for Author: ${author}`)

    // Check if this is truly a first-time contributor by searching for previous PRs
    // We only need to find one previous PR to determine they're not a first-timer
    const searchResult = await context.octokit.rest.search.issuesAndPullRequests({
      q: `is:pr author:${author} repo:${repo} created:<${context.payload.pull_request.created_at}`,
      per_page: 1 // Only need to check if any exist
    })

    context.log.info(`Found ${searchResult.data.total_count} previous PRs for ${author}`)

    if (searchResult.data.total_count === 0) {
      try {
        context.log.info(`Adding comment on ${context.payload.pull_request.html_url}: ${firstPRWelcomeComment}`)
        await context.octokit.issues.createComment(context.issue({ body: firstPRWelcomeComment }))
      } catch (err) {
        if (err.code !== 404) {
          throw err
        }
      }
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
  if (context.payload.pull_request.merged) {
    if (configKey in config) {
      const firstPRMergeComment = config[configKey]
      const author = context.payload.pull_request.user.login
      const repo = context.payload.repository.full_name

      context.log.info(`Fetching merged PRs for Author: ${author}`)

      // Check if this is the author's first merged PR by searching for previous merged PRs
      const searchResult = await context.octokit.rest.search.issuesAndPullRequests({
        q: `is:pr is:merged author:${author} repo:${repo} merged:<${context.payload.pull_request.merged_at}`,
        per_page: 1 // Only need to check if any exist
      })

      context.log.info(`Found ${searchResult.data.total_count} previous merged PRs for ${author}`)

      if (searchResult.data.total_count === 0) {
        try {
          if (firstPRMergeComment) {
            context.log.info(`Adding comment on ${context.payload.pull_request.html_url}: ${firstPRMergeComment}`)
            await context.octokit.issues.createComment(context.issue({ body: firstPRMergeComment }))
          }
        } catch (err) {
          if (err.code !== 404) {
            throw err
          }
        }
      }
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

  if (configKey in config) {
    const firstIssueWelcomeComment = config[configKey]
    const author = context.payload.issue.user.login
    const repo = context.payload.repository.full_name

    context.log.info(`Fetching Issues created by Author: ${author}`)

    // Check if this is the author's first issue by searching for previous issues
    const searchResult = await context.octokit.rest.search.issuesAndPullRequests({
      q: `is:issue author:${author} repo:${repo} created:<${context.payload.issue.created_at}`,
      per_page: 1 // Only need to check if any exist
    })

    context.log.info(`Found ${searchResult.data.total_count} previous issues for ${author}`)

    if (searchResult.data.total_count === 0) {
      try {
        context.log.info(`Adding comment on ${context.payload.issue.html_url}: ${firstIssueWelcomeComment}`)
        await context.octokit.issues.createComment(context.issue({ body: firstIssueWelcomeComment }))
      } catch (err) {
        if (err.code !== 404) {
          throw err
        }
      }
    }
  }
}

module.exports = {
  commentOnfirstPR,
  commentOnfirstPRMerge,
  commentOnfirstIssue
}
