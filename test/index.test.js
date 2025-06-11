const pino = require('pino')
const Stream = require('stream')
const { Probot, ProbotOctokit } = require('probot')
const myProbotApp = require('../index.js')

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
})
