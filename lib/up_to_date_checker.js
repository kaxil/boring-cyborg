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
    const getPr = await context.octokit.rest.pulls.get(pullParams)
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
        context.log.debug('No file patterns configured, skipping up-to-date check')
        return
      }
    }

    if (!filePatterns || (Array.isArray(filePatterns) && filePatterns.length === 0)) {
      context.log.debug('No file patterns configured, skipping up-to-date check')
      return
    }

    // Get files in the PR
    const modifiedFiles = await _listFilesInPR(context, pullParams)
    context.log.debug(`Files in the PR: ${JSON.stringify(modifiedFiles)}`)

    context.log.debug(`Looking for files matching pattern: ${JSON.stringify(filePatterns)}`)
    const matcher = ignore().add(filePatterns)

    let upToDate = true
    if (modifiedFiles.find(file => matcher.ignores(file))) {
      context.log.info(`Found files that match pattern. Checking if PR is up to date with ${targetBranch}`)

      const contextBaseSha = context.payload.pull_request.base.sha
      const targetBranchResponse = await context.octokit.rest.repos.getBranch(context.repo({ branch: targetBranch }))
      const targetBranchSha = targetBranchResponse.data.commit.sha
      context.log.debug(`target branch sha: ${targetBranchSha}, context base sha: ${contextBaseSha}`)
      upToDate = targetBranchSha === contextBaseSha
    }

    const statusOptions = {
      context: checkerName,
      description: upToDate ? 'PR is up to date with base branch' : 'PR is not up to date with base branch',
      state: upToDate ? 'success' : 'pending'
    }
    context.log.info(statusOptions.description)
    // pr comes from the API, so pr.head.sha is the current head. Don't look the head branch
    // up in this repo: a fork PR's branch lives in the fork.
    await context.octokit.rest.repos.createCommitStatus(context.repo({ ...statusOptions, sha: pr.head.sha }))
  }
}

async function _listFilesInPR (context, pullParams) {
  const files = await context.octokit.paginate(context.octokit.rest.pulls.listFiles, pullParams)
  context.log.debug(`Files response: ${JSON.stringify(files.map(f => f.filename))}`)
  const modifiedFiles = files.map(file => file.filename)
  return modifiedFiles
}

module.exports = {
  checkUpToDate
}
