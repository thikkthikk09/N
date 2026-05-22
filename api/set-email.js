import { cors, getServerJwt, jwtStillValid, renewJwt, sendJson } from './bakong-lib.mjs'

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })

  const email = process.env.BAKONG_EMAIL
  if (!email) {
    return sendJson(res, 400, { error: 'BAKONG_EMAIL not set on server' })
  }

  const token = getServerJwt()
  if (jwtStillValid(token)) {
    return sendJson(res, 200, {
      ok: true,
      hasJwt: true,
      token,
      renewed: false,
      cached: true,
    })
  }

  try {
    const data = await renewJwt(email, process.env.BAKONG_ORG, process.env.BAKONG_PROJECT)
    const jwt = data.responseCode === 0 && data.data?.token
    return sendJson(res, 200, {
      ok: true,
      hasJwt: Boolean(jwt),
      token: jwt || null,
      renewed: data.responseCode === 0,
      message: jwt ? 'ready' : data.responseMessage || 'Renew failed',
    })
  } catch (err) {
    return sendJson(res, 502, { error: String(err.message) })
  }
}
