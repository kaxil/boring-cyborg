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

  const setupPr = (headRef = 'feature-branch') => {
    context.octokit.pulls.get.mockResolvedValue({
      data: {
        url: 'https://api.github.com/repos/owner/repo/pulls/1',
        head: { sha: 'pr-head-sha', ref: headRef },
        base: { sha: 'target-branch-sha', ref: 'main' }
      }
    })
  }

  const setupFiles = (filenames) => {
    context.octokit.paginate.mockResolvedValue(
      filenames.map(f => ({ filename: f }))
    )
  }

  const setupBranches = (headSha, targetSha) => {
    context.octokit.repos.getBranch
      .mockResolvedValueOnce({ data: { commit: { sha: headSha } } })
      .mockResolvedValueOnce({ data: { commit: { sha: targetSha } } })
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
      setupBranches('fresh-head-sha', 'target-branch-sha')

      await checkUpToDate(context, config)

      expect(context.octokit.repos.createCommitStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'success',
          context: 'Up-to-date Checker',
          description: 'PR is up to date with base branch'
        })
      )
    })

    it('should set pending status when PR is NOT up to date, using fresh head SHA', async () => {
      const config = {
        checkUpToDate: {
          files: ['migrations/*'],
          targetBranch: 'master'
        }
      }

      setupPr()
      setupFiles(['migrations/001.sql'])
      // target branch sha differs from context base sha => not up to date
      setupBranches('fresh-head-sha', 'different-target-sha')

      await checkUpToDate(context, config)

      const statusCall = context.octokit.repos.createCommitStatus.mock.calls[0][0]
      expect(statusCall).toMatchObject({
        state: 'pending',
        context: 'Up-to-date Checker',
        description: 'PR is not up to date with base branch'
      })
      // The status must be posted against the fresh head SHA from getBranch,
      // not the stale context.payload.pull_request.head.sha
      expect(statusCall.sha).toBe('fresh-head-sha')
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
      // Branches shouldn't even be fetched, but set up to avoid unhandled rejection
      setupBranches('head-sha', 'target-sha')

      await checkUpToDate(context, config)

      // Should post success since no tracked files were modified
      expect(context.octokit.repos.createCommitStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'success',
          description: 'PR is up to date with base branch'
        })
      )
      // getBranch should NOT be called when no files match
      expect(context.octokit.repos.getBranch).not.toHaveBeenCalled()
    })

    it('should do nothing when config is not present', async () => {
      const config = {}

      await checkUpToDate(context, config)

      expect(context.octokit.pulls.get).not.toHaveBeenCalled()
      expect(context.octokit.repos.createCommitStatus).not.toHaveBeenCalled()
    })

    it('should work with legacy config format (bare array)', async () => {
      // Backwards compatibility: config value is directly an array of file patterns
      const config = {
        checkUpToDate: ['migrations/*', 'schema/*.sql']
      }

      setupPr()
      setupFiles(['schema/tables.sql'])
      setupBranches('head-sha', 'target-branch-sha')

      await checkUpToDate(context, config)

      // Should use default targetBranch 'master'
      expect(context.octokit.repos.getBranch).toHaveBeenCalledWith(
        expect.objectContaining({ branch: 'master' })
      )
      expect(context.octokit.repos.createCommitStatus).toHaveBeenCalledWith(
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
      expect(context.octokit.pulls.listFiles).not.toHaveBeenCalled()
      expect(context.octokit.repos.createCommitStatus).not.toHaveBeenCalled()
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

      expect(context.octokit.pulls.listFiles).not.toHaveBeenCalled()
      expect(context.octokit.repos.createCommitStatus).not.toHaveBeenCalled()
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
      setupBranches('head-sha', 'target-branch-sha')

      await checkUpToDate(context, config)

      // getBranch is called twice: once for head branch, once for target branch
      const targetBranchCall = context.octokit.repos.getBranch.mock.calls[1][0]
      expect(targetBranchCall.branch).toBe('develop')
    })

    it('should post success status using PR head SHA when up to date', async () => {
      const config = {
        checkUpToDate: {
          files: ['migrations/*'],
          targetBranch: 'master'
        }
      }

      setupPr('my-feature')
      setupFiles(['migrations/001.sql'])
      setupBranches('fresh-head-sha', 'target-branch-sha')

      await checkUpToDate(context, config)

      // When up to date, status uses pr.head.sha from pulls.get (not getBranch)
      const statusCall = context.octokit.repos.createCommitStatus.mock.calls[0][0]
      expect(statusCall.sha).toBe('pr-head-sha')
    })
  })
})
