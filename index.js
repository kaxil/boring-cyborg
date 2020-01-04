const labeler = require('./lib/labeler')

module.exports = app => {
  app.log('Yay, the app was loaded!')

  // 1. "Labeler" - Add Labels on PRs
  app.on([
    'pull_request.opened',
    'pull_request.reopened',
    'pull_request.edited',
    'pull_request.synchronize'], async context => {
    const config = await context.config('boring-cyborg.yml', { })

    await labeler.addLabelsOnPr(context, config)
  })
}
