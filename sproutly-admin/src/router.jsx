import { createBrowserRouter } from 'react-router'

import AppLayout from './components/AppLayout.jsx'
import Guard from './components/Guard.jsx'
import AccountPage from './pages/AccountPage.jsx'
import AdvicePage from './pages/AdvicePage.jsx'
import AuditPage from './pages/AuditPage.jsx'
import ContactsPage from './pages/ContactsPage.jsx'
import DeleteAccountPage from './pages/DeleteAccountPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import ModelSettingsPage from './pages/ModelSettingsPage.jsx'
import NotFoundPage from './pages/NotFoundPage.jsx'
import OverviewPage from './pages/OverviewPage.jsx'
import PrivacyPage from './pages/PrivacyPage.jsx'
import ReferralDetailPage from './pages/ReferralDetailPage.jsx'
import ReferralsPage from './pages/ReferralsPage.jsx'
import SetPasswordPage from './pages/SetPasswordPage.jsx'
import UsersPage from './pages/UsersPage.jsx'

const ADMIN = ['admin']
const STAFF = ['admin', 'officer']

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/set-password', element: <SetPasswordPage /> },
  // Public, no sign-in: the links Google Play asks for.
  { path: '/privacy', element: <PrivacyPage /> },
  { path: '/delete-account', element: <DeleteAccountPage /> },
  {
    element: <Guard roles={STAFF}><AppLayout /></Guard>,
    children: [
      { index: true, element: <Guard roles={ADMIN}><OverviewPage /></Guard> },
      { path: 'referrals', element: <ReferralsPage /> },
      { path: 'referrals/:id', element: <ReferralDetailPage /> },
      { path: 'contacts', element: <ContactsPage /> },
      { path: 'users', element: <Guard roles={ADMIN}><UsersPage /></Guard> },
      { path: 'advice', element: <AdvicePage /> },
      { path: 'model', element: <Guard roles={ADMIN}><ModelSettingsPage /></Guard> },
      { path: 'audit', element: <Guard roles={ADMIN}><AuditPage /></Guard> },
      { path: 'account', element: <AccountPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
