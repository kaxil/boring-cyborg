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

    // Get list of all PRs that the author has created
    const allPRs = new Set()
    await context.github.paginate(
      context.github.search.issuesAndPullRequests.endpoint.merge({
        q: `is:pr author:${author} repo:${repo}`
      }),
      res => res.data.items.forEach(pr => { allPRs.add(pr) })
    )

    // Filter current PR
    const allPreviousPRs = Array.from(allPRs).filter(pr => pr.number !== context.payload.pull_request.number)

    context.log.info(`Number of PRs excluding the current: ${allPreviousPRs.length}`)

    if (allPreviousPRs.length === 0) {
      try {
        if (allPreviousPRs) {
          context.log.info(`Adding comment on ${context.payload.pull_request.html_url}: ${firstPRWelcomeComment}`)
          context.github.issues.createComment(context.issue({ body: firstPRWelcomeComment }))
        }
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

      context.log.info(`Fetching PRs for Author: ${author}`)

      // Get list of all merged PRs that the author has created
      const allMergedPRs = new Set()
      await context.github.paginate(
        context.github.search.issuesAndPullRequests.endpoint.merge({
          q: `is:pr is:merged author:${author} repo:${repo}`
        }),
        res => res.data.items.forEach(pr => { allMergedPRs.add(pr) })
      )

      // Filter current PR
      const mergedPRs = Array.from(allMergedPRs).filter(pr => pr.number !== context.payload.pull_request.number)

      context.log.info(`Number of Merged PRs excluding the current: ${mergedPRs.length}`)

      if (mergedPRs.length === 0) {
        try {
          if (firstPRMergeComment) {
            context.log.info(`Adding comment on ${context.payload.pull_request.html_url}: ${firstPRMergeComment}`)
            context.github.issues.createComment(context.issue({ body: firstPRMergeComment }))
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

    // Get list of all issues that the author has created
    const allIssues = new Set()
    await context.github.paginate(
      context.github.search.issuesAndPullRequests.endpoint.merge({
        q: `is:issue author:${author} repo:${repo}`
      }),
      res => res.data.items.forEach(issue => { allIssues.add(issue) })
    )

    // Filter current Issue
    const allPreviousIssues = Array.from(allIssues).filter(
      issue => issue.number !== context.payload.issue.number)

    context.log.info(`Number of Issues excluding the current: ${allPreviousIssues.length}`)

    if (allPreviousIssues.length === 0) {
      try {
        if (allPreviousIssues) {
          context.log.info(`Adding comment on ${context.payload.issue.html_url}: ${firstIssueWelcomeComment}`)
          context.github.issues.createComment(context.issue({ body: firstIssueWelcomeComment }))
        }
      } catch (err) {
        if (err.code !== 404) {
          throw err
        }
      }
    }
  }
}

module.exports = {
  commentOnfirstPR: commentOnfirstPR,
  commentOnfirstPRMerge: commentOnfirstPRMerge,
  commentOnfirstIssue: commentOnfirstIssue
}
