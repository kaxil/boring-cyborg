const pino = require('pino')
const Stream = require('stream')
const { Probot, ProbotOctokit } = require('probot')
const myProbotApp = require('../index.js')
const utils = require('../lib/utils')
const labeler = require('../lib/labeler')
const greetings = require('../lib/greetings')
const issuelink = require('../lib/issuelink')
const titleValidator = require('../lib/title_validator')
const upToDateChecker = require('../lib/up_to_date_checker')

describe('Boring Cyborg App Integration', () => {
  let probot
  let logOutput

  beforeEach(() => {
    // Capture log output using pino stream (following official Probot docs)
    logOutput = []
    const streamLogsToOutput = new Stream.Writable({ objectMode: true })
    streamLogsToOutput._write = (object, encoding, done) => {
      logOutput.push(JSON.parse(object))
      done()
    }

    probot = new Probot({
      appId: 1,
      githubToken: 'test',
      // Disable throttling & retrying requests for easier testing
      Octokit: ProbotOctokit.defaults({
        retry: { enabled: false },
        throttle: { enabled: false }
      }),
      log: pino(streamLogsToOutput)
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  const prPayload = (action = 'opened', baseRef = 'main') => ({
    action,
    number: 1,
    pull_request: {
      number: 1,
      head: { sha: 'abc123', ref: 'feature-branch' },
      base: { sha: 'def456', ref: baseRef },
      user: { login: 'testuser' },
      created_at: '2024-01-01T00:00:00Z',
      merged: false,
      html_url: 'https://github.com/owner/repo/pull/1'
    },
    repository: {
      id: 1,
      node_id: 'R_1',
      name: 'repo',
      full_name: 'owner/repo',
      owner: { login: 'owner' }
    },
    installation: { id: 1 }
  })

  describe('App Initialization', () => {
    it('should load the app without errors', () => {
      expect(() => {
        myProbotApp(probot, { getRouter: jest.fn() })
      }).not.toThrow()
    })

    it('should log app loaded message', () => {
      myProbotApp(probot, { getRouter: jest.fn() })

      const appLoadedLogs = logOutput.filter(log =>
        log.level === 30 && // pino info level is 30
        log.msg === 'Yay, the app was loaded!'
      )
      expect(appLoadedLogs.length).toBe(1)
    })

    it('should register event handlers', () => {
      const originalOn = probot.on
      const originalOnAny = probot.onAny
      const eventHandlers = []

      probot.on = jest.fn((events, handler) => {
        eventHandlers.push({ events, handler })
        return originalOn.call(probot, events, handler)
      })

      probot.onAny = jest.fn((handler) => {
        eventHandlers.push({ events: '*', handler })
        return originalOnAny.call(probot, handler)
      })

      myProbotApp(probot, { getRouter: jest.fn() })

      // Check that handlers were registered
      expect(probot.onAny).toHaveBeenCalledTimes(1)
      expect(probot.on).toHaveBeenCalledWith(['pull_request.opened', 'pull_request.reopened', 'pull_request.edited', 'pull_request.synchronize'], expect.any(Function))
      expect(probot.on).toHaveBeenCalledWith(['pull_request.labeled', 'pull_request.unlabeled'], expect.any(Function))
      expect(probot.on).toHaveBeenCalledWith('pull_request.opened', expect.any(Function))
      expect(probot.on).toHaveBeenCalledWith('pull_request.closed', expect.any(Function))
      expect(probot.on).toHaveBeenCalledWith('issues.opened', expect.any(Function))
    })

    it('should use onAny instead of on("*") for universal event handler', () => {
      const onAnySpy = jest.spyOn(probot, 'onAny')

      myProbotApp(probot, { getRouter: jest.fn() })

      // Verify onAny was called (this would fail if we used app.on('*'))
      expect(onAnySpy).toHaveBeenCalledWith(expect.any(Function))
    })
  })

  describe('App Orchestration', () => {
    it('should block all PR handlers when targetBranchFilter does not match', async () => {
      jest.spyOn(utils, 'getConfig').mockResolvedValue({
        targetBranchFilter: '^release/.*$',
        labelPRBasedOnFilePath: { frontend: ['src/**'] }
      })
      const labelerSpy = jest.spyOn(labeler, 'addLabelsOnPr').mockResolvedValue()
      const issueLinkSpy = jest.spyOn(issuelink, 'insertIssueLinkInPrDescription').mockResolvedValue()
      const titleSpy = jest.spyOn(titleValidator, 'verifyTitles').mockResolvedValue()
      const uptodateSpy = jest.spyOn(upToDateChecker, 'checkUpToDate').mockResolvedValue()
      const greetingSpy = jest.spyOn(greetings, 'commentOnfirstPR').mockResolvedValue()

      myProbotApp(probot, { getRouter: jest.fn() })

      // PR targeting 'main' should be blocked by filter '^release/.*$'
      await probot.receive({ id: '1', name: 'pull_request', payload: prPayload('opened', 'main') })

      expect(labelerSpy).not.toHaveBeenCalled()
      expect(issueLinkSpy).not.toHaveBeenCalled()
      expect(titleSpy).not.toHaveBeenCalled()
      expect(uptodateSpy).not.toHaveBeenCalled()
      expect(greetingSpy).not.toHaveBeenCalled()
    })

    it('should pass through when targetBranchFilter matches', async () => {
      jest.spyOn(utils, 'getConfig').mockResolvedValue({
        targetBranchFilter: '^main$',
        labelPRBasedOnFilePath: { frontend: ['src/**'] }
      })
      const labelerSpy = jest.spyOn(labeler, 'addLabelsOnPr').mockResolvedValue()

      myProbotApp(probot, { getRouter: jest.fn() })

      await probot.receive({ id: '1', name: 'pull_request', payload: prPayload('opened', 'main') })

      expect(labelerSpy).toHaveBeenCalled()
    })

    it('should not apply branch filter to issues.opened events', async () => {
      jest.spyOn(utils, 'getConfig').mockResolvedValue({
        targetBranchFilter: '^release/.*$',
        firstIssueWelcomeComment: 'Welcome!'
      })
      const greetingSpy = jest.spyOn(greetings, 'commentOnfirstIssue').mockResolvedValue()

      myProbotApp(probot, { getRouter: jest.fn() })

      await probot.receive({
        id: '2',
        name: 'issues',
        payload: {
          action: 'opened',
          issue: {
            number: 1,
            user: { login: 'testuser' },
            html_url: 'https://github.com/owner/repo/issues/1',
            created_at: '2024-01-01T00:00:00Z'
          },
          repository: {
            id: 1,
            node_id: 'R_1',
            name: 'repo',
            full_name: 'owner/repo',
            owner: { login: 'owner' }
          },
          installation: { id: 1 }
        }
      })

      // Greetings should fire despite targetBranchFilter because issues bypass it
      expect(greetingSpy).toHaveBeenCalled()
    })

    it('should invoke multiple handlers for the same event', async () => {
      jest.spyOn(utils, 'getConfig').mockResolvedValue({
        labelPRBasedOnFilePath: { frontend: ['src/**'] },
        verifyTitles: { titleRegexp: '^fix:' }
      })
      const labelerSpy = jest.spyOn(labeler, 'addLabelsOnPr').mockResolvedValue()
      const titleSpy = jest.spyOn(titleValidator, 'verifyTitles').mockResolvedValue()

      myProbotApp(probot, { getRouter: jest.fn() })

      await probot.receive({ id: '1', name: 'pull_request', payload: prPayload('opened', 'main') })

      // Both handlers fire on the same event
      expect(labelerSpy).toHaveBeenCalled()
      expect(titleSpy).toHaveBeenCalled()
    })
  })

  describe('Stats Endpoint', () => {
    let routeHandler
    let mockReq
    let mockRes

    beforeEach(() => {
      const routes = {}
      const mockRouter = {
        get: jest.fn((path, handler) => { routes[path] = handler })
      }
      const mockGetRouter = jest.fn(() => mockRouter)

      myProbotApp(probot, { getRouter: mockGetRouter })
      routeHandler = routes['/stats']

      mockRes = {
        status: jest.fn(function () { return this }),
        json: jest.fn()
      }
    })

    it('should return 401 when no Authorization header', async () => {
      process.env.STATS_API_KEY = 'test-key'
      mockReq = { headers: {} }

      await routeHandler(mockReq, mockRes)

      expect(mockRes.status).toHaveBeenCalledWith(401)
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Missing or invalid Authorization header' })
      delete process.env.STATS_API_KEY
    })

    it('should return 403 when API key is wrong', async () => {
      process.env.STATS_API_KEY = 'correct-key'
      mockReq = { headers: { authorization: 'Bearer wrong-key' } }

      await routeHandler(mockReq, mockRes)

      expect(mockRes.status).toHaveBeenCalledWith(403)
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid API key' })
      delete process.env.STATS_API_KEY
    })

    it('should return 500 when STATS_API_KEY is not configured', async () => {
      delete process.env.STATS_API_KEY
      mockReq = { headers: { authorization: 'Bearer some-key' } }

      await routeHandler(mockReq, mockRes)

      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'STATS_API_KEY not configured' })
    })

    it('should return stats with valid API key', async () => {
      process.env.STATS_API_KEY = 'test-key'
      mockReq = { headers: { authorization: 'Bearer test-key' } }

      // Mock app.auth() to return an octokit with paginate
      jest.spyOn(probot, 'auth').mockResolvedValue({
        paginate: jest.fn().mockResolvedValue([
          { id: 1, account: { login: 'org1', type: 'Organization' } },
          { id: 2, account: { login: 'user1', type: 'User' } }
        ]),
        rest: { apps: { listInstallations: jest.fn() } }
      })

      await routeHandler(mockReq, mockRes)

      expect(mockRes.json).toHaveBeenCalledWith({
        totalInstallations: 2,
        installations: [
          { id: 1, account: 'org1', account_type: 'Organization' },
          { id: 2, account: 'user1', account_type: 'User' }
        ]
      })
      delete process.env.STATS_API_KEY
    })

    it('should return 500 when GitHub API call fails', async () => {
      process.env.STATS_API_KEY = 'test-key'
      mockReq = { headers: { authorization: 'Bearer test-key' } }

      jest.spyOn(probot, 'auth').mockRejectedValue(new Error('GitHub API down'))

      await routeHandler(mockReq, mockRes)

      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to fetch stats' })
      delete process.env.STATS_API_KEY
    })
  })
})
