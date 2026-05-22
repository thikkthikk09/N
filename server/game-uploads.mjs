/**
 * Large game .zip uploads — chunked writes to disk (up to 500 GB).
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { createReadStream } from 'fs'

export const MAX_GAME_BYTES = 500 * 1024 * 1024 * 1024
export const CHUNK_SIZE = 64 * 1024 * 1024

export function createGameUploadApi(root) {
  const UPLOADS_DIR = path.join(root, 'uploads', 'games')
  const CATALOG_PATH = path.join(UPLOADS_DIR, 'catalog.json')
  const sessions = new Map()

  fs.mkdirSync(UPLOADS_DIR, { recursive: true })

  function readCatalog() {
    try {
      const raw = fs.readFileSync(CATALOG_PATH, 'utf8')
      const data = JSON.parse(raw)
      return Array.isArray(data.games) ? data.games : []
    } catch {
      return []
    }
  }

  function writeCatalog(games) {
    fs.writeFileSync(CATALOG_PATH, JSON.stringify({ games }, null, 2))
  }

  function nextGameId(games) {
    return Math.max(999, ...games.map((g) => g.id), 0) + 1
  }

  function safeName(name) {
    return path.basename(name).replace(/[^\w.\-()+ ]/g, '_')
  }

  async function readRawBody(req, maxBytes = CHUNK_SIZE + 1024) {
    const chunks = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > maxBytes) throw new Error('CHUNK_TOO_LARGE')
      chunks.push(chunk)
    }
    return Buffer.concat(chunks)
  }

  function gameFilePath(id) {
    const games = readCatalog()
    const g = games.find((x) => x.id === id)
    if (!g?.storedName) return null
    const p = path.join(UPLOADS_DIR, String(id), g.storedName)
    const norm = path.normalize(p)
    if (!norm.startsWith(UPLOADS_DIR)) return null
    return norm
  }

  function gradients(id) {
    const list = [
      'linear-gradient(135deg, #1e3a5f 0%, #3d5a80 50%, #7dd3fc 100%)',
      'linear-gradient(135deg, #312e81 0%, #6366f1 50%, #c4b5fd 100%)',
      'linear-gradient(135deg, #134e4a 0%, #0d9488 50%, #5eead4 100%)',
      'linear-gradient(135deg, #4a1942 0%, #9d174d 50%, #fda4af 100%)',
    ]
    return list[id % list.length]
  }

  function titleFromFilename(name) {
    return name
      .replace(/\.zip$/i, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase()) || 'Untitled game'
  }

  async function handleInit(body, sendJson) {
    let json
    try {
      json = JSON.parse(body)
    } catch {
      return sendJson(400, { error: 'Invalid JSON' })
    }

    const fileName = safeName(String(json.fileName || 'game.zip'))
    const fileSize = Number(json.fileSize)
    if (!/\.zip$/i.test(fileName)) return sendJson(400, { error: 'NOT_ZIP' })
    if (!Number.isFinite(fileSize) || fileSize <= 0) return sendJson(400, { error: 'BAD_SIZE' })
    if (fileSize > MAX_GAME_BYTES) return sendJson(400, { error: 'TOO_LARGE', maxBytes: MAX_GAME_BYTES })

    const games = readCatalog()
    const gameId = nextGameId(games)
    const uploadId = crypto.randomBytes(16).toString('hex')
    const dir = path.join(UPLOADS_DIR, String(gameId))
    fs.mkdirSync(dir, { recursive: true })
    const partPath = path.join(dir, `${fileName}.part`)

    sessions.set(uploadId, {
      uploadId,
      gameId,
      fileName,
      fileSize,
      partPath,
      title: String(json.title || '').trim() || titleFromFilename(fileName),
      category: String(json.category || 'Indie'),
      price: Number(json.price) >= 0 ? Number(json.price) : 9.99,
      receivedBytes: 0,
      nextChunkIndex: 0,
    })

    return sendJson(200, {
      uploadId,
      gameId,
      chunkSize: CHUNK_SIZE,
      maxBytes: MAX_GAME_BYTES,
    })
  }

  async function handleChunk(req, sendJson) {
    const uploadId = String(req.headers['x-upload-id'] || '')
    const chunkIndex = Number(req.headers['x-chunk-index'])
    const session = sessions.get(uploadId)
    if (!session) return sendJson(404, { error: 'SESSION_NOT_FOUND' })
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
      return sendJson(400, { error: 'BAD_CHUNK_INDEX' })
    }

    let buffer
    try {
      buffer = await readRawBody(req)
    } catch (e) {
      return sendJson(413, { error: e.message || 'CHUNK_TOO_LARGE' })
    }

    if (chunkIndex !== session.nextChunkIndex) {
      return sendJson(400, {
        error: 'OUT_OF_ORDER',
        expected: session.nextChunkIndex,
      })
    }

    const nextSize = session.receivedBytes + buffer.length
    if (nextSize > session.fileSize) {
      return sendJson(400, { error: 'CHUNK_OVERFLOW' })
    }

    if (session.nextChunkIndex === 0) {
      await fs.promises.writeFile(session.partPath, buffer)
    } else {
      await fs.promises.appendFile(session.partPath, buffer)
    }

    session.nextChunkIndex += 1
    session.receivedBytes = nextSize

    return sendJson(200, {
      ok: true,
      chunkIndex,
      receivedBytes: session.receivedBytes,
      totalBytes: session.fileSize,
    })
  }

  async function handleComplete(body, sendJson) {
    let json
    try {
      json = JSON.parse(body)
    } catch {
      return sendJson(400, { error: 'Invalid JSON' })
    }

    const session = sessions.get(String(json.uploadId || ''))
    if (!session) return sendJson(404, { error: 'SESSION_NOT_FOUND' })

    const stat = await fs.promises.stat(session.partPath).catch(() => null)
    if (!stat || stat.size !== session.fileSize) {
      return sendJson(400, {
        error: 'INCOMPLETE',
        expected: session.fileSize,
        actual: stat?.size || 0,
      })
    }

    const finalName = safeName(session.fileName)
    const finalPath = path.join(path.dirname(session.partPath), finalName)
    await fs.promises.rename(session.partPath, finalPath)

    const games = readCatalog()
    const entry = {
      id: session.gameId,
      title: session.title,
      category: session.category,
      price: session.price,
      rating: 4.5,
      tag: 'ZIP',
      gradient: gradients(session.gameId),
      uploaded: true,
      storage: 'server',
      fileName: session.fileName,
      fileSize: session.fileSize,
      storedName: finalName,
      createdAt: Date.now(),
    }
    games.push(entry)
    writeCatalog(games)
    sessions.delete(session.uploadId)

    return sendJson(200, { ok: true, game: entry })
  }

  function handleCatalog(sendJson) {
    return sendJson(200, { games: readCatalog() })
  }

  function handleDelete(id, sendJson) {
    const all = readCatalog()
    const games = all.filter((g) => g.id !== id)
    writeCatalog(games)
    const dir = path.join(UPLOADS_DIR, String(id))
    fs.rmSync(dir, { recursive: true, force: true })
    return sendJson(200, { ok: true, removed })
  }

  function handleDownload(id, req, res, cors) {
    const filePath = gameFilePath(id)
    if (!filePath || !fs.existsSync(filePath)) {
      cors(res)
      res.writeHead(404)
      res.end('Not found')
      return true
    }

    const games = readCatalog()
    const g = games.find((x) => x.id === id)
    const stat = fs.statSync(filePath)
    cors(res)
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Length': stat.size,
      'Content-Disposition': `attachment; filename="${g?.fileName || 'game.zip'}"`,
    })
    createReadStream(filePath).pipe(res)
    return true
  }

  async function route(req, res, helpers) {
    const { cors, sendJson, readBody } = helpers
    const url = req.url.split('?')[0]

    if (req.method === 'GET' && url === '/api/games/catalog') {
      handleCatalog(sendJson)
      return true
    }

    if (req.method === 'GET' && url.startsWith('/api/games/download/')) {
      const id = Number(url.split('/').pop())
      if (!Number.isFinite(id)) {
        sendJson(400, { error: 'BAD_ID' })
        return true
      }
      return handleDownload(id, req, res, cors)
    }

    if (req.method === 'POST' && url === '/api/games/upload/init') {
      await handleInit(await readBody(req), sendJson)
      return true
    }

    if (req.method === 'POST' && url === '/api/games/upload/chunk') {
      await handleChunk(req, sendJson)
      return true
    }

    if (req.method === 'POST' && url === '/api/games/upload/complete') {
      await handleComplete(await readBody(req), sendJson)
      return true
    }

    if (req.method === 'DELETE' && url.startsWith('/api/games/')) {
      const id = Number(url.split('/').pop())
      if (!Number.isFinite(id)) {
        sendJson(400, { error: 'BAD_ID' })
        return true
      }
      handleDelete(id, sendJson)
      return true
    }

    return false
  }

  return { route, MAX_GAME_BYTES, CHUNK_SIZE }
}
