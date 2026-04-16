const { addLabelsOnPr } = require('../lib/labeler')

describe('labeler', () => {
  let context

  beforeEach(() => {
    context = {
      event: 'pull_request',
      payload: {
        action: 'opened',
        pull_request: {
          number: 1,
          base: { ref: 'main' }
        }
      },
      log: {
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn()
      },
      octokit: {
        pulls: {
          get: jest.fn(),
          listFiles: jest.fn()
        },
        issues: {
          addLabels: jest.fn()
        }
      },
      issue: jest.fn((params) => ({ owner: 'owner', repo: 'repo', pull_number: 1, ...params }))
    }
  })

  describe('addLabelsOnPr', () => {
    it('should add labels based on file paths', async () => {
      const config = {
        labelPRBasedOnFilePath: {
          frontend: ['src/frontend/**/*'],
          backend: ['src/backend/**/*']
        }
      }

      context.octokit.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          labels: []
        }
      })

      context.octokit.pulls.listFiles.mockResolvedValue({
        data: [
          { filename: 'src/frontend/component.js' },
          { filename: 'README.md' }
        ]
      })

      await addLabelsOnPr(context, config)

      expect(context.octokit.issues.addLabels).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        pull_number: 1,
        labels: ['frontend']
      })
    })

    it('should not add labels if files do not match patterns', async () => {
      const config = {
        labelPRBasedOnFilePath: {
          frontend: ['src/frontend/**/*'],
          backend: ['src/backend/**/*']
        }
      }

      context.octokit.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          labels: []
        }
      })

      context.octokit.pulls.listFiles.mockResolvedValue({
        data: [
          { filename: 'README.md' },
          { filename: 'docs/guide.md' }
        ]
      })

      await addLabelsOnPr(context, config)

      expect(context.octokit.issues.addLabels).not.toHaveBeenCalled()
    })

    it('should not add existing labels', async () => {
      const config = {
        labelPRBasedOnFilePath: {
          frontend: ['src/frontend/**/*']
        }
      }

      context.octokit.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          labels: [{ name: 'frontend' }]
        }
      })

      context.octokit.pulls.listFiles.mockResolvedValue({
        data: [
          { filename: 'src/frontend/component.js' }
        ]
      })

      await addLabelsOnPr(context, config)

      expect(context.octokit.issues.addLabels).not.toHaveBeenCalled()
    })

    it('should skip labeling if config not present', async () => {
      const config = {}

      await addLabelsOnPr(context, config)

      expect(context.octokit.pulls.get).not.toHaveBeenCalled()
      expect(context.octokit.issues.addLabels).not.toHaveBeenCalled()
    })

    it('should skip labeling on PR updates when disabled', async () => {
      const config = {
        labelPRBasedOnFilePath: {
          frontend: ['src/frontend/**/*']
        },
        labelerFlags: {
          labelOnPRUpdates: false
        }
      }

      context.payload.action = 'synchronize'

      await addLabelsOnPr(context, config)

      expect(context.octokit.pulls.get).not.toHaveBeenCalled()
      expect(context.octokit.issues.addLabels).not.toHaveBeenCalled()
    })

    it('should accept the object rule form with paths + targetBranchFilter', async () => {
      const config = {
        labelPRBasedOnFilePath: {
          frontend: {
            paths: ['src/frontend/**/*'],
            targetBranchFilter: '^main$'
          }
        }
      }

      context.octokit.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          labels: []
        }
      })
      context.octokit.pulls.listFiles.mockResolvedValue({
        data: [{ filename: 'src/frontend/component.js' }]
      })

      await addLabelsOnPr(context, config)

      expect(context.octokit.issues.addLabels).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        pull_number: 1,
        labels: ['frontend']
      })
    })

    it('should skip a label whose rule-level targetBranchFilter does not match', async () => {
      const config = {
        labelPRBasedOnFilePath: {
          frontend: {
            paths: ['src/frontend/**/*'],
            targetBranchFilter: '^release/.*$'
          },
          backend: ['src/backend/**/*']
        }
      }

      context.octokit.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          labels: []
        }
      })
      context.octokit.pulls.listFiles.mockResolvedValue({
        data: [
          { filename: 'src/frontend/component.js' },
          { filename: 'src/backend/api.js' }
        ]
      })

      await addLabelsOnPr(context, config)

      expect(context.octokit.issues.addLabels).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        pull_number: 1,
        labels: ['backend']
      })
    })

    it('should warn and skip a rule with no paths configured', async () => {
      const config = {
        labelPRBasedOnFilePath: {
          broken: { targetBranchFilter: '^main$' }
        }
      }

      context.octokit.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          labels: []
        }
      })
      context.octokit.pulls.listFiles.mockResolvedValue({ data: [] })

      await addLabelsOnPr(context, config)

      expect(context.log.warn).toHaveBeenCalled()
      expect(context.octokit.issues.addLabels).not.toHaveBeenCalled()
    })
  })
})
