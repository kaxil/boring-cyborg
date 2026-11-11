'use strict'
const ignore = require('ignore')
const utils = require('./utils')

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
    let filePatterns
    const pr = await utils.getPr(context)
    context.log.info(`Fetched PR for ${checkerName}: ${pr.url}`)

    // Without a configured targetBranch, check against the branch the PR targets
    const targetBranch = config[configKey][targetBranchKey] || pr.base.ref

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

    const modifiedFiles = (await utils.getPrFiles(context)).map(file => file.filename)
    context.log.debug(`Files in the PR: ${JSON.stringify(modifiedFiles)}`)

    context.log.debug(`Looking for files matching pattern: ${JSON.stringify(filePatterns)}`)
    const matcher = ignore().add(filePatterns)

    let upToDate = true
    if (modifiedFiles.find(file => matcher.ignores(file))) {
      context.log.info(`Found files that match pattern. Checking if PR is up to date with ${targetBranch}`)

      // Up to date means the PR head contains the target branch's tip. The compare endpoint
      // resolves a fork PR's head SHA too, since forks share the base repo's commits.
      const { data: comparison } = await context.octokit.rest.repos.compareCommits(
        context.repo({ base: targetBranch, head: pr.head.sha, per_page: 1 })
      )
      context.log.debug(`PR head is ${comparison.behind_by} commits behind ${targetBranch}`)
      upToDate = comparison.behind_by === 0
    }

    const statusOptions = {
      context: checkerName,
      description: upToDate ? 'PR is up to date with base branch' : 'PR is not up to date with base branch',
      state: upToDate ? 'success' : 'pending'
    }
    context.log.info(statusOptions.description)
    // pr comes from the API, so pr.head.sha is the current head, fork PRs included
    await context.octokit.rest.repos.createCommitStatus(context.repo({ ...statusOptions, sha: pr.head.sha }))
  }
}

module.exports = {
  checkUpToDate
}
