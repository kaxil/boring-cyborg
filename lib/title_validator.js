const utils = require('./utils')

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

    const pr = await utils.getPr(context)
    context.log.info(`Fetched PR for Title Validator: ${pr.url}`)

    // pr.commits is the commit count, so the commits themselves are only listed when their titles are checked
    if (!alwaysUsePrTitle && pr.commits === 0) {
      context.log.warn('No commits in PR ?????')
      await _createStatus(context, pr.head.sha, statusTitle, 'failure', 'No commits ?????')
      return
    }

    // Use PR title by default
    let titles = [pr.title]
    let type = 'PR'
    if (alwaysUsePrTitle || (validateEitherPrOrSingleCommitTitle && pr.commits !== 1)) {
      context.log.info(`Validating PR title only: ${pr.title}`)
    } else {
      // One page holds 30 commits, and GitHub lists at most 250.
      const commits = await context.octokit.paginate(context.octokit.rest.pulls.listCommits, context.pullRequest({ per_page: 100 }))
      if (commits.length < pr.commits) {
        context.log.warn(`GitHub lists only ${commits.length} of the PR's ${pr.commits} commits; the rest are not validated`)
      }
      context.log.info(`Validating ${commits.length} commits`)
      titles = commits.map(commit => commit.commit.message.split('\n')[0])
      type = 'Commit'
    }

    // Check titles and raise a failure on the first invalid title.
    for (const title of titles) {
      context.log.info(`Validating ${title}`)
      const regexpMatch = commitTitleRegexp.exec(title)
      if (regexpMatch == null) {
        context.log.info(`${type} title is wrong: ${title}`)

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
    sha,
    context: statusTitle,
    state,
    description: _statusDescription(description)
  }
  await context.octokit.rest.repos.createCommitStatus(context.repo(params))
}

const graphemes = new Intl.Segmenter()

/**
 * GitHub rejects a status description that holds a 4-byte UTF-8 character (any code point
 * above U+FFFF, which covers most emoji) or is over 140 characters, and a message quoting the
 * title is often both. Replace each grapheme that holds such a character with □ (3 bytes), so a
 * flag or a joined emoji like 👨‍👩‍👧 becomes one □ and the author can still see where an emoji
 * was, which may be why the title failed. Then cut to 140.
 */
function _statusDescription (text) {
  const description = Array.from(graphemes.segment(text),
    // The second range matches a lone surrogate, half of a 4-byte character with no partner
    ({ segment }) => /[\u{10000}-\u{10FFFF}\uD800-\uDFFF]/u.test(segment) ? '□' : segment).join('')
  // Every character left is one UTF-16 unit, so length and slice count what GitHub counts
  return description.length > 140 ? description.slice(0, 139) + '…' : description
}

module.exports = {
  verifyTitles
}
