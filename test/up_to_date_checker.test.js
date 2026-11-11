const { checkUpToDate } = require('../lib/up_to_date_checker')
const { createMockContext } = require('./helpers')

describe('up_to_date_checker', () => {
  let context

  beforeEach(() => {
    context = createMockContext({
      payload: {
        pull_request: {
          head: { sha: 'context-head-sha' },
          base: { sha: 'target-branch-sha', ref: 'main' }
        }
      }
    })
  })

  const setupPr = () => {
    context.octokit.rest.pulls.get.mockResolvedValue({
      data: {
        url: 'https://api.github.com/repos/owner/repo/pulls/1',
        // Opened from a fork, so the head branch exists in contributor/repo, not here
        head: { sha: 'pr-head-sha', ref: 'feature-branch', repo: { full_name: 'contributor/repo' } },
        base: { sha: 'target-branch-sha', ref: 'main' }
      }
    })
  }

  const setupFiles = (filenames) => {
    context.octokit.paginate.mockResolvedValue(
      filenames.map(f => ({ filename: f }))
    )
  }

  const setupTargetBranch = (targetSha) => {
    context.octokit.rest.repos.getBranch.mockResolvedValue({ data: { commit: { sha: targetSha } } })
  }

  describe('checkUpToDate', () => {
    it('should set success status when PR is up to date', async () => {
      const config = {
        checkUpToDate: {
          files: ['migrations/*'],
          targetBranch: 'master'
        }
      }

      setupPr()
      setupFiles(['migrations/001.sql'])
      // target branch sha matches the context base sha => up to date
      setupTargetBranch('target-branch-sha')

      await checkUpToDate(context, config)

      expect(context.octokit.rest.repos.createCommitStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'success',
          context: 'Up-to-date Checker',
          description: 'PR is up to date with base branch',
          sha: 'pr-head-sha'
        })
      )
    })

    it('should set pending status on the PR head SHA when PR is NOT up to date, even from a fork', async () => {
      const config = {
        checkUpToDate: {
          files: ['migrations/*'],
          targetBranch: 'master'
        }
      }

      setupPr()
      setupFiles(['migrations/001.sql'])
      // target branch sha differs from context base sha => not up to date
      setupTargetBranch('different-target-sha')

      await checkUpToDate(context, config)

      const statusCall = context.octokit.rest.repos.createCommitStatus.mock.calls[0][0]
      expect(statusCall).toMatchObject({
        state: 'pending',
        context: 'Up-to-date Checker',
        description: 'PR is not up to date with base branch'
      })
      // The fresh head SHA from pulls.get, not the stale context.payload.pull_request.head.sha
      expect(statusCall.sha).toBe('pr-head-sha')
      // Only the target branch is looked up: a fork PR's head branch doesn't exist in this repo
      expect(context.octokit.rest.repos.getBranch.mock.calls.map(([params]) => params.branch)).toEqual(['master'])
    })

    it('should set success status when no files match the pattern', async () => {
      const config = {
        checkUpToDate: {
          files: ['migrations/*'],
          targetBranch: 'master'
        }
      }

      setupPr()
      setupFiles(['src/app.js', 'README.md'])
      // The branch shouldn't even be fetched, but set up to avoid unhandled rejection
      setupTargetBranch('target-sha')

      await checkUpToDate(context, config)

      // Should post success since no tracked files were modified
      expect(context.octokit.rest.repos.createCommitStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'success',
          description: 'PR is up to date with base branch'
        })
      )
      // getBranch should NOT be called when no files match
      expect(context.octokit.rest.repos.getBranch).not.toHaveBeenCalled()
    })

    it('should do nothing when config is not present', async () => {
      const config = {}

      await checkUpToDate(context, config)

      expect(context.octokit.rest.pulls.get).not.toHaveBeenCalled()
      expect(context.octokit.rest.repos.createCommitStatus).not.toHaveBeenCalled()
    })

    it('should work with legacy config format (bare array)', async () => {
      // Backwards compatibility: config value is directly an array of file patterns
      const config = {
        checkUpToDate: ['migrations/*', 'schema/*.sql']
      }

      setupPr()
      setupFiles(['schema/tables.sql'])
      setupTargetBranch('target-branch-sha')

      await checkUpToDate(context, config)

      // Should use default targetBranch 'master'
      expect(context.octokit.rest.repos.getBranch).toHaveBeenCalledWith(
        expect.objectContaining({ branch: 'master' })
      )
      expect(context.octokit.rest.repos.createCommitStatus).toHaveBeenCalledWith(
        expect.objectContaining({ state: 'success' })
      )
    })

    it('should return early when targetBranch is set but files key is missing', async () => {
      // This was a crash bug: ignore().add(undefined) threw TypeError
      const config = {
        checkUpToDate: {
          targetBranch: 'main'
        }
      }

      setupPr()

      await checkUpToDate(context, config)

      // Should return early without crashing, no file listing or status check
      expect(context.octokit.rest.pulls.listFiles).not.toHaveBeenCalled()
      expect(context.octokit.rest.repos.createCommitStatus).not.toHaveBeenCalled()
    })

    it('should return early when files key is present but null', async () => {
      const config = {
        checkUpToDate: {
          files: null,
          targetBranch: 'main'
        }
      }

      setupPr()

      await checkUpToDate(context, config)

      expect(context.octokit.rest.pulls.listFiles).not.toHaveBeenCalled()
      expect(context.octokit.rest.repos.createCommitStatus).not.toHaveBeenCalled()
    })

    it('should use custom targetBranch from config', async () => {
      const config = {
        checkUpToDate: {
          files: ['migrations/*'],
          targetBranch: 'develop'
        }
      }

      setupPr()
      setupFiles(['migrations/001.sql'])
      setupTargetBranch('target-branch-sha')

      await checkUpToDate(context, config)

      expect(context.octokit.rest.repos.getBranch).toHaveBeenCalledWith(
        expect.objectContaining({ branch: 'develop' })
      )
    })
  })
})
