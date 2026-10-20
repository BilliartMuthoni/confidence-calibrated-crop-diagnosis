import { useCallback, useEffect, useMemo, useState } from 'react'

import { SESSION_ENDED } from '../api/client.js'
import { AuthContext } from './context.js'

// The session lives in sessionStorage: it survives a page reload but ends when the tab is
// closed, so an admin session is not left behind on a shared computer.
const KEY = 'sproutly-admin-session'
// Signed out after this long without a click or key press (the server ends every staff
// session after 8 hours regardless).
const IDLE_MINUTES = 30
const ACTIVITY = ['pointerdown', 'keydown']

function readSession() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY)) ?? null
  } catch {
    return null
  }
}

export default function AuthProvider({ children }) {
  const [session, setSession] = useState(readSession)
  // Why the last session ended, for the sign-in page (null when the user signed out themselves).
  const [endedBecause, setEndedBecause] = useState(null)

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
    setEndedBecause(null)
    setSession(next)
  }, [])

  const signOut = useCallback((reason = null) => {
    try {
      sessionStorage.removeItem(KEY)
    } catch {
      // nothing stored
    }
    setEndedBecause(reason)
    setSession(null)
  }, [])

  // The server refused the token: expired, or the account was deactivated.
  useEffect(() => {
    const ended = () => signOut('Your session ended. Please sign in again.')
    window.addEventListener(SESSION_ENDED, ended)
    return () => window.removeEventListener(SESSION_ENDED, ended)
  }, [signOut])

  // Idle timeout while signed in.
  useEffect(() => {
    if (!session) return undefined
    let last = Date.now()
    const touch = () => { last = Date.now() }
    ACTIVITY.forEach((name) => window.addEventListener(name, touch))
    const timer = setInterval(() => {
      if (Date.now() - last > IDLE_MINUTES * 60000) signOut(`You were signed out after ${IDLE_MINUTES} minutes without activity.`)
    }, 30000)
    return () => {
      clearInterval(timer)
      ACTIVITY.forEach((name) => window.removeEventListener(name, touch))
    }
  }, [session, signOut])

  const value = useMemo(
    () => ({ token: session?.token ?? null, user: session?.user ?? null, endedBecause, signIn, signOut }),
    [session, endedBecause, signIn, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
