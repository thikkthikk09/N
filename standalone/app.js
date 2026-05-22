const categories = ['All', 'Action', 'RPG', 'Indie', 'Sports', 'Strategy']
const topupAmounts = [0.01, 1, 2, 5, 10, 20, 50]
const WALLET_KEY = 'dyna_wallet_usd'
const KHR_PER_USD = 4100
let selectedTopup = 0.01

function formatTopupUsd(amount) {
  const n = Number(amount)
  if (n < 1) return `$${n.toFixed(2)}`
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`
}

function getBalance() {
  const n = Number(localStorage.getItem(WALLET_KEY))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function setBalance(usd) {
  localStorage.setItem(WALLET_KEY, String(Math.max(0, Number(usd) || 0)))
}

function addBalance(usd) {
  const next = getBalance() + Number(usd)
  setBalance(next)
  renderWallet(true)
  return next
}

function formatKhr(usd) {
  const khr = Math.round(Number(usd) * KHR_PER_USD)
  return '៛' + khr.toLocaleString('en-US')
}

function renderWallet(pulse) {
  const bal = getBalance()
  const usd = `$${bal.toFixed(2)}`
  const khr = formatKhr(bal)

  for (const id of ['userBalance', 'topupBalanceDisplay']) {
    const el = $(id)
    if (el) el.textContent = usd
  }
  const khrEl = $('topupBalanceKhr')
  if (khrEl) khrEl.textContent = khr

  if (pulse) {
    document.querySelectorAll('.user-wallet-amount').forEach((el) => {
      el.classList.add('wallet-pulse')
      setTimeout(() => el.classList.remove('wallet-pulse'), 600)
    })
  }
}

const OWNED_KEY = 'dyna_owned_games'
const BUILTIN_GAMES = [
  { id: 1, title: 'Eclipse Protocol', category: 'Action', price: 49.99, rating: 4.8, tag: 'New', gradient: 'linear-gradient(135deg, #1a1f3a 0%, #3d5a80 50%, #ee6c4d 100%)' },
  { id: 2, title: 'Verdant Realms', category: 'RPG', price: 39.99, rating: 4.9, tag: 'Bestseller', gradient: 'linear-gradient(135deg, #0d2818 0%, #2d6a4f 50%, #95d5b2 100%)' },
  { id: 3, title: 'Neon Drift', category: 'Indie', price: 14.99, rating: 4.6, tag: null, gradient: 'linear-gradient(135deg, #240046 0%, #7b2cbf 50%, #e0aaff 100%)' },
  { id: 4, title: 'Iron League 26', category: 'Sports', price: 59.99, rating: 4.4, tag: 'Sale', gradient: 'linear-gradient(135deg, #1b263b 0%, #415a77 50%, #ffd166 100%)' },
  { id: 5, title: 'Citadel Tactics', category: 'Strategy', price: 34.99, rating: 4.7, tag: null, gradient: 'linear-gradient(135deg, #2b2d42 0%, #8d99ae 50%, #ef233c 100%)' },
  { id: 6, title: 'Hollow Signal', category: 'Action', price: 29.99, rating: 4.5, tag: 'Sale', gradient: 'linear-gradient(135deg, #0b090a 0%, #660708 50%, #a4161a 100%)' },
  { id: 7, title: 'Starbound Odyssey', category: 'RPG', price: 44.99, rating: 4.8, tag: null, gradient: 'linear-gradient(135deg, #03045e 0%, #0077b6 50%, #90e0ef 100%)' },
  { id: 8, title: 'Pixel Ranch', category: 'Indie', price: 9.99, rating: 4.9, tag: 'Bestseller', gradient: 'linear-gradient(135deg, #582f0e 0%, #bc6c25 50%, #dda15e 100%)' },
  { id: 9, title: 'Grid Masters', category: 'Sports', price: 24.99, rating: 4.3, tag: null, gradient: 'linear-gradient(135deg, #14213d 0%, #fca311 50%, #e5e5e5 100%)' },
  { id: 10, title: 'Kingdom Forge', category: 'Strategy', price: 19.99, rating: 4.6, tag: 'Sale', gradient: 'linear-gradient(135deg, #3c1642 0%, #861657 50%, #f72585 100%)' },
  { id: 11, title: 'Rift Runner', category: 'Action', price: 54.99, rating: 4.7, tag: 'New', gradient: 'linear-gradient(135deg, #10002b 0%, #5a189a 50%, #ff6d00 100%)' },
  { id: 12, title: 'Moonlit Tales', category: 'RPG', price: 27.99, rating: 4.8, tag: null, gradient: 'linear-gradient(135deg, #1d3557 0%, #457b9d 50%, #f1faee 100%)' },
]

let games = [...BUILTIN_GAMES]
let pendingZipFile = null

let category = 'All'
let search = ''
const cart = new Map()
let toastTimer
const $ = (id) => document.getElementById(id)

function showToast(msg) {
  const el = $('toast')
  if (!el) return
  el.textContent = msg
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500)
}

function getOwnedIds() {
  try {
    return JSON.parse(localStorage.getItem(OWNED_KEY) || '[]')
  } catch {
    return []
  }
}

function markOwned(ids) {
  const set = new Set([...getOwnedIds(), ...ids])
  localStorage.setItem(OWNED_KEY, JSON.stringify([...set]))
}

function isOwned(id) {
  return getOwnedIds().includes(id)
}

async function mergeUploadedGames() {
  const uploaded = (await window.DynaUpload?.loadMeta?.()) || []
  games = [...BUILTIN_GAMES, ...uploaded]
}

function filtered() {
  const q = search.trim().toLowerCase()
  return games.filter((g) => {
    const cat = category === 'All' || g.category === category
    const sr = !q || g.title.toLowerCase().includes(q) || g.category.toLowerCase().includes(q)
    return cat && sr
  })
}

function renderTopup() {
  const grid = $('topupGrid')
  if (!grid) return
  grid.innerHTML = topupAmounts
    .map(
      (amount) =>
        `<button type="button" class="topup-amount ${amount === selectedTopup ? 'active' : ''}" data-amount="${amount}" aria-pressed="${amount === selectedTopup}">${formatTopupUsd(amount)}</button>`,
    )
    .join('')
  const confirm = $('topupConfirm')
  if (confirm) confirm.textContent = `Pay with Bakong — ${formatTopupUsd(selectedTopup)}`
}

function renderCategories() {
  const el = $('categories')
  if (!el) return
  el.innerHTML = categories
    .map(
      (c) =>
        `<button type="button" class="category-pill ${c === category ? 'active' : ''}" data-cat="${c}">${c}</button>`,
    )
    .join('')
}

function starSvg() {
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>'
}

function closeGameMenu(el) {
  const det = el?.closest?.('details.game-action-details')
  if (det) det.open = false
}

function closeAllGameMenus() {
  document.querySelectorAll('details.game-action-details[open]').forEach((d) => {
    d.open = false
  })
  document.querySelectorAll('.game-card.menu-open-card').forEach((c) => c.classList.remove('menu-open-card'))
}

function renderGrid() {
  const list = filtered()
  const countEl = $('gameCount')
  if (countEl) countEl.textContent = `${list.length} ${list.length === 1 ? 'title' : 'titles'}`
  $('empty')?.classList.toggle('hidden', list.length > 0)
  const grid = $('grid')
  if (!grid) return
  grid.classList.toggle('hidden', list.length === 0)

  grid.innerHTML = list
    .map((g) => {
      const inCart = cart.has(g.id)
      const tagClass = g.tag ? g.tag.toLowerCase() : ''
      const tagHtml = g.tag ? `<span class="game-tag ${tagClass}">${g.tag}</span>` : ''
      const zipMeta = g.uploaded
        ? `<span class="game-zip-meta">${g.fileSizeLabel || ''}</span>`
        : ''
      const downloadRow = g.uploaded
        ? `<button type="button" class="game-menu-item game-menu-item--download" role="menuitem" data-download="${g.id}">
                Download file
              </button>`
        : ''

      const actionHtml = `
          <details class="game-action-details">
            <summary class="add-btn ${inCart ? 'added' : ''}">
              ${inCart ? 'In cart' : 'Add'} <span class="add-caret" aria-hidden="true">▾</span>
            </summary>
            <div class="game-action-menu" role="menu">
              <button type="button" class="game-menu-item" role="menuitem" data-cart-id="${g.id}">
                ${inCart ? 'View cart' : 'Add to cart'}
              </button>
              ${downloadRow}
            </div>
          </details>`

      return `
        <article class="game-card ${g.uploaded ? 'game-card--uploaded' : ''}">
          <div class="game-cover">
            <div class="game-cover-bg" style="background:${g.gradient}"></div>
            ${tagHtml}
          </div>
          <div class="game-body">
            <div class="game-meta">
              <span class="game-category">${g.category}</span>
              <span class="game-rating">${starSvg()} ${g.rating}</span>
            </div>
            <h3 class="game-title">${g.title}</h3>
            ${zipMeta}
            <div class="game-footer">
              <span class="game-price">$${g.price.toFixed(2)}</span>
              <div class="game-footer-actions">${actionHtml}</div>
            </div>
          </div>
        </article>`
    })
    .join('')
}

function renderCart() {
  const items = [...cart.values()]
  const badge = $('cartBadge')
  badge.textContent = items.length
  badge.classList.toggle('hidden', items.length === 0)

  const total = items.reduce((s, g) => s + g.price, 0)
  $('cartTotal').textContent = `$${total.toFixed(2)}`
  $('checkout').disabled = items.length === 0

  if (items.length === 0) {
    $('cartItems').innerHTML = '<p class="cart-empty">Your cart is empty. Add a game to get started.</p>'
    return
  }

  $('cartItems').innerHTML = items
    .map(
      (g) => `
      <div class="cart-item">
        <div class="cart-item-cover" style="background:${g.gradient}"></div>
        <div class="cart-item-info">
          <p class="cart-item-title">${g.title}</p>
          <p class="cart-item-price">$${g.price.toFixed(2)}</p>
          <button type="button" class="cart-item-remove" data-remove="${g.id}">Remove</button>
        </div>
      </div>`,
    )
    .join('')
}

function openCart() {
  $('overlay').classList.add('open')
  $('drawer').classList.add('open')
}

function closeCart() {
  $('overlay').classList.remove('open')
  $('drawer').classList.remove('open')
}

function addGame(id) {
  const game = games.find((g) => g.id === id)
  if (!game) return
  if (cart.has(id)) {
    openCart()
    return
  }
  cart.set(id, game)
  showToast(`${game.title} added to cart`)
  renderGrid()
  renderCart()
}

async function renderUploadList() {
  const list = $('uploadList')
  const uploaded = (await window.DynaUpload?.loadMeta?.()) || []
  if (!list) return
  if (!uploaded.length) {
    list.innerHTML = '<li class="upload-empty">No uploads yet — use Upload ZIP above.</li>'
    return
  }
  list.innerHTML = uploaded
    .map(
      (g) => `
      <li class="upload-item">
        <div class="upload-item-info">
          <strong>${g.title}</strong>
          <span>${g.fileName} · ${g.fileSizeLabel}</span>
        </div>
        <div class="upload-item-actions">
          <button type="button" class="upload-item-btn" data-store-id="${g.id}">View in store</button>
          <button type="button" class="upload-item-btn upload-item-btn--danger" data-delete-upload="${g.id}">Delete</button>
        </div>
      </li>`,
    )
    .join('')
}

function uploadOptionsFromForm() {
  return {
    title: $('uploadTitle')?.value?.trim(),
    category: $('uploadCategory')?.value,
    price: Number($('uploadPrice')?.value),
  }
}

async function handleZipFiles(fileList, useForm = true) {
  const files = [...fileList].filter((f) => /\.zip$/i.test(f.name))
  if (!files.length) {
    showToast('Choose a .zip file')
    return
  }
  const pending = $('uploadPending')
  const progress = $('uploadProgress')
  const progressBar = $('uploadProgressBar')
  if (pending) {
    pending.classList.remove('hidden')
    pending.textContent = `Uploading ${files.length} file(s)…`
  }
  progress?.classList.remove('hidden')
  const opts = useForm ? uploadOptionsFromForm() : {}
  let ok = 0
  for (const file of files) {
    try {
      const one = files.length === 1 && useForm ? opts : {}
      if (files.length > 1) one.title = undefined
      await DynaUpload.uploadZipFile(file, one, (p) => {
        if (pending) {
          pending.textContent = `${file.name} — ${p.percent}% (${DynaUpload.formatBytes(p.loaded)} / ${DynaUpload.formatBytes(p.total)})`
        }
        if (progressBar) progressBar.style.width = `${p.percent}%`
      })
      ok++
    } catch (err) {
      const msg =
        err.message === 'NOT_ZIP'
          ? 'Only .zip files'
          : err.message === 'TOO_LARGE'
            ? `Max ${DynaUpload.MAX_ZIP_GB} GB per file`
            : err.message === 'STORAGE_UNSUPPORTED'
              ? 'Use Chrome or Edge for large ZIP uploads'
              : 'Upload failed'
      showToast(msg)
    }
  }
  if (pending) pending.classList.add('hidden')
  progress?.classList.add('hidden')
  if (progressBar) progressBar.style.width = '0%'
  await mergeUploadedGames()
  await renderUploadList()
  renderGrid()
  if (ok) showToast(`${ok} game ZIP${ok > 1 ? 's' : ''} added to store`)
  pendingZipFile = null
}

function initUploadUi() {
  const panel = $('uploadPanel')
  const input = $('gameZipInput')
  const multi = $('gameZipMulti')
  if (!input) return

  $('btnUploadZip')?.addEventListener('click', () => {
    $('uploadPanel')?.classList.remove('hidden')
    input.click()
  })

  $('btnUploadMulti')?.addEventListener('click', () => {
    $('uploadPanel')?.classList.remove('hidden')
    multi?.click()
  })

  $('btnToggleUploads')?.addEventListener('click', async () => {
    panel?.classList.toggle('hidden')
    await renderUploadList()
    document.getElementById('uploadSection')?.scrollIntoView({ behavior: 'smooth' })
  })

  input.addEventListener('change', async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    $('uploadTitle').value =
      file.name.replace(/\.zip$/i, '').replace(/[-_]+/g, ' ').trim() || ''
    panel?.classList.remove('hidden')
    pendingZipFile = file
    await handleZipFiles([file], true)
  })

  multi?.addEventListener('change', async (e) => {
    const files = e.target.files
    e.target.value = ''
    if (!files?.length) return
    panel?.classList.remove('hidden')
    await handleZipFiles(files, false)
  })

  $('uploadList')?.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-delete-upload]')
    if (del) {
      const id = Number(del.dataset.deleteUpload)
      if (!confirm('Delete this upload from the store?')) return
      await DynaUpload.removeUpload(id)
      cart.delete(id)
      await mergeUploadedGames()
      await renderUploadList()
      renderGrid()
      renderCart()
      showToast('Upload removed')
      return
    }
    const view = e.target.closest('[data-store-id]')
    if (view) {
      category = 'All'
      renderCategories()
      renderGrid()
      $('store')?.scrollIntoView({ behavior: 'smooth' })
    }
  })
}

async function init() {
  document.getElementById('bootMsg')?.classList.add('hidden')

  try {
    await mergeUploadedGames()
  } catch (e) {
    console.error(e)
  }

  const yearEl = $('year')
  if (yearEl) yearEl.textContent = new Date().getFullYear()
  renderWallet()
  renderTopup()
  renderCategories()
  renderGrid()
  renderCart()
  initUploadUi()
  try {
    await renderUploadList()
  } catch (e) {
    console.error(e)
  }

  $('topupGrid')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-amount]')
    if (!btn) return
    selectedTopup = Number(btn.dataset.amount)
    renderTopup()
  })

  window.showKhqrToast = showToast

  $('topupConfirm')?.addEventListener('click', async () => {
    if (!window.Khqr?.openKhqrModal) {
      showToast('Still loading… wait 2 seconds and try again')
      return
    }
    Khqr.saveSettings?.()
    const btn = $('topupConfirm')
    if (btn) btn.disabled = true
    try {
      await Khqr.redirectToPaymentServerIfNeeded?.()
      Khqr.openKhqrModal(selectedTopup)
      void Khqr.ensurePaymentReady?.().then(async () => {
        const online = await Khqr.discoverProxy?.()
        if (!online) {
          showToast('QR shown — run start.bat for auto balance update after you pay')
          global.DynaServer?.setOnline?.(false)
        } else if (!global.DynaServer?.hasJwt) {
          showToast('After paying, tap Check payment now in the QR window')
        }
      })
    } catch (err) {
      console.error(err)
      showToast('Could not open payment QR — check Bakong account ID')
    } finally {
      if (btn) btn.disabled = false
    }
  })

  $('walletTopUp')?.addEventListener('click', () => {
    document.getElementById('topup')?.scrollIntoView({ behavior: 'smooth' })
  })

  if (window.Khqr) {
    Khqr.onPaymentSuccess = (usd) => {
      const total = addBalance(usd)
      renderWallet(true)
      showToast(`+${formatTopupUsd(usd)} added · Balance $${total.toFixed(2)}`)
    }
    Khqr.initKhqrModal()
    Khqr.loadSettings?.()
    Khqr.ensurePaymentReady?.()
    global.DynaServer?.ping?.()
    setInterval(() => global.DynaServer?.ping?.(), 4000)
    document.getElementById('serverStatus')?.addEventListener('click', (e) => {
      if (e.target.id === 'serverSaveApi') {
        const input = document.getElementById('apiBaseInput')
        const url = input?.value?.trim().replace(/\/$/, '')
        if (url) {
          localStorage.setItem('dyna_api_base', url)
          showToast('API URL saved')
        }
        global.DynaServer?.ping?.()
        return
      }
      if (e.target.id !== 'serverRetry') return
      global.DynaServer?.ping?.().then((ok) => {
        showToast(
          ok
            ? 'Payment API connected'
            : 'Still offline — renew token or run start.bat (local)',
        )
      })
    })
    Khqr.resumePendingTopup?.()
    setInterval(() => Khqr.resumePendingTopup?.(), 1500)
  }

  $('categories')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cat]')
    if (!btn) return
    category = btn.dataset.cat
    renderCategories()
    renderGrid()
  })

  $('grid')?.addEventListener('toggle', (e) => {
    const det = e.target.closest('details.game-action-details')
    if (!det) return
    const card = det.closest('.game-card')
    if (card) card.classList.toggle('menu-open-card', det.open)
    if (!det.open) return
    document.querySelectorAll('details.game-action-details[open]').forEach((d) => {
      if (d !== det) {
        d.open = false
        d.closest('.game-card')?.classList.remove('menu-open-card')
      }
    })
  })

  document.addEventListener('click', (e) => {
    if (e.target.closest('details.game-action-details')) return
    closeAllGameMenus()
    document.querySelectorAll('.game-card.menu-open-card').forEach((c) => c.classList.remove('menu-open-card'))
  })

  $('grid')?.addEventListener('click', async (e) => {
    const cartBtn = e.target.closest('[data-cart-id]')
    if (cartBtn) {
      e.preventDefault()
      closeGameMenu(cartBtn)
      addGame(Number(cartBtn.dataset.cartId))
      return
    }

    const dl = e.target.closest('[data-download]')
    if (dl) {
      e.preventDefault()
      e.stopPropagation()
      closeGameMenu(dl)
      const gameId = Number(dl.dataset.download)
      showToast('Preparing download…')
      try {
        await DynaUpload.downloadZip(gameId)
        showToast('Download started')
      } catch (err) {
        console.error(err)
        showToast(err?.message === 'MISSING' ? 'File not found — upload again' : 'Download failed')
      }
      return
    }
  })

  $('search')?.addEventListener('input', (e) => {
    search = e.target.value
    renderGrid()
  })

  $('viewAll')?.addEventListener('click', () => {
    category = 'All'
    search = ''
    $('search').value = ''
    renderCategories()
    renderGrid()
    $('store').scrollIntoView({ behavior: 'smooth' })
  })

  document.querySelectorAll('.nav-link[data-cat]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault()
      category = link.dataset.cat
      renderCategories()
      renderGrid()
      $('store').scrollIntoView({ behavior: 'smooth' })
    })
  })

  $('openCart')?.addEventListener('click', openCart)
  $('closeCart')?.addEventListener('click', closeCart)
  $('overlay')?.addEventListener('click', closeCart)

  $('cartItems')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove]')
    if (!btn) return
    cart.delete(Number(btn.dataset.remove))
    renderGrid()
    renderCart()
  })

  $('checkout')?.addEventListener('click', () => {
    if (!cart.size) return
    const total = [...cart.values()].reduce((s, g) => s + g.price, 0)
    const bal = getBalance()
    if (bal < total) {
      showToast(`Need $${total.toFixed(2)} — you have $${bal.toFixed(2)}. Top up first.`)
      document.getElementById('topup')?.scrollIntoView({ behavior: 'smooth' })
      return
    }
    setBalance(bal - total)
    markOwned([...cart.keys()])
    cart.clear()
    renderWallet(true)
    renderGrid()
    renderCart()
    closeCart()
    showToast(`Paid $${total.toFixed(2)} from wallet · Balance $${getBalance().toFixed(2)}`)
  })
}

window.DynaWallet = { getBalance, addBalance, setBalance, renderWallet }

init().catch(function (err) {
  console.error(err)
  const msg = document.getElementById('bootMsg')
  if (msg) {
    msg.classList.remove('hidden')
    msg.textContent = 'Could not start — open http://127.0.0.1:8787/index.html (run start.bat)'
  }
})
