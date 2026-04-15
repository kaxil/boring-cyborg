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
  })
})
