/**
 * Public config for GitHub Pages (and local).
 * MD5 works on GitHub via direct Bakong API (CORS allowed).
 * Optional: set apiBase to a Vercel URL if you deploy api/ there instead.
 */
window.DYNA_BAKONG_CONFIG = {
  apiBase: '',
  email: 'thikkthikk09@gmail.com',
  /** JWT — renew with: node scripts/bakong-token.mjs your@email.com */
  token:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImlkIjoiMWJkOTRjMDY2ODViNGIwMiJ9LCJpYXQiOjE3Nzk0MTIwODIsImV4cCI6MTc4NzE4ODA4Mn0.u8w7kKP8rKYxQD9Q7edXprIya1D_mQdGmUHkmGBHz3E',
  account: 'ben_sothida@bkrt',
  organization: 'Dyna Store',
  project: 'dyna_store',
}
