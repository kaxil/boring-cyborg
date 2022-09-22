const ignore = require("ignore");

/**
 * Assign reviewers based on the labels that are assigned in the PR
 * @param {import('probot').Context} context
 * @param {import('probot').Context.config} config
 */
async function addReviewersOnPr(context, config) {
  configKey = "addReviewerBasedOnLabel"
  const defaultReviewerFlags = {
    addReviewerBasedOnLabel: true,
    addDefaultReviewers: false,
    defaultReviewers: [],
  };
  const reviewerFlags = (('reviewerFlags' in config) ? config.reviewerFlags : defaultReviewerFlags)
  
  if (configKey in config) {
    const addReviewerBasedOnLabelConfig = config[configKey]
    const addReviewerBasedOnLabel = (('addReviewerBasedOnLabel' in reviewerFlags) ? reviewerFlags["addReviewerBasedOnLabel"] : false)
    const addDefaultReviewers = (('addDefaultReviewers' in reviewerFlags) ? reviewerFlags["addDefaultReviewers"] : false)
    const defaultReviewers = ((addDefaultReviewers && !(config.reviewerFlags.defaultReviewers.length == 0)) ? config.reviewerFlags.defaultReviewers : [])

    context.log.debug(`Context Event: ${context.event}`)
    context.log.debug(`Context Action: ${context.payload.action}`)

    const issue = await context.issue()
    const getPr = await context.github.pulls.get(issue)
    const pr = getPr.data
    context.log.info('Fetched PR for assigner: ', pr.url)

    // Get existing labels
    const existingLabels = new Set(pr.labels.map((label) => { return label.name }))
    context.log.info('Existing labels: ', existingLabels)

    // Get existing reviewers
    const existingReviewers = new Set(pr.requested_reviewers.map((reviewer) => {return reviewer.login}))
    context.log.info('Existing reviewers: ', existingReviewers);

    // Determine who to assign as reviewers to PR from labels and assign list of reviewers
    const reviewersToAssign = new Set()
    for (const defaultReviewer in addDefaultReviewers){
      reviewersToAssign.add(defaultReviewer)
    }
    for (const reviewer in addReviewerBasedOnLabelConfig){
      reviewersToAssign.add(reviewer)
    }


    // if (!(addReviewerBasedOnLabel || context.payload.action === 'opened')) {
    //   context.log.info('Auto add reviewer is disabled, skipping Assigner ...')
    //   return
    // }

    // // const issue = await context.issue()
    // // const getPr = await context.github.pulls.get(issue)
    // // const pr = getPr.data
    // // context.log.info('Fetched PR: for labeler', pr.url)


    // if (addDefaultReviewers) {
    //   const addAssigneeParams = context.issue({ assignees: addDefaultReviewers })
    //   await context.github.issues.addAssignees(addAssigneeParams);
    // }
  

  }
}

module.exports = {
  addReviewersOnPr: addReviewersOnPr,
};
