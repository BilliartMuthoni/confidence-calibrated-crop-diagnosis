import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  IoBookOutline,
  IoCallOutline,
  IoChatbubblesOutline,
  IoGridOutline,
  IoListOutline,
  IoMenuOutline,
  IoOptionsOutline,
  IoPeopleOutline,
  IoPersonCircleOutline,
} from 'react-icons/io5'
import { NavLink, Outlet, useNavigate } from 'react-router'

import { useAuth } from '../auth/context.js'

// Officers see only what they need to answer referrals; admins see everything, in two groups.
// Icons are Ionicons, the set the mobile app uses (e.g. call-outline for support contacts).
// `short` is the word under the icon when the menu is folded: icons alone are hard to tell apart.
const PAGES = {
  overview: { to: '/', label: 'Overview', short: 'Overview', icon: IoGridOutline },
  referrals: { to: '/referrals', label: 'Referrals', short: 'Referrals', icon: IoChatbubblesOutline },
  audit: { to: '/audit', label: 'Audit log', short: 'Audit', icon: IoListOutline },
  users: { to: '/users', label: 'Users', short: 'Users', icon: IoPeopleOutline },
  contacts: { to: '/contacts', label: 'County contacts', short: 'Contacts', icon: IoCallOutline },
  advice: { to: '/advice', label: 'Advice library', short: 'Advice', icon: IoBookOutline },
  model: { to: '/model', label: 'Model settings', short: 'Model', icon: IoOptionsOutline },
  account: { to: '/account', label: 'My account', short: 'Account', icon: IoPersonCircleOutline },
}

const GROUPS = {
  admin: [
    ['Monitoring', ['overview', 'referrals', 'audit']],
    ['Manage', ['users', 'contacts', 'advice', 'model']],
  ],
  officer: [['Work', ['referrals', 'contacts', 'advice']]],
}

// Whether the menu is folded to icons is remembered on this computer only.
const FOLDED_KEY = 'sproutly.menuFolded'
function readFolded() {
  try {
    return localStorage.getItem(FOLDED_KEY) === '1'
  } catch {
    return false
  }
}

// True while the window matches a media query, updated as it is resized.
function useMedia(query) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
  )
}

function NavItem({ page, compact }) {
  const Icon = page.icon
  return (
    <NavLink
      to={page.to}
      end={page.to === '/'}
      title={compact ? page.label : undefined}
      className={({ isActive }) =>
        `flex items-center rounded-md text-sm font-semibold transition-colors ${
          compact ? 'flex-col gap-1 px-1 py-2' : 'h-9 gap-3 px-3'
        } ${isActive ? 'bg-white text-primary' : 'text-white/80 hover:bg-white/10 hover:text-white'}`
      }
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      {compact ? <span className="text-[11px] font-medium leading-tight">{page.short}</span> : <span>{page.label}</span>}
    </NavLink>
  )
}

export default function AppLayout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const wide = useMedia('(min-width: 64rem)')
  const medium = useMedia('(min-width: 30rem)')
  const size = wide ? 'wide' : medium ? 'narrow' : 'phone'
  // Wide screens: the full menu, folded to icons with ☰ (remembered). Narrower windows (a split
  // screen, a tablet, a phone) start with the folded menu; ☰ opens the full one, in place, or on
  // a phone over the page. Crossing into another size starts again from that size's default.
  const [folded, setFolded] = useState(readFolded)
  const [expanded, setExpanded] = useState({ size, on: false })
  const open = expanded.size === size && expanded.on
  const mode = wide ? (folded ? 'rail' : 'full') : !open ? 'rail' : medium ? 'full' : 'overlay'
  const compact = mode === 'rail'

  useEffect(() => {
    try {
      localStorage.setItem(FOLDED_KEY, folded ? '1' : '0')
    } catch {
      // Private windows may refuse storage; the menu still works, it just isn't remembered.
    }
  }, [folded])

  // The menu over the page closes only with ☰ (or Escape on a keyboard), never by tapping
  // outside it: an accidental tap kept closing it.
  useEffect(() => {
    if (mode !== 'overlay') return undefined
    const onKey = (e) => e.key === 'Escape' && setExpanded({ size, on: false })
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, size])

  const toggleMenu = () => (wide ? setFolded((f) => !f) : setExpanded({ size, on: !open }))

  const leave = () => {
    signOut()
    navigate('/login', { replace: true })
  }


  const placement = {
    full: 'sticky top-0 h-screen w-64 shrink-0',
    rail: 'sticky top-0 h-screen w-20 shrink-0',
    overlay: 'fixed inset-y-0 left-0 w-64 shadow-xl',
  }[mode]

  return (
    <div className="flex min-h-screen">
      {/* The folded menu's space is kept while the full one lies over it, so the page doesn't jump. */}
      {mode === 'overlay' && <div className="w-20 shrink-0" aria-hidden="true" />}

      <aside
        id="main-menu"
        className={`z-40 flex flex-col bg-forest-mid text-white transition-[width,transform] duration-200 ${placement}`}
      >
        <div className={`flex h-14 shrink-0 items-center gap-2.5 ${compact ? 'justify-center' : 'px-5'}`}>
          {/* On a phone the open menu covers the top bar's ☰, so it has its own to close it. */}
          {mode === 'overlay' && (
            <button type="button" onClick={toggleMenu} aria-controls="main-menu" aria-expanded="true" aria-label="Close the menu"
                    className="-ml-2 flex h-9 w-9 items-center justify-center rounded-md text-white hover:bg-white/10">
              <IoMenuOutline className="h-6 w-6" aria-hidden="true" />
            </button>
          )}
          <img src="/sproutly-logo.png" alt="" className="h-7 w-7" />
          {!compact && (
            <div>
              <p className="text-base font-bold leading-tight">Sproutly</p>
              <p className="text-xs text-white/70">{user.role === 'admin' ? 'Admin portal' : 'Officer portal'}</p>
            </div>
          )}
        </div>

        <nav aria-label="Main" className={`flex flex-1 flex-col gap-5 overflow-y-auto py-3 ${compact ? 'px-2' : 'px-3'}`}>
          {GROUPS[user.role].map(([title, keys]) => (
            <div key={title}>
              {compact
                ? <hr className="mx-2 mb-2 border-white/15" />
                : <p className="mb-1.5 px-3 text-xs font-semibold text-white/70">{title}</p>}
              <div className="flex flex-col gap-0.5">
                {keys.map((key) => <NavItem key={key} page={PAGES[key]} compact={compact} />)}
              </div>
            </div>
          ))}
        </nav>

        <div className={`border-t border-white/10 py-3 ${compact ? 'px-2' : 'px-3'}`}>
          <NavItem page={PAGES.account} compact={compact} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-divider bg-white px-4 sm:px-6">
          <button
            type="button"
            onClick={toggleMenu}
            aria-controls="main-menu"
            aria-expanded={mode === 'full' || mode === 'overlay'}
            aria-label={compact ? 'Show the full menu' : 'Menu'}
            className="-ml-1 flex h-9 w-9 items-center justify-center rounded-md text-ink hover:bg-surface"
          >
            <IoMenuOutline className="h-6 w-6" aria-hidden="true" />
          </button>

          <div className="ml-auto flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold leading-5 text-ink">{user.name}</p>
              <p className="text-xs text-muted">
                {user.role === 'admin' ? 'Administrator' : `Extension officer, ${user.county}`}
              </p>
            </div>
            <button
              type="button"
              onClick={leave}
              className="h-9 rounded-md border border-divider-strong bg-white px-3.5 text-sm font-semibold text-ink hover:bg-surface"
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
