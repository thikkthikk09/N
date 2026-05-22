import { useState, useMemo, useCallback } from 'react'
import { games, categories } from './data/games'
import './App.css'

function StarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  )
}

function CartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

function GameCard({ game, inCart, onAdd }) {
  const tagClass = game.tag?.toLowerCase()

  return (
    <article className="game-card">
      <div className="game-cover">
        <div className="game-cover-bg" style={{ background: game.gradient }} />
        {game.tag && <span className={`game-tag ${tagClass}`}>{game.tag}</span>}
      </div>
      <div className="game-body">
        <div className="game-meta">
          <span className="game-category">{game.category}</span>
          <span className="game-rating">
            <StarIcon />
            {game.rating}
          </span>
        </div>
        <h3 className="game-title">{game.title}</h3>
        <div className="game-footer">
          <span className="game-price">${game.price.toFixed(2)}</span>
          <button
            type="button"
            className={`add-btn ${inCart ? 'added' : ''}`}
            onClick={() => onAdd(game)}
          >
            {inCart ? 'In cart' : 'Add'}
          </button>
        </div>
      </div>
    </article>
  )
}

export default function App() {
  const [category, setCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const [toast, setToast] = useState('')

  const cartIds = useMemo(() => new Set(cart.map((g) => g.id)), [cart])
  const cartTotal = useMemo(() => cart.reduce((sum, g) => sum + g.price, 0), [cart])

  const filteredGames = useMemo(() => {
    const q = search.trim().toLowerCase()
    return games.filter((game) => {
      const matchCategory = category === 'All' || game.category === category
      const matchSearch =
        !q ||
        game.title.toLowerCase().includes(q) ||
        game.category.toLowerCase().includes(q)
      return matchCategory && matchSearch
    })
  }, [category, search])

  const showToast = useCallback((message) => {
    setToast(message)
    setTimeout(() => setToast(''), 2500)
  }, [])

  const addToCart = useCallback(
    (game) => {
      if (cartIds.has(game.id)) {
        setCartOpen(true)
        return
      }
      setCart((prev) => [...prev, game])
      showToast(`${game.title} added to cart`)
    },
    [cartIds, showToast],
  )

  const removeFromCart = useCallback((id) => {
    setCart((prev) => prev.filter((g) => g.id !== id))
  }, [])

  const scrollToStore = () => {
    document.getElementById('store')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="app">
      <header className="header">
        <a href="#" className="logo" onClick={(e) => e.preventDefault()}>
          <span className="logo-icon">D</span>
          Dyna Store
        </a>
        <nav className="nav" aria-label="Main">
          <a href="#store" className="nav-link active" onClick={(e) => { e.preventDefault(); scrollToStore() }}>
            Store
          </a>
          <a href="#store" className="nav-link" onClick={(e) => { e.preventDefault(); setCategory('Action') }}>
            Action
          </a>
          <a href="#store" className="nav-link" onClick={(e) => { e.preventDefault(); setCategory('RPG') }}>
            RPG
          </a>
          <a href="#store" className="nav-link" onClick={(e) => { e.preventDefault(); setCategory('Indie') }}>
            Indie
          </a>
        </nav>
        <div className="header-actions">
          <div className="search-wrap">
            <SearchIcon />
            <input
              type="search"
              className="search-input"
              placeholder="Search games..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search games"
            />
          </div>
          <button
            type="button"
            className="cart-btn"
            onClick={() => setCartOpen(true)}
            aria-label={`Cart, ${cart.length} items`}
          >
            <CartIcon />
            {cart.length > 0 && <span className="cart-badge">{cart.length}</span>}
          </button>
        </div>
      </header>

      <section className="hero">
        <div className="hero-content">
          <span className="hero-label">Digital game store</span>
          <h1>Play more. Browse less.</h1>
          <p>
            Curated PC and console titles with instant delivery. Find your next favorite game in seconds.
          </p>
          <div className="hero-cta">
            <button type="button" className="btn btn-primary" onClick={scrollToStore}>
              Browse games
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setCategory('All')
                setSearch('')
                scrollToStore()
              }}
            >
              View all
            </button>
          </div>
        </div>
      </section>

      <main className="main" id="store">
        <div className="section-header">
          <h2>All games</h2>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            {filteredGames.length} {filteredGames.length === 1 ? 'title' : 'titles'}
          </span>
        </div>

        <div className="categories" role="tablist" aria-label="Categories">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={category === cat}
              className={`category-pill ${category === cat ? 'active' : ''}`}
              onClick={() => setCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        {filteredGames.length > 0 ? (
          <div className="games-grid">
            {filteredGames.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                inCart={cartIds.has(game.id)}
                onAdd={addToCart}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>No games found</h3>
            <p>Try a different search or category.</p>
          </div>
        )}
      </main>

      <footer className="footer">
        © {new Date().getFullYear()} Dyna Store — Demo game shop
      </footer>

      <div
        className={`overlay ${cartOpen ? 'open' : ''}`}
        onClick={() => setCartOpen(false)}
        aria-hidden={!cartOpen}
      />
      <aside className={`cart-drawer ${cartOpen ? 'open' : ''}`} aria-label="Shopping cart">
        <div className="cart-header">
          <h2>Your cart</h2>
          <button type="button" className="close-btn" onClick={() => setCartOpen(false)} aria-label="Close cart">
            <CloseIcon />
          </button>
        </div>
        <div className="cart-items">
          {cart.length === 0 ? (
            <p className="cart-empty">Your cart is empty. Add a game to get started.</p>
          ) : (
            cart.map((game) => (
              <div key={game.id} className="cart-item">
                <div className="cart-item-cover" style={{ background: game.gradient }} />
                <div className="cart-item-info">
                  <p className="cart-item-title">{game.title}</p>
                  <p className="cart-item-price">${game.price.toFixed(2)}</p>
                  <button
                    type="button"
                    className="cart-item-remove"
                    onClick={() => removeFromCart(game.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="cart-footer">
          <div className="cart-total">
            <span>Total</span>
            <span>${cartTotal.toFixed(2)}</span>
          </div>
          <button
            type="button"
            className="checkout-btn"
            disabled={cart.length === 0}
            onClick={() => {
              if (cart.length > 0) showToast('Checkout is a demo — thanks for trying Dyna Store!')
            }}
          >
            Checkout
          </button>
        </div>
      </aside>

      <div className={`toast ${toast ? 'show' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  )
}
