/** Copy to bakong.config.local.js and fill in your values (file is gitignored). */
window.DYNA_BAKONG_CONFIG = {
  /** JWT from renew — not the short rbk… code from the register page */
  token: '',
  /** Email registered at https://api-bakong.nbc.gov.kh/register */
  email: 'your@email.com',
  organization: 'Dyna Store',
  project: 'dyna_store',
  account: 'yourname@aba',
  /** Local dev only — use start.bat */
  proxy: 'http://127.0.0.1:8787/api/check-md5',
  /** GitHub Pages: set apiBase to your Vercel URL (see README) */
  apiBase: '',
}
