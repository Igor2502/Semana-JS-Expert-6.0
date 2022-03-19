import { jest, test, expect, beforeAll, describe } from '@jest/globals'

import { Service } from '../../../server/service.js'
import TestUtil from '../_util/testUtil'
import config from '../../../server/config.js'

import { Writable, PassThrough } from 'stream'
import fs from 'fs'
import fsPromises from 'fs/promises'
import os from 'os'
import childProcess from 'child_process'
import streamsAsync from 'stream/promises'
import Throttle from 'throttle'

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

  test('#createClientStream', () => {
    const service = new Service()
    jest.spyOn(
      service.clientStreams,
      service.clientStreams.set.name
    ).mockReturnValue()

    const {
      id,
      clientStream
    } = service.createClientStream()

    expect(id.length).toBeGreaterThan(0)
    expect(clientStream).toBeInstanceOf(PassThrough)
    expect(service.clientStreams.set).toHaveBeenCalledWith(id, clientStream)
  })

  test('#removeClientStream', () => {
    const service = new Service()
    jest.spyOn(
      service.clientStreams,
      service.clientStreams.delete.name
    ).mockReturnValue()
    const mockId = '1'
    service.removeClientStream(mockId)

    expect(service.clientStreams.delete).toHaveBeenCalledWith(mockId)
  })

  test('#_executeSoxCommand - it should call the sox command', async () => {
    const service = new Service()
    const spawnResponse = TestUtil.getSpawnResponse({
      stdout: '1k'
    })
    jest.spyOn(
      childProcess,
      childProcess.spawn.name
    ).mockReturnValue(spawnResponse)

    const args = ['myArgs']
    const result = service._executeSoxCommand(args)
    expect(childProcess.spawn).toHaveBeenCalledWith('sox', args)
    expect(result).toStrictEqual(spawnResponse)
  })

  test('#getBitRate - it should return the bitRate as string', async () => {
    const song = 'mySong'
    const service = new Service()
    const spawnResponse = TestUtil.getSpawnResponse({
      stdout: '  1k  '
    })

    jest.spyOn(
      service,
      service._executeSoxCommand.name
    ).mockReturnValue(spawnResponse)

    const bitRatePromise = service.getBitRate(song)

    const result = await bitRatePromise
    expect(result).toStrictEqual('1000')
    expect(service._executeSoxCommand).toHaveBeenCalledWith(['--i', '-B', song])
  })

  test('#getBitRate - when an error ocurr it should get the fallbackBitRate', async () => {
    const song = 'mySong'
    const service = new Service()
    const spawnResponse = TestUtil.getSpawnResponse({
      stderr: 'error!'
    })

    jest.spyOn(
      service,
      service._executeSoxCommand.name
    ).mockReturnValue(spawnResponse)

    const bitRatePromise = service.getBitRate(song)

    const result = await bitRatePromise
    expect(result).toStrictEqual(config.constants.fallbackBitRate)
    expect(service._executeSoxCommand).toHaveBeenCalledWith(['--i', '-B', song])
  })

  test('#broadCast - it should write only for active client streams', () => {
    const service = new Service()
    const onData = jest.fn()
    const client1 = TestUtil.generateWritableStream(onData)
    const client2 = TestUtil.generateWritableStream(onData)

    jest.spyOn(
      service.clientStreams,
      service.clientStreams.delete.name
    )

    service.clientStreams.set('1', client1)
    service.clientStreams.set('2', client2)
    client2.end()

    const writable = service.broadCast()
    writable.write('data')

    expect(writable).toBeInstanceOf(Writable)
    expect(service.clientStreams.delete).toHaveBeenCalled()
    expect(onData).toHaveBeenCalledTimes(1)
  })

  test('#startStreamming - it should call the sox command', async () => {
    const currentSong = 'mySong.mp3'
    const expectedResult = 'ok'
    const service = new Service()
    const currentReadable = TestUtil.generateReadableStream(['abc'])
    const writableBroadCaster = TestUtil.generateWritableStream(() => {})
    service.currentSong = currentSong

    jest.spyOn(
      service,
      service.getBitRate.name
    ).mockResolvedValue(config.constants.fallbackBitRate)
    jest.spyOn(
      streamsAsync,
      streamsAsync.pipeline.name
    ).mockResolvedValue(expectedResult)
    jest.spyOn(
      fs,
      'createReadStream'
    ).mockReturnValue(currentReadable)
    jest.spyOn(
      service,
      service.broadCast.name
    ).mockReturnValue(writableBroadCaster)

    const expectedThrottle = config.constants.fallbackBitRate / config.constants.bitRateDivisor
    const result = await service.startStreamming()

    expect(service.currentBitRate).toEqual(expectedThrottle)
    expect(result).toEqual(expectedResult)
    expect(service.getBitRate).toHaveBeenCalledWith(currentSong)
  })

  test('#stopStreamming - existing throttleTransform', () => {
    const service = new Service()
    service.throttleTransform = new Throttle(1)

    jest.spyOn(
      service.throttleTransform,
      "end",
    ).mockReturnValue()

    service.stopStreamming()
    expect(service.throttleTransform.end).toHaveBeenCalled()
  })

  test('#stopStreamming - non existing throttleTransform', () => {
    const service = new Service()
    expect(() => service.stopStreamming()).not.toThrow()
  })
})