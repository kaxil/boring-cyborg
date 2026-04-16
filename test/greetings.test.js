const { commentOnfirstPR, commentOnfirstPRMerge, commentOnfirstIssue } = require('../lib/greetings')
const { createMockContext } = require('./helpers')

describe('greetings', () => {
  let context

  beforeEach(() => {
    context = createMockContext()
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

    it('should construct the correct search query for first-time check', async () => {
      const config = {
        firstPRWelcomeComment: 'Welcome!'
      }

      context.octokit.rest.search.issuesAndPullRequests.mockResolvedValue({
        data: { total_count: 0, items: [] }
      })

      await commentOnfirstPR(context, config)

      const searchCall = context.octokit.rest.search.issuesAndPullRequests.mock.calls[0][0]
      expect(searchCall.q).toContain('is:pr')
      expect(searchCall.q).toContain('author:testuser')
      expect(searchCall.q).toContain('repo:owner/repo')
      expect(searchCall.q).toContain('created:<2024-01-01T00:00:00Z')
      expect(searchCall.per_page).toBe(1)
    })

    it('should swallow 404 errors from createComment', async () => {
      const config = {
        firstPRWelcomeComment: 'Welcome!'
      }

      context.octokit.rest.search.issuesAndPullRequests.mockResolvedValue({
        data: { total_count: 0, items: [] }
      })
      const notFoundError = new Error('Not Found')
      notFoundError.status = 404
      context.octokit.issues.createComment.mockRejectedValue(notFoundError)

      // 404 should be swallowed (PR deleted between webhook and handler)
      await expect(commentOnfirstPR(context, config)).resolves.not.toThrow()
    })

    it('should re-throw non-404 errors from createComment', async () => {
      const config = {
        firstPRWelcomeComment: 'Welcome!'
      }

      context.octokit.rest.search.issuesAndPullRequests.mockResolvedValue({
        data: { total_count: 0, items: [] }
      })
      const serverError = new Error('Internal Server Error')
      serverError.status = 500
      context.octokit.issues.createComment.mockRejectedValue(serverError)

      await expect(commentOnfirstPR(context, config)).rejects.toThrow('Internal Server Error')
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

    it('should construct the correct search query for first-merged check', async () => {
      const config = { firstPRMergeComment: 'Congrats!' }
      context.payload.pull_request.merged = true

      context.octokit.rest.search.issuesAndPullRequests.mockResolvedValue({
        data: { total_count: 0, items: [] }
      })

      await commentOnfirstPRMerge(context, config)

      const searchCall = context.octokit.rest.search.issuesAndPullRequests.mock.calls[0][0]
      expect(searchCall.q).toContain('is:pr')
      expect(searchCall.q).toContain('is:merged')
      expect(searchCall.q).toContain('author:testuser')
      expect(searchCall.q).toContain('repo:owner/repo')
    })

    it('should swallow 404 but re-throw 500 from createComment on merge', async () => {
      const config = { firstPRMergeComment: 'Congrats!' }
      context.payload.pull_request.merged = true

      context.octokit.rest.search.issuesAndPullRequests.mockResolvedValue({
        data: { total_count: 0, items: [] }
      })

      const notFoundError = new Error('Not Found')
      notFoundError.status = 404
      context.octokit.issues.createComment.mockRejectedValue(notFoundError)
      await expect(commentOnfirstPRMerge(context, config)).resolves.not.toThrow()

      const serverError = new Error('Server Error')
      serverError.status = 500
      context.octokit.issues.createComment.mockRejectedValue(serverError)
      await expect(commentOnfirstPRMerge(context, config)).rejects.toThrow('Server Error')
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

    it('should construct the correct search query for first-issue check', async () => {
      const config = { firstIssueWelcomeComment: 'Welcome!' }

      context.octokit.rest.search.issuesAndPullRequests.mockResolvedValue({
        data: { total_count: 0, items: [] }
      })

      await commentOnfirstIssue(context, config)

      const searchCall = context.octokit.rest.search.issuesAndPullRequests.mock.calls[0][0]
      expect(searchCall.q).toContain('is:issue')
      expect(searchCall.q).toContain('author:testuser')
      expect(searchCall.q).toContain('repo:owner/repo')
    })

    it('should swallow 404 but re-throw 500 from createComment on issue', async () => {
      const config = { firstIssueWelcomeComment: 'Welcome!' }

      context.octokit.rest.search.issuesAndPullRequests.mockResolvedValue({
        data: { total_count: 0, items: [] }
      })

      const notFoundError = new Error('Not Found')
      notFoundError.status = 404
      context.octokit.issues.createComment.mockRejectedValue(notFoundError)
      await expect(commentOnfirstIssue(context, config)).resolves.not.toThrow()

      const serverError = new Error('Server Error')
      serverError.status = 500
      context.octokit.issues.createComment.mockRejectedValue(serverError)
      await expect(commentOnfirstIssue(context, config)).rejects.toThrow('Server Error')
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
