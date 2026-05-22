/**
 * Game .zip uploads — browser storage (OPFS / IndexedDB), up to 500 GB. No server required.
 */
;(function (global) {
  const META_KEY = 'dyna_uploaded_games'
  const DB_NAME = 'dyna_store_games'
  const DB_VER = 1
  const MAX_BYTES = 500 * 1024 * 1024 * 1024
  const MAX_ZIP_GB = 500
  const IDB_MAX_BYTES = 200 * 1024 * 1024
  const CHUNK_BYTES = 64 * 1024 * 1024
  const DEFAULT_ORIGIN = 'http://127.0.0.1:8787'

  let cachedOrigin = null

  function opfsPath(id) {
    return `game-${id}.zip`
  }

  function opfsSupported() {
    try {
      return Boolean(navigator.storage?.getDirectory)
    } catch {
      return false
    }
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('zips')) {
          db.createObjectStore('zips', { keyPath: 'id' })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  function loadMetaLocal() {
    try {
      return JSON.parse(localStorage.getItem(META_KEY) || '[]')
    } catch {
      return []
    }
  }

  function saveMetaLocal(list) {
    localStorage.setItem(META_KEY, JSON.stringify(list))
  }

  function titleFromFilename(name) {
    return name
      .replace(/\.zip$/i, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase()) || 'Untitled game'
  }

  function formatBytes(n) {
    if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`
    if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
    if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
    return `${n} B`
  }

  const gradients = [
    'linear-gradient(135deg, #1e3a5f 0%, #3d5a80 50%, #7dd3fc 100%)',
    'linear-gradient(135deg, #312e81 0%, #6366f1 50%, #c4b5fd 100%)',
    'linear-gradient(135deg, #134e4a 0%, #0d9488 50%, #5eead4 100%)',
    'linear-gradient(135deg, #4a1942 0%, #9d174d 50%, #fda4af 100%)',
  ]

  function decorateEntry(entry) {
    return {
      ...entry,
      fileSizeLabel: entry.fileSizeLabel || formatBytes(entry.fileSize || 0),
    }
  }

  function nextId(meta) {
    return Math.max(999, ...meta.map((g) => g.id)) + 1
  }

  async function resolveApiOrigin() {
    if (cachedOrigin) return cachedOrigin
    const list = []
    if (typeof location !== 'undefined' && location.origin?.startsWith('http')) {
      list.push(location.origin)
    }
    list.push(DEFAULT_ORIGIN)
    for (const origin of [...new Set(list)]) {
      try {
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), 1500)
        const res = await fetch(`${origin}/api/health`, { signal: ctrl.signal })
        clearTimeout(t)
        if (res.ok) {
          const h = await res.json()
          if (h.gameUploads) {
            cachedOrigin = origin
            return origin
          }
        }
      } catch {
        /* optional server */
      }
    }
    return null
  }

  async function loadMeta() {
    const local = loadMetaLocal().map(decorateEntry)
    const origin = await resolveApiOrigin()
    if (!origin) return local

    try {
      const res = await fetch(`${origin}/api/games/catalog`)
      if (!res.ok) return local
      const data = await res.json()
      const remote = (data.games || []).map(decorateEntry)
      if (!remote.length) return local

      const byId = new Map(local.map((g) => [g.id, g]))
      for (const g of remote) {
        const prev = byId.get(g.id)
        byId.set(g.id, prev ? { ...prev, ...g, storage: g.storage || prev.storage, opfsPath: g.opfsPath || prev.opfsPath } : g)
      }
      const merged = [...byId.values()]
      saveMetaLocal(merged)
      return merged
    } catch {
      return local
    }
  }

  function triggerFileDownload(fileOrBlob, fileName) {
    const blob = fileOrBlob instanceof Blob ? fileOrBlob : new Blob([fileOrBlob])
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName || 'game.zip'
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      URL.revokeObjectURL(url)
      a.remove()
    }, 1500)
  }

  async function saveZipIdb(id, blob, fileName) {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('zips', 'readwrite')
      tx.objectStore('zips').put({ id, blob, fileName, size: blob.size, at: Date.now() })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  async function deleteZipIdb(id) {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('zips', 'readwrite')
      tx.objectStore('zips').delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  async function deleteZipOpfs(id) {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry(opfsPath(id)).catch(() => {})
  }

  async function uploadZipOpfs(file, options, onProgress) {
    const meta = loadMetaLocal()
    const id = nextId(meta)
    const name = file.name || 'game.zip'
    const root = await navigator.storage.getDirectory()
    const path = opfsPath(id)
    const handle = await root.getFileHandle(path, { create: true })
    const writable = await handle.createWritable()

    let offset = 0
    while (offset < file.size) {
      const end = Math.min(offset + CHUNK_BYTES, file.size)
      const buf = await file.slice(offset, end).arrayBuffer()
      await writable.write(buf)
      offset = end
      onProgress?.({
        loaded: offset,
        total: file.size,
        percent: Math.min(100, Math.round((offset / file.size) * 100)),
      })
    }
    await writable.close()

    const entry = decorateEntry({
      id,
      title: options.title || titleFromFilename(name),
      category: options.category || 'Indie',
      price: Number(options.price) >= 0 ? Number(options.price) : 9.99,
      rating: 4.5,
      tag: 'ZIP',
      gradient: gradients[id % gradients.length],
      uploaded: true,
      storage: 'opfs',
      opfsPath: path,
      fileName: name,
      fileSize: file.size,
      createdAt: Date.now(),
    })
    meta.push(entry)
    saveMetaLocal(meta)
    return entry
  }

  async function uploadZipIndexedDB(file, options, onProgress) {
    onProgress?.({ loaded: 0, total: file.size, percent: 0 })
    const meta = loadMetaLocal()
    const id = nextId(meta)
    const name = file.name || 'game.zip'
    const entry = decorateEntry({
      id,
      title: options.title || titleFromFilename(name),
      category: options.category || 'Indie',
      price: Number(options.price) >= 0 ? Number(options.price) : 9.99,
      rating: 4.5,
      tag: 'ZIP',
      gradient: gradients[id % gradients.length],
      uploaded: true,
      storage: 'browser',
      fileName: name,
      fileSize: file.size,
      createdAt: Date.now(),
    })
    await saveZipIdb(id, file, name)
    meta.push(entry)
    saveMetaLocal(meta)
    onProgress?.({ loaded: file.size, total: file.size, percent: 100 })
    return entry
  }

  async function uploadZipServer(file, options, origin, onProgress) {
    const name = file.name || 'game.zip'
    const initRes = await fetch(`${origin}/api/games/upload/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: name,
        fileSize: file.size,
        title: options.title || titleFromFilename(name),
        category: options.category || 'Indie',
        price: options.price,
      }),
    })
    const init = await initRes.json()
    if (!initRes.ok) {
      if (init.error === 'TOO_LARGE') throw new Error('TOO_LARGE')
      throw new Error(init.error || 'INIT_FAILED')
    }

    const chunkSize = init.chunkSize || CHUNK_BYTES
    const uploadId = init.uploadId
    let offset = 0
    let index = 0

    while (offset < file.size) {
      const end = Math.min(offset + chunkSize, file.size)
      const res = await fetch(`${origin}/api/games/upload/chunk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Upload-Id': uploadId,
          'X-Chunk-Index': String(index),
        },
        body: file.slice(offset, end),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'CHUNK_FAILED')

      offset = end
      index += 1
      onProgress?.({
        loaded: offset,
        total: file.size,
        percent: Math.min(100, Math.round((offset / file.size) * 100)),
      })
    }

    const doneRes = await fetch(`${origin}/api/games/upload/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadId }),
    })
    const done = await doneRes.json()
    if (!doneRes.ok) throw new Error(done.error || 'COMPLETE_FAILED')

    await loadMeta()
    return decorateEntry(done.game || { id: init.gameId })
  }

  async function uploadZipFile(file, options = {}, onProgress) {
    if (!file) throw new Error('NO_FILE')
    const name = file.name || 'game.zip'
    if (!/\.zip$/i.test(name)) throw new Error('NOT_ZIP')
    if (file.size > MAX_BYTES) throw new Error('TOO_LARGE')

    if (opfsSupported()) {
      return uploadZipOpfs(file, options, onProgress)
    }
    if (file.size <= IDB_MAX_BYTES) {
      return uploadZipIndexedDB(file, options, onProgress)
    }

    const origin = await resolveApiOrigin()
    if (origin) {
      return uploadZipServer(file, options, origin, onProgress)
    }

    throw new Error('STORAGE_UNSUPPORTED')
  }

  async function removeUpload(id) {
    const meta = loadMetaLocal()
    const item = meta.find((g) => g.id === id)

    if (item?.storage === 'server') {
      const origin = await resolveApiOrigin()
      if (origin) await fetch(`${origin}/api/games/${id}`, { method: 'DELETE' })
    } else if (item?.storage === 'opfs') {
      await deleteZipOpfs(id)
    } else {
      await deleteZipIdb(id).catch(() => {})
    }

    saveMetaLocal(meta.filter((g) => g.id !== id))
  }

  async function downloadFromOpfs(id, item) {
    const root = await navigator.storage.getDirectory()
    const handle = await root.getFileHandle(item.opfsPath || opfsPath(id))
    const file = await handle.getFile()
    triggerFileDownload(file, item.fileName || file.name)
  }

  async function downloadFromIdb(id, item) {
    const db = await openDb()
    const row = await new Promise((resolve, reject) => {
      const tx = db.transaction('zips', 'readonly')
      const req = tx.objectStore('zips').get(id)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error)
    })
    if (!row?.blob) throw new Error('MISSING')
    triggerFileDownload(row.blob, item?.fileName || row.fileName || 'game.zip')
  }

  async function downloadFromServer(id) {
    const origin = await resolveApiOrigin()
    if (!origin) throw new Error('MISSING')
    const a = document.createElement('a')
    a.href = `${origin}/api/games/download/${id}`
    a.download = ''
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  async function downloadZip(id) {
    const idNum = Number(id)
    let item = loadMetaLocal().map(decorateEntry).find((g) => g.id === idNum)
    if (!item) {
      const meta = await loadMeta()
      item = meta.find((g) => g.id === idNum)
    }
    if (!item) throw new Error('MISSING')

    const order = []
    if (item.storage === 'opfs') order.push('opfs')
    else if (item.storage === 'browser') order.push('idb')
    else if (item.storage === 'server') order.push('server')
    else order.push('opfs', 'idb', 'server')

    let lastErr
    for (const kind of order) {
      try {
        if (kind === 'opfs' && opfsSupported()) {
          await downloadFromOpfs(idNum, item)
          return
        }
        if (kind === 'idb') {
          await downloadFromIdb(idNum, item)
          return
        }
        if (kind === 'server') {
          await downloadFromServer(idNum)
          return
        }
      } catch (err) {
        lastErr = err
      }
    }
    throw lastErr || new Error('MISSING')
  }

  global.DynaUpload = {
    loadMeta,
    uploadZipFile,
    removeUpload,
    downloadZip,
    formatBytes,
    resolveApiOrigin,
    MAX_ZIP_GB,
    MAX_BYTES,
  }
})(typeof window !== 'undefined' ? window : globalThis)
