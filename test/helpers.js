/**
 * Shared test helpers for boring-cyborg tests.
 *
 * Provides a consistent mock context factory so all test files use the same
 * shape and avoid subtle inconsistencies (e.g. context.issue accepting params
 * in some files but not others).
 */

/**
 * Create a mock Probot context with all commonly-used octokit methods.
 *
 * @param {object} [overrides] — deep-merge overrides for the context
 * @param {object} [overrides.payload] — merge into context.payload
 * @returns {object} mock context
 */
function createMockContext (overrides = {}) {
  const defaultPayload = {
    action: 'opened',
    pull_request: {
      number: 1,
      head: { sha: 'abc123', ref: 'feature-branch' },
      base: { sha: 'def456', ref: 'main' },
      user: { login: 'testuser' },
      created_at: '2024-01-01T00:00:00Z',
      merged: false,
      merged_at: '2024-01-02T00:00:00Z',
      html_url: 'https://github.com/owner/repo/pull/1'
    },
    repository: {
      full_name: 'owner/repo'
    },
    issue: {
      number: 1,
      user: { login: 'testuser' },
      html_url: 'https://github.com/owner/repo/issues/1',
      created_at: '2024-01-01T00:00:00Z'
    }
  }

  const payload = { ...defaultPayload, ...overrides.payload }

  // Deep merge pull_request and issue if provided
  if (overrides.payload && overrides.payload.pull_request) {
    payload.pull_request = { ...defaultPayload.pull_request, ...overrides.payload.pull_request }
  }
  if (overrides.payload && overrides.payload.issue) {
    payload.issue = { ...defaultPayload.issue, ...overrides.payload.issue }
  }

  return {
    event: 'pull_request',
    payload,
    log: {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn()
    },
    octokit: {
      paginate: jest.fn(),
      pulls: {
        get: jest.fn(),
        listFiles: jest.fn(),
        listCommits: jest.fn(),
        createReviewRequest: jest.fn()
      },
      issues: {
        addLabels: jest.fn(),
        createComment: jest.fn(),
        update: jest.fn()
      },
      repos: {
        getBranch: jest.fn(),
        createCommitStatus: jest.fn()
      },
      rest: {
        search: {
          issuesAndPullRequests: jest.fn()
        },
        repos: {
          createCommitStatus: jest.fn()
        }
      }
    },
    issue: jest.fn((params = {}) => ({ owner: 'owner', repo: 'repo', issue_number: 1, ...params })),
    repo: jest.fn((params = {}) => ({ owner: 'owner', repo: 'repo', ...params }))
  }
}

module.exports = { createMockContext }
