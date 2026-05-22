/**
 * Minimal Bakong MD5 check proxy (avoids browser CORS).
 * Run: BAKONG_TOKEN=your_jwt node examples/bakong-check-proxy.mjs
 * Then set proxy URL in the app to http://localhost:8787/check-md5
 */
import http from 'http'

const PORT = Number(process.env.PORT) || 8787
const BAKONG_TOKEN = process.env.BAKONG_TOKEN || ''
const BAKONG_API = 'https://api-bakong.nbc.gov.kh/v1/check_transaction_by_md5'

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method !== 'POST' || req.url !== '/check-md5') {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'POST /check-md5 only' }))
    return
  }

  let body = ''
  for await (const chunk of req) body += chunk

  let json
  try {
    json = JSON.parse(body)
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Invalid JSON' }))
    return
  }

  const token = json.token || BAKONG_TOKEN
  const md5 = json.md5
  if (!md5) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'md5 required' }))
    return
  }
  if (!token) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Set BAKONG_TOKEN env or send token in body' }))
    return
  }

  try {
    const upstream = await fetch(BAKONG_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ md5 }),
    })
    const data = await upstream.json()
    res.writeHead(upstream.status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: String(err.message) }))
  }
})

server.listen(PORT, () => {
  console.log(`Bakong MD5 proxy http://localhost:${PORT}/check-md5`)
})
