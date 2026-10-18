import { NavLink, Outlet, useNavigate } from 'react-router'

import { USE_SAMPLE_DATA } from '../api/admin.js'
import { useAuth } from '../auth/context.js'

// Officers see only what they need to answer referrals; admins see everything.
const NAV = [
  { to: '/', label: 'Overview', roles: ['admin'] },
  { to: '/referrals', label: 'Referrals', roles: ['admin', 'officer'] },
  { to: '/contacts', label: 'County contacts', roles: ['admin', 'officer'] },
  { to: '/users', label: 'Users', roles: ['admin'] },
  { to: '/advice', label: 'Advice library', roles: ['admin', 'officer'] },
  { to: '/model', label: 'Model settings', roles: ['admin'] },
]

export default function AppLayout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const leave = () => {
    signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen md:grid md:grid-cols-[15rem_1fr]">
      {/* The column keeps the sidebar's colour below it on pages taller than the screen. */}
      <div className="md:bg-forest-light">
      <aside className="flex flex-col bg-gradient-to-b from-forest-deep via-forest-mid to-forest-light text-white md:sticky md:top-0 md:h-screen">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <div>
            <p className="text-base font-bold leading-tight">Sproutly</p>
            <p className="text-xs text-white/60">{user.role === 'admin' ? 'Admin portal' : 'Officer portal'}</p>
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible">
          {NAV.filter((item) => item.roles.includes(user.role)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
                  isActive ? 'bg-white/15 text-white' : 'text-white/65 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto hidden border-t border-white/10 px-5 py-4 md:block">
          <p className="truncate text-sm font-semibold">{user.name}</p>
          <p className="text-xs text-white/60">
            {user.role === 'admin' ? 'Administrator' : `Extension officer, ${user.county}`}
          </p>
          <button type="button" onClick={leave} className="mt-3 text-sm font-semibold text-white/80 underline hover:text-white">
            Sign out
          </button>
        </div>
      </aside>
      </div>

      <div className="min-w-0">
        {USE_SAMPLE_DATA && (
          <div className="border-b border-expert/20 bg-expert/10 px-6 py-2 text-xs font-semibold text-expert">
            Sample data: these screens show made-up cases, people and numbers. The admin API is not connected yet.
          </div>
        )}
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <Outlet />
        </main>
        <div className="border-t border-divider px-6 py-4 md:hidden">
          <button type="button" onClick={leave} className="text-sm font-semibold text-primary underline">
            Sign out ({user.name})
          </button>
        </div>
      </div>
    </div>
  )
}
