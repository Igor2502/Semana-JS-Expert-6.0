import fs from 'fs'
import fsPromises from 'fs/promises'
import { extname, join } from 'path'
import { randomUUID } from 'crypto'
import { PassThrough, Writable } from 'stream'
import Throttle from 'throttle'
import childProcess from 'child_process'
import streamsPromises from 'stream/promises'

import config from './config.js'
import { logger } from './util.js'
import { once } from 'events'

export class Service {

  constructor() {
    this.clientStreams = new Map()
    this.currentSong = config.constants.englishConversation
    this.currentBitRate = 0
    this.throttleTransform = {}
    this.currentReadable = {}
  }

  createClientStream() {
    const id = randomUUID()
    const clientStream = new PassThrough()
    this.clientStreams.set(id, clientStream)

    return {
      id,
      clientStream
    }
  }

  removeClientStream(id) {
    this.clientStreams.delete(id)
  }

  _executeSoxCommand(args) {
    return childProcess.spawn('sox', args)
  }

  async getBitRate(song) {
    try {
      const args = [ '--i', '-B', song ]
      const { stderr, stdout, stdin } = this._executeSoxCommand(args)

      await Promise.all([
        once(stderr, 'readable'),
        once(stdout, 'readable'),
      ])

      const [sucess, error] = [stdout, stderr].map(stream => stream.read())
      if (error) return await Promise.reject(error)

      return sucess.toString().trim().replace(/k/, '000')

    } catch (error) {
      logger.error(`deu ruim no bitRate: ${error}`)
      return config.constants.fallbackBitRate
    }
  }

  broadCast() {
    return new Writable({
      write: (chunk, enc, cb) => {
        for (const [id, stream] of this.clientStreams) {
          if (stream.writableEnded) {
            this.clientStreams.delete(id)
            continue;
          }

          stream.write(chunk)
        }

        cb()
      }
    })
  }

  async startStreamming() {
    logger.info(`starting with ${this.currentSong}`)
    const bitRate = this.currentBitRate = (await this.getBitRate(this.currentSong)) / config.constants.bitRateDivisor
    const throttleTransform = this.throttleTransform = new Throttle(bitRate)
    const songReadable = this.currentReadable = this.createFileStream(this.currentSong)
    return streamsPromises.pipeline(
      songReadable,
      throttleTransform,
      this.broadCast()
    )
  }

  stopStreamming() {
    this.throttleTransform?.end?.()
  }

  createFileStream(filename) {
    return fs.createReadStream(filename)
  }

  async getFileInfo(file) {
    const fullFilePath = join(config.dir.publicDirectory, file)
    await fsPromises.access(fullFilePath)
    const fileType = extname(fullFilePath)

    return {
      type: fileType,
      name: fullFilePath
    }
  }

  async getFileStream(file) {
    const { name, type } = await this.getFileInfo(file)
    return {
      stream: this.createFileStream(name),
      type
    }
  }
}