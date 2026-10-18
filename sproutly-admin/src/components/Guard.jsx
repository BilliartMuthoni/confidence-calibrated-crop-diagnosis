import { Navigate, useLocation } from 'react-router'

import { useAuth } from '../auth/context.js'

// Signed-out visitors go to the login page; a page outside the user's role sends them to
// their own start page. The backend checks the role on every request as well.
export default function Guard({ roles, children }) {
  const { user } = useAuth()
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (roles && !roles.includes(user.role)) return <Navigate to={user.role === 'admin' ? '/' : '/referrals'} replace />
  return children
}
