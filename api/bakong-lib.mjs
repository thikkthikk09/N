const BAKONG_API = 'https://api-bakong.nbc.gov.kh/v1/check_transaction_by_md5'
const BAKONG_RENEW = 'https://api-bakong.nbc.gov.kh/v1/renew_token'

export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

export function sendJson(res, status, data) {
  cors(res)
  res.status(status).json(data)
}

export function jwtStillValid(token, bufferMs = 15 * 60 * 1000) {
  if (!token?.startsWith('eyJ')) return false
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
    if (!payload.exp) return true
    return Date.now() < payload.exp * 1000 - bufferMs
  } catch {
    return false
  }
}

export function getServerJwt() {
  return String(process.env.BAKONG_TOKEN || '').trim()
}

export function transactionPaid(data) {
  const tx = data?.data
  if (!tx || typeof tx !== 'object') return false
  const st = String(tx.status || tx.transactionStatus || '').toUpperCase()
  return (
    st === 'SUCCESS' ||
    st === 'PAID' ||
    st === 'COMPLETED' ||
    st === 'SUCCEEDED' ||
    st === 'ACCEPTED' ||
    st === 'SETTLED' ||
    Boolean(tx.hash) ||
    Boolean(tx.fromAccountId) ||
    Boolean(tx.toAccountId) ||
    Number(tx.acknowledgedDateMs) > 0 ||
    Number(tx.createdDateMs) > 0 ||
    (tx.amount != null && Number(tx.amount) > 0)
  )
}

export async function renewJwt(email, organization, project) {
  const res = await fetch(BAKONG_RENEW, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      organization: organization || 'Dyna Store',
      project: project || 'dyna_store',
    }),
  })
  const text = await res.text()
  return text ? JSON.parse(text) : {}
}

export async function callCheckMd5(md5, bearer) {
  const upstream = await fetch(BAKONG_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify({ md5 }),
  })
  const text = await upstream.text()
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    return { responseCode: 1, errorCode: 1, responseMessage: 'Invalid Bakong response' }
  }
}
