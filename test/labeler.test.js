const { addLabelsOnPr } = require('../lib/labeler')
const { createMockContext } = require('./helpers')

describe('labeler', () => {
  let context

  beforeEach(() => {
    context = createMockContext()
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

      context.octokit.paginate.mockResolvedValue([
        { filename: 'src/frontend/component.js' },
        { filename: 'README.md' }
      ])

      await addLabelsOnPr(context, config)

      expect(context.octokit.issues.addLabels).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 1,
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

      context.octokit.paginate.mockResolvedValue([
        { filename: 'README.md' },
        { filename: 'docs/guide.md' }
      ])

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

      context.octokit.paginate.mockResolvedValue([
        { filename: 'src/frontend/component.js' }
      ])

      await addLabelsOnPr(context, config)

      expect(context.octokit.issues.addLabels).not.toHaveBeenCalled()
    })

    it('should skip labeling if config not present', async () => {
      const config = {}

      await addLabelsOnPr(context, config)

      expect(context.octokit.pulls.get).not.toHaveBeenCalled()
      expect(context.octokit.issues.addLabels).not.toHaveBeenCalled()
    })

    it('should match non-trivial glob patterns correctly', async () => {
      const config = {
        labelPRBasedOnFilePath: {
          migrations: ['db/migrations/**/*.sql'],
          tests: ['**/__tests__/**', '**/*.test.js'],
          config: ['*.json', '*.yml', '!package-lock.json']
        }
      }

      context.octokit.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          labels: []
        }
      })

      context.octokit.paginate.mockResolvedValue([
        { filename: 'db/migrations/2024/001_add_users.sql' },
        { filename: 'src/__tests__/app.test.js' },
        { filename: 'tsconfig.json' }
      ])

      await addLabelsOnPr(context, config)

      expect(context.octokit.issues.addLabels).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: expect.arrayContaining(['migrations', 'tests', 'config'])
        })
      )
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
      context.octokit.paginate.mockResolvedValue([
        { filename: 'src/frontend/component.js' }
      ])

      await addLabelsOnPr(context, config)

      expect(context.octokit.issues.addLabels).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 1,
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
      context.octokit.paginate.mockResolvedValue([
        { filename: 'src/frontend/component.js' },
        { filename: 'src/backend/api.js' }
      ])

      await addLabelsOnPr(context, config)

      expect(context.octokit.issues.addLabels).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 1,
        labels: ['backend']
      })
    })

    it('should add label when all files match an allFilesMatch rule', async () => {
      const config = {
        labelPRBasedOnFilePath: {
          'kind:tests': {
            allFilesMatch: true,
            paths: ['**/tests/**', '**/*.test.js']
          }
        }
      }

      context.octokit.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          labels: []
        }
      })
      context.octokit.paginate.mockResolvedValue([
        { filename: 'core/tests/test_app.py' },
        { filename: 'src/app.test.js' }
      ])

      await addLabelsOnPr(context, config)

      expect(context.octokit.issues.addLabels).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 1,
        labels: ['kind:tests']
      })
      expect(context.octokit.issues.removeLabel).not.toHaveBeenCalled()
    })

    it('should not add label when only some files match an allFilesMatch rule', async () => {
      const config = {
        labelPRBasedOnFilePath: {
          'kind:tests': {
            allFilesMatch: true,
            paths: ['**/tests/**']
          }
        }
      }

      context.octokit.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          labels: []
        }
      })
      context.octokit.paginate.mockResolvedValue([
        { filename: 'core/tests/test_app.py' },
        { filename: 'core/app.py' }
      ])

      await addLabelsOnPr(context, config)

      expect(context.octokit.issues.addLabels).not.toHaveBeenCalled()
      expect(context.octokit.issues.removeLabel).not.toHaveBeenCalled()
    })

    it('should remove an existing label when an allFilesMatch rule no longer holds', async () => {
      const config = {
        labelPRBasedOnFilePath: {
          'kind:tests': {
            allFilesMatch: true,
            paths: ['**/tests/**']
          }
        }
      }

      context.payload.action = 'synchronize'
      context.octokit.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          labels: [{ name: 'kind:tests' }]
        }
      })
      context.octokit.paginate.mockResolvedValue([
        { filename: 'core/tests/test_app.py' },
        { filename: 'core/app.py' }
      ])

      await addLabelsOnPr(context, config)

      expect(context.octokit.issues.addLabels).not.toHaveBeenCalled()
      expect(context.octokit.issues.removeLabel).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 1,
        name: 'kind:tests'
      })
    })

    it('should not label an empty PR via an allFilesMatch rule', async () => {
      const config = {
        labelPRBasedOnFilePath: {
          'kind:tests': {
            allFilesMatch: true,
            paths: ['**/tests/**']
          }
        }
      }

      context.octokit.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          labels: []
        }
      })
      context.octokit.paginate.mockResolvedValue([])

      await addLabelsOnPr(context, config)

      expect(context.octokit.issues.addLabels).not.toHaveBeenCalled()
      expect(context.octokit.issues.removeLabel).not.toHaveBeenCalled()
    })

    it('should never remove labels for plain any-match rules', async () => {
      const config = {
        labelPRBasedOnFilePath: {
          frontend: ['src/frontend/**/*']
        }
      }

      context.payload.action = 'synchronize'
      context.octokit.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          labels: [{ name: 'frontend' }]
        }
      })
      context.octokit.paginate.mockResolvedValue([
        { filename: 'README.md' }
      ])

      await addLabelsOnPr(context, config)

      expect(context.octokit.issues.addLabels).not.toHaveBeenCalled()
      expect(context.octokit.issues.removeLabel).not.toHaveBeenCalled()
    })

    it('should honor allFilesMatch combined with targetBranchFilter', async () => {
      const config = {
        labelPRBasedOnFilePath: {
          'kind:tests': {
            allFilesMatch: true,
            paths: ['**/tests/**'],
            targetBranchFilter: '^release/.*$'
          }
        }
      }

      // Base ref is 'main' (default mock), so the rule must be skipped entirely:
      // no label added, and no removal either even though the rule would not hold.
      context.octokit.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          labels: [{ name: 'kind:tests' }]
        }
      })
      context.octokit.paginate.mockResolvedValue([
        { filename: 'core/app.py' }
      ])

      await addLabelsOnPr(context, config)

      expect(context.octokit.issues.addLabels).not.toHaveBeenCalled()
      expect(context.octokit.issues.removeLabel).not.toHaveBeenCalled()
    })

    it('should keep allFilesMatch rules in sync on PR updates even when labelOnPRUpdates is false', async () => {
      const config = {
        labelPRBasedOnFilePath: {
          'kind:tests': {
            allFilesMatch: true,
            paths: ['**/tests/**']
          },
          frontend: ['src/frontend/**/*']
        },
        labelerFlags: {
          labelOnPRUpdates: false
        }
      }

      context.payload.action = 'synchronize'
      context.octokit.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          labels: []
        }
      })
      // Tests-only update: the allFilesMatch label must be applied, while the
      // plain 'frontend' rule stays disabled on updates.
      context.octokit.paginate.mockResolvedValue([
        { filename: 'core/tests/test_app.py' }
      ])

      await addLabelsOnPr(context, config)

      expect(context.octokit.issues.addLabels).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 1,
        labels: ['kind:tests']
      })
    })

    it('should remove an allFilesMatch label on PR update even when labelOnPRUpdates is false', async () => {
      const config = {
        labelPRBasedOnFilePath: {
          'kind:tests': {
            allFilesMatch: true,
            paths: ['**/tests/**']
          }
        },
        labelerFlags: {
          labelOnPRUpdates: false
        }
      }

      context.payload.action = 'synchronize'
      context.octokit.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          labels: [{ name: 'kind:tests' }]
        }
      })
      context.octokit.paginate.mockResolvedValue([
        { filename: 'core/tests/test_app.py' },
        { filename: 'core/app.py' }
      ])

      await addLabelsOnPr(context, config)

      expect(context.octokit.issues.addLabels).not.toHaveBeenCalled()
      expect(context.octokit.issues.removeLabel).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 1,
        name: 'kind:tests'
      })
    })

    it('should tolerate a failing label removal', async () => {
      const config = {
        labelPRBasedOnFilePath: {
          'kind:tests': {
            allFilesMatch: true,
            paths: ['**/tests/**']
          }
        }
      }

      context.payload.action = 'synchronize'
      context.octokit.pulls.get.mockResolvedValue({
        data: {
          url: 'https://api.github.com/repos/owner/repo/pulls/1',
          labels: [{ name: 'kind:tests' }]
        }
      })
      context.octokit.paginate.mockResolvedValue([
        { filename: 'core/app.py' }
      ])
      context.octokit.issues.removeLabel.mockRejectedValue(new Error('Not Found'))

      await expect(addLabelsOnPr(context, config)).resolves.toBeUndefined()
      expect(context.log.warn).toHaveBeenCalled()
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
      context.octokit.paginate.mockResolvedValue([])

      await addLabelsOnPr(context, config)

      expect(context.log.warn).toHaveBeenCalled()
      expect(context.octokit.issues.addLabels).not.toHaveBeenCalled()
    })
  })
})
