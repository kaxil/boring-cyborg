/* eslint-disable no-template-curly-in-string */
const { insertIssueLinkInPrDescription } = require('../lib/issuelink')

describe('issuelink', () => {
  let context

  beforeEach(() => {
    context = {
      event: 'pull_request',
      payload: {
        action: 'opened',
        pull_request: { number: 1, base: { ref: 'main' } }
      },
      log: {
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn()
      },
      octokit: {
        pulls: { get: jest.fn() },
        issues: { update: jest.fn() }
      },
      issue: jest.fn((params) => ({ owner: 'owner', repo: 'repo', issue_number: 1, ...params })),
      repo: jest.fn((params) => ({ owner: 'owner', repo: 'repo', ...params }))
    }
  })

  const baseConfig = (matchers) => ({
    insertIssueLinkInPrDescription: {
      descriptionIssuePlaceholderRegexp: '^Issue link: (.*)$',
      matchers
    }
  })

  const prWithTitleAndBody = (title, body) => ({
    data: {
      url: 'https://api.github.com/repos/owner/repo/pulls/1',
      title,
      body
    }
  })

  it('uses the first matching matcher when no per-matcher filter is set', async () => {
    context.octokit.pulls.get.mockResolvedValue(
      prWithTitleAndBody('[AIRFLOW-1234] Fix X', 'Issue link: PLACEHOLDER')
    )

    await insertIssueLinkInPrDescription(context, baseConfig({
      jiraIssueMatch: {
        titleIssueIdRegexp: '\\[(AIRFLOW-[0-9]{4})\\]',
        descriptionIssueLink: 'LINK-${1}'
      }
    }))

    expect(context.octokit.issues.update).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Issue link: LINK-AIRFLOW-1234' })
    )
  })

  it('skips a matcher whose targetBranchFilter does not match the base ref', async () => {
    context.octokit.pulls.get.mockResolvedValue(
      prWithTitleAndBody('[AIRFLOW-1234] Fix X', 'Issue link: PLACEHOLDER')
    )

    await insertIssueLinkInPrDescription(context, baseConfig({
      releaseOnly: {
        titleIssueIdRegexp: '\\[(AIRFLOW-[0-9]{4})\\]',
        descriptionIssueLink: 'RELEASE-${1}',
        targetBranchFilter: '^release/.*$'
      },
      fallback: {
        titleIssueIdRegexp: '\\[(AIRFLOW-[0-9]{4})\\]',
        descriptionIssueLink: 'MAIN-${1}'
      }
    }))

    expect(context.octokit.issues.update).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Issue link: MAIN-AIRFLOW-1234' })
    )
  })

  it('uses a matcher whose targetBranchFilter matches the base ref', async () => {
    context.payload.pull_request.base.ref = 'release/1.2'
    context.octokit.pulls.get.mockResolvedValue(
      prWithTitleAndBody('[AIRFLOW-1234] Fix X', 'Issue link: PLACEHOLDER')
    )

    await insertIssueLinkInPrDescription(context, baseConfig({
      releaseOnly: {
        titleIssueIdRegexp: '\\[(AIRFLOW-[0-9]{4})\\]',
        descriptionIssueLink: 'RELEASE-${1}',
        targetBranchFilter: '^release/.*$'
      },
      fallback: {
        titleIssueIdRegexp: '\\[(AIRFLOW-[0-9]{4})\\]',
        descriptionIssueLink: 'MAIN-${1}'
      }
    }))

    expect(context.octokit.issues.update).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Issue link: RELEASE-AIRFLOW-1234' })
    )
  })
})
