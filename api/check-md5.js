import {
  callCheckMd5,
  cors,
  getServerJwt,
  jwtStillValid,
  renewJwt,
  sendJson,
  transactionPaid,
} from './bakong-lib.mjs'

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })

  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      return sendJson(res, 400, { error: 'Invalid JSON' })
    }
  }

  const md5 = String(body?.md5 || '')
    .trim()
    .toLowerCase()
  if (!md5 || !/^[a-f0-9]{32}$/.test(md5)) {
    return sendJson(res, 400, { error: 'md5 must be 32 hex characters' })
  }

  let token = getServerJwt()
  if (!jwtStillValid(token)) {
    const email = process.env.BAKONG_EMAIL
    if (email) {
      const renewed = await renewJwt(email, process.env.BAKONG_ORG, process.env.BAKONG_PROJECT)
      if (renewed.responseCode === 0 && renewed.data?.token) {
        token = renewed.data.token
      }
    }
  }

  if (!token.startsWith('eyJ')) {
    return sendJson(res, 200, {
      responseCode: 1,
      responseMessage: 'Set BAKONG_TOKEN on Vercel (or Render) environment variables',
      errorCode: 99,
      data: null,
      _dyna: { paid: false, md5, hasJwt: false },
    })
  }

  try {
    let data = await callCheckMd5(md5, token)
    if (data.errorCode === 6) {
      const email = process.env.BAKONG_EMAIL
      if (email) {
        const renewed = await renewJwt(email, process.env.BAKONG_ORG, process.env.BAKONG_PROJECT)
        if (renewed.responseCode === 0 && renewed.data?.token) {
          data = await callCheckMd5(md5, renewed.data.token)
        }
      }
    }
    const paid = transactionPaid(data)
    return sendJson(res, 200, { ...data, _dyna: { paid, md5, hasJwt: true } })
  } catch (err) {
    return sendJson(res, 502, { error: String(err.message) })
  }
}
