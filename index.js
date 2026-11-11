const labeler = require('./lib/labeler')
const reviewer = require('./lib/reviewer')
const greetings = require('./lib/greetings')
const issuelink = require('./lib/issuelink')
const titleValidator = require('./lib/title_validator')
const upToDateChecker = require('./lib/up_to_date_checker')
const utils = require('./lib/utils')

module.exports = (app, { addHandler }) => {
  app.log.info('Yay, the app was loaded!')

  app.onAny(async context => {
    // Only log events we care about to reduce noise
    const relevantEvents = ['pull_request', 'issues', 'push']
    if (relevantEvents.includes(context.event)) {
      context.log.info(`${context.event}.${context.payload.action || 'unknown'}`)
    }
  })

  const withBranchFilter = (handler) => async (context) => {
    const config = await utils.getConfig(context)
    if (!utils.shouldProcessPr(context, config)) return
    await handler(context, config)
  }

  const prEditEvents = [
    'pull_request.opened',
    'pull_request.reopened',
    'pull_request.edited',
    'pull_request.synchronize'
  ]

  // "Labeler" - Add Labels on PRs
  app.on(prEditEvents, withBranchFilter((ctx, config) => labeler.addLabelsOnPr(ctx, config)))

  // "Reviewer" - Assign reviewers on PRs based on label
  app.on([
    'pull_request.labeled',
    'pull_request.unlabeled'
  ], withBranchFilter((ctx, config) => reviewer.addReviewersOnPr(ctx, config)))

  // "Greetings" - Welcome Authors on opening their first PR
  app.on('pull_request.opened', withBranchFilter((ctx, config) => greetings.commentOnfirstPR(ctx, config)))

  // "Greetings" - Congratulate Authors on getting their first PR merged
  app.on('pull_request.closed', withBranchFilter((ctx, config) => greetings.commentOnfirstPRMerge(ctx, config)))

  // "Greetings" - Welcome Authors on opening their first Issue
  app.on('issues.opened', async context => {
    const config = await utils.getConfig(context)
    await greetings.commentOnfirstIssue(context, config)
  })

  // "IssueLink" - Update issue links in PRs
  app.on(prEditEvents, withBranchFilter((ctx, config) => issuelink.insertIssueLinkInPrDescription(ctx, config)))

  // "Commit Validator" - validate commit messages for regular expression
  app.on(prEditEvents, withBranchFilter((ctx, config) => titleValidator.verifyTitles(ctx, config)))

  // "Up to date checker" - Check if PR is up to date with master
  app.on(prEditEvents, withBranchFilter((ctx, config) => upToDateChecker.checkUpToDate(ctx, config)))

  // Returning false passes the request on to the server's next handler.
  const statsHandler = async (req, res) => {
    // Not `new URL()`: it throws on paths like `//`, and this handler sees every request.
    const pathname = req.url.split('?')[0]
    if (req.method !== 'GET' || pathname !== '/boring-cyborg/stats') return false

    const sendJson = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
      return true
    }

    try {
      const authHeader = req.headers.authorization
      const statsApiKey = process.env.STATS_API_KEY

      if (!statsApiKey) {
        return sendJson(500, { error: 'STATS_API_KEY not configured' })
      }

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return sendJson(401, { error: 'Missing or invalid Authorization header' })
      }

      const providedKey = authHeader.substring(7) // Remove 'Bearer ' prefix
      if (providedKey !== statsApiKey) {
        return sendJson(403, { error: 'Invalid API key' })
      }

      // Use the app's authenticated octokit instance
      const octokit = await app.auth()
      const installations = await octokit.paginate(octokit.rest.apps.listInstallations)
      return sendJson(200, {
        totalInstallations: installations.length,
        installations: installations.map(inst => ({
          id: inst.id,
          account: inst.account.login,
          account_type: inst.account.type
        }))
      })
    } catch (err) {
      app.log.error({ err }, 'Error fetching stats')
      return sendJson(500, { error: 'Failed to fetch stats' })
    }
  }

  try {
    addHandler(statsHandler)
  } catch (err) {
    // `probot receive` runs the app without an HTTP server, and its addHandler throws.
    app.log.debug(`Not serving /boring-cyborg/stats: ${err.message}`)
  }
}
