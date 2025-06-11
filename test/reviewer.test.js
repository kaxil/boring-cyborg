const { addReviewersOnPr } = require('../lib/reviewer')

describe('reviewer', () => {
  let context

  beforeEach(() => {
    context = {
      event: 'pull_request',
      payload: {
        action: 'labeled'
      },
      log: {
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn()
      },
      octokit: {
        pulls: {
          get: jest.fn(),
          createReviewRequest: jest.fn()
        }
      },
      issue: jest.fn(() => ({ owner: 'owner', repo: 'repo', pull_number: 1 })),
      repo: jest.fn((params) => ({ owner: 'owner', repo: 'repo', ...params }))
    }
  })

  describe('addReviewersOnPr', () => {
    it('should add reviewers based on labels', async () => {
      const config = {
        addReviewerBasedOnLabel: {
          labels: {
            frontend: ['frontend-reviewer'],
            backend: ['backend-reviewer']
          },
          defaultReviewers: ['default-reviewer']
        }
      }

      context.octokit.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          number: 1,
          user: { login: 'author' },
          labels: [{ name: 'frontend' }],
          requested_reviewers: []
        }
      })

      await addReviewersOnPr(context, config)

      expect(context.octokit.pulls.createReviewRequest).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        pull_number: 1,
        reviewers: ['default-reviewer', 'frontend-reviewer']
      })
    })

    it('should not add author as reviewer', async () => {
      const config = {
        addReviewerBasedOnLabel: {
          labels: {
            frontend: ['author', 'frontend-reviewer']
          }
        }
      }

      context.octokit.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          number: 1,
          user: { login: 'author' },
          labels: [{ name: 'frontend' }],
          requested_reviewers: []
        }
      })

      await addReviewersOnPr(context, config)

      expect(context.octokit.pulls.createReviewRequest).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        pull_number: 1,
        reviewers: ['frontend-reviewer']
      })
    })

    it('should not add reviewers if no matching labels', async () => {
      const config = {
        addReviewerBasedOnLabel: {
          labels: {
            frontend: ['frontend-reviewer']
          }
        }
      }

      context.octokit.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          number: 1,
          user: { login: 'author' },
          labels: [{ name: 'backend' }],
          requested_reviewers: []
        }
      })

      await addReviewersOnPr(context, config)

      expect(context.octokit.pulls.createReviewRequest).not.toHaveBeenCalled()
    })

    it('should skip if config not present', async () => {
      const config = {}

      await addReviewersOnPr(context, config)

      expect(context.octokit.pulls.get).not.toHaveBeenCalled()
      expect(context.octokit.pulls.createReviewRequest).not.toHaveBeenCalled()
    })

    it('should handle API errors gracefully', async () => {
      const config = {
        addReviewerBasedOnLabel: {
          labels: {
            frontend: ['frontend-reviewer']
          }
        }
      }

      context.octokit.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          number: 1,
          user: { login: 'author' },
          labels: [{ name: 'frontend' }],
          requested_reviewers: []
        }
      })

      context.octokit.pulls.createReviewRequest.mockRejectedValue(new Error('API Error'))

      await expect(addReviewersOnPr(context, config)).resolves.not.toThrow()
      expect(context.log.debug).toHaveBeenCalled()
    })
  })
})
