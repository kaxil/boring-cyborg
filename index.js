const labeler = require('./lib/labeler')
const reviewer = require('./lib/reviewer')
const greetings = require('./lib/greetings')
const issuelink = require('./lib/issuelink')
const titleValidator = require('./lib/title_validator')
const upToDateChecker = require('./lib/up_to_date_checker')
const utils = require('./lib/utils')

module.exports = (app, { getRouter }) => {
  app.log.info('Yay, the app was loaded!')

  app.onAny(async context => {
    // Only log events we care about to reduce noise
    const relevantEvents = ['pull_request', 'issues', 'push']
    if (relevantEvents.includes(context.event)) {
      context.log.info(`${context.event}.${context.payload.action || 'unknown'}`)
    }
  })

  // "Labeler" - Add Labels on PRs
  app.on([
    'pull_request.opened',
    'pull_request.reopened',
    'pull_request.edited',
    'pull_request.synchronize'], async context => {
    const config = await utils.getConfig(context)
    await labeler.addLabelsOnPr(context, config)
  })

  // "Reviewer" - Assign reviewers on PRs based on label
  app.on([
    'pull_request.labeled',
    'pull_request.unlabeled'], async context => {
    const config = await utils.getConfig(context)
    await reviewer.addReviewersOnPr(context, config)
  })

  // "Greetings" - Welcome Authors on opening their first PR
  app.on('pull_request.opened', async context => {
    const config = await utils.getConfig(context)
    await greetings.commentOnfirstPR(context, config)
  })

  // "Greetings" - Congratulate Authors on getting their first PR merged
  app.on('pull_request.closed', async context => {
    const config = await utils.getConfig(context)
    await greetings.commentOnfirstPRMerge(context, config)
  })

  // "Greetings" - Welcome Authors on opening their first Issue
  app.on('issues.opened', async context => {
    const config = await utils.getConfig(context)
    await greetings.commentOnfirstIssue(context, config)
  })

  // "IssueLink" - Update issue links in PRs
  app.on([
    'pull_request.opened',
    'pull_request.reopened',
    'pull_request.edited',
    'pull_request.synchronize'], async context => {
    const config = await utils.getConfig(context)
    await issuelink.insertIssueLinkInPrDescription(context, config)
  })

  // "Commit Validator" - validate commit messages for regular expression
  app.on([
    'pull_request.opened',
    'pull_request.reopened',
    'pull_request.edited',
    'pull_request.synchronize'], async context => {
    const config = await utils.getConfig(context)
    await titleValidator.verifyTitles(context, config)
  })

  // "Up to date checker" - Check if PR is up to date with master
  app.on([
    'pull_request.opened',
    'pull_request.reopened',
    'pull_request.edited',
    'pull_request.synchronize'], async context => {
    const config = await utils.getConfig(context)
    await upToDateChecker.checkUpToDate(context, config)
  })

  // Only register the /stats endpoint if getRouter is provided and returns a router
  if (typeof getRouter === 'function') {
    const router = getRouter('/boring-cyborg')
    if (router && typeof router.get === 'function') {
      router.get('/stats', async (req, res) => {
        try {
          // Check for STATS_API_KEY authentication
          const authHeader = req.headers.authorization
          const statsApiKey = process.env.STATS_API_KEY

          if (!statsApiKey) {
            return res.status(500).json({ error: 'STATS_API_KEY not configured' })
          }

          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing or invalid Authorization header' })
          }

          const providedKey = authHeader.substring(7) // Remove 'Bearer ' prefix
          if (providedKey !== statsApiKey) {
            return res.status(403).json({ error: 'Invalid API key' })
          }

          // Use the app's authenticated octokit instance
          const octokit = await app.auth()
          const installations = await octokit.paginate(octokit.rest.apps.listInstallations)
          const stats = {
            totalInstallations: installations.length,
            installations: installations.map(inst => ({
              id: inst.id,
              account: inst.account.login,
              account_type: inst.account.type
            }))
          }
          res.json(stats)
        } catch (err) {
          app.log.error('Error fetching stats:', err)
          res.status(500).json({ error: 'Failed to fetch stats' })
        }
      })
    }
  }
}
