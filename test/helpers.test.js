const { createMockContext } = require('./helpers')

describe('createMockContext', () => {
  // Feature tests only exercise these mocks, so a mocked method that the real
  // client lacks would pass every unit test and fail in production.
  it('only mocks octokit members that exist on the real ProbotOctokit', async () => {
    const { ProbotOctokit } = await import('probot') // ESM-only, so require() can't load it
    const real = new ProbotOctokit()
    const { rest, ...topLevel } = createMockContext().octokit

    const missing = [
      // Catches the pre-v14 shape, e.g. a bare `pulls` beside `rest`
      ...Object.keys(topLevel).filter(key => !(key in real)),
      ...Object.entries(rest).flatMap(([namespace, methods]) =>
        Object.keys(methods)
          .filter(method => typeof real.rest[namespace]?.[method] !== 'function')
          .map(method => `rest.${namespace}.${method}`)
      )
    ]

    expect(missing).toEqual([])
  })
})
