const utils = require('../lib/utils')

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
})
