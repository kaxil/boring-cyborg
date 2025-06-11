'use strict'
const ignore = require('ignore')

/**
 * Check if a branch is up to date with the targetBranch when specific files are modified in the PR
 * @param {import('probot').Context} context
 * @param {import('probot').Context.config} config
 */
async function checkUpToDate (context, config) {
  const configKey = 'checkUpToDate'
  const targetBranchKey = 'targetBranch'
  const filesKey = 'files'
  const checkerName = 'Up-to-date Checker'

  if (configKey in config) {
    let targetBranch = 'master'
    let filePatterns
    const issue = context.issue()
    const pullNumber = context.payload.pull_request ? context.payload.pull_request.number : issue.issue_number
    const pullParams = { owner: issue.owner, repo: issue.repo, pull_number: pullNumber }
    const getPr = await context.octokit.pulls.get(pullParams)
    const pr = getPr.data
    context.log.info(`Fetched PR for ${checkerName}: ${pr.url}`)

    // For Backwards compatibility
    if (targetBranchKey in config[configKey]) {
      targetBranch = config[configKey][targetBranchKey]
    }

    if (filesKey in config[configKey]) {
      filePatterns = config[configKey][filesKey]
    } else {
      if (!(targetBranchKey in config[configKey])) {
        filePatterns = config[configKey]
      } else {
        context.log.debug('No file pattern defined')
      }
    }

    // Get files in the PR
    const modifiedFiles = await _listFilesInPR(context, pullParams)
    context.log.debug('Files in the PR:', modifiedFiles)

    context.log.debug(`Looking for files: ${filePatterns}`)
    const matcher = ignore().add(filePatterns)

    if (modifiedFiles.find(file => matcher.ignores(file))) {
      context.log.info(`Found files that match pattern. Checking if PR is up to date with ${targetBranch}`)

      const contextHeadSha = context.payload.pull_request.head.sha
      const contextBaseSha = context.payload.pull_request.base.sha

      const headBranchResponse = await context.octokit.repos.getBranch(context.repo({ branch: pr.head.ref }))
      const headBranchSha = headBranchResponse.data.commit.sha
      context.log.debug(`head branch sha: ${headBranchSha}, context head sha: ${contextHeadSha}`)

      const targetBranchResponse = await context.octokit.repos.getBranch(context.repo({ branch: targetBranch }))
      const targetBranchSha = targetBranchResponse.data.commit.sha
      context.log.debug(`target branch sha: ${targetBranchSha}, context base sha: ${contextBaseSha}`)

      if (targetBranchSha !== contextBaseSha) {
        const comment = 'PR is not up to date with base branch'
        context.log.info(comment)
        const commitStatus = 'pending'
        const statusOptions = {
          context: checkerName,
          description: comment,
          state: commitStatus
        }
        context.log.debug('Sending status check:', statusOptions)
        const prStatusUpdate = context.repo(Object.assign({}, statusOptions, { sha: headBranchSha }))
        await context.octokit.repos.createCommitStatus(prStatusUpdate)
        return
      }
    }

    const comment = 'PR is up to date with base branch'
    const commitStatus = 'success'
    const statusOptions = {
      context: checkerName,
      description: comment,
      state: commitStatus
    }
    context.log.debug('Sending status check:', statusOptions)
    const prStatusUpdate = context.repo(Object.assign({}, statusOptions, { sha: pr.head.sha }))
    await context.octokit.repos.createCommitStatus(prStatusUpdate)
  }
}

async function _listFilesInPR (context, pullParams) {
  const files = await context.octokit.pulls.listFiles(pullParams)
  context.log.debug('files', files)
  const modifiedFiles = files.data.map(file => file.filename)
  return modifiedFiles
}

module.exports = {
  checkUpToDate
}
