import { jest, expect, describe, test, beforeEach } from '@jest/globals'
import config from '../../../server/config.js'
import { Controller } from '../../../server/controller.js'
import { handler } from '../../../server/routes.js'
import TestUtil from '../_util/testUtil.js'

describe('#Routes - test suit for api response', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
  })

  test('GET / - should redirect to home page', async () => {
    const params = TestUtil.defaultHandleParams()

    params.request.method = 'GET'
    params.request.url = '/'

    await handler(...params.values())
    expect(params.response.end).toHaveBeenCalled()
    expect(params.response.writeHead).toHaveBeenCalledWith(302, {
      'Location': config.location.home
    })
  })

  test(`GET /home - should response with ${config.pages.homeHTML} file stream`, async () => {
    const params = TestUtil.defaultHandleParams()
    params.request.method = 'GET'
    params.request.url = '/home'

    const mockFileStream = TestUtil.generateReadableStream(['data'])

    jest.spyOn(
      Controller.prototype,
      Controller.prototype.getFileStream.name,
    ).mockResolvedValue({
      stream: mockFileStream
    })
    jest.spyOn(
      mockFileStream,
      "pipe"
    ).mockReturnValue()

    await handler(...params.values())
    expect(Controller.prototype.getFileStream).toHaveBeenCalledWith(config.pages.homeHTML)
    expect(mockFileStream.pipe).toHaveBeenCalledWith(params.response)
  })

  test(`GET /stream?id=123 - should response with a new client stream`, async () => {
    const params = TestUtil.defaultHandleParams()
    params.request.method = 'GET'
    params.request.url = '/stream'

    const stream = TestUtil.generateReadableStream(['test'])
    const onClose = jest.fn()

    jest.spyOn(
      stream,
      'pipe'
    ).mockReturnValue()
    jest.spyOn(
      Controller.prototype,
      Controller.prototype.createClientStream.name
    ).mockReturnValue({
      stream,
      onClose
    })

    await handler(...params.values())
    params.request.emit('close')

    expect(params.response.writeHead).toHaveBeenCalledWith(200, {
      'Content-Type': 'audio/mpeg',
      'Accept-Ranges': 'bytes',
    })
    expect(Controller.prototype.createClientStream).toHaveBeenCalled()
    expect(stream.pipe).toHaveBeenCalledWith(params.response)
    expect(onClose).toHaveBeenCalled()
  })

  test(`GET /controller - should response with ${config.pages.controllerHTML} file stream`, async () => {
    const params = TestUtil.defaultHandleParams()
    params.request.method = 'GET'
    params.request.url = '/controller'

    const mockFileStream = TestUtil.generateReadableStream(['data'])

    jest.spyOn(
      Controller.prototype,
      Controller.prototype.getFileStream.name,
    ).mockResolvedValue({
      stream: mockFileStream
    })
    jest.spyOn(
      mockFileStream,
      "pipe"
    ).mockReturnValue()

    await handler(...params.values())
    expect(Controller.prototype.getFileStream).toHaveBeenCalledWith(config.pages.controllerHTML)
    expect(mockFileStream.pipe).toHaveBeenCalledWith(params.response)
  })

  test(`POST /controller - should send a command to execute at sox`, async () => {
    const params = TestUtil.defaultHandleParams()
    params.request.method = 'POST'
    params.request.url = '/controller'
    params.request.push(JSON.stringify(
      {
        'command': 'start'
      }
    ))

    jest.spyOn(
      Controller.prototype,
      Controller.prototype.handleCommand.name,
    ).mockResolvedValue({
      result: 'ok'
    })

    await handler(...params.values())
    expect(Controller.prototype.handleCommand).toHaveBeenCalledWith({ command: 'start' })
  })

  test(`GET /index.html - should response with file stream`, async () => {
    const params = TestUtil.defaultHandleParams()
    const fileName = '/index.html'
    params.request.method = 'GET'
    params.request.url = fileName

    const mockFileStream = TestUtil.generateReadableStream(['data'])
    const expectedType = '.html'

    jest.spyOn(
      Controller.prototype,
      Controller.prototype.getFileStream.name,
    ).mockResolvedValue({
      stream: mockFileStream,
      type: expectedType
    })
    jest.spyOn(
      mockFileStream,
      "pipe"
    ).mockReturnValue()

    await handler(...params.values())
    expect(Controller.prototype.getFileStream).toHaveBeenCalledWith(fileName)
    expect(mockFileStream.pipe).toHaveBeenCalledWith(params.response)
    expect(params.response.writeHead).toHaveBeenCalledWith(200, {
      'Content-Type': config.constants.CONTENT_TYPE[expectedType]
    })
  })

  test(`GET /file.ext - should response with file stream`, async () => {
    const params = TestUtil.defaultHandleParams()
    const fileName = '/file.ext'
    params.request.method = 'GET'
    params.request.url = fileName

    const mockFileStream = TestUtil.generateReadableStream(['data'])
    const expectedType = '.ext'

    jest.spyOn(
      Controller.prototype,
      Controller.prototype.getFileStream.name,
    ).mockResolvedValue({
      stream: mockFileStream,
      type: expectedType
    })
    jest.spyOn(
      mockFileStream,
      "pipe"
    ).mockReturnValue()

    await handler(...params.values())
    expect(Controller.prototype.getFileStream).toHaveBeenCalledWith(fileName)
    expect(mockFileStream.pipe).toHaveBeenCalledWith(params.response)
    expect(params.response.writeHead).not.toHaveBeenCalled()
  })

  test(`GET /unknown - given a inexistent route it should response with 404`, async () => {
    const params = TestUtil.defaultHandleParams()
    params.request.method = 'POST'
    params.request.url = '/unknown'

    await handler(...params.values())
    expect(params.response.writeHead).toHaveBeenCalledWith(404)
    expect(params.response.end).toHaveBeenCalled()
  })

  describe('exceptions', () => {
    test('given inexistent file it should respond with 404', async () => {
      const params = TestUtil.defaultHandleParams()
      params.request.method = 'GET'
      params.request.url = '/index.png'

      jest.spyOn(
        Controller.prototype,
        Controller.prototype.getFileStream.name
      ).mockRejectedValue(new Error('Error: ENOENT: no such file or directory'))

      await handler(...params.values())
      expect(params.response.writeHead).toHaveBeenCalledWith(404)
      expect(params.response.end).toHaveBeenCalled()
    })
    test('given an error it should respond with 500', async () => {
      const params = TestUtil.defaultHandleParams()
      params.request.method = 'GET'
      params.request.url = '/index.png'

      jest.spyOn(
        Controller.prototype,
        Controller.prototype.getFileStream.name
      ).mockRejectedValue(new Error('Error:'))

      await handler(...params.values())
      expect(params.response.writeHead).toHaveBeenCalledWith(500)
      expect(params.response.end).toHaveBeenCalled()
    })
  })
})