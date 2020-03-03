/**
 * Modifies the description of the PR and updates issue link with the
 * Issue id present in issue title..
 * @param {import('probot').Context} context
 * @param {import('probot').Context.config} config
 */
async function insertIssueLinkInPrDescription (context, config) {
  const configKey = 'insertIssueLinkInPrDescription'

  if (configKey in config) {
    const insertIssueLinkInPrDescription = config[configKey]
    const issue = await context.issue()
    const getPr = await context.github.pulls.get(issue)
    const pr = getPr.data
    context.log.info('Fetched PR for issue link: ', pr.url)

    const placeholderRegexp = new RegExp(insertIssueLinkInPrDescription.descriptionIssuePlaceholderRegexp,
      'm')
    const matchedPlaceholderArray = placeholderRegexp.exec(pr.body)

    if (matchedPlaceholderArray == null) {
      context.log.warn('Placeholder not found in the body. Body:\n', pr.body,
        'Regexp:', placeholderRegexp)
      return
    }

    if (matchedPlaceholderArray.length < 2) {
      context.log.warn('The descriptionIssuePlaceholderRegexp regexp should ' +
        'contain a match group (). Regexp:', placeholderRegexp)
      return
    }

    const placeholderPosition = pr.body.indexOf(matchedPlaceholderArray[0])
    const linkPlaceholderPosition = matchedPlaceholderArray[0].indexOf(matchedPlaceholderArray[1])
    const linkPlaceholderLength = matchedPlaceholderArray[1].length

    for (const matcher in insertIssueLinkInPrDescription.matchers) {
      const matcherObject = insertIssueLinkInPrDescription.matchers[matcher]
      const issueIdRegexp = new RegExp(matcherObject.titleIssueIdRegexp)
      const matchedIssueIdArray = issueIdRegexp.exec(pr.title)
      if (matchedIssueIdArray == null) {
        context.log.debug('Issue ID not found in the title. Title:', pr.title, 'Regexp:',
          issueIdRegexp)
        continue
      }
      if (matchedIssueIdArray.length < 2) {
        context.log.warn('The titleIssueIdRegexp regexp should contain a match group: (): Regexp:',
          issueIdRegexp)
        continue
      }

      let linkString = matcherObject.descriptionIssueLink

      for (let i = 1; i < matchedIssueIdArray.length; i++) {
        const matchFromTitle = matchedIssueIdArray[i]
        const stringToReplace = '${' + i + '}'

        // fancy replaceAll in javascript
        linkString = linkString.split(stringToReplace).join(matchFromTitle)
      }

      const newBody = pr.body.substr(0, placeholderPosition + linkPlaceholderPosition) +
        linkString +
        pr.body.substr(placeholderPosition + linkPlaceholderPosition + linkPlaceholderLength)
      context.log.debug('Updating PR :', pr, ' with new body', newBody)
      context.github.issues.update(context.issue({ body: newBody }))
      break
    }
  } else {
    context.log.debug('Skip insertIssueLinkInPrDescription - not configured!')
  }
}

module.exports = {
  insertIssueLinkInPrDescription: insertIssueLinkInPrDescription
}
