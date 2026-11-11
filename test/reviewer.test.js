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

      context.octokit.rest.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          number: 1,
          user: { login: 'author' },
          labels: [{ name: 'frontend' }],
          requested_reviewers: []
        }
      })

      await addReviewersOnPr(context, config)

      expect(context.octokit.rest.pulls.requestReviewers).toHaveBeenCalledWith({
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

      context.octokit.rest.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          number: 1,
          user: { login: 'author' },
          labels: [{ name: 'frontend' }],
          requested_reviewers: []
        }
      })

      await addReviewersOnPr(context, config)

      expect(context.octokit.rest.pulls.requestReviewers).toHaveBeenCalledWith({
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

      context.octokit.rest.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          number: 1,
          user: { login: 'author' },
          labels: [{ name: 'backend' }],
          requested_reviewers: []
        }
      })

      await addReviewersOnPr(context, config)

      expect(context.octokit.rest.pulls.requestReviewers).not.toHaveBeenCalled()
    })

    it('should skip if config not present', async () => {
      const config = {}

      await addReviewersOnPr(context, config)

      expect(context.octokit.rest.pulls.get).not.toHaveBeenCalled()
      expect(context.octokit.rest.pulls.requestReviewers).not.toHaveBeenCalled()
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

      context.octokit.rest.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          number: 1,
          user: { login: 'author' },
          labels: [{ name: 'frontend' }],
          requested_reviewers: []
        }
      })

      await addReviewersOnPr(context, config)

      expect(context.octokit.rest.pulls.requestReviewers).toHaveBeenCalledWith({
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

      context.octokit.rest.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          number: 1,
          user: { login: 'author' },
          labels: [{ name: 'frontend' }, { name: 'backend' }],
          requested_reviewers: []
        }
      })

      await addReviewersOnPr(context, config)

      expect(context.octokit.rest.pulls.requestReviewers).toHaveBeenCalledWith({
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

      context.octokit.rest.pulls.get.mockResolvedValue({
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
      expect(context.octokit.rest.pulls.requestReviewers).not.toHaveBeenCalled()
    })

    it('should not re-request already-assigned reviewers', async () => {
      const config = {
        addReviewerBasedOnLabel: {
          labels: {
            frontend: ['already-assigned', 'new-reviewer']
          }
        }
      }

      context.octokit.rest.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          number: 1,
          user: { login: 'author' },
          labels: [{ name: 'frontend' }],
          requested_reviewers: [{ login: 'already-assigned' }]
        }
      })

      await addReviewersOnPr(context, config)

      expect(context.octokit.rest.pulls.requestReviewers).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        pull_number: 1,
        reviewers: ['new-reviewer']
      })
    })

    it('should not make review request when all reviewers are the PR author', async () => {
      const config = {
        addReviewerBasedOnLabel: {
          labels: {
            frontend: ['author']
          }
        }
      }

      context.octokit.rest.pulls.get.mockResolvedValue({
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
      expect(context.octokit.rest.pulls.requestReviewers).not.toHaveBeenCalled()
    })

    it.each([
      [422, 'resolves and warns', true],
      [500, 'rethrows', false],
      [undefined, 'rethrows', false]
    ])('on a review request error with status %s, %s', async (status, _label, shouldResolve) => {
      const context = createMockContext({ payload: { action: 'labeled' } })
      const config = {
        addReviewerBasedOnLabel: {
          labels: {
            frontend: ['frontend-reviewer']
          }
        }
      }

      context.octokit.rest.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          number: 1,
          user: { login: 'author' },
          labels: [{ name: 'frontend' }],
          requested_reviewers: []
        }
      })
      const error = Object.assign(new Error('API Error'), { status })
      context.octokit.rest.pulls.requestReviewers.mockRejectedValue(error)

      const result = addReviewersOnPr(context, config)

      if (shouldResolve) {
        await expect(result).resolves.toBeUndefined()
        expect(context.log.warn).toHaveBeenCalledWith(expect.stringContaining('API Error'))
      } else {
        await expect(result).rejects.toBe(error)
      }
    })

    it('should still request the valid reviewers when GitHub refuses one of them', async () => {
      const config = {
        addReviewerBasedOnLabel: {
          labels: {
            frontend: ['alice', 'departed-user']
          }
        }
      }

      context.octokit.rest.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          number: 1,
          user: { login: 'author' },
          labels: [{ name: 'frontend' }],
          requested_reviewers: []
        }
      })
      const notCollaborator = Object.assign(new Error('Reviews may only be requested from collaborators'), { status: 422 })
      context.octokit.rest.pulls.requestReviewers.mockImplementation(async ({ reviewers }) => {
        if (reviewers.includes('departed-user')) throw notCollaborator
      })

      await addReviewersOnPr(context, config)

      expect(context.octokit.rest.pulls.requestReviewers.mock.calls.map(([params]) => params.reviewers)).toEqual([
        ['alice', 'departed-user'],
        ['alice'],
        ['departed-user']
      ])
      expect(context.log.warn).toHaveBeenCalledTimes(1)
      expect(context.log.warn).toHaveBeenCalledWith(expect.stringContaining('departed-user'))
    })
  })
})
