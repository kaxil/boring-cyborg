/**
 * Add labels based on the path of the file that are modified in the PR
 * @param {import('probot').Context} context
 * @param {import('probot').Context.config} config
 */
async function verifyTitles (context, config) {
  const configKey = 'verifyTitles'

  if (configKey in config) {
    const verifyTitles = config[configKey]
    const commitTitleRegexp = new RegExp(verifyTitles.titleRegexp)
    const alwaysUsePrTitle = verifyTitles.alwaysUsePrTitle
    const validateEitherPrOrSingleCommitTitle =
      verifyTitles.validateEitherPrOrSingleCommitTitle
    const statusTitle = verifyTitles.statusTitle || 'Title Validator'
    const successMessage = verifyTitles.successMessage || 'Validation successful!'
    // eslint-disable-next-line no-template-curly-in-string
    const failureMessage = verifyTitles.failureMessage || 'Wrong ${type} title: ${title}'

    const issue = await context.issue()
    const getPr = await context.github.pulls.get(issue)
    const pr = getPr.data
    context.log.info('Fetched PR for Title Validator: ', pr.url)

    // Get commits in the PR
    const commits = await context.github.pulls.listCommits(issue)
    const messages = commits.data.map(commit => commit.commit.message)

    if (!alwaysUsePrTitle && messages.length === 0) {
      context.log.warn('No commits in PR ?????')
      await _createStatus(context, pr.head.sha, statusTitle, 'failure', 'No commits ?????')
      return
    }

    // Use PR title by default
    let titles = [pr.title]
    let type = 'PR'
    if (alwaysUsePrTitle || (validateEitherPrOrSingleCommitTitle && messages.length !== 1)) {
      context.log.info(`Validating PR title only: ${pr.title}`)
    } else {
      context.log.info(`Validating ${messages.length} commits`)
      titles = messages.map(m => m.split('\n')[0])
      type = 'Commit'
    }

    // Check titles and raise a failure on the first invalid title.
    for (const title of titles) {
      context.log.info(`Validating ${title}`)
      const regexpMatch = commitTitleRegexp.exec(title)
      if (regexpMatch == null) {
        context.log.info(`${type} title is wrong:`, title)

        // Easy way of doing replace all
        const message = failureMessage
          /* eslint-disable no-template-curly-in-string */
          .split('${type}').join(type)
          .split('${title}').join(title)
          .split('${regex}').join(commitTitleRegexp.toString())
          /* eslint-enable no-template-curly-in-string */

        // Create the status
        await _createStatus(context, pr.head.sha, statusTitle, 'failure', message)
        return
      }
    }

    // Only valid states remain
    context.log.info('Commit/PR titles are OK')
    await _createStatus(context, pr.head.sha, statusTitle, 'success', successMessage)
  }
}

/**
 * Create a github status for the PR with the given state and description
 * @param {import('probot').Context} context  Context used to post the status
 * @param {string} sha                        The commit hash to post the status against
 * @param {string} statusTitle                The title of the check
 * @param {string} state                      The status to post, typically 'success' or 'failure'
 * @param {string} description                The description for the status
 */
async function _createStatus (context, sha, statusTitle, state, description) {
  const params = {
    sha: sha,
    context: statusTitle,
    state: state,
    description: description
  }
  await context.github.repos.createStatus(context.repo(params))
}

module.exports = {
  verifyTitles: verifyTitles
}
