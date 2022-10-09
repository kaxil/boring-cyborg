/**
 * Assign reviewers based on the labels that are assigned in the PR
 * @param {import('probot').Context} context
 * @param {import('probot').Context.config} config
 */

async function addReviewersOnPr(context, config) {
  const configKey = "addReviewerBasedOnLabel"
  
  if (configKey in config) {
    const addReviewerBasedOnLabelConfig = config[configKey]

    context.log.debug(`Context Event: ${context.event}`)
    context.log.debug(`Context Action: ${context.payload.action}`)

    // If config variable addReviewerBasedOnLabel exists, run, otherwise skip reviewer
    if (addReviewerBasedOnLabelConfig) {
      const issue = await context.issue()
      const getPr = await context.github.pulls.get(issue)
      const pr = getPr.data
      context.log.info('Fetched PR for reviewer: ', pr.url)

      // Get existing labels from PR
      const existingLabels = new Set(pr.labels.map((label) => { return label.name }))
      context.log.info('Existing labels: ', existingLabels)

      // Get existing reviewers from PR
      const existingReviewers = new Set(pr.requested_reviewers.map((reviewer) => {return reviewer.login}))
      context.log.info('Existing reviewers: ', existingReviewers);

      // Get labels from addReviewerBasedOnLabel config
      const reviewerLabels = config.addReviewerBasedOnLabel.labels
      context.log.info('Labels to check against: ', reviewerLabels)

      // Determine who to assign as reviewers to PR from labels in addReviewerBasedOnLabel and assign list of reviewers
      const reviewersToAssign = new Set();
      if(config.addReviewerBasedOnLabel.defaultReviewers) {
        config.addReviewerBasedOnLabel.defaultReviewers.forEach(defaultReviewer => {
          reviewersToAssign.add(defaultReviewer)
        })
      }
      context.log.info('Default reviewers from config: ', reviewersToAssign)

      // Are there labels to add reviewers based upon?
      const reviewerMap = new Map(Object.entries(reviewerLabels))

      if (reviewerMap) {
        existingLabels.forEach(label => {
          context.log.info(`Label: ${label}. Exists in the PR: true.\nExists in config: `, reviewerMap.has(label))

          if(reviewerMap.has(label)) {
            const reviewersForLabel = reviewerMap.get(label)
            reviewersForLabel.forEach(reviewer => {
              reviewersToAssign.add(reviewer)
            })
          }
        })
      }

      // remove author of PR if in requested reviewer list. You cannot request a review from the owner of the PR.
      reviewersToAssign.delete(pr.user.login)
      context.log.info('All reviewers from config to assign to PR: ', reviewersToAssign)

      if (reviewersToAssign) {
        try {
          const addReviewerParams = context.repo( { pull_number: pr.number, reviewers: Array.from(reviewersToAssign) })
          await context.github.pulls.createReviewRequest(addReviewerParams)
        } catch (error) {
          context.log.debug(error)
        }
      }
    }
  }
}

module.exports = {
  addReviewersOnPr: addReviewersOnPr,
};