const ignore = require('ignore')
const utils = require('./utils')

/**
 * Normalize a single label rule into `{ paths, targetBranchFilter, allFilesMatch }`.
 * Accepts either the legacy array-of-paths form or an object form with
 * `paths`, optional `targetBranchFilter` and optional `allFilesMatch`.
 */
function _parseRule (rule) {
  if (Array.isArray(rule)) {
    return { paths: rule, targetBranchFilter: undefined, allFilesMatch: false }
  }
  if (rule && typeof rule === 'object') {
    return {
      paths: rule.paths,
      targetBranchFilter: rule.targetBranchFilter,
      allFilesMatch: rule.allFilesMatch === true
    }
  }
  return { paths: undefined, targetBranchFilter: undefined, allFilesMatch: false }
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
    const isPRUpdate = context.payload.action !== 'opened'

    context.log.debug(`Context Event: ${context.event}`)
    context.log.debug(`Context Action: ${context.payload.action}`)
    context.log.debug(`labelOnPRUpdate Config: ${labelOnPRUpdate}`)

    // `allFilesMatch` rules track the current state of the PR (e.g. "tests-only"),
    // so they are kept in sync on every update even when labelOnPRUpdates is off.
    const hasAllFilesMatchRules = Object.values(addLabelsOnPrConfig)
      .some(rule => _parseRule(rule).allFilesMatch)

    if (isPRUpdate && !labelOnPRUpdate && !hasAllFilesMatchRules) {
      context.log.info('Labeling on PR Update is disabled, skipping Labeler ...')
      return
    }

    const issue = context.issue()
    const pullNumber = context.payload.pull_request ? context.payload.pull_request.number : issue.issue_number
    const pullParams = { owner: issue.owner, repo: issue.repo, pull_number: pullNumber }
    const getPr = await context.octokit.pulls.get(pullParams)
    const pr = getPr.data
    context.log.info('Fetched PR: for labeler', pr.url)

    // Get files in the PR (paginate to handle PRs with 100+ files)
    const files = await context.octokit.paginate(context.octokit.pulls.listFiles, pullParams)
    const modifiedFiles = files.map(file => file.filename)
    context.log.debug(`Files in the PR: ${JSON.stringify(modifiedFiles)}`)

    // Get the existing labels on the PR
    const existingLabels = new Set(pr.labels.map((label) => { return label.name }))
    context.log.debug(`Existing labels: ${JSON.stringify(Array.from(existingLabels))}`)

    const newLabels = new Set()
    const allLabels = new Set()
    const removableLabels = new Set()

    for (const label in addLabelsOnPrConfig) {
      allLabels.add(label)

      const { paths, targetBranchFilter, allFilesMatch } = _parseRule(addLabelsOnPrConfig[label])
      if (!paths) {
        context.log.warn(`Skipping label "${label}": no paths configured`)
        continue
      }

      if (isPRUpdate && !labelOnPRUpdate && !allFilesMatch) {
        context.log.info(`Skipping label "${label}": labeling on PR updates is disabled`)
        continue
      }

      if (!utils.matchesBranchFilter(context, targetBranchFilter)) {
        context.log.info(`Skipping label "${label}": PR base ref does not match rule's targetBranchFilter`)
        continue
      }

      context.log.debug(`Looking for files: label="${label}", pattern="${JSON.stringify(paths)}")`)
      const matcher = ignore().add(paths)

      if (allFilesMatch) {
        if (modifiedFiles.length > 0 && modifiedFiles.every(file => matcher.ignores(file))) {
          context.log.info(`All files match conditions, applying label: "${label}"`)
          newLabels.add(label)
        } else {
          // The label no longer qualifies; remove it if the bot (or anyone) set it earlier.
          removableLabels.add(label)
        }
      } else if (modifiedFiles.find(file => matcher.ignores(file))) {
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

    const labelsToRemove = Array.from(removableLabels).filter((value) => {
      return existingLabels.has(value)
    })

    for (const label of labelsToRemove) {
      context.log.info(`Removing label "${label}": not all files in the PR match its conditions anymore`)
      try {
        await context.octokit.issues.removeLabel(context.issue({ name: label }))
      } catch (err) {
        // The label may have been removed concurrently; don't fail the whole run.
        context.log.warn(`Failed to remove label "${label}": ${err.message}`)
      }
    }
  }
}

module.exports = {
  addLabelsOnPr
}
