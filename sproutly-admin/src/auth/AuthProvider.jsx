import { useCallback, useMemo, useState } from 'react'

import { AuthContext } from './context.js'

// The session lives in sessionStorage: it survives a page reload but ends when the tab is
// closed, so an admin session is not left behind on a shared computer.
const KEY = 'sproutly-admin-session'

function readSession() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY)) ?? null
  } catch {
    return null
  }
}

export default function AuthProvider({ children }) {
  const [session, setSession] = useState(readSession)

  const signIn = useCallback((next) => {
    // The portal is for admins and extension officers only; farmers use the mobile app.
    if (!['admin', 'officer'].includes(next.user.role)) {
      throw new Error('This portal is for administrators and extension officers. Farmers use the Sproutly app.')
    }
    try {
      sessionStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // Storage blocked: the session still works until the page is reloaded.
    }
    setSession(next)
  }, [])

  const signOut = useCallback(() => {
    try {
      sessionStorage.removeItem(KEY)
    } catch {
      // nothing stored
    }
    setSession(null)
  }, [])

  const value = useMemo(
    () => ({ token: session?.token ?? null, user: session?.user ?? null, signIn, signOut }),
    [session, signIn, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
