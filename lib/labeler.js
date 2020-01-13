const ignore = require('ignore')

/**
 * Add labels based on the path of the file that are modified in the PR
 * @param {import('probot').Context} context
 * @param {import('probot').Context.config} config
 */
async function addLabelsOnPr (context, config) {
  const configKey = 'labelPRBasedOnFilePath'

  if (configKey in config) {
    const addLabelsOnPrConfig = config[configKey]
    const issue = await context.issue()
    const getPr = await context.github.pullRequests.get(issue)
    const pr = getPr.data
    context.log.info('Fetched PR: for labeler', pr.url)

    // Get files in the PR
    const files = await context.github.pullRequests.listFiles(issue)
    const modifiedFiles = files.data.map(file => file.filename)
    context.log.debug('Files in the PR:', modifiedFiles)

    // Get the existing labels on the PR
    const existingLabels = new Set(pr.labels.map((label) => { return label.name }))
    context.log.debug('Existing labels', existingLabels)

    const newLabels = new Set()
    const allLabels = new Set()

    for (const label in addLabelsOnPrConfig) {
      allLabels.add(label)

      context.log.debug('Looking for files:', label, addLabelsOnPrConfig[label])
      const matcher = ignore().add(addLabelsOnPrConfig[label])

      if (modifiedFiles.find(file => matcher.ignores(file))) {
        context.log.info('Found files matching conditions, applying label: ', label)
        newLabels.add(label)
      }
    }

    const labelsToAdd = Array.from(newLabels).filter((value) => {
      return !existingLabels.has(value)
    })

    if (labelsToAdd.length > 0) {
      context.log.info('Adding labels:', labelsToAdd)
      await context.github.issues.addLabels(context.issue({ labels: labelsToAdd }))
    } else {
      context.log.info('No labels to add')
    }
  }
}

module.exports = {
  addLabelsOnPr: addLabelsOnPr
}
