/**
 * Add a comment to welcome users when they open their first PR
 * @param {import('probot').Context} context
 */
module.exports.getConfig = function (context) {
  return context.config('boring-cyborg.yml', {})
}
