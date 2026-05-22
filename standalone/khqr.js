/**
 * Bakong KHQR — EMV payload, MD5 payment check (Bakong Open API).
 * Register token: https://api-bakong.nbc.gov.kh/register
 */
;(function (global) {
  const KHR_PER_USD = 4100
  /** localStorage keys — do not put your JWT or account here */
  const TOKEN_KEY = 'dyna_bakong_token'
  const PROXY_KEY = 'dyna_bakong_proxy'
  const ACCOUNT_KEY = 'dyna_bakong_account'
  const EMAIL_KEY = 'dyna_bakong_email'
  const PENDING_KEY = 'dyna_pending_topup'
  const API_BASE_KEY = 'dyna_api_base'
  const QR_EXPIRE_MS = 10 * 60 * 1000
  const DEMO_ACCOUNT = 'dynastore@bkrt'
  const LOCAL_PROXY_ORIGIN = 'http://127.0.0.1:8787'
  const PROXY_API = `${LOCAL_PROXY_ORIGIN}/api/check-md5`
  let activeProxyOrigin = null

  function isLocalDev() {
    if (typeof location === 'undefined') return false
    const h = location.hostname
    return h === '127.0.0.1' || h === 'localhost'
  }

  function isGitHubPages() {
    if (typeof location === 'undefined') return false
    return location.hostname.endsWith('.github.io')
  }

  function isStaticHosting() {
    return isGitHubPages() || (typeof location !== 'undefined' && !isLocalDev())
  }

  function configApiBase() {
    const cfg = configDefaults()
    let base = String(
      localStorage.getItem(API_BASE_KEY) || cfg.apiBase || '',
    )
      .trim()
      .replace(/\/$/, '')
    if (typeof location !== 'undefined' && location.hostname.endsWith('.vercel.app')) {
      return location.origin
    }
    if (base && !base.includes('REPLACE-WITH')) return base
    const proxy = String(cfg.proxy || '').trim()
    if (proxy.startsWith('http')) {
      try {
        return new URL(proxy).origin
      } catch {
        /* ignore */
      }
    }
    return ''
  }

  function canUseDirectBakong() {
    return getApiCredential().startsWith('eyJ')
  }

  async function probeDirectBakong() {
    if (!canUseDirectBakong()) return false
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    try {
      const res = await fetch(`${PAYMENT_CHECK.apiBase}/v1/check_transaction_by_md5`, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getApiCredential()}`,
        },
        body: JSON.stringify({ md5: '00000000000000000000000000000000' }),
        signal: ctrl.signal,
      })
      const json = await res.json()
      return json.responseCode !== undefined || json.errorCode !== undefined
    } catch {
      return false
    } finally {
      clearTimeout(timer)
    }
  }

  const MERCHANT = {
    name: 'DYNA STORE',
    city: 'PHNOM PENH',
    /** Your real Bakong ID, e.g. myshop@aba — must exist in Bakong */
    account: 'ben_sothida@bkrt',
    mcc: '5999',
    /** 840 = USD (matches $ prices in UI); use '116' for KHR-only */
    currency: '840',
    merchantDisplayName: 'Dyna Store',
    merchantCity: 'Phnom Penh',
  }

  const PAYMENT_CHECK = {
    apiBase: 'https://api-bakong.nbc.gov.kh',
    pollIntervalMs: 1500,
    maxPollMs: 10 * 60 * 1000,
    pendingMaxMs: 24 * 60 * 60 * 1000,
    demoWhenNoToken: false,
  }

  /** No JWT — Bakong MD5 API cannot verify payment */
  function useSimplePaymentFlow() {
    return !getToken()
  }

  function savePendingTopup() {
    if (!currentMd5 || !currentUsd) return
    localStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ md5: currentMd5, usd: currentUsd, at: Date.now() }),
    )
  }

  function clearPendingTopup() {
    localStorage.removeItem(PENDING_KEY)
  }

  function applyTopupCredit(usd, md5, data) {
    const key = md5 || `manual-${usd}-${Date.now()}`
    if (creditedMd5.has(key)) return false
    creditedMd5.add(key)
    clearPendingTopup()
    global.Khqr?.onPaymentSuccess?.(Number(usd), data)
    global.showKhqrToast?.(`+${formatUsd(usd)} added to balance`)
    return true
  }

  async function resumePendingTopup() {
    const raw = localStorage.getItem(PENDING_KEY)
    if (!raw) return false

    let pending
    try {
      pending = JSON.parse(raw)
    } catch {
      clearPendingTopup()
      return false
    }

    if (Date.now() - pending.at > PAYMENT_CHECK.pendingMaxMs) {
      clearPendingTopup()
      return false
    }

    const md5 = String(pending.md5 || '').toLowerCase()
    if (!md5 || creditedMd5.has(md5)) return false

    currentMd5 = md5
    currentUsd = Number(pending.usd) || currentUsd

    try {
      if (!(await isProxyOnline())) return false
    } catch {
      return false
    }

    try {
      await ensurePaymentReady()
      let json = await checkTransactionByMd5(md5)
      let st = parsePaymentStatus(json)
      if (st === 'no_token' || st === 'unauthorized') {
        await syncEmailToServer(true)
        await discoverProxy()
        json = await checkTransactionByMd5(md5)
        st = parsePaymentStatus(json)
      }
      if (st === 'paid') {
        return applyTopupCredit(pending.usd, md5, json.data)
      }
      if (!pollTimer && !paymentCredited) {
        startPolling()
      }
    } catch {
      /* retry */
    }
    return false
  }

  function verifyKhqr(payload) {
    if (global.BakongKhqrLite?.verify) return global.BakongKhqrLite.verify(payload)
    return false
  }

  function configDefaults() {
    return global.DYNA_BAKONG_CONFIG || {}
  }

  function getBakongAccount() {
    const input = document.getElementById('bakongAccount')
    const fromConfig = configDefaults().account
    return (
      input?.value ||
      localStorage.getItem(ACCOUNT_KEY) ||
      fromConfig ||
      MERCHANT.account
    ).trim()
  }

  function isInvalidAccount(account) {
    return !account || account === DEMO_ACCOUNT || !/^[^\s@]+@[^\s@]+$/.test(account)
  }

  function buildKhqr(usdAmount) {
    const account = getBakongAccount()
    if (isInvalidAccount(account)) {
      throw new Error('INVALID_ACCOUNT')
    }

    if (!global.BakongKhqrLite) {
      throw new Error('KHQR generator missing')
    }

    const currency = MERCHANT.currency
    const amount =
      currency === '116'
        ? Math.round(Number(usdAmount) * KHR_PER_USD)
        : Number(usdAmount)

    const result = global.BakongKhqrLite.generateIndividual({
      bakongAccountID: account,
      merchantName: MERCHANT.merchantDisplayName || MERCHANT.name,
      merchantCity: MERCHANT.merchantCity || 'Phnom Penh',
      amount,
      currency,
    })

    const qr = result.qr
    const md5 = String(result.md5 || hashMd5(qr) || '').toLowerCase()
    return { qr, md5 }
  }

  function hashMd5(qrString) {
    if (typeof global.md5 !== 'function') return ''
    return String(global.md5(qrString)).toLowerCase()
  }

  function formatKhr(usd) {
    const khr = Math.round(Number(usd) * KHR_PER_USD)
    return '៛' + khr.toLocaleString('en-US')
  }

  function formatUsd(usd) {
    return '$' + Number(usd).toFixed(2)
  }

  function isRegisterCode(token) {
    const t = String(token || '').trim()
    return t.startsWith('rbk') && !t.startsWith('eyJ')
  }

  function getRegisterCode() {
    const cfg = configDefaults()
    if (isRegisterCode(cfg.registerToken)) return cfg.registerToken
    if (isRegisterCode(cfg.token)) return cfg.token
    return isRegisterCode(getTokenRaw()) ? getTokenRaw() : ''
  }

  function needsJwtActivation() {
    const jwt = getToken()
    return Boolean(getRegisterCode()) && !jwt.startsWith('eyJ')
  }

  function getTokenRaw() {
    const input = document.getElementById('bakongToken')
    const fromConfig = configDefaults().token
    return (input?.value || localStorage.getItem(TOKEN_KEY) || fromConfig || '').trim()
  }

  /** JWT only (eyJ…) — empty when only rbk register code is set */
  function getToken() {
    const raw = getTokenRaw()
    return isRegisterCode(raw) ? '' : raw
  }

  /** JWT only — rbk codes do not work for check_transaction_by_md5 */
  function getApiCredential() {
    return getToken()
  }

  function hasApiCredential() {
    return Boolean(getToken())
  }

  function getBakongEmail() {
    const input =
      document.getElementById('bakongEmail') ||
      document.querySelector('.bakong-email-sync')
    const fromConfig = configDefaults().email
    return (input?.value || localStorage.getItem(EMAIL_KEY) || fromConfig || '').trim()
  }

  function getProxyUrl() {
    const input = document.getElementById('bakongProxy')
    const fromConfig = configDefaults().proxy
    return (input?.value || localStorage.getItem(PROXY_KEY) || fromConfig || PROXY_API).trim()
  }

  function proxyOriginsToTry() {
    const list = []
    const apiBase = configApiBase()
    if (apiBase) list.push(apiBase)
    if (isLocalDev()) {
      if (typeof location !== 'undefined' && location.origin && location.protocol.startsWith('http')) {
        list.push(location.origin)
      }
      list.push(LOCAL_PROXY_ORIGIN)
    }
    const raw = getProxyUrl()
    if (raw.startsWith('http')) {
      try {
        list.push(new URL(raw).origin)
      } catch {
        /* ignore */
      }
    }
    return [...new Set(list.filter(Boolean))]
  }

  function proxyBase() {
    return activeProxyOrigin || configApiBase() || LOCAL_PROXY_ORIGIN
  }

  function resolveProxyUrl() {
    if (activeProxyOrigin === 'direct') return ''
    const base = proxyBase()
    if (!base || base === 'direct') return ''
    return `${base}/api/check-md5`
  }

  function resolveProxyHealth() {
    return `${proxyBase()}/api/health`
  }

  function resolveProxyRenew() {
    return `${proxyBase()}/api/renew-token`
  }

  function resolveProxySetEmail() {
    return `${proxyBase()}/api/set-email`
  }

  async function discoverProxy() {
    if (isStaticHosting() && canUseDirectBakong()) {
      const ok = await probeDirectBakong()
      if (ok) {
        activeProxyOrigin = 'direct'
        serverHasJwt = true
        global.DynaServer?.setOnline?.(true, true)
        if (global.DynaServer) global.DynaServer.hasJwt = true
        return true
      }
    }

    for (const origin of proxyOriginsToTry()) {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 5000)
      try {
        const res = await fetch(`${origin}/api/health`, {
          method: 'GET',
          mode: 'cors',
          signal: ctrl.signal,
        })
        if (res.ok) {
          activeProxyOrigin = origin
          try {
            const health = await res.json()
            serverHasJwt = Boolean(health.hasJwt)
          } catch {
            serverHasJwt = false
          }
          global.DynaServer?.setOnline?.(true, serverHasJwt)
          if (global.DynaServer) global.DynaServer.hasJwt = serverHasJwt
          return true
        }
      } catch {
        /* try next */
      } finally {
        clearTimeout(timer)
      }
    }
    activeProxyOrigin = configApiBase() || LOCAL_PROXY_ORIGIN
    global.DynaServer?.setOnline?.(false, false)
    return false
  }

  async function isProxyOnline() {
    return discoverProxy()
  }

  async function redirectToPaymentServerIfNeeded() {
    if (typeof location === 'undefined') return false
    if (isGitHubPages() || configApiBase()) return true
    if (location.port === '8787') return true
    const local = LOCAL_PROXY_ORIGIN
    let ok = false
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 3000)
      const res = await fetch(`${local}/api/health`, { mode: 'cors', signal: ctrl.signal })
      clearTimeout(t)
      ok = res.ok
    } catch {
      return false
    }
    if (!ok) return false
    const path =
      location.pathname && location.pathname !== '/'
        ? location.pathname.replace(/^\//, '')
        : 'index.html'
    const target = `${local}/${path}${location.search}${location.hash}`
    if (location.href !== target) {
      location.replace(target)
      return true
    }
    return true
  }

  async function renewBakongToken() {
    const email = getBakongEmail()
    if (!email) throw new Error('EMAIL_REQUIRED')

    const online = await isProxyOnline()
    if (!online) throw new Error('PROXY_OFFLINE')

    const cfg = configDefaults()
    const body = {
      email,
      organization: cfg.organization || 'Dyna Store',
      project: cfg.project || 'dyna_store',
    }
    const code = document.getElementById('bakongVerifyCode')?.value?.trim()
    if (code) body.code = code
    const rbk = getRegisterCode()
    if (rbk) body.registerToken = rbk

      const res = await fetch(resolveProxyRenew(), {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (json.responseCode === 0 && json.data?.token) {
      const tokenEl = document.getElementById('bakongToken')
      if (tokenEl) tokenEl.value = json.data.token
      saveSettings()
      return json.data.token
    }
    if (json.errorCode === 10) {
      throw new Error('NOT_REGISTERED')
    }
    throw new Error(json.responseMessage || 'RENEW_FAILED')
  }

  async function syncEmailToServer(force = false) {
    const email = getBakongEmail()
    if (!email) return false

    await isProxyOnline()
    if (!force && serverHasJwt) return true
    if (!force && Date.now() - lastEmailSyncAt < EMAIL_SYNC_COOLDOWN_MS) {
      return serverHasJwt
    }

    const cfg = configDefaults()
    try {
      const res = await fetch(resolveProxySetEmail(), {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          organization: cfg.organization || 'Dyna Store',
          project: cfg.project || 'dyna_store',
          forceRenew: Boolean(force),
        }),
      })
      const json = await res.json()
      serverHasJwt = Boolean(json.hasJwt)
      if (json.token?.startsWith('eyJ')) {
        localStorage.setItem(TOKEN_KEY, json.token)
        const tokenEl = document.getElementById('bakongToken')
        if (tokenEl) tokenEl.value = json.token
      }
      lastEmailSyncAt = Date.now()
      return json.hasJwt
    } catch {
      return false
    }
  }

  function saveSettings() {
    const token = document.getElementById('bakongToken')?.value?.trim()
    const proxy = document.getElementById('bakongProxy')?.value?.trim()
    const account = document.getElementById('bakongAccount')?.value?.trim()
    const email =
      document.getElementById('bakongEmail')?.value?.trim() ||
      document.querySelector('.bakong-email-sync')?.value?.trim()
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
    if (proxy) localStorage.setItem(PROXY_KEY, proxy)
    else localStorage.removeItem(PROXY_KEY)
    if (account) localStorage.setItem(ACCOUNT_KEY, account)
    else localStorage.removeItem(ACCOUNT_KEY)
    if (email) {
      localStorage.setItem(EMAIL_KEY, email)
      document.querySelectorAll('#bakongEmail, .bakong-email-sync').forEach((el) => {
        el.value = email
      })
    } else localStorage.removeItem(EMAIL_KEY)
  }

  function loadSettings() {
    const cfg = configDefaults()
    if (cfg.token?.startsWith('eyJ')) localStorage.setItem(TOKEN_KEY, cfg.token)
    const tokenEl = document.getElementById('bakongToken')
    const proxyEl = document.getElementById('bakongProxy')
    const accountEl = document.getElementById('bakongAccount')
    const emailEl = document.getElementById('bakongEmail')
    if (tokenEl) {
      const jwt = cfg.token?.startsWith('eyJ') ? cfg.token : ''
      const rbk = getRegisterCode()
      const stored = localStorage.getItem(TOKEN_KEY) || ''
      tokenEl.value = (stored.startsWith('eyJ') ? stored : '') || jwt || rbk || ''
      if (jwt) localStorage.setItem(TOKEN_KEY, jwt)
    }
    if (proxyEl) {
      let stored = localStorage.getItem(PROXY_KEY) || ''
      if (stored === '/api/check-md5' || stored.endsWith('/check-md5')) {
        stored = PROXY_API
        localStorage.setItem(PROXY_KEY, stored)
      }
      proxyEl.value = stored || cfg.proxy || PROXY_API
      if (!localStorage.getItem(PROXY_KEY)) {
        localStorage.setItem(PROXY_KEY, proxyEl.value)
      }
    }
    if (accountEl) {
      accountEl.value =
        localStorage.getItem(ACCOUNT_KEY) || cfg.account || MERCHANT.account
      if (cfg.account && !localStorage.getItem(ACCOUNT_KEY)) {
        localStorage.setItem(ACCOUNT_KEY, cfg.account)
      }
    }
    const storedEmail = localStorage.getItem(EMAIL_KEY) || cfg.email || ''
    document.querySelectorAll('#bakongEmail, .bakong-email-sync').forEach((el) => {
      el.value = storedEmail
    })
    if (storedEmail) localStorage.setItem(EMAIL_KEY, storedEmail)
  }

  /** Map Bakong check_transaction_by_md5 response to status */
  function parsePaymentStatus(json) {
    if (!json || typeof json !== 'object') return 'error'

    if (json._dyna?.paid === true) return 'paid'

    if (json.errorCode === 6) return 'unauthorized'
    if (json.errorCode === 99) return 'no_token'
    if (json.errorCode === 1) return 'pending'
    if (json.errorCode === 2 || json.errorCode === 3) return 'failed'

    const d = json.data
    const tx = d && typeof d === 'object' && d.transaction && typeof d.transaction === 'object' ? d.transaction : d

    if (json.responseCode === 0) {
      if (!tx || typeof tx !== 'object') return 'pending'
      if (tx.status === 'FAILED' || tx.status === 'FAIL') return 'failed'
      if (tx.status === 'NOT_FOUND') return 'pending'
      const st = String(tx.status || tx.transactionStatus || '').toUpperCase()
      const paid =
        st === 'SUCCESS' ||
        st === 'PAID' ||
        st === 'COMPLETED' ||
        st === 'SUCCEEDED' ||
        st === 'ACCEPTED' ||
        st === 'SETTLED' ||
        Boolean(tx.hash) ||
        Boolean(tx.fromAccountId) ||
        Boolean(tx.toAccountId) ||
        Boolean(tx.receiverAccountId) ||
        Number(tx.acknowledgedDateMs) > 0 ||
        Number(tx.createdDateMs) > 0 ||
        Number(tx.transactionDate) > 0 ||
        (tx.amount != null && Number(tx.amount) > 0)
      if (paid) return 'paid'
      if (json.responseMessage && /success/i.test(String(json.responseMessage))) return 'paid'
    }

    if (json.responseCode === 1) return 'pending'
    return 'pending'
  }

  let currentPayload = ''
  let currentMd5 = ''
  let currentUsd = 0
  let pollTimer = null
  let pollStartedAt = 0
  let checking = false
  let paymentCredited = false
  let serverHasJwt = false
  let lastEmailSyncAt = 0
  const EMAIL_SYNC_COOLDOWN_MS = 30 * 60 * 1000
  const creditedMd5 = new Set()

  function userFacingMessage(msg) {
    if (!msg) return msg
    const s = String(msg).toLowerCase()
    if (
      s.includes('email') ||
      s.includes('register') ||
      s.includes('renew_token') ||
      s.includes('proxy') ||
      s.includes('start.bat') ||
      s.includes('server.mjs') ||
      s.includes('start server') ||
      s.includes('offline') ||
      s.includes('double-click')
    ) {
      return null
    }
    return msg
  }

  function setPaymentStatus(status, detail) {
    const wrap = document.getElementById('khqrStatus')
    const text = document.getElementById('khqrStatusText')
    if (!wrap || !text) return

    wrap.className = 'khqr-status khqr-status--' + status
    const labels = {
      pending: 'Waiting for payment…',
      checking: 'Checking payment (MD5)…',
      paid: 'Payment received',
      failed: 'Payment failed',
      expired: 'QR expired — generate a new one',
      error: 'Could not reach Bakong API',
      demo: 'Demo mode — simulating payment check',
    }
    text.textContent = userFacingMessage(detail) || labels[status] || status
  }

  function updateMd5Display() {
    const el = document.getElementById('khqrMd5')
    if (el) el.textContent = currentMd5 || '—'
  }

  async function checkTransactionByMd5(md5Hash) {
    const token = getApiCredential()
    const md5 = String(md5Hash || '').toLowerCase()
    const proxy = resolveProxyUrl()

    async function callDirect() {
      if (!token.startsWith('eyJ')) throw new Error('NO_TOKEN')
      const res = await fetch(`${PAYMENT_CHECK.apiBase}/v1/check_transaction_by_md5`, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ md5 }),
      })
      const json = await res.json()
      if (json.errorCode === 6) throw new Error('UNAUTHORIZED')
      if (res.status === 401) throw new Error('UNAUTHORIZED')
      const paid = parsePaymentStatus(json) === 'paid'
      return { ...json, _dyna: { paid, md5, hasJwt: true, direct: true } }
    }

    if (activeProxyOrigin === 'direct' || (!proxy && canUseDirectBakong())) {
      return callDirect()
    }

    if (proxy) {
      try {
        const res = await fetch(proxy, {
          method: 'POST',
          mode: 'cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ md5 }),
        })
        let json
        try {
          json = await res.json()
        } catch {
          if (!res.ok) throw new Error('PROXY_HTTP_' + res.status)
          throw new Error('PROXY_BAD_RESPONSE')
        }
        if (json.error && json.responseCode === undefined) {
          if (res.status === 401) throw new Error('NO_TOKEN')
          if (canUseDirectBakong()) return callDirect()
          return {
            responseCode: 1,
            errorCode: 99,
            responseMessage: String(json.error),
            data: null,
          }
        }
        return json
      } catch (err) {
        if (canUseDirectBakong()) return callDirect()
        throw err
      }
    }

    if (!token) throw new Error('NO_TOKEN')

    const res = await fetch(`${PAYMENT_CHECK.apiBase}/v1/check_transaction_by_md5`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ md5 }),
    })

    const json = await res.json()
    if (json.errorCode === 6) throw new Error('UNAUTHORIZED')
    if (res.status === 401) throw new Error('UNAUTHORIZED')
    return json
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    checking = false
  }

  function creditWalletAfterPaid() {
    if (paymentCredited) return
    onPaymentPaid({ manualConfirm: true })
  }

  function onPaymentPaid(data) {
    if (paymentCredited) return
    paymentCredited = true
    stopPolling()
    setPaymentStatus('paid', 'Payment received — updating balance…')
    applyTopupCredit(currentUsd, currentMd5, data)
    document.getElementById('khqrCheckNow')?.setAttribute('disabled', 'true')
    setTimeout(() => closeKhqrModal(), 1500)
  }

  async function ensurePaymentWatcher() {
    await discoverProxy()
    if (!serverHasJwt && !getToken().startsWith('eyJ')) {
      await syncEmailToServer(true)
      await discoverProxy()
    }
    return serverHasJwt || getToken().startsWith('eyJ')
  }

  async function runPaymentCheck() {
    if (!currentMd5 || checking) return
    checking = true
    setPaymentStatus('checking', 'Checking payment — balance updates automatically…')

    try {
      const online = await discoverProxy()
      if (!online) {
        setPaymentStatus('pending', 'Scan & pay — balance updates automatically')
        return
      }
      await ensurePaymentWatcher()

      let json = await checkTransactionByMd5(currentMd5)
      let status = parsePaymentStatus(json)

      if (status === 'no_token' || status === 'unauthorized') {
        await syncEmailToServer(true)
        await isProxyOnline()
        json = await checkTransactionByMd5(currentMd5)
        status = parsePaymentStatus(json)
      }

      if (status === 'paid') {
        onPaymentPaid(json.data)
        return
      }
      if (status === 'no_token' || status === 'unauthorized') {
        setPaymentStatus(
          'pending',
          'Paid already? Run start.bat, then tap “Check payment now” or “Confirm payment”',
        )
        document.getElementById('khqrAdvanced')?.classList.remove('hidden')
        return
      }
      if (status === 'failed') {
        setPaymentStatus('failed')
        stopPolling()
        return
      }
      setPaymentStatus('pending')
    } catch (err) {
      if (err.message === 'NO_TOKEN') {
        setPaymentStatus('pending', 'Waiting for payment…')
        return
      }
      if (err.message === 'UNAUTHORIZED') {
        setPaymentStatus('pending', 'Checking payment…')
        return
      }
      if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
        setPaymentStatus('pending', 'Waiting for payment…')
        return
      }
      setPaymentStatus('error', userFacingMessage(err.message) || 'Payment check failed')
    } finally {
      checking = false
    }
  }

  async function startPolling() {
    stopPolling()
    pollStartedAt = Date.now()
    saveSettings()

    const proxy = resolveProxyUrl()
    paymentCredited = false

    document.getElementById('khqrCheckNow')?.removeAttribute('disabled')

    await discoverProxy()
    await ensurePaymentWatcher()
    setPaymentStatus('pending', 'Scan & pay — balance updates automatically')
    runPaymentCheck()
    pollTimer = setInterval(() => {
      if (Date.now() - pollStartedAt > PAYMENT_CHECK.maxPollMs) {
        setPaymentStatus('expired')
        stopPolling()
        return
      }
      runPaymentCheck()
    }, PAYMENT_CHECK.pollIntervalMs)
  }

  function renderQr(container, payload) {
    if (!container) return
    container.innerHTML = ''
    if (!payload) {
      container.textContent = 'QR code could not be generated'
      return
    }
    if (typeof global.QRCode === 'undefined') {
      container.textContent = 'QR library missing — refresh the page'
      return
    }
    if (!verifyKhqr(payload)) {
      console.warn('KHQR verify failed, rendering anyway')
    }
    try {
      container.innerHTML = ''
      new global.QRCode(container, {
        text: payload,
        width: 240,
        height: 240,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: global.QRCode.CorrectLevel.H,
      })
    } catch (err) {
      console.error(err)
      container.textContent = 'Could not draw QR — try again'
    }
  }

  function openKhqrModal(usdAmount) {
    const overlay = document.getElementById('khqrOverlay')
    if (!overlay) return

    saveSettings()
    loadSettings()

    const account = getBakongAccount()
    if (isInvalidAccount(account)) {
      global.showKhqrToast?.('Enter your real Bakong ID above (e.g. you@aba)')
      document.getElementById('bakongAccount')?.focus()
      return
    }

    try {
      currentUsd = Number(usdAmount)
      const built = buildKhqr(usdAmount)
      currentPayload = built.qr
      currentMd5 = built.md5
    } catch (err) {
      global.showKhqrToast?.('Cannot build KHQR — check Bakong account')
      return
    }

    document.getElementById('khqrAmountUsd').textContent = formatUsd(usdAmount)
    document.getElementById('khqrAmountKhr').textContent = formatKhr(usdAmount)
    document.getElementById('khqrMerchant').textContent = MERCHANT.name
    document.getElementById('khqrAccount').textContent = account

    const warn = document.getElementById('khqrAccountWarn')
    if (warn) warn.classList.add('hidden')

    const expireEl = document.getElementById('khqrExpire')
    if (expireEl) {
      const cur = MERCHANT.currency === '116' ? '៛' + Math.round(currentUsd * KHR_PER_USD).toLocaleString('en-US') : formatUsd(currentUsd)
      expireEl.textContent = `QR valid 10 min · ${cur} · account must match your Bakong registration`
    }

    updateMd5Display()
    savePendingTopup()

    overlay.classList.add('open')
    overlay.setAttribute('aria-hidden', 'false')
    document.body.style.overflow = 'hidden'
    document.body.classList.add('khqr-open')

    renderQr(document.getElementById('khqrQr'), currentPayload)

    paymentCredited = false
    document.getElementById('khqrAdvanced')?.classList.toggle('hidden', serverHasJwt || Boolean(getToken()))
    setPaymentStatus('pending', 'Scan & pay — balance updates automatically')
    ensurePaymentReady().finally(() => startPolling())
  }

  async function ensurePaymentReady() {
    const cfg = configDefaults()
    if (cfg.token?.startsWith('eyJ')) {
      localStorage.setItem(TOKEN_KEY, cfg.token)
      const tokenEl = document.getElementById('bakongToken')
      if (tokenEl) tokenEl.value = cfg.token
      serverHasJwt = true
    }
    if (cfg.email) localStorage.setItem(EMAIL_KEY, cfg.email)

    await redirectToPaymentServerIfNeeded()

    const online = await discoverProxy()
    if (online && !serverHasJwt) {
      await syncEmailToServer(true)
      await discoverProxy()
    }
    return online || getToken().startsWith('eyJ')
  }

  async function tryAutoRenewToken() {
    await ensurePaymentReady()
  }

  async function confirmPayment() {
    if (!currentUsd || !currentMd5) return
    await runPaymentCheck()
    if (paymentCredited) return
    global.showKhqrToast?.(
      'Payment not confirmed yet. Keep start.bat running, wait ~30s, then tap Check payment now again.',
    )
    setPaymentStatus('pending', 'Still waiting for Bakong to confirm your payment…')
  }

  async function fixBakongToken() {
    if (!getBakongEmail()) throw new Error('CONFIG_REQUIRED')
    return renewBakongToken()
  }

  function closeKhqrModal() {
    if (paymentCredited || !localStorage.getItem(PENDING_KEY)) {
      stopPolling()
    }
    const overlay = document.getElementById('khqrOverlay')
    if (!overlay) return
    overlay.classList.remove('open')
    overlay.setAttribute('aria-hidden', 'true')
    document.body.style.overflow = ''
    document.body.classList.remove('khqr-open')
  }

  function initKhqrModal() {
    const overlay = document.getElementById('khqrOverlay')
    if (!overlay) return

    loadSettings()
    redirectToPaymentServerIfNeeded().then(() => ensurePaymentReady())
    resumePendingTopup()

    document.getElementById('khqrClose')?.addEventListener('click', closeKhqrModal)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeKhqrModal()
    })

    document.getElementById('khqrCopy')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(currentPayload)
        global.showKhqrToast?.('KHQR copied')
      } catch {
        global.showKhqrToast?.('Copy failed')
      }
    })

    document.getElementById('khqrCopyMd5')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(currentMd5)
        global.showKhqrToast?.('MD5 copied')
      } catch {
        global.showKhqrToast?.('Copy failed')
      }
    })

    document.getElementById('khqrCheckNow')?.addEventListener('click', () => {
      saveSettings()
      runPaymentCheck()
    })

    document.getElementById('bakongToken')?.addEventListener('change', saveSettings)
    document.getElementById('bakongProxy')?.addEventListener('change', saveSettings)
    document.getElementById('bakongAccount')?.addEventListener('change', saveSettings)
    document.getElementById('bakongEmail')?.addEventListener('change', saveSettings)

    document.getElementById('bakongToken')?.addEventListener('input', () => {
      if (currentMd5 && !paymentCredited) runPaymentCheck()
    })

    document.getElementById('khqrCreditPaid')?.addEventListener('click', () => {
      confirmPayment()
    })

    document.getElementById('bakongFixToken')?.addEventListener('click', async () => {
      const btn = document.getElementById('bakongFixToken')
      const statusEl = document.getElementById('bakongRenewStatus')
      if (btn) btn.disabled = true
      if (statusEl) statusEl.textContent = 'Getting JWT…'
      try {
        saveSettings()
        await fixBakongToken()
        serverHasJwt = true
        if (statusEl) statusEl.textContent = 'JWT saved — MD5 check enabled'
        document.getElementById('khqrAdvanced')?.classList.add('hidden')
        if (pollTimer) stopPolling()
        startPolling()
        global.showKhqrToast?.('API token fixed')
        if (currentMd5) runPaymentCheck()
      } catch (err) {
        const msg =
          err.message === 'CONFIG_REQUIRED' || err.message === 'NOT_REGISTERED'
            ? 'Could not connect payment check — try again'
            : userFacingMessage(err.message) || 'Could not get token'
        if (statusEl) statusEl.textContent = msg
        if (msg) global.showKhqrToast?.(msg)
      } finally {
        if (btn) btn.disabled = false
      }
    })

    document.getElementById('bakongRenewToken')?.addEventListener('click', async () => {
      const btn = document.getElementById('bakongRenewToken')
      const statusEl = document.getElementById('bakongRenewStatus')
      if (btn) btn.disabled = true
      if (statusEl) statusEl.textContent = 'Requesting token…'
      try {
        saveSettings()
        await renewBakongToken()
        serverHasJwt = true
        if (statusEl) statusEl.textContent = 'New token saved — payment check enabled'
        document.getElementById('khqrAdvanced')?.classList.add('hidden')
        global.showKhqrToast?.('Bakong API token renewed')
        if (currentMd5) {
          setPaymentStatus('pending', 'Checking payment…')
          runPaymentCheck()
          if (!pollTimer) startPolling()
        }
      } catch (err) {
        const msg =
          err.message === 'EMAIL_REQUIRED' || err.message === 'NOT_REGISTERED'
            ? 'Could not connect payment check — try again'
            : err.message === 'PROXY_OFFLINE'
              ? 'Could not connect payment check — try again'
              : userFacingMessage(err.message) || 'Could not renew token'
        if (statusEl) statusEl.textContent = msg
        if (msg) global.showKhqrToast?.(msg)
      } finally {
        if (btn) btn.disabled = false
      }
    })

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('open')) closeKhqrModal()
    })
  }

  global.DynaServer = {
    online: false,
    hasJwt: false,
    setOnline(ok, hasJwt) {
      this.online = Boolean(ok)
      if (hasJwt !== undefined) this.hasJwt = Boolean(hasJwt)
      const el = document.getElementById('serverStatus')
      if (!el) return
      const apiBase = configApiBase()
      const hosted = isStaticHosting()

      el.classList.toggle('hidden', this.online && this.hasJwt)
      el.classList.toggle('server-status--offline', !this.online || !this.hasJwt)
      el.classList.toggle('server-status--ok', this.online && this.hasJwt)

      if (this.online && this.hasJwt) {
        el.innerHTML =
          '<strong>Payment check ready.</strong> Scan QR — balance updates automatically after you pay.'
        return
      }

      if (hosted) {
        if (this.online && this.hasJwt) {
          el.innerHTML =
            '<strong>Payment check ready (Bakong direct).</strong> Scan QR — balance updates after you pay.'
        } else if (!canUseDirectBakong() && !apiBase) {
          el.innerHTML =
            '<div class="server-setup"><strong>Connect payment API</strong><p>Paste your Vercel URL (optional) or add <code>token</code> in <code>standalone/bakong.config.js</code></p><input type="url" id="apiBaseInput" class="server-setup-input" placeholder="https://your-app.vercel.app" /><button type="button" class="server-retry-btn" id="serverSaveApi">Save</button> <button type="button" class="server-retry-btn" id="serverRetry">Retry</button></div>'
        } else if (!this.online) {
          el.innerHTML =
            '<strong>Cannot reach Bakong API.</strong> Check internet or renew token: <code>node scripts/bakong-token.mjs your@email.com</code> <button type="button" class="server-retry-btn" id="serverRetry">Retry</button>'
        } else {
          el.innerHTML =
            '<strong>API online but no JWT.</strong> Update <code>token</code> in <code>standalone/bakong.config.js</code> and push to GitHub.'
        }
        return
      }

      if (this.online) {
        el.innerHTML =
          '<strong>Server on, API token missing.</strong> Run <code>node scripts/bakong-token.mjs your@email.com</code> then restart <code>start.bat</code>.'
      }
    },
    async ping() {
      try {
        const ok = await discoverProxy()
        this.setOnline(ok, serverHasJwt)
        return ok && serverHasJwt
      } catch {
        this.setOnline(false, false)
        return false
      }
    },
  }

  global.Khqr = {
    buildKhqr,
    verifyKhqr,
    isInvalidAccount,
    isProxyOnline,
    discoverProxy,
    redirectToPaymentServerIfNeeded,
    checkServerOnline: isProxyOnline,
    hashMd5,
    checkTransactionByMd5,
    renewBakongToken,
    fixBakongToken,
    tryAutoRenewToken,
    ensurePaymentReady,
    syncEmailToServer,
    confirmPayment,
    applyTopupCredit,
    resumePendingTopup,
    creditWalletAfterPaid,
    parsePaymentStatus,
    openKhqrModal,
    closeKhqrModal,
    initKhqrModal,
    loadSettings,
    saveSettings,
    formatKhr,
    formatUsd,
    KHR_PER_USD,
    MERCHANT,
    PAYMENT_CHECK,
    onPaymentSuccess: null,
  }
})(typeof window !== 'undefined' ? window : global)
