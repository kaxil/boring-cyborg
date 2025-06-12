const ignore = require('ignore')

/**
 * Add labels based on the path of the file that are modified in the PR
 * @param {import('probot').Context} context
 * @param {import('probot').Context.config} config
 */
async function addLabelsOnPr (context, config) {
  const configKey = 'labelPRBasedOnFilePath'
  const defaultLabelerFlags = { labelOnPRUpdates: true, labelsOnPRCreation: [] }
  const labelerFlags = (('labelerFlags' in config) ? config.labelerFlags : defaultLabelerFlags)

  if (configKey in config) {
    const addLabelsOnPrConfig = config[configKey]
    const labelOnPRUpdate = (('labelOnPRUpdates' in labelerFlags) ? labelerFlags.labelOnPRUpdates : true)

    context.log.debug(`Context Event: ${context.event}`)
    context.log.debug(`Context Action: ${context.payload.action}`)
    context.log.debug(`labelOnPRUpdate Config: ${labelOnPRUpdate}`)

    if (!(labelOnPRUpdate || context.payload.action === 'opened')) {
      context.log.info('Labeling on PR Update is disabled, skipping Labeler ...')
      return
    }

    const issue = context.issue()
    const pullNumber = context.payload.pull_request ? context.payload.pull_request.number : issue.issue_number
    const pullParams = { owner: issue.owner, repo: issue.repo, pull_number: pullNumber }
    const getPr = await context.octokit.pulls.get(pullParams)
    const pr = getPr.data
    context.log.info('Fetched PR: for labeler', pr.url)

    // Get files in the PR
    const files = await context.octokit.pulls.listFiles(pullParams)
    const modifiedFiles = files.data.map(file => file.filename)
    context.log.debug(`Files in the PR: ${JSON.stringify(modifiedFiles)}`)

    // Get the existing labels on the PR
    const existingLabels = new Set(pr.labels.map((label) => { return label.name }))
    context.log.debug(`Existing labels: ${JSON.stringify(Array.from(existingLabels))}`)

    const newLabels = new Set()
    const allLabels = new Set()

    for (const label in addLabelsOnPrConfig) {
      allLabels.add(label)

      context.log.debug(`Looking for files: label="${label}", pattern="${JSON.stringify(addLabelsOnPrConfig[label])}")`)
      const matcher = ignore().add(addLabelsOnPrConfig[label])

      if (modifiedFiles.find(file => matcher.ignores(file))) {
        context.log.info(`Found files matching conditions, applying label: "${label}"`)
        newLabels.add(label)
      }
    }

    const labelsToAdd = Array.from(newLabels).filter((value) => {
      return !existingLabels.has(value)
    })

    if (labelsToAdd.length > 0) {
      context.log.info(`Adding labels: ${JSON.stringify(labelsToAdd)}`)
      await context.octokit.issues.addLabels(context.issue({ labels: labelsToAdd }))
    } else {
      context.log.info('No labels to add')
    }
  }
}

module.exports = {
  addLabelsOnPr
}
