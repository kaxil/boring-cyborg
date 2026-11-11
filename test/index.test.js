const pino = require('pino')
const Stream = require('stream')
const myProbotApp = require('../index.js')
const utils = require('../lib/utils')
const labeler = require('../lib/labeler')
const greetings = require('../lib/greetings')
const issuelink = require('../lib/issuelink')
const titleValidator = require('../lib/title_validator')
const upToDateChecker = require('../lib/up_to_date_checker')

describe('Boring Cyborg App Integration', () => {
  let Probot
  let ProbotOctokit
  let probot
  let logOutput

  beforeAll(async () => {
    // Probot v14 is ESM-only; Jest's CommonJS runtime can only load it through import()
    ({ Probot, ProbotOctokit } = await import('probot'))
  })

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
        myProbotApp(probot, { addHandler: jest.fn() })
      }).not.toThrow()
    })

    it('should log app loaded message', () => {
      myProbotApp(probot, { addHandler: jest.fn() })

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

      myProbotApp(probot, { addHandler: jest.fn() })

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

      myProbotApp(probot, { addHandler: jest.fn() })

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

      myProbotApp(probot, { addHandler: jest.fn() })

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

      myProbotApp(probot, { addHandler: jest.fn() })

      await probot.receive({ id: '1', name: 'pull_request', payload: prPayload('opened', 'main') })

      expect(labelerSpy).toHaveBeenCalled()
    })

    it('should not apply branch filter to issues.opened events', async () => {
      jest.spyOn(utils, 'getConfig').mockResolvedValue({
        targetBranchFilter: '^release/.*$',
        firstIssueWelcomeComment: 'Welcome!'
      })
      const greetingSpy = jest.spyOn(greetings, 'commentOnfirstIssue').mockResolvedValue()

      myProbotApp(probot, { addHandler: jest.fn() })

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

      myProbotApp(probot, { addHandler: jest.fn() })

      await probot.receive({ id: '1', name: 'pull_request', payload: prPayload('opened', 'main') })

      // Both handlers fire on the same event
      expect(labelerSpy).toHaveBeenCalled()
      expect(titleSpy).toHaveBeenCalled()
    })
  })

  describe('Stats Endpoint', () => {
    let statsHandler

    beforeEach(() => {
      delete process.env.STATS_API_KEY // Don't let a key exported in the shell leak in
      const addHandler = jest.fn()
      myProbotApp(probot, { addHandler })
      statsHandler = addHandler.mock.calls[0][0]
    })

    afterEach(() => {
      delete process.env.STATS_API_KEY
    })

    const callStats = async ({ method = 'GET', url = '/boring-cyborg/stats', headers = {} } = {}) => {
      const res = { writeHead: jest.fn(), end: jest.fn() }
      const handled = await statsHandler({ method, url, headers }, res)
      const status = res.writeHead.mock.calls[0]?.[0]
      const raw = res.end.mock.calls[0]?.[0]
      return { handled, status, body: raw && JSON.parse(raw) }
    }

    it.each([
      ['another path', { url: '/api/github/webhooks' }],
      ['a POST', { method: 'POST' }],
      ['a path that new URL() rejects', { url: '//' }]
    ])('should let %s through to the next handler', async (_label, request) => {
      const result = await callStats(request)

      expect(result).toEqual({ handled: false, status: undefined, body: undefined })
    })

    it('should return 401 when no Authorization header', async () => {
      process.env.STATS_API_KEY = 'test-key'

      const result = await callStats()

      expect(result).toEqual({ handled: true, status: 401, body: { error: 'Missing or invalid Authorization header' } })
    })

    it('should return 403 when API key is wrong', async () => {
      process.env.STATS_API_KEY = 'correct-key'

      const result = await callStats({ headers: { authorization: 'Bearer wrong-key' } })

      expect(result).toEqual({ handled: true, status: 403, body: { error: 'Invalid API key' } })
    })

    it('should return 500 when STATS_API_KEY is not configured', async () => {
      const result = await callStats({ headers: { authorization: 'Bearer some-key' } })

      expect(result).toEqual({ handled: true, status: 500, body: { error: 'STATS_API_KEY not configured' } })
    })

    it('should return stats with valid API key, ignoring the query string', async () => {
      process.env.STATS_API_KEY = 'test-key'
      jest.spyOn(probot, 'auth').mockResolvedValue({
        paginate: jest.fn().mockResolvedValue([
          { id: 1, account: { login: 'org1', type: 'Organization' } },
          { id: 2, account: { login: 'user1', type: 'User' } }
        ]),
        rest: { apps: { listInstallations: jest.fn() } }
      })

      const result = await callStats({ url: '/boring-cyborg/stats?x=1', headers: { authorization: 'Bearer test-key' } })

      expect(result).toEqual({
        handled: true,
        status: 200,
        body: {
          totalInstallations: 2,
          installations: [
            { id: 1, account: 'org1', account_type: 'Organization' },
            { id: 2, account: 'user1', account_type: 'User' }
          ]
        }
      })
    })

    it('should return 500 when GitHub API call fails', async () => {
      process.env.STATS_API_KEY = 'test-key'
      jest.spyOn(probot, 'auth').mockRejectedValue(new Error('GitHub API down'))

      const result = await callStats({ headers: { authorization: 'Bearer test-key' } })

      expect(result).toEqual({ handled: true, status: 500, body: { error: 'Failed to fetch stats' } })
    })
  })

  it('should still load when there is no HTTP server, as under `probot receive`', () => {
    const addHandler = jest.fn(() => { throw new Error('No server instance') })

    expect(() => myProbotApp(probot, { addHandler })).not.toThrow()
  })
})
