import { createWriteStream } from 'fs'
import { utimes } from 'fs/promises'
import { pipeline } from 'stream/promises'

import sortBy from 'sortby'
import createSpeedo from 'speedo/gen'
import throttler from 'throttler/gen'
import progressStream from 'progress-stream/gen'
import hashStream from 'hash-stream/gen'

import { getDriveAPI } from './drive.mjs'

export async function * scan () {
  const drive = await getDriveAPI()
  const dirs = new Map([['', []]])

  const query = {
    fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,size,parents)'
  }

  let pResponse = drive.files.list(query)

  while (pResponse) {
    const { data } = check(await pResponse)
    if (data.nextPageToken) {
      query.pageToken = data.nextPageToken
      pResponse = drive.files.list(query)
    } else {
      pResponse = null
    }

    for (const file of data.files) {
      if (file.modifiedTime) file.mtime = new Date(file.modifiedTime)
      if (file.size) file.size = Number(file.size)
      if (!file.parents) file.parents = ['']
      for (const parent of file.parents) {
        if (!dirs.has(parent)) dirs.set(parent, [])
        dirs.get(parent).push(file)
      }
    }
  }

  yield * dir('', '')

  function * dir (id, path) {
    const files = dirs.get(id)
    files.sort(sortBy('name'))
    for (const file of files) {
      file.path = path + '/' + file.name
      yield file
      if (dirs.has(file.id)) {
        yield * dir(file.id, file.path)
      }
    }
  }
}

function check (response) {
  const { status } = response
  if (status !== 200) {
    const err = new Error('Bad response from Drive')
    err.response = response
    throw err
  }
  return response
}

export async function stat (fileId) {
  const drive = await getDriveAPI()
  const query = { fileId, fields: 'id,name,mimeType,modifiedTime,size' }
  const { data } = check(await drive.files.get(query))
  const { id, name, mimeType, modifiedTime: mtimeStr, size } = data
  return { id, name, mimeType, mtime: new Date(mtimeStr), size }
}

export async function download (fileId, dest, opts = {}) {
  const { onProgress, interval = 1000, limit } = opts
  let { size, mtime } = opts
  const drive = await getDriveAPI()
  if (!size || !mtime) {
    const stats = await stat(fileId)
    ({ size, mtime } = stats)
  }
  const hasher = hashStream()
  const speedo = createSpeedo({ total: size })
  const src = (await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' }
  )).data
  const streams = [
    src,
    hasher,
    limit && throttler(limit),
    onProgress && speedo,
    onProgress && progressStream({ onProgress, interval, speedo }),
    createWriteStream(dest)
  ].filter(Boolean)

  await pipeline(...streams)

  await utimes(dest, mtime, mtime)
  return { hash: hasher.hash, mtime, size }
}
