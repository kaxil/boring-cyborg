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
    const issue = await context.issue()
    const getPr = await context.github.pulls.get(issue)
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
    const modifiedFiles = await _listFilesInPR(context, issue)
    context.log.debug('Files in the PR:', modifiedFiles)

    context.log.debug(`Looking for files: ${filePatterns}`)
    const matcher = ignore().add(filePatterns)

    if (modifiedFiles.find(file => matcher.ignores(file))) {
      context.log.info('Found files matching conditions. Checking if need rebase.')

      // Get parent commit of the first commit in the PR
      const parentCommitId = await _getParentOfFirstCommitOfPR(context, issue)

      const branchesForHeadCommit = await _listBranchesForHeadCommit(context, parentCommitId)

      if (branchesForHeadCommit.includes(targetBranch)) {
        context.log.info(`PR branch is up to date with ${targetBranch}`)
        await _createStatus(context, pr, checkerName, 'success', `PR is up to date with ${targetBranch}`)
      } else {
        context.log.info(`PR branch is not up to date with ${targetBranch}. Need rebase`)
        await _createStatus(context, pr, checkerName, 'failure', `PR is not up to date with ${targetBranch}. Please rebase.`)
      }
    }
  }
}

async function _getParentOfFirstCommitOfPR (context, issue) {
  const commits = await context.github.pulls.listCommits(issue)
  const firstCommitId = commits.data[0].sha
  const getFirstCommit = await context.github.repos.getCommit(context.repo({ commit_sha: firstCommitId }))
  const parentCommitId = getFirstCommit.data.parents[0].sha
  return parentCommitId
}

async function _listBranchesForHeadCommit (context, commit) {
  const getBranches = await context.github.repos.listBranchesForHeadCommit(context.repo({ commit_sha: commit }))
  const branches = getBranches.data.map(branch => branch.name)
  return branches
}

async function _createStatus (context, pr, checkerName, state, description) {
  const params = {
    sha: pr.head.sha,
    context: checkerName,
    state: state,
    description: description
  }
  await context.github.repos.createStatus(context.repo(params))
}

async function _listFilesInPR (context, issue) {
  const files = await context.github.pulls.listFiles(issue)
  context.log.debug('files', files)
  const modifiedFiles = files.data.map(file => file.filename)
  return modifiedFiles
}

module.exports = {
  checkUpToDate: checkUpToDate
}
