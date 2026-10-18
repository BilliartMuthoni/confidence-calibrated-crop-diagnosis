import { createBrowserRouter } from 'react-router'

import AppLayout from './components/AppLayout.jsx'
import Guard from './components/Guard.jsx'
import AdvicePage from './pages/AdvicePage.jsx'
import ContactsPage from './pages/ContactsPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import ModelSettingsPage from './pages/ModelSettingsPage.jsx'
import NotFoundPage from './pages/NotFoundPage.jsx'
import OverviewPage from './pages/OverviewPage.jsx'
import ReferralDetailPage from './pages/ReferralDetailPage.jsx'
import ReferralsPage from './pages/ReferralsPage.jsx'
import UsersPage from './pages/UsersPage.jsx'

const ADMIN = ['admin']
const STAFF = ['admin', 'officer']

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
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
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
