const safeRegex = require('safe-regex2')

/**
 * Load the bot configuration from the repository.
 * @param {import('probot').Context} context
 */
module.exports.getConfig = function (context) {
  return context.config('boring-cyborg.yml', {})
}

/**
 * Check whether the PR base ref matches a `targetBranchFilter` value.
 *
 * The filter may be a single regex string or an array of regex strings. A
 * missing, null, empty-string, or empty-array filter is treated as unset and
 * matches everything. Events without a pull_request payload (e.g. plain issue
 * events) are never filtered out — this helper only gates PR work.
 *
 * Unsafe or invalid regex patterns are logged and skipped; if no valid pattern
 * matches, the function returns false.
 *
 * @param {import('probot').Context} context
 * @param {string|string[]|undefined|null} filter
 * @returns {boolean}
 */
module.exports.matchesBranchFilter = function (context, filter) {
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
    if (!safeRegex(pattern)) {
      context.log.warn(`Unsafe targetBranchFilter regex "${pattern}", skipping`)
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

  return false
}

/**
 * Check if the PR associated with the current context should be processed,
 * given the optional top-level `targetBranchFilter` config entry. Logs a
 * skip message when the PR is filtered out.
 *
 * @param {import('probot').Context} context
 * @param {object} config
 * @returns {boolean}
 */
module.exports.shouldProcessPr = function (context, config) {
  const filter = config && config.targetBranchFilter
  if (module.exports.matchesBranchFilter(context, filter)) {
    return true
  }
  const baseRef = context.payload.pull_request.base.ref
  context.log.info(`Skipping PR: base ref "${baseRef}" does not match targetBranchFilter`)
  return false
}
