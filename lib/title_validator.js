/**
 * Add labels based on the path of the file that are modified in the PR
 * @param {import('probot').Context} context
 * @param {import('probot').Context.config} config
 */
async function verifyTitles (context, config) {
  const configKey = 'verifyTitles'
  const titleValidatorName = 'Title Validator'

  if (configKey in config) {
    const verifyTitles = config[configKey]
    const commitTitleRegexp = new RegExp(verifyTitles.titleRegexp)
    const alwaysUsePrTitle = verifyTitles.alwaysUsePrTitle
    const validateEitherPrOrSingleCommitTitle =
        verifyTitles.validateEitherPrOrSingleCommitTitle
    const issue = await context.issue()
    const getPr = await context.github.pulls.get(issue)
    const pr = getPr.data
    context.log.info('Fetched PR for Title Validator: ', pr.url)

    // Get commits in the PR
    const commits = await context.github.pulls.listCommits(issue)
    const messages = commits.data.map(commit => commit.commit.message)
    let valid = true
    if (messages.length === 0) {
      context.log.warn('No commits in PR ?????')
      const params = {
        sha: pr.head.sha,
        context: titleValidatorName,
        state: 'failure',
        description: 'No commits ?????'
      }
      context.github.repos.createStatus(context.repo(params))
      valid = false
    } else if (alwaysUsePrTitle || (validateEitherPrOrSingleCommitTitle && messages.length !== 1)) {
      context.log.info(`Validating PR title only: ${pr.title}`)
      const regexpMatch = commitTitleRegexp.exec(pr.title)
      if (regexpMatch == null) {
        context.log.info('PR title is wrong:', pr.title)
        const params = {
          sha: pr.head.sha,
          context: titleValidatorName,
          state: 'failure',
          description: `Wrong PR title: ${pr.title}`
        }
        context.github.repos.createStatus(context.repo(params))
        valid = false
      }
    } else {
      context.log.info(`Validating ${messages.length} commits`)
      for (const messageIndex in messages) {
        const commitTitle = messages[messageIndex].split('\n')[0]
        context.log.info(`Validating ${commitTitle}`)
        const regexpMatch = commitTitleRegexp.exec(commitTitle)
        if (regexpMatch == null) {
          context.log.info('Commit title is wrong:', commitTitle)
          const params = {
            sha: pr.head.sha,
            context: titleValidatorName,
            state: 'failure',
            description: `Wrong commit title: ${commitTitle}`
          }
          // Create the status
          context.github.repos.createStatus(context.repo(params))
          valid = false
          break
        }
      }
    }
    if (valid) {
      context.log.info('Commit/PR titles are OK')
      const params = {
        sha: pr.head.sha,
        context: titleValidatorName,
        state: 'success',
        description: 'Validation successful!'
      }
      context.github.repos.createStatus(context.repo(params))
    }
  }
}

module.exports = {
  verifyTitles: verifyTitles
}
