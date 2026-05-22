/**
 * Renew Bakong API token (registered email only).
 * Usage: node scripts/bakong-token.mjs your@email.com
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const CONFIG = path.join(ROOT, 'standalone', 'bakong.config.local.js')

const email = process.argv[2]?.trim()
if (!email || !email.includes('@')) {
  console.error('Usage: node scripts/bakong-token.mjs your@registered-email.com')
  process.exit(1)
}

const res = await fetch('https://api-bakong.nbc.gov.kh/v1/renew_token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email }),
})
const json = await res.json()

if (json.responseCode !== 0 || !json.data?.token) {
  console.error('Failed:', json.responseMessage || json)
  if (json.errorCode === 10) {
    console.error('Register first: https://api-bakong.nbc.gov.kh/register')
  }
  process.exit(1)
}

const token = json.data.token
console.log('New token (JWT):')
console.log(token)

if (fs.existsSync(CONFIG)) {
  let text = fs.readFileSync(CONFIG, 'utf8')
  if (/^\s*token:\s*['"]/m.test(text)) {
    text = text.replace(/^\s*token:\s*['"][^'"]*['"]/m, `  token: '${token}'`)
  } else {
    text = text.replace(
      /window\.DYNA_BAKONG_CONFIG\s*=\s*\{/,
      `window.DYNA_BAKONG_CONFIG = {\n  token: '${token}',`
    )
  }
  if (/email:\s*['"]/.test(text)) {
    text = text.replace(/email:\s*['"][^'"]*['"]/, `email: '${email}'`)
  } else {
    text = text.replace(/token:\s*'[^']*',/, `token: '${token}',\n  email: '${email}',`)
  }
  fs.writeFileSync(CONFIG, text)
  console.log('\nUpdated', CONFIG)
}

const runtimePath = path.join(ROOT, 'standalone', '.bakong-runtime.json')
fs.mkdirSync(path.dirname(runtimePath), { recursive: true })
fs.writeFileSync(
  runtimePath,
  JSON.stringify({ email, jwt: token, updatedAt: Date.now() }, null, 2),
)
console.log('Updated', runtimePath)
console.log('Restart: double-click start.bat (or node server.mjs)')
