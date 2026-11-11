const { checkUpToDate } = require('../lib/up_to_date_checker')
const { createMockContext } = require('./helpers')

describe('up_to_date_checker', () => {
  let context

  beforeEach(() => {
    context = createMockContext({
      payload: {
        pull_request: {
          number: 7,
          head: { sha: 'stale-payload-head-sha' },
          base: { sha: 'stale-payload-base-sha', ref: 'release-2' }
        }
      }
    })
  })

  const setupPr = () => {
    context.octokit.rest.pulls.get.mockResolvedValue({
      data: {
        url: 'https://api.github.com/repos/owner/repo/pulls/7',
        number: 7,
        // Opened from a fork, so the head branch exists in contributor/repo, not here
        head: { sha: 'pr-head-sha', ref: 'feature-branch', repo: { full_name: 'contributor/repo' } },
        base: { sha: 'base-sha', ref: 'release-2' }
      }
    })
  }

  const setupFiles = (filenames) => {
    context.octokit.paginate.mockResolvedValue(
      filenames.map(f => ({ filename: f }))
    )
  }

  const setupComparison = (behindBy) => {
    context.octokit.rest.repos.compareCommits.mockResolvedValue({ data: { behind_by: behindBy } })
  }

  const comparedRefs = () => context.octokit.rest.repos.compareCommits.mock.calls.map(([params]) => `${params.base}...${params.head}`)

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
      // The PR head already contains the target branch's tip
      setupComparison(0)

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

    it('should set pending status on the PR head SHA when the target branch has commits the PR lacks', async () => {
      const config = {
        checkUpToDate: {
          files: ['migrations/*'],
          targetBranch: 'master'
        }
      }

      setupPr()
      setupFiles(['migrations/001.sql'])
      setupComparison(2)

      await checkUpToDate(context, config)

      const statusCall = context.octokit.rest.repos.createCommitStatus.mock.calls[0][0]
      expect(statusCall).toMatchObject({
        state: 'pending',
        context: 'Up-to-date Checker',
        description: 'PR is not up to date with base branch'
      })
      // The fresh head SHA from pulls.get, not the stale context.payload.pull_request.head.sha
      expect(statusCall.sha).toBe('pr-head-sha')
      // The exact head commit the status goes on, not the stale payload SHA
      expect(comparedRefs()).toEqual(['master...pr-head-sha'])
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

      await checkUpToDate(context, config)

      // Should post success since no tracked files were modified
      expect(context.octokit.rest.repos.createCommitStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'success',
          description: 'PR is up to date with base branch'
        })
      )
      expect(context.octokit.rest.repos.compareCommits).not.toHaveBeenCalled()
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
      setupComparison(0)

      await checkUpToDate(context, config)

      // Without a targetBranch, it checks against the branch the PR targets
      expect(comparedRefs()).toEqual(['release-2...pr-head-sha'])
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
      setupComparison(0)

      await checkUpToDate(context, config)

      expect(comparedRefs()).toEqual(['develop...pr-head-sha'])
    })
  })
})
