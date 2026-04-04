const { createInitialPR, createInitialPROnInstall, createInitialPRForRepo, hasExistingPR, CONFIG_FLAG } = require('../lib/initial_pr')

describe('initial_pr', () => {
  let context
  let octokit
  let log

  beforeEach(() => {
    log = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }
    octokit = {
      rest: {
        search: {
          issuesAndPullRequests: jest.fn()
        },
        repos: {
          get: jest.fn(),
          getContent: jest.fn(),
          createFork: jest.fn(),
          createOrUpdateFileContents: jest.fn()
        },
        git: {
          getRef: jest.fn(),
          createRef: jest.fn(),
          updateRef: jest.fn()
        },
        pulls: {
          create: jest.fn()
        }
      }
    }
    context = {
      payload: {
        repository: {
          owner: { login: 'apache' },
          name: 'airflow',
          default_branch: 'main'
        },
        installation: { id: 123 }
      },
      log,
      octokit
    }
  })

  /**
   * Helper to set up mocks for a full successful PR creation flow
   */
  function setupSuccessfulFlow (existingConfig) {
    // No existing PRs
    octokit.rest.search.issuesAndPullRequests.mockResolvedValue({
      data: { total_count: 0, items: [] }
    })

    // Existing config file (or 404)
    octokit.rest.repos.getContent.mockImplementation(({ owner, ref }) => {
      if (owner === 'apache' && !ref) {
        if (existingConfig === null) {
          return Promise.reject(Object.assign(new Error('Not found'), { status: 404 }))
        }
        return Promise.resolve({
          data: {
            content: Buffer.from(existingConfig).toString('base64'),
            sha: 'abc123'
          }
        })
      }
      // Fork file check - throw 404
      return Promise.reject(Object.assign(new Error('Not found'), { status: 404 }))
    })

    // Fork creation
    octokit.rest.repos.createFork.mockResolvedValue({
      data: {
        owner: { login: 'boring-cyborg-bot' },
        name: 'airflow',
        full_name: 'boring-cyborg-bot/airflow',
        default_branch: 'main'
      }
    })

    // Fork ready check
    octokit.rest.repos.get.mockResolvedValue({ data: { default_branch: 'main' } })

    // Default branch ref
    octokit.rest.git.getRef.mockResolvedValue({
      data: { object: { sha: 'deadbeef' } }
    })

    // Branch creation
    octokit.rest.git.createRef.mockResolvedValue({ data: {} })

    // File creation
    octokit.rest.repos.createOrUpdateFileContents.mockResolvedValue({ data: {} })

    // PR creation
    octokit.rest.pulls.create.mockResolvedValue({
      data: { html_url: 'https://github.com/apache/airflow/pull/999' }
    })
  }

  describe('createInitialPRForRepo', () => {
    it('should skip if config flag is set to true', async () => {
      const existingConfig = `${CONFIG_FLAG}: true\nlabelPRBasedOnFilePath:\n  area:API:\n    - airflow/api/**/*\n`

      octokit.rest.repos.getContent.mockResolvedValue({
        data: {
          content: Buffer.from(existingConfig).toString('base64'),
          sha: 'abc123'
        }
      })

      await createInitialPRForRepo(octokit, 'apache', 'airflow', 'main', log)

      expect(octokit.rest.repos.createFork).not.toHaveBeenCalled()
    })

    it('should NOT skip if config flag is set to false', async () => {
      const existingConfig = `${CONFIG_FLAG}: false\nlabelPRBasedOnFilePath:\n  area:API:\n    - airflow/api/**/*\n`
      setupSuccessfulFlow(existingConfig)

      await createInitialPRForRepo(octokit, 'apache', 'airflow', 'main', log)

      expect(octokit.rest.repos.createFork).toHaveBeenCalled()
    })

    it('should skip if boring-cyborg already has a PR', async () => {
      // No flag in config
      octokit.rest.repos.getContent.mockResolvedValue({
        data: {
          content: Buffer.from('labelPRBasedOnFilePath: {}').toString('base64'),
          sha: 'abc123'
        }
      })

      // Existing PR found
      octokit.rest.search.issuesAndPullRequests.mockResolvedValue({
        data: { total_count: 1, items: [{ number: 42 }] }
      })

      await createInitialPRForRepo(octokit, 'apache', 'airflow', 'main', log)

      expect(octokit.rest.repos.createFork).not.toHaveBeenCalled()
    })

    it('should create a PR with flag prepended when config exists', async () => {
      const existingConfig = 'labelPRBasedOnFilePath:\n  area:API:\n    - airflow/api/**/*\n'
      setupSuccessfulFlow(existingConfig)

      await createInitialPRForRepo(octokit, 'apache', 'airflow', 'main', log)

      // Verify fork was created
      expect(octokit.rest.repos.createFork).toHaveBeenCalledWith({
        owner: 'apache',
        repo: 'airflow',
        default_branch_only: true
      })

      // Verify file was created with flag prepended
      expect(octokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalled()
      const fileCall = octokit.rest.repos.createOrUpdateFileContents.mock.calls[0][0]
      expect(fileCall.owner).toBe('boring-cyborg-bot')
      expect(fileCall.branch).toBe('boring-cyborg-initial-setup')
      const fileContent = Buffer.from(fileCall.content, 'base64').toString()
      expect(fileContent).toContain(`${CONFIG_FLAG}: true`)
      expect(fileContent).toContain(existingConfig)

      // Verify PR was created from fork
      expect(octokit.rest.pulls.create).toHaveBeenCalledWith({
        owner: 'apache',
        repo: 'airflow',
        title: `Add ${CONFIG_FLAG} flag to boring-cyborg configuration`,
        head: 'boring-cyborg-bot:boring-cyborg-initial-setup',
        base: 'main',
        body: expect.stringContaining('recognised contributor'),
        maintainer_can_modify: true
      })
    })

    it('should create a PR with initial config when no config exists', async () => {
      setupSuccessfulFlow(null)

      await createInitialPRForRepo(octokit, 'apache', 'airflow', 'main', log)

      // Verify PR title for initial config
      expect(octokit.rest.pulls.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Add initial boring-cyborg configuration'
        })
      )

      // Verify file content includes the flag
      const fileCall = octokit.rest.repos.createOrUpdateFileContents.mock.calls[0][0]
      const fileContent = Buffer.from(fileCall.content, 'base64').toString()
      expect(fileContent).toContain(`${CONFIG_FLAG}: true`)
    })
  })

  describe('createInitialPR (context wrapper)', () => {
    it('should extract repo info from context and call createInitialPRForRepo', async () => {
      // Config already has flag — should skip early
      octokit.rest.repos.getContent.mockResolvedValue({
        data: {
          content: Buffer.from(`${CONFIG_FLAG}: true`).toString('base64'),
          sha: 'abc123'
        }
      })

      await createInitialPR(context)

      expect(log.info).toHaveBeenCalledWith(
        expect.stringContaining('Checking if initial PR is needed for apache/airflow')
      )
    })
  })

  describe('createInitialPROnInstall', () => {
    it('should process repos from installation.created event', async () => {
      context.payload.repositories = [
        { full_name: 'apache/airflow' }
      ]

      // Config already has flag — should skip
      octokit.rest.repos.get.mockResolvedValue({ data: { default_branch: 'main' } })
      octokit.rest.repos.getContent.mockResolvedValue({
        data: {
          content: Buffer.from(`${CONFIG_FLAG}: true`).toString('base64'),
          sha: 'abc123'
        }
      })

      await createInitialPROnInstall(context)

      expect(octokit.rest.repos.get).toHaveBeenCalledWith({
        owner: 'apache',
        repo: 'airflow'
      })
    })

    it('should process repos from installation_repositories.added event', async () => {
      context.payload.repositories_added = [
        { full_name: 'apache/airflow' },
        { full_name: 'apache/beam' }
      ]

      octokit.rest.repos.get.mockResolvedValue({ data: { default_branch: 'main' } })
      octokit.rest.repos.getContent.mockResolvedValue({
        data: {
          content: Buffer.from(`${CONFIG_FLAG}: true`).toString('base64'),
          sha: 'abc123'
        }
      })

      await createInitialPROnInstall(context)

      expect(octokit.rest.repos.get).toHaveBeenCalledTimes(2)
    })

    it('should handle errors for individual repos without failing others', async () => {
      context.payload.repositories = [
        { full_name: 'apache/airflow' },
        { full_name: 'apache/beam' }
      ]

      octokit.rest.repos.get
        .mockRejectedValueOnce(new Error('Not found'))
        .mockResolvedValueOnce({ data: { default_branch: 'main' } })

      octokit.rest.repos.getContent.mockResolvedValue({
        data: {
          content: Buffer.from(`${CONFIG_FLAG}: true`).toString('base64'),
          sha: 'abc123'
        }
      })

      await createInitialPROnInstall(context)

      expect(log.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process apache/airflow')
      )
      // Second repo should still be processed
      expect(octokit.rest.repos.get).toHaveBeenCalledTimes(2)
    })
  })

  describe('hasExistingPR', () => {
    it('should return true when PRs exist', async () => {
      octokit.rest.search.issuesAndPullRequests.mockResolvedValue({
        data: { total_count: 2, items: [{ number: 1 }, { number: 2 }] }
      })

      const result = await hasExistingPR(octokit, 'apache', 'airflow', log)

      expect(result).toBe(true)
      expect(octokit.rest.search.issuesAndPullRequests).toHaveBeenCalledWith({
        q: 'is:pr repo:apache/airflow author:app/boring-cyborg',
        per_page: 1
      })
    })

    it('should return false when no PRs exist', async () => {
      octokit.rest.search.issuesAndPullRequests.mockResolvedValue({
        data: { total_count: 0, items: [] }
      })

      const result = await hasExistingPR(octokit, 'apache', 'airflow', log)

      expect(result).toBe(false)
    })

    it('should return false on API error', async () => {
      octokit.rest.search.issuesAndPullRequests.mockRejectedValue(
        new Error('API error')
      )

      const result = await hasExistingPR(octokit, 'apache', 'airflow', log)

      expect(result).toBe(false)
    })
  })
})
