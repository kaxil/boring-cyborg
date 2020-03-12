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
    const onlyValidatePrTitle = verifyTitles.onlyValidatePrTitle
    const validateEitherPrOrSingleCommitTitle =
        verifyTitles.validateEitherPrOrSingleCommitTitle
    const description = verifyTitles.errorDescription || "Wrong {type} title: {title}"

    const issue = await context.issue()
    const getPr = await context.github.pulls.get(issue)
    const pr = getPr.data
    context.log.info('Fetched PR for Title Validator: ', pr.url)

    /**
     *
     * Generate a description for the github status
     * @param {string} type     Should be either PR or Commit
     * @param {string} title    The title that was invalid
     * @returns {string}        A description to display to the end user
     */
    function _getDescription(type, title) {

      // Easy way of doing replace all
      return description
        .split("{type}").join(type)
        .split("{title}").join(title)
        .split("{regex}").join(commitTitleRegexp.toString())

    }

    // Get commits in the PR
    const commits = await context.github.pulls.listCommits(issue)
    const messages = commits.data.map(commit => commit.commit.message)
    let valid = true
    if (!onlyValidatePrTitle && messages.length === 0) {
      context.log.warn('No commits in PR ?????')
      const params = {
        sha: pr.head.sha,
        context: titleValidatorName,
        state: 'failure',
        description: 'No commits ?????'
      }
      context.github.repos.createStatus(context.repo(params))
      valid = false
    } else if (onlyValidatePrTitle || validateEitherPrOrSingleCommitTitle && messages.length !== 1) {
      context.log.info(`Validating PR title only: ${pr.title}`)
      const regexpMatch = commitTitleRegexp.exec(pr.title)
      if (regexpMatch == null) {
        context.log.info('PR title is wrong:', pr.title)
        const params = {
          sha: pr.head.sha,
          context: titleValidatorName,
          state: 'failure',
          description: _getDescription("PR", pr.title)
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
            description: _getDescription("commit", commitTitle)
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
