import { relative, join, dirname } from 'path'
import { stat, mkdir } from 'fs/promises'

import { format } from '@lukeed/ms'
import mri from 'mri'
import log from 'logjs'
import filescan from 'filescan'

import { scan, download } from './src/index.mjs'

async function main () {
  const opts = mri(process.argv.slice(2), {
    alias: {
      n: ['dryrun', 'dry-run'],
      l: 'limit'
    }
  })
  const [driveRoot, localRoot] = opts._
  const { dryrun, limit } = opts

  log('Sync from gdrive://%s to %s', driveRoot, localRoot)
  log.status('Scanning gdrive...')

  const seen = new Set()

  for await (const file of scan()) {
    if (!file.path.startsWith(driveRoot)) continue
    if (file.mimeType.endsWith('folder')) continue
    const path = relative(driveRoot, file.path)
    log.status(path)
    const localFile = join(localRoot, path)
    seen.add(localFile)
    let stats
    try {
      stats = await stat(localFile)
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
    if (stats && stats.size === file.size && +stats.mtime === +file.mtime) {
      continue
    }
    if (dryrun) {
      log('%s (dryrun)', localFile)
      continue
    }
    log(log.green(localFile))
    await mkdir(dirname(localFile), { recursive: true })
    await download(file.id, localFile, { ...file, onProgress, limit })
    log.status('')
  }
  log.status('Checking local files...')
  for await (const { path, stats } of filescan(localRoot)) {
    log.status(path)
    if (stats.isDirectory()) continue
    if (seen.has(path)) continue
    if (dryrun) {
      log('%s - remove (dryrun)', path)
      continue
    }
    log('%s - remove')
  }
  log.status('')
}

function onProgress (update) {
  const {
    bytes,
    speedo: { percent, total, taken, eta, rate }
  } = update
  log.status(
    [
      comma(bytes).padStart(1 + comma(total).length),
      `${percent.toString().padStart(3)}%`,
      `time ${format(taken)}`,
      `eta ${eta < 1000 ? '0s' : format(eta)}`,
      `rate ${fmtSize(rate)}B/s`
    ].join(' ')
  )
}

function comma (n) {
  if (typeof n !== 'number') return ''
  return n.toLocaleString()
}

function fmtSize (n) {
  const suffixes = [
    ['G', 1024 * 1024 * 1024],
    ['M', 1024 * 1024],
    ['K', 1024],
    ['', 1]
  ]

  for (const [suffix, factor] of suffixes) {
    if (n >= factor) {
      return (n / factor).toFixed(1) + suffix
    }
  }
  return '0'
}

main()
