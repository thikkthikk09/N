const rbk = 'rbk82qAU7sFjn7CG2mAP-CA0_mKVz_RNVRcNlA60b3oNkY'
const email = process.argv[2] || 'test@test.com'
const code = process.argv[3] || '123456'
const org = 'Dyna Store'
const proj = 'dyna_store'

for (const f of ['token', 'registerToken', 'pendingToken', 'accessToken']) {
  const body = { email, organization: org, project: proj, code, [f]: rbk }
  const r = await fetch('https://api-bakong.nbc.gov.kh/v1/renew_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  console.log(f, await r.text())
}
