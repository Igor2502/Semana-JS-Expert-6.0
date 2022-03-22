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

  test('#readFxByName - it should return a path of the given fx', async () => {
    jest.spyOn(
      fsPromises,
      fsPromises.readdir.name
    ).mockResolvedValue([
       'Applause Sound Effect HD No Copyright (128 kbps).mp3',       
       'Audience Applause - Gaming Sound Effect (HD) (128 kbps).mp3',
       'Boo! Sound Effect (128 kbps).mp3',
       'Fart - Gaming Sound Effect (HD) (128 kbps).mp3',
       'Laughing Sound #3 - Audience laughing Sound Effects(HD) No Copyright Sound Effects (128 kbps).mp3'
    ])

    const service = new Service()
    const result = await service.readFxByName('Applause')

    expect(result).toStrictEqual(`${config.dir.fxDirectory}/Applause Sound Effect HD No Copyright (128 kbps).mp3`)
  })

  test('#readFxByName - it should return a rejected promise given a inexistent fx', async () => {
    jest.spyOn(
      fsPromises,
      "readdir"
    ).mockResolvedValue([
       'Applause Sound Effect HD No Copyright (128 kbps).mp3',       
       'Audience Applause - Gaming Sound Effect (HD) (128 kbps).mp3',
       'Boo! Sound Effect (128 kbps).mp3',
       'Fart - Gaming Sound Effect (HD) (128 kbps).mp3',
       'Laughing Sound #3 - Audience laughing Sound Effects(HD) No Copyright Sound Effects (128 kbps).mp3'
    ])

    const service = new Service()

    expect(service.readFxByName('myFx')).rejects.toEqual(`the song myFx wasn't found!`)
  })

  test.skip('#appendFxStream - it should append the fx to the current song', async () => {
    const currentFx = 'fx.mp3'
    const service = new Service()
    const mergedthrottleTransformMock = new PassThrough()
    const expectedFirstCallResult = 'ok1'
    const expectedSecondCallResult = 'ok2'
    const writableBroadCaster = TestUtil.generateWritableStream(() => {})
    
    service.throttleTransform = new PassThrough()
    service.currentReadable = TestUtil.generateReadableStream(['abc'])

    jest.spyOn(
      streamsAsync,
      "pipeline"
    ).mockResolvedValueOnce(expectedFirstCallResult)
     .mockResolvedValueOnce(expectedSecondCallResult)
    jest.spyOn(
      service,
      service.broadCast.name
    ).mockReturnValue(writableBroadCaster)
    jest.spyOn(
      service,
      service.mergeAudioStreams.name
    ).mockReturnValue(mergedthrottleTransformMock)
    jest.spyOn(
      mergedthrottleTransformMock,
      "removeListener"
    ).mockReturnValue()

    jest.spyOn(
      service.throttleTransform,
      "pause"
    )
    jest.spyOn(
      service.currentReadable,
      "unpipe"
    ).mockImplementation()

    service.appendFxStream(currentFx)

    expect(service.throttleTransform.pause).toHaveBeenCalled()
    expect(service.currentReadable.unpipe).toHaveBeenCalledWith(service.throttleTransform)

    service.throttleTransform.emit('unpipe')
    const [call1, call2] = streamsAsync.pipeline.mock.calls
    const [resultCall1, resultCall2] = streamsAsync.pipeline.mock.results
    const [throttleTransformCall1, broadCastCall1] = call1

    expect(throttleTransformCall1).toBeInstanceOf(Throttle)
    expect(broadCastCall1).toStrictEqual(writableBroadCaster)

    const [result1, result2] = await Promise.all([resultCall1.value, resultCall2.value])

    expect(result1).toStrictEqual(expectedFirstCallResult)
    expect(result2).toStrictEqual(expectedSecondCallResult)

    const [mergedStreamCall2, throttleTransformCall2] = call2

    expect(mergedStreamCall2).toStrictEqual(mergedthrottleTransformMock)
    expect(throttleTransformCall2).toBeInstanceOf(Throttle)
    expect(service.currentReadable.removeListener).toHaveBeenCalled()
  })

  test.skip('#mergeAudioStreams - it should return a new stream containing the merged audios', async () => {
    const currentFx = 'fx.mp3'
    const service = new Service()
    const currentReadable = TestUtil.generateReadableStream(['abc'])
    const spawnResponse = TestUtil.getSpawnResponse({
      stdout: '1k',
      stdin: 'myFx'
    })

    jest.spyOn(
      service,
      service._executeSoxCommand.name
    ).mockReturnValue(spawnResponse)

    jest.spyOn(
      streamsAsync,
      "pipeline"
    ).mockResolvedValue()

    const result = service.mergeAudioStreams(currentFx, currentReadable)
    const [call1, call2] = streamsAsync.pipeline.mock.calls    
    const [readableCall, stdinCall] = call1

    expect(readableCall).toStrictEqual(currentReadable)
    expect(stdinCall).toStrictEqual(spawnResponse.stdin)

    const [stdoutCall, transformStream] = call2

    expect(stdoutCall).toStrictEqual(spawnResponse.stdout)
    expect(transformStream).toBeInstanceOf(PassThrough)    
    expect(result).toBeInstanceOf(PassThrough)
  })
})