const utils = require('../lib/utils')

function makeContext (baseRef) {
  return {
    payload: baseRef === undefined
      ? {}
      : { pull_request: { base: { ref: baseRef } } },
    log: {
      info: jest.fn(),
      warn: jest.fn()
    }
  }
}

describe('utils', () => {
  describe('getConfig', () => {
    it('should call context.config with correct parameters', async () => {
      const context = {
        config: jest.fn().mockResolvedValue({ test: 'config' })
      }

      const result = await utils.getConfig(context)

      expect(context.config).toHaveBeenCalledWith('boring-cyborg.yml', {})
      expect(result).toEqual({ test: 'config' })
    })

    it('should return empty object as default', async () => {
      const context = {
        config: jest.fn().mockResolvedValue({})
      }

      const result = await utils.getConfig(context)

      expect(context.config).toHaveBeenCalledWith('boring-cyborg.yml', {})
      expect(result).toEqual({})
    })
  })

  describe('shouldProcessPr', () => {
    it('returns true when no targetBranchFilter is configured', () => {
      expect(utils.shouldProcessPr(makeContext('main'), {})).toBe(true)
    })

    it('returns true when payload has no pull_request (non-PR event)', () => {
      const ctx = makeContext(undefined)
      expect(utils.shouldProcessPr(ctx, { targetBranchFilter: '^main$' })).toBe(true)
    })

    it('matches against a single string pattern', () => {
      const config = { targetBranchFilter: '^main$' }
      expect(utils.shouldProcessPr(makeContext('main'), config)).toBe(true)
      expect(utils.shouldProcessPr(makeContext('dev'), config)).toBe(false)
    })

    it('matches against an array of patterns (any match passes)', () => {
      const config = { targetBranchFilter: ['^main$', '^release/.*$'] }
      expect(utils.shouldProcessPr(makeContext('main'), config)).toBe(true)
      expect(utils.shouldProcessPr(makeContext('release/1.2'), config)).toBe(true)
      expect(utils.shouldProcessPr(makeContext('feature/x'), config)).toBe(false)
    })

    it('ignores empty-string and non-string patterns', () => {
      const config = { targetBranchFilter: ['', null, '^main$'] }
      expect(utils.shouldProcessPr(makeContext('main'), config)).toBe(true)
      expect(utils.shouldProcessPr(makeContext('dev'), config)).toBe(false)
    })

    it('treats an invalid regex as non-matching and logs a warning', () => {
      const ctx = makeContext('main')
      const config = { targetBranchFilter: ['[unclosed'] }
      expect(utils.shouldProcessPr(ctx, config)).toBe(false)
      expect(ctx.log.warn).toHaveBeenCalled()
    })

    it('treats an empty array filter as unset (processes all PRs)', () => {
      expect(utils.shouldProcessPr(makeContext('main'), { targetBranchFilter: [] })).toBe(true)
    })

    it('returns true when filter value is empty string (treated as unset)', () => {
      expect(utils.shouldProcessPr(makeContext('main'), { targetBranchFilter: '' })).toBe(true)
    })

    it('returns true when config is null or undefined', () => {
      expect(utils.shouldProcessPr(makeContext('main'), null)).toBe(true)
      expect(utils.shouldProcessPr(makeContext('main'), undefined)).toBe(true)
    })

    it('rejects unsafe regex patterns and logs a warning', () => {
      const ctx = makeContext('main')
      const config = { targetBranchFilter: ['^(a+)+$'] }
      expect(utils.shouldProcessPr(ctx, config)).toBe(false)
      expect(ctx.log.warn).toHaveBeenCalled()
    })
  })

  describe('matchesBranchFilter', () => {
    it('returns true for an unset filter (undefined/null/empty)', () => {
      const ctx = makeContext('main')
      expect(utils.matchesBranchFilter(ctx, undefined)).toBe(true)
      expect(utils.matchesBranchFilter(ctx, null)).toBe(true)
      expect(utils.matchesBranchFilter(ctx, '')).toBe(true)
      expect(utils.matchesBranchFilter(ctx, [])).toBe(true)
    })

    it('returns true when payload has no pull_request', () => {
      expect(utils.matchesBranchFilter(makeContext(undefined), '^main$')).toBe(true)
    })

    it('matches against a single string pattern', () => {
      expect(utils.matchesBranchFilter(makeContext('main'), '^main$')).toBe(true)
      expect(utils.matchesBranchFilter(makeContext('dev'), '^main$')).toBe(false)
    })

    it('matches against an array (any-match passes)', () => {
      const filter = ['^main$', '^release/.*$']
      expect(utils.matchesBranchFilter(makeContext('main'), filter)).toBe(true)
      expect(utils.matchesBranchFilter(makeContext('release/1.2'), filter)).toBe(true)
      expect(utils.matchesBranchFilter(makeContext('feature/x'), filter)).toBe(false)
    })

    it('skips invalid regex patterns and logs a warning', () => {
      const ctx = makeContext('main')
      expect(utils.matchesBranchFilter(ctx, ['[unclosed'])).toBe(false)
      expect(ctx.log.warn).toHaveBeenCalled()
    })

    it('skips unsafe regex patterns and logs a warning', () => {
      const ctx = makeContext('main')
      expect(utils.matchesBranchFilter(ctx, ['^(a+)+$'])).toBe(false)
      expect(ctx.log.warn).toHaveBeenCalled()
    })

    it('does NOT log a skip message on mismatch (caller decides)', () => {
      const ctx = makeContext('dev')
      expect(utils.matchesBranchFilter(ctx, '^main$')).toBe(false)
      expect(ctx.log.info).not.toHaveBeenCalled()
    })
  })
})
