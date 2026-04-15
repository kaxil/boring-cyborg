/**
 * Load the bot configuration from the repository.
 * @param {import('probot').Context} context
 */
module.exports.getConfig = function (context) {
  return context.config('boring-cyborg.yml', {})
}

/**
 * Check if the PR associated with the current context should be processed,
 * given the optional `targetBranchFilter` config entry.
 *
 * `targetBranchFilter` may be a single regex string or an array of regex strings.
 * If any pattern matches the PR base ref the PR is processed. If the config key
 * is missing, all PRs are processed. Events without a pull_request payload (e.g.
 * plain issue events) are never filtered out by this helper.
 *
 * @param {import('probot').Context} context
 * @param {object} config
 * @returns {boolean}
 */
module.exports.shouldProcessPr = function (context, config) {
  const filter = config && config.targetBranchFilter
  if (
    filter === undefined ||
    filter === null ||
    filter === '' ||
    (Array.isArray(filter) && filter.length === 0)
  ) {
    return true
  }

  const pr = context.payload && context.payload.pull_request
  if (!pr || !pr.base || !pr.base.ref) {
    return true
  }

  const patterns = Array.isArray(filter) ? filter : [filter]
  const baseRef = pr.base.ref

  for (const pattern of patterns) {
    if (typeof pattern !== 'string' || pattern.length === 0) {
      continue
    }
    let regex
    try {
      regex = new RegExp(pattern)
    } catch (err) {
      context.log.warn(`Invalid targetBranchFilter regex "${pattern}": ${err.message}`)
      continue
    }
    if (regex.test(baseRef)) {
      return true
    }
  }

  context.log.info(`Skipping PR: base ref "${baseRef}" does not match targetBranchFilter`)
  return false
}
