import { cors, getServerJwt, sendJson } from './bakong-lib.mjs'

export default function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' })

  const jwt = getServerJwt()
  return sendJson(res, 200, {
    ok: true,
    hasToken: jwt.startsWith('eyJ'),
    hasJwt: jwt.startsWith('eyJ'),
    email: process.env.BAKONG_EMAIL || null,
    hosted: true,
  })
}
