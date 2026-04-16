const { addReviewersOnPr } = require('../lib/reviewer')
const { createMockContext } = require('./helpers')

describe('reviewer', () => {
  let context

  beforeEach(() => {
    context = createMockContext({ payload: { action: 'labeled' } })
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

    it('should accept the object rule form with reviewers + targetBranchFilter', async () => {
      const config = {
        addReviewerBasedOnLabel: {
          labels: {
            frontend: {
              reviewers: ['frontend-reviewer'],
              targetBranchFilter: '^main$'
            }
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

    it('should skip reviewers for a label whose filter does not match', async () => {
      const config = {
        addReviewerBasedOnLabel: {
          labels: {
            frontend: {
              reviewers: ['frontend-reviewer'],
              targetBranchFilter: '^release/.*$'
            },
            backend: ['backend-reviewer']
          }
        }
      }

      context.octokit.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          number: 1,
          user: { login: 'author' },
          labels: [{ name: 'frontend' }, { name: 'backend' }],
          requested_reviewers: []
        }
      })

      await addReviewersOnPr(context, config)

      expect(context.octokit.pulls.createReviewRequest).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        pull_number: 1,
        reviewers: ['backend-reviewer']
      })
    })

    it('should warn and skip a rule with no reviewers configured', async () => {
      const config = {
        addReviewerBasedOnLabel: {
          labels: {
            frontend: { targetBranchFilter: '^main$' }
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

      expect(context.log.warn).toHaveBeenCalled()
      expect(context.octokit.pulls.createReviewRequest).not.toHaveBeenCalled()
    })

    it('should not make review request when all reviewers are the PR author', async () => {
      const config = {
        addReviewerBasedOnLabel: {
          labels: {
            frontend: ['author']
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

      // After removing the author, no reviewers remain — should not call API
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
