# Dyna Store

Game shop with **Bakong KHQR** top-up and **automatic balance** after payment (MD5 check).

## Why GitHub Pages shows “Payment server offline”

**GitHub Pages only hosts HTML/CSS/JS.** It cannot run `start.bat` or `server.mjs`.  
Bakong’s MD5 API blocks browsers (CORS), so you need a small **cloud API** for payment checks.

You use **two free hosts**:

| Part | Host | What it does |
|------|------|----------------|
| Store UI | **GitHub Pages** | `index.html`, games, QR display |
| Payment API | **Vercel** (free) | `/api/check-md5`, `/api/health` with your Bakong JWT |

---

## 1. Deploy payment API to Vercel (one time)

1. Push this repo to GitHub.
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → Import your repo.
3. **Environment Variables** (Settings → Environment Variables):

   | Name | Value |
   |------|--------|
   | `BAKONG_EMAIL` | Email registered at [api-bakong.nbc.gov.kh/register](https://api-bakong.nbc.gov.kh/register) |
   | `BAKONG_TOKEN` | JWT from: `node scripts/bakong-token.mjs your@email.com` |

4. **Deploy**. Copy your URL, e.g. `https://dyna-store-abc123.vercel.app`

5. Edit **`standalone/bakong.config.js`** in the repo:

```js
window.DYNA_BAKONG_CONFIG = {
  apiBase: 'https://dyna-store-abc123.vercel.app',  // your Vercel URL
  account: 'ben_sothida@bkrt',                       // your Bakong ID
  organization: 'Dyna Store',
  project: 'dyna_store',
}
```

6. Commit and push again.

**Never put `BAKONG_TOKEN` in GitHub** — only in Vercel env vars.

---

## 2. Deploy store UI to GitHub Pages

1. GitHub repo → **Settings** → **Pages**
2. **Source:** GitHub Actions (workflow `Deploy GitHub Pages` is included)
3. Push to `main` — site will be at `https://YOUR_USER.github.io/YOUR_REPO/`

Open your Pages URL. The banner should turn green: **Payment check ready.**

---

## 3. Local development (optional)

On your PC you can still use `start.bat` instead of Vercel:

1. `copy standalone\bakong.config.example.js standalone\bakong.config.local.js`
2. Edit `bakong.config.local.js` (email, account, optional `proxy: http://127.0.0.1:8787/api/check-md5`)
3. Double-click **`start.bat`**
4. Open **http://127.0.0.1:8787/index.html**

`bakong.config.local.js` overrides `bakong.config.js` on your machine.

---

## Payment flow

1. Choose amount → **Pay with Bakong**
2. Scan QR in Bakong app (within 10 minutes)
3. MD5 is polled every ~1.5s → balance updates automatically

---

## Upload to GitHub (first time)

```bash
git init
git add .
git commit -m "Dyna Store with Bakong KHQR"
git branch -M main
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

Ignored secrets (do not commit):

- `standalone/bakong.config.local.js`
- `standalone/.bakong-runtime.json`
- `uploads/`

---

## React version (optional)

```bash
npm install
npm run dev
```

Open **http://localhost:5173/react.html**

## License

Demo — verify Bakong API terms for production use.
