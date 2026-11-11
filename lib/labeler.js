const ignore = require('ignore')
const utils = require('./utils')

/**
 * Normalize a single label rule into `{ paths, targetBranchFilter }`.
 * Accepts either the legacy array-of-paths form or an object form with
 * `paths` and optional `targetBranchFilter`.
 */
function _parseRule (rule) {
  if (Array.isArray(rule)) {
    return { paths: rule, targetBranchFilter: undefined }
  }
  if (rule && typeof rule === 'object') {
    return { paths: rule.paths, targetBranchFilter: rule.targetBranchFilter }
  }
  return { paths: undefined, targetBranchFilter: undefined }
}

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

    context.log.debug(`Context Event: ${context.name}`)
    context.log.debug(`Context Action: ${context.payload.action}`)
    context.log.debug(`labelOnPRUpdate Config: ${labelOnPRUpdate}`)

    if (!(labelOnPRUpdate || context.payload.action === 'opened')) {
      context.log.info('Labeling on PR Update is disabled, skipping Labeler ...')
      return
    }

    const pr = await utils.getPr(context)
    context.log.info('Fetched PR: for labeler', pr.url)

    const files = await utils.getPrFiles(context)
    const modifiedFiles = files.map(file => file.filename)
    context.log.debug(`Files in the PR: ${JSON.stringify(modifiedFiles)}`)

    // Get the existing labels on the PR
    const existingLabels = new Set(pr.labels.map((label) => { return label.name }))
    context.log.debug(`Existing labels: ${JSON.stringify(Array.from(existingLabels))}`)

    const newLabels = new Set()
    const allLabels = new Set()

    for (const label in addLabelsOnPrConfig) {
      allLabels.add(label)

      const { paths, targetBranchFilter } = _parseRule(addLabelsOnPrConfig[label])
      if (!paths) {
        context.log.warn(`Skipping label "${label}": no paths configured`)
        continue
      }

      if (!utils.matchesBranchFilter(context, targetBranchFilter)) {
        context.log.info(`Skipping label "${label}": PR base ref does not match rule's targetBranchFilter`)
        continue
      }

      context.log.debug(`Looking for files: label="${label}", pattern="${JSON.stringify(paths)}")`)
      const matcher = ignore().add(paths)

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
      await context.octokit.rest.issues.addLabels(context.issue({ labels: labelsToAdd }))
    } else {
      context.log.info('No labels to add')
    }
  }
}

module.exports = {
  addLabelsOnPr
}
