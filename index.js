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
    if (relevantEvents.includes(context.name)) {
      context.log.info(`${context.name}.${context.payload.action || 'unknown'}`)
    }
  })

  const prEditEvents = [
    'pull_request.opened',
    'pull_request.reopened',
    'pull_request.edited',
    'pull_request.synchronize'
  ]

  const prFeatures = [
    // "Labeler" - Add Labels on PRs
    { events: prEditEvents, run: (ctx, config) => labeler.addLabelsOnPr(ctx, config) },
    // "Reviewer" - Assign reviewers on PRs based on label
    { events: ['pull_request.labeled', 'pull_request.unlabeled'], run: (ctx, config) => reviewer.addReviewersOnPr(ctx, config) },
    // "Greetings" - Welcome Authors on opening their first PR
    { events: ['pull_request.opened'], run: (ctx, config) => greetings.commentOnfirstPR(ctx, config) },
    // "Greetings" - Congratulate Authors on getting their first PR merged
    { events: ['pull_request.closed'], run: (ctx, config) => greetings.commentOnfirstPRMerge(ctx, config) },
    // "IssueLink" - Update issue links in PRs
    { events: prEditEvents, run: (ctx, config) => issuelink.insertIssueLinkInPrDescription(ctx, config) },
    // "Commit Validator" - validate commit messages for regular expression
    { events: prEditEvents, run: (ctx, config) => titleValidator.verifyTitles(ctx, config) },
    // "Up to date checker" - Check if PR is up to date with its target branch
    { events: prEditEvents, run: (ctx, config) => upToDateChecker.checkUpToDate(ctx, config) }
  ]

  // One handler for every PR event, because Probot gives each handler its own Context. Sharing one
  // loads the config once per webhook, and lets utils.getPr/getPrFiles fetch once for all features.
  app.on([...new Set(prFeatures.flatMap(feature => feature.events))], async context => {
    const event = `${context.name}.${context.payload.action}`
    const config = await utils.getConfig(context)
    if (!utils.shouldProcessPr(context, config)) return

    // Features are independent, so one failing must not stop the others
    const results = await Promise.allSettled(
      prFeatures.filter(feature => feature.events.includes(event)).map(feature => feature.run(context, config))
    )
    // Features that awaited the same failed utils.getPr call reject with the same error, so dedupe
    const errors = [...new Set(results.filter(result => result.status === 'rejected').map(result => result.reason))]
    // A lone error is thrown as is, so Probot logs it the way it logged a failing handler before
    if (errors.length === 1) throw errors[0]
    if (errors.length > 1) throw new AggregateError(errors, errors.map(error => error.message).join('\n'))
  })

  // "Greetings" - Welcome Authors on opening their first Issue
  app.on('issues.opened', async context => {
    const config = await utils.getConfig(context)
    await greetings.commentOnfirstIssue(context, config)
  })

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
