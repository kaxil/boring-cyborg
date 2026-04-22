const { commentOnfirstPR, commentOnfirstPRMerge, commentOnfirstIssue } = require('../lib/greetings')
const { createMockContext } = require('./helpers')

describe('greetings', () => {
  let context

  beforeEach(() => {
    context = createMockContext()
    // Default: no prior commits → handlers fall through to createComment
    context.octokit.repos.listCommits.mockResolvedValue({ data: [] })
    // Default: no prior issues/PRs by the author (only the current one)
    context.octokit.issues.listForRepo.mockResolvedValue({
      data: [{ number: 1, pull_request: { url: 'x' } }]
    })
    // `paginate(fn, opts)` is used to fetch the PR's own commits; default to empty
    context.octokit.paginate.mockResolvedValue([])
  })

  describe('commentOnfirstPR', () => {
    it('adds comment when author has no prior commits', async () => {
      const config = { firstPRWelcomeComment: 'Welcome to your first PR!' }

      await commentOnfirstPR(context, config)

      expect(context.octokit.repos.listCommits).toHaveBeenCalledWith(
        expect.objectContaining({ author: 'testuser', sha: 'main' })
      )
      expect(context.octokit.issues.createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'owner',
          repo: 'repo',
          issue_number: 1,
          body: 'Welcome to your first PR!'
        })
      )
    })

    it('skips when author has a prior commit on the target branch', async () => {
      const config = { firstPRWelcomeComment: 'Welcome!' }
      context.octokit.repos.listCommits.mockResolvedValue({
        data: [{ sha: 'priorsha' }]
      })

      await commentOnfirstPR(context, config)

      expect(context.octokit.issues.createComment).not.toHaveBeenCalled()
    })

    it('skips when author has a prior PR even with no prior commits', async () => {
      const config = { firstPRWelcomeComment: 'Welcome!' }
      context.octokit.issues.listForRepo.mockResolvedValue({
        data: [
          { number: 99, pull_request: { url: 'x' } },
          { number: 1, pull_request: { url: 'x' } }
        ]
      })

      await commentOnfirstPR(context, config)

      expect(context.octokit.issues.createComment).not.toHaveBeenCalled()
    })

    it('still welcomes when author has only prior issues (no prior PR)', async () => {
      const config = { firstPRWelcomeComment: 'Welcome!' }
      context.octokit.issues.listForRepo.mockResolvedValue({
        data: [
          { number: 50 }, // issue (no pull_request field)
          { number: 1, pull_request: { url: 'x' } } // the current PR
        ]
      })

      await commentOnfirstPR(context, config)

      expect(context.octokit.issues.createComment).toHaveBeenCalled()
    })

    it('paginates past 100 older issues to find a prior PR on page 2', async () => {
      const config = { firstPRWelcomeComment: 'Welcome!' }
      const page1 = Array.from({ length: 100 }, (_, i) => ({ number: 100 + i }))
      const page2 = [{ number: 500, pull_request: { url: 'x' } }]
      context.octokit.issues.listForRepo
        .mockResolvedValueOnce({ data: page1 })
        .mockResolvedValueOnce({ data: page2 })

      await commentOnfirstPR(context, config)

      const calls = context.octokit.issues.listForRepo.mock.calls
      expect(calls).toHaveLength(2)
      expect(calls[0][0]).toMatchObject({
        creator: 'testuser',
        state: 'all',
        sort: 'created',
        direction: 'asc',
        per_page: 100,
        page: 1
      })
      expect(calls[1][0]).toMatchObject({ page: 2, per_page: 100 })
      expect(context.octokit.issues.createComment).not.toHaveBeenCalled()
    })

    it('stops paginating once a full page returns <100 items', async () => {
      const config = { firstPRWelcomeComment: 'Welcome!' }
      // Single partial page means the author has no more history to scan.
      context.octokit.issues.listForRepo.mockResolvedValueOnce({
        data: [{ number: 1, pull_request: { url: 'x' } }] // current PR only
      })

      await commentOnfirstPR(context, config)

      expect(context.octokit.issues.listForRepo).toHaveBeenCalledTimes(1)
      expect(context.octokit.issues.listForRepo.mock.calls[0][0]).toMatchObject({
        page: 1,
        per_page: 100,
        sort: 'created',
        direction: 'asc'
      })
      expect(context.octokit.issues.createComment).toHaveBeenCalled()
    })

    it.each(['MEMBER', 'OWNER', 'COLLABORATOR', 'CONTRIBUTOR'])(
      'skips %s via fast-path without calling listCommits',
      async (association) => {
        const config = { firstPRWelcomeComment: 'Welcome!' }
        context.payload.pull_request.author_association = association

        await commentOnfirstPR(context, config)

        expect(context.octokit.repos.listCommits).not.toHaveBeenCalled()
        expect(context.octokit.issues.createComment).not.toHaveBeenCalled()
      }
    )

    it('skips bot accounts without any API call', async () => {
      const config = { firstPRWelcomeComment: 'Welcome!' }
      context.payload.pull_request.user = { login: 'dependabot[bot]', type: 'Bot' }

      await commentOnfirstPR(context, config)

      expect(context.octokit.repos.listCommits).not.toHaveBeenCalled()
      expect(context.octokit.issues.createComment).not.toHaveBeenCalled()
    })

    it('skips the deleted-user ghost login', async () => {
      const config = { firstPRWelcomeComment: 'Welcome!' }
      context.payload.pull_request.user = { login: 'ghost', type: 'User' }

      await commentOnfirstPR(context, config)

      expect(context.octokit.repos.listCommits).not.toHaveBeenCalled()
      expect(context.octokit.issues.createComment).not.toHaveBeenCalled()
    })

    it('swallows 404 from createComment (PR deleted between webhook and handler)', async () => {
      const config = { firstPRWelcomeComment: 'Welcome!' }
      const notFound = Object.assign(new Error('Not Found'), { status: 404 })
      context.octokit.issues.createComment.mockRejectedValue(notFound)

      await expect(commentOnfirstPR(context, config)).resolves.not.toThrow()
    })

    it('rethrows non-404 errors from createComment', async () => {
      const config = { firstPRWelcomeComment: 'Welcome!' }
      const serverError = Object.assign(new Error('Internal Server Error'), { status: 500 })
      context.octokit.issues.createComment.mockRejectedValue(serverError)

      await expect(commentOnfirstPR(context, config)).rejects.toThrow('Internal Server Error')
    })

    it('does nothing when config key is absent', async () => {
      await commentOnfirstPR(context, {})

      expect(context.octokit.repos.listCommits).not.toHaveBeenCalled()
      expect(context.octokit.issues.createComment).not.toHaveBeenCalled()
    })
  })

  describe('commentOnfirstPRMerge', () => {
    beforeEach(() => {
      context.payload.pull_request.merged = true
    })

    it('adds comment for a squash-merged first PR (only merge_commit_sha on base)', async () => {
      const config = { firstPRMergeComment: 'Congrats!' }
      context.octokit.repos.listCommits.mockResolvedValue({
        data: [{ sha: 'mergesha123' }]
      })
      // Squash PR had its own commits on the branch; paginate returns them
      context.octokit.paginate.mockResolvedValue([{ sha: 'branchshaA' }, { sha: 'branchshaB' }])

      await commentOnfirstPRMerge(context, config)

      expect(context.octokit.issues.createComment).toHaveBeenCalledWith(
        expect.objectContaining({ body: 'Congrats!' })
      )
    })

    it('queries default branch (no sha param) so non-main merges still count', async () => {
      const config = { firstPRMergeComment: 'Congrats!' }

      await commentOnfirstPRMerge(context, config)

      const call = context.octokit.repos.listCommits.mock.calls[0][0]
      expect(call.sha).toBeUndefined()
      expect(call.author).toBe('testuser')
    })

    it('adds comment for a merge-commit first PR (PR commits also on base)', async () => {
      const config = { firstPRMergeComment: 'Congrats!' }
      // Merge commit + the PR's original commits all land on base with matching shas
      context.octokit.paginate.mockResolvedValue([{ sha: 'branchshaA' }, { sha: 'branchshaB' }])
      context.octokit.repos.listCommits.mockResolvedValue({
        data: [
          { sha: 'mergesha123' },
          { sha: 'branchshaA' },
          { sha: 'branchshaB' }
        ]
      })

      await commentOnfirstPRMerge(context, config)

      expect(context.octokit.issues.createComment).toHaveBeenCalled()
    })

    it('skips when there is a genuinely prior commit beyond the current PR', async () => {
      const config = { firstPRMergeComment: 'Congrats!' }
      context.octokit.paginate.mockResolvedValue([{ sha: 'branchshaA' }])
      context.octokit.repos.listCommits.mockResolvedValue({
        data: [
          { sha: 'mergesha123' },
          { sha: 'branchshaA' },
          { sha: 'oldpriorsha' }
        ]
      })

      await commentOnfirstPRMerge(context, config)

      expect(context.octokit.issues.createComment).not.toHaveBeenCalled()
    })

    it('does nothing when PR was closed without merging', async () => {
      const config = { firstPRMergeComment: 'Congrats!' }
      context.payload.pull_request.merged = false

      await commentOnfirstPRMerge(context, config)

      expect(context.octokit.repos.listCommits).not.toHaveBeenCalled()
      expect(context.octokit.issues.createComment).not.toHaveBeenCalled()
    })

    it.each(['MEMBER', 'OWNER', 'COLLABORATOR'])(
      'skips %s via fast-path without calling listCommits',
      async (association) => {
        const config = { firstPRMergeComment: 'Congrats!' }
        context.payload.pull_request.author_association = association

        await commentOnfirstPRMerge(context, config)

        expect(context.octokit.repos.listCommits).not.toHaveBeenCalled()
        expect(context.octokit.issues.createComment).not.toHaveBeenCalled()
      }
    )

    it('does NOT fast-path CONTRIBUTOR — webhook may reflect post-merge state', async () => {
      // A genuine first-time merger can show as CONTRIBUTOR by the time the
      // pull_request.closed webhook fires. Verify we still run the commit
      // check and post the comment when prior commits are absent.
      const config = { firstPRMergeComment: 'Congrats!' }
      context.payload.pull_request.author_association = 'CONTRIBUTOR'
      context.octokit.repos.listCommits.mockResolvedValue({
        data: [{ sha: 'mergesha123' }]
      })

      await commentOnfirstPRMerge(context, config)

      expect(context.octokit.repos.listCommits).toHaveBeenCalled()
      expect(context.octokit.issues.createComment).toHaveBeenCalled()
    })

    it('skips bot accounts', async () => {
      const config = { firstPRMergeComment: 'Congrats!' }
      context.payload.pull_request.user = { login: 'dependabot[bot]', type: 'Bot' }

      await commentOnfirstPRMerge(context, config)

      expect(context.octokit.repos.listCommits).not.toHaveBeenCalled()
      expect(context.octokit.issues.createComment).not.toHaveBeenCalled()
    })

    it('swallows 404 and rethrows 500 from createComment', async () => {
      const config = { firstPRMergeComment: 'Congrats!' }

      const notFound = Object.assign(new Error('Not Found'), { status: 404 })
      context.octokit.issues.createComment.mockRejectedValueOnce(notFound)
      await expect(commentOnfirstPRMerge(context, config)).resolves.not.toThrow()

      const serverError = Object.assign(new Error('Server Error'), { status: 500 })
      context.octokit.issues.createComment.mockRejectedValueOnce(serverError)
      await expect(commentOnfirstPRMerge(context, config)).rejects.toThrow('Server Error')
    })

    it('does nothing when firstPRMergeComment config is empty string', async () => {
      const config = { firstPRMergeComment: '' }

      await commentOnfirstPRMerge(context, config)

      expect(context.octokit.repos.listCommits).not.toHaveBeenCalled()
      expect(context.octokit.issues.createComment).not.toHaveBeenCalled()
    })

    it('clamps listCommits per_page to 100 even for huge PRs', async () => {
      const config = { firstPRMergeComment: 'Congrats!' }
      const bigPrCommits = Array.from({ length: 250 }, (_, i) => ({ sha: `branchsha${i}` }))
      context.octokit.paginate.mockResolvedValue(bigPrCommits)
      context.octokit.repos.listCommits.mockResolvedValue({ data: [] })

      await commentOnfirstPRMerge(context, config)

      expect(context.octokit.repos.listCommits).toHaveBeenCalledWith(
        expect.objectContaining({ per_page: 100 })
      )
    })

    it('still posts comment when pulls.listCommits fails (non-fatal)', async () => {
      const config = { firstPRMergeComment: 'Congrats!' }
      context.octokit.paginate.mockRejectedValue(new Error('network blip'))
      context.octokit.repos.listCommits.mockResolvedValue({
        data: [{ sha: 'mergesha123' }]
      })

      await commentOnfirstPRMerge(context, config)

      expect(context.octokit.issues.createComment).toHaveBeenCalled()
    })
  })

  describe('commentOnfirstIssue', () => {
    it('adds comment when author has no prior commits', async () => {
      const config = { firstIssueWelcomeComment: 'Welcome to your first issue!' }

      await commentOnfirstIssue(context, config)

      expect(context.octokit.repos.listCommits).toHaveBeenCalledWith(
        expect.objectContaining({ author: 'testuser' })
      )
      expect(context.octokit.issues.createComment).toHaveBeenCalledWith(
        expect.objectContaining({ body: 'Welcome to your first issue!' })
      )
    })

    it('skips when author has prior commits', async () => {
      const config = { firstIssueWelcomeComment: 'Welcome!' }
      context.octokit.repos.listCommits.mockResolvedValue({
        data: [{ sha: 'priorsha' }]
      })

      await commentOnfirstIssue(context, config)

      expect(context.octokit.issues.createComment).not.toHaveBeenCalled()
    })

    it('skips when author has a prior issue even with no commits', async () => {
      const config = { firstIssueWelcomeComment: 'Welcome!' }
      context.octokit.issues.listForRepo.mockResolvedValue({
        data: [
          { number: 42 }, // plain issue (no pull_request)
          { number: 1 } // current issue
        ]
      })

      await commentOnfirstIssue(context, config)

      expect(context.octokit.issues.createComment).not.toHaveBeenCalled()
    })

    it('still welcomes when author has only prior PRs (no prior issue)', async () => {
      const config = { firstIssueWelcomeComment: 'Welcome!' }
      context.octokit.issues.listForRepo.mockResolvedValue({
        data: [
          { number: 99, pull_request: { url: 'x' } }, // old PR
          { number: 1 } // current issue
        ]
      })

      await commentOnfirstIssue(context, config)

      expect(context.octokit.issues.createComment).toHaveBeenCalled()
    })

    it.each(['MEMBER', 'OWNER', 'COLLABORATOR', 'CONTRIBUTOR'])(
      'skips %s via fast-path without calling listCommits',
      async (association) => {
        const config = { firstIssueWelcomeComment: 'Welcome!' }
        context.payload.issue.author_association = association

        await commentOnfirstIssue(context, config)

        expect(context.octokit.repos.listCommits).not.toHaveBeenCalled()
        expect(context.octokit.issues.createComment).not.toHaveBeenCalled()
      }
    )

    it('swallows 404 and rethrows 500 from createComment', async () => {
      const config = { firstIssueWelcomeComment: 'Welcome!' }

      const notFound = Object.assign(new Error('Not Found'), { status: 404 })
      context.octokit.issues.createComment.mockRejectedValueOnce(notFound)
      await expect(commentOnfirstIssue(context, config)).resolves.not.toThrow()

      const serverError = Object.assign(new Error('Server Error'), { status: 500 })
      context.octokit.issues.createComment.mockRejectedValueOnce(serverError)
      await expect(commentOnfirstIssue(context, config)).rejects.toThrow('Server Error')
    })

    it('does nothing when config key is absent', async () => {
      await commentOnfirstIssue(context, {})

      expect(context.octokit.repos.listCommits).not.toHaveBeenCalled()
      expect(context.octokit.issues.createComment).not.toHaveBeenCalled()
    })
  })
})
