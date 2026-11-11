const { verifyTitles } = require('../lib/title_validator')
const { createMockContext } = require('./helpers')

describe('title_validator', () => {
  let context

  beforeEach(() => {
    context = createMockContext()
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

      context.octokit.rest.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          title: 'feat(api): add new endpoint',
          head: { sha: 'abc123' }
        }
      })

      await verifyTitles(context, config)

      expect(context.octokit.paginate).not.toHaveBeenCalled()
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

      context.octokit.rest.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          title: 'invalid title format',
          head: { sha: 'abc123' }
        }
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

      context.octokit.rest.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          title: 'Some PR title',
          head: { sha: 'abc123' },
          commits: 1
        }
      })

      context.octokit.paginate.mockResolvedValue([
        { commit: { message: 'feat(api): add new endpoint' } }
      ])

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

      context.octokit.rest.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          title: 'Some PR title',
          head: { sha: 'abc123' },
          commits: 1
        }
      })

      context.octokit.paginate.mockResolvedValue([
        { commit: { message: 'invalid commit message' } }
      ])

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

      context.octokit.rest.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          title: 'Some PR title',
          head: { sha: 'abc123' },
          commits: 0
        }
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

    it('should list commits across all pages when validating commit titles', async () => {
      const config = {
        verifyTitles: {
          titleRegexp: '^feat: .+'
        }
      }

      context.octokit.rest.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          title: 'feat: big change',
          head: { sha: 'abc123' },
          commits: 2
        }
      })
      context.octokit.paginate.mockResolvedValue([
        { commit: { message: 'feat: step one' } },
        { commit: { message: 'wip oops' } }
      ])

      await verifyTitles(context, config)

      expect(context.octokit.paginate).toHaveBeenCalledWith(
        context.octokit.rest.pulls.listCommits,
        expect.objectContaining({ pull_number: 1, per_page: 100 })
      )
      expect(context.octokit.rest.repos.createCommitStatus).toHaveBeenCalledWith(
        expect.objectContaining({ state: 'failure', description: 'Wrong Commit title: wip oops' })
      )
    })

    it('should warn when GitHub lists fewer commits than the PR has', async () => {
      const config = {
        verifyTitles: {
          titleRegexp: '^feat: .+'
        }
      }

      context.octokit.rest.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          title: 'feat: big change',
          head: { sha: 'abc123' },
          commits: 300
        }
      })
      context.octokit.paginate.mockResolvedValue([{ commit: { message: 'feat: step one' } }])

      await verifyTitles(context, config)

      expect(context.log.warn).toHaveBeenCalledWith(expect.stringContaining('only 1 of the PR\'s 300 commits'))
    })

    it('should check only the PR title, without listing commits, when there are several commits and validateEitherPrOrSingleCommitTitle is set', async () => {
      const config = {
        verifyTitles: {
          titleRegexp: '^feat: .+',
          validateEitherPrOrSingleCommitTitle: true
        }
      }

      context.octokit.rest.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          title: 'feat: big change',
          head: { sha: 'abc123' },
          commits: 3
        }
      })

      await verifyTitles(context, config)

      expect(context.octokit.paginate).not.toHaveBeenCalled()
      expect(context.octokit.rest.repos.createCommitStatus).toHaveBeenCalledWith(
        expect.objectContaining({ state: 'success' })
      )
    })

    it('should skip if config not present', async () => {
      const config = {}

      await verifyTitles(context, config)

      expect(context.octokit.rest.pulls.get).not.toHaveBeenCalled()
      expect(context.octokit.rest.repos.createCommitStatus).not.toHaveBeenCalled()
    })
  })
})
