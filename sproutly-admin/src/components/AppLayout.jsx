import {
  IoBookOutline,
  IoCallOutline,
  IoChatbubblesOutline,
  IoGridOutline,
  IoListOutline,
  IoLogOutOutline,
  IoOptionsOutline,
  IoPeopleOutline,
  IoPersonCircleOutline,
} from 'react-icons/io5'
import { NavLink, Outlet, useNavigate } from 'react-router'

import { useAuth } from '../auth/context.js'

// Officers see only what they need to answer referrals; admins see everything.
// Icons are Ionicons, the set the mobile app uses (e.g. call-outline for support contacts).
const NAV = [
  { to: '/', label: 'Overview', icon: IoGridOutline, roles: ['admin'] },
  { to: '/referrals', label: 'Referrals', icon: IoChatbubblesOutline, roles: ['admin', 'officer'] },
  { to: '/contacts', label: 'County contacts', icon: IoCallOutline, roles: ['admin', 'officer'] },
  { to: '/users', label: 'Users', icon: IoPeopleOutline, roles: ['admin'] },
  { to: '/advice', label: 'Advice library', icon: IoBookOutline, roles: ['admin', 'officer'] },
  { to: '/model', label: 'Model settings', icon: IoOptionsOutline, roles: ['admin'] },
  { to: '/audit', label: 'Audit log', icon: IoListOutline, roles: ['admin'] },
  { to: '/account', label: 'My account', icon: IoPersonCircleOutline, roles: ['admin', 'officer'] },
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
          <img src="/sproutly-logo.png" alt="" className="h-8 w-8" />
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
                `flex items-center gap-3 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
                  isActive ? 'bg-white/15 text-white' : 'text-white/65 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto hidden border-t border-white/10 px-5 py-4 md:block">
          <p className="truncate text-sm font-semibold">{user.name}</p>
          <p className="text-xs text-white/60">
            {user.role === 'admin' ? 'Administrator' : `Extension officer, ${user.county}`}
          </p>
          <button type="button" onClick={leave}
                  className="mt-3 flex items-center gap-2 text-sm font-semibold text-white/75 hover:text-white">
            <IoLogOutOutline className="h-5 w-5" aria-hidden="true" />
            Sign out
          </button>
        </div>
      </aside>
      </div>

      <div className="min-w-0">
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
