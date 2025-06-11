// Test setup file
const nock = require('nock')

// Setup nock to prevent actual HTTP requests during tests
beforeEach(() => {
  nock.disableNetConnect()
})

afterEach(() => {
  nock.cleanAll()
  nock.enableNetConnect()
})
