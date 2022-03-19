import { jest, test, expect, beforeAll, describe } from '@jest/globals'

import { Service } from '../../../server/service.js'
import TestUtil from '../_util/testUtil'
import config from '../../../server/config.js'

import fs from 'fs'
import fsPromises from 'fs/promises'
import os from 'os'

describe('#Service - test suit for services', () => {
  beforeAll(() => {
    jest.clearAllMocks()
    jest.restoreAllMocks()
  })

  test('#createFileStream', () => {
    const mockReadableStream = TestUtil.generateReadableStream(['data'])
    const mockFilename = '/index.html'

    jest.spyOn(
      fs,
      fs.createReadStream.name
    ).mockReturnValue(mockReadableStream)

    const service = new Service()
    const stream = service.createFileStream(mockFilename)

    expect(fs.createReadStream).toHaveBeenCalledWith(mockFilename)
    expect(stream).toEqual(mockReadableStream)
  })

  test('#getFileInfo', async () => {
    const mockFile = 'image.png'

    jest.spyOn(
      fsPromises,
      fsPromises.access.name
    ).mockResolvedValue()

    const service = new Service()
    const { name, type } = await service.getFileInfo(mockFile)

    const expectedValue = {
      type: '.png',
      name: `${config.dir.publicDirectory}${os.type().includes('Linux') ? '/' : '\\'}${mockFile}`
    }

    expect(type).toEqual(expectedValue.type)
    expect(name).toEqual(expectedValue.name)
  })

  test('#getFileStream', async () => {
    const mockFile = 'image.png'
    const mockType = '.png'
    const mockCurrentFile = `${config.dir.publicDirectory}\\${mockFile}`
    const mockStream = TestUtil.generateReadableStream(['data'])

    jest.spyOn(
      Service.prototype,
      Service.prototype.getFileInfo.name,
    ).mockResolvedValue({
      name: mockCurrentFile,
      type: mockType
    })

    jest.spyOn(
      Service.prototype,
      Service.prototype.createFileStream.name
    ).mockReturnValue(mockStream)

    const service = new Service()
    const { stream, type } = await service.getFileStream(mockFile)

    expect(stream).toStrictEqual(mockStream)
    expect(type).toEqual(mockType)
  })
})