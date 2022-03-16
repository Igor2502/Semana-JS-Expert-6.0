import { jest, describe, beforeEach, expect, test } from '@jest/globals'
import TestUtil from '../_util/testUtil.js'
import { Controller } from '../../../server/controller.js'
import { Service } from '../../../server/service.js'

describe('#Controller - test suite for controllers', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.restoreAllMocks()
  })

  test('#getFileStream', async () => {
    const mockStream = TestUtil.generateReadableStream(['data'])
    const mockType = '.html'
    const mockFilename = 'index.html'

    jest.spyOn(
      Service.prototype,
      Service.prototype.getFileStream.name,
    ).mockResolvedValue({
      stream: mockStream,
      type: mockType
    })

    const controller = new Controller()
    const {
      stream,
      type
    } = await controller.getFileStream(mockFilename)

    expect(stream).toEqual(mockStream)
    expect(type).toEqual(mockType)
  })
})