const ignore = require("ignore");

/**
 * Assign reviewers based on the labels that are assigned in the PR
 * @param {import('probot').Context} context
 * @param {import('probot').Context.config} config
 */
async function addReviewersOnPr(context, config) {
  configKey = "addReviewerPRBasedOnLabel";
  const defaultReviewerFlags = {
    addReviewerBasedOnLabel: false,
    addDefaultReviewers: false,
    defaultReviewers: [],
  };
  const reviewerFlags = (('reviewerFlags' in config) ? config.reviewerFlags : defaultReviewerFlags)
  
  if (configKey in config) {
    const addReviewersOnPRConfig = config[configKey]
    const addReviewerBasedOnLabel = (('addReviewerBasedOnLabel' in reviewerFlags) ? reviewerFlags["addReviewerBasedOnLabel"] : false)
    const addDefaultReviewers = (('addDefaultReviewers' in reviewerFlags) ? reviewerFlags["addDefaultReviewers"] : false)

    context.log.debug(`Context Event: ${context.event}`)
    context.log.debug(`Context Action: ${context.payload.action}`)
    context.log.debug(`addReviewerBasedOnLabel Config: ${addReviewerBasedOnLabel}`)
    context.log.debug(`addDefaultReviewers Config: ${addDefaultReviewers}`)

    // Get existing labels

    // Get existing assignees

    // Determine who to assign to PR from labels

    // Assign list of assignees


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
