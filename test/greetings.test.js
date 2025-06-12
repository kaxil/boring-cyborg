const { commentOnfirstPR, commentOnfirstPRMerge, commentOnfirstIssue } = require('../lib/greetings')

describe('greetings', () => {
  let context

  beforeEach(() => {
    context = {
      payload: {
        pull_request: {
          user: { login: 'testuser' },
          number: 1,
          html_url: 'https://github.com/owner/repo/pull/1',
          merged: false,
          created_at: '2024-01-01T00:00:00Z',
          merged_at: '2024-01-02T00:00:00Z'
        },
        repository: {
          full_name: 'owner/repo'
        },
        issue: {
          user: { login: 'testuser' },
          number: 1,
          html_url: 'https://github.com/owner/repo/issues/1',
          created_at: '2024-01-01T00:00:00Z'
        }
      },
      log: {
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn()
      },
      octokit: {
        rest: {
          search: {
            issuesAndPullRequests: jest.fn()
          }
        },
        issues: {
          createComment: jest.fn()
        }
      },
      issue: jest.fn((obj = {}) => ({ owner: 'owner', repo: 'repo', issue_number: 1, ...obj }))
    }
  })

  describe('commentOnfirstPR', () => {
    it('should add comment on first PR', async () => {
      const config = {
        firstPRWelcomeComment: 'Welcome to your first PR!'
      }

      context.octokit.rest.search.issuesAndPullRequests.mockResolvedValue({
        data: {
          total_count: 0,
          items: []
        }
      })

      await commentOnfirstPR(context, config)

      expect(context.octokit.issues.createComment).toHaveBeenCalled()
      const callArgs = context.octokit.issues.createComment.mock.calls[0][0]
      expect(callArgs).toMatchObject({
        owner: 'owner',
        repo: 'repo',
        issue_number: 1,
        body: 'Welcome to your first PR!'
      })
    })

    it('should not add comment if not first PR', async () => {
      const config = {
        firstPRWelcomeComment: 'Welcome to your first PR!'
      }

      context.octokit.rest.search.issuesAndPullRequests.mockResolvedValue({
        data: {
          total_count: 1,
          items: [{ number: 2 }]
        }
      })

      await commentOnfirstPR(context, config)

      expect(context.octokit.issues.createComment).not.toHaveBeenCalled()
    })

    it('should not add comment if config not present', async () => {
      const config = {}

      await commentOnfirstPR(context, config)

      expect(context.octokit.rest.search.issuesAndPullRequests).not.toHaveBeenCalled()
      expect(context.octokit.issues.createComment).not.toHaveBeenCalled()
    })
  })

  describe('commentOnfirstPRMerge', () => {
    it('should add comment on first merged PR', async () => {
      const config = {
        firstPRMergeComment: 'Congratulations on your first merged PR!'
      }

      context.payload.pull_request.merged = true
      context.octokit.rest.search.issuesAndPullRequests.mockResolvedValue({
        data: {
          total_count: 0,
          items: []
        }
      })

      await commentOnfirstPRMerge(context, config)

      expect(context.octokit.issues.createComment).toHaveBeenCalled()
      const callArgs = context.octokit.issues.createComment.mock.calls[0][0]
      expect(callArgs).toMatchObject({
        owner: 'owner',
        repo: 'repo',
        issue_number: 1,
        body: 'Congratulations on your first merged PR!'
      })
    })

    it('should not add comment if PR is not merged', async () => {
      const config = {
        firstPRMergeComment: 'Congratulations on your first merged PR!'
      }

      context.payload.pull_request.merged = false

      await commentOnfirstPRMerge(context, config)

      expect(context.octokit.rest.search.issuesAndPullRequests).not.toHaveBeenCalled()
      expect(context.octokit.issues.createComment).not.toHaveBeenCalled()
    })
  })

  describe('commentOnfirstIssue', () => {
    it('should add comment on first issue', async () => {
      const config = {
        firstIssueWelcomeComment: 'Welcome to your first issue!'
      }

      context.octokit.rest.search.issuesAndPullRequests.mockResolvedValue({
        data: {
          total_count: 0,
          items: []
        }
      })

      await commentOnfirstIssue(context, config)

      expect(context.octokit.issues.createComment).toHaveBeenCalled()
      const callArgs = context.octokit.issues.createComment.mock.calls[0][0]
      expect(callArgs).toMatchObject({
        owner: 'owner',
        repo: 'repo',
        issue_number: 1,
        body: 'Welcome to your first issue!'
      })
    })

    it('should not add comment if not first issue', async () => {
      const config = {
        firstIssueWelcomeComment: 'Welcome to your first issue!'
      }

      context.octokit.rest.search.issuesAndPullRequests.mockResolvedValue({
        data: {
          total_count: 1,
          items: [{ number: 2 }]
        }
      })

      await commentOnfirstIssue(context, config)

      expect(context.octokit.issues.createComment).not.toHaveBeenCalled()
    })
  })
})
