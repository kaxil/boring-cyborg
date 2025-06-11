const { verifyTitles } = require('../lib/title_validator')

describe('title_validator', () => {
  let context

  beforeEach(() => {
    context = {
      log: {
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn()
      },
      octokit: {
        pulls: {
          get: jest.fn(),
          listCommits: jest.fn()
        },
        rest: {
          repos: {
            createCommitStatus: jest.fn()
          }
        }
      },
      issue: jest.fn(() => ({ owner: 'owner', repo: 'repo', pull_number: 1 })),
      repo: jest.fn((params) => ({ owner: 'owner', repo: 'repo', ...params }))
    }
  })

  describe('verifyTitles', () => {
    it('should pass validation for valid PR title', async () => {
      const config = {
        verifyTitles: {
          titleRegexp: '^(feat|fix|docs)\\(.+\\): .+',
          alwaysUsePrTitle: true,
          statusTitle: 'Title Validator',
          successMessage: 'Title is valid!'
        }
      }

      context.octokit.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          title: 'feat(api): add new endpoint',
          head: { sha: 'abc123' }
        }
      })

      context.octokit.pulls.listCommits.mockResolvedValue({
        data: []
      })

      await verifyTitles(context, config)

      expect(context.octokit.rest.repos.createCommitStatus).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        sha: 'abc123',
        context: 'Title Validator',
        state: 'success',
        description: 'Title is valid!'
      })
    })

    it('should fail validation for invalid PR title', async () => {
      const config = {
        verifyTitles: {
          titleRegexp: '^(feat|fix|docs)\\(.+\\): .+',
          alwaysUsePrTitle: true,
          statusTitle: 'Title Validator',
          // eslint-disable-next-line no-template-curly-in-string
          failureMessage: 'Wrong ${type} title: ${title}'
        }
      }

      context.octokit.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          title: 'invalid title format',
          head: { sha: 'abc123' }
        }
      })

      context.octokit.pulls.listCommits.mockResolvedValue({
        data: []
      })

      await verifyTitles(context, config)

      expect(context.octokit.rest.repos.createCommitStatus).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        sha: 'abc123',
        context: 'Title Validator',
        state: 'failure',
        description: 'Wrong PR title: invalid title format'
      })
    })

    it('should validate commit titles when not using PR title', async () => {
      const config = {
        verifyTitles: {
          titleRegexp: '^(feat|fix|docs)\\(.+\\): .+',
          alwaysUsePrTitle: false,
          statusTitle: 'Title Validator',
          successMessage: 'Title is valid!'
        }
      }

      context.octokit.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          title: 'Some PR title',
          head: { sha: 'abc123' }
        }
      })

      context.octokit.pulls.listCommits.mockResolvedValue({
        data: [
          { commit: { message: 'feat(api): add new endpoint' } }
        ]
      })

      await verifyTitles(context, config)

      expect(context.octokit.rest.repos.createCommitStatus).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        sha: 'abc123',
        context: 'Title Validator',
        state: 'success',
        description: 'Title is valid!'
      })
    })

    it('should fail for invalid commit title', async () => {
      const config = {
        verifyTitles: {
          titleRegexp: '^(feat|fix|docs)\\(.+\\): .+',
          alwaysUsePrTitle: false,
          statusTitle: 'Title Validator',
          // eslint-disable-next-line no-template-curly-in-string
          failureMessage: 'Wrong ${type} title: ${title}'
        }
      }

      context.octokit.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          title: 'Some PR title',
          head: { sha: 'abc123' }
        }
      })

      context.octokit.pulls.listCommits.mockResolvedValue({
        data: [
          { commit: { message: 'invalid commit message' } }
        ]
      })

      await verifyTitles(context, config)

      expect(context.octokit.rest.repos.createCommitStatus).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        sha: 'abc123',
        context: 'Title Validator',
        state: 'failure',
        description: 'Wrong Commit title: invalid commit message'
      })
    })

    it('should handle no commits case', async () => {
      const config = {
        verifyTitles: {
          titleRegexp: '^(feat|fix|docs)\\(.+\\): .+',
          alwaysUsePrTitle: false,
          statusTitle: 'Title Validator'
        }
      }

      context.octokit.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          title: 'Some PR title',
          head: { sha: 'abc123' }
        }
      })

      context.octokit.pulls.listCommits.mockResolvedValue({
        data: []
      })

      await verifyTitles(context, config)

      expect(context.octokit.rest.repos.createCommitStatus).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        sha: 'abc123',
        context: 'Title Validator',
        state: 'failure',
        description: 'No commits ?????'
      })
    })

    it('should skip if config not present', async () => {
      const config = {}

      await verifyTitles(context, config)

      expect(context.octokit.pulls.get).not.toHaveBeenCalled()
      expect(context.octokit.rest.repos.createCommitStatus).not.toHaveBeenCalled()
    })
  })
})
