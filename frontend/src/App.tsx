import { Suspense, lazy } from 'react'
import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { Skeleton } from '@/components/ui/skeleton'

// Public & Auth Pages
const EventListPage = lazy(() =>
  import('@/pages/events/EventListPage').then((m) => ({ default: m.EventListPage }))
)
const EventDetailPage = lazy(() =>
  import('@/pages/events/EventDetailPage').then((m) => ({ default: m.EventDetailPage }))
)
const LoginPage = lazy(() =>
  import('@/pages/auth/LoginPage').then((m) => ({ default: m.LoginPage }))
)
const RegisterPage = lazy(() =>
  import('@/pages/auth/RegisterPage').then((m) => ({ default: m.RegisterPage }))
)
const GoogleCallbackPage = lazy(() =>
  import('@/pages/auth/GoogleCallbackPage').then((m) => ({ default: m.GoogleCallbackPage }))
)

// Attendee Pages
const MyTicketsPage = lazy(() =>
  import('@/pages/tickets/MyTicketsPage').then((m) => ({ default: m.MyTicketsPage }))
)
const ProfilePage = lazy(() =>
  import('@/pages/profile/ProfilePage').then((m) => ({ default: m.ProfilePage }))
)

// Organizer Pages
const OrganizerEventsPage = lazy(() =>
  import('@/pages/organizer/OrganizerEventsPage').then((m) => ({ default: m.OrganizerEventsPage }))
)
const CreateEventPage = lazy(() =>
  import('@/pages/organizer/CreateEventPage').then((m) => ({ default: m.CreateEventPage }))
)
const EditEventPage = lazy(() =>
  import('@/pages/organizer/EditEventPage').then((m) => ({ default: m.EditEventPage }))
)
const EventAnalyticsPage = lazy(() =>
  import('@/pages/organizer/EventAnalyticsPage').then((m) => ({ default: m.EventAnalyticsPage }))
)
const VenuesPage = lazy(() =>
  import('@/pages/organizer/VenuesPage').then((m) => ({ default: m.VenuesPage }))
)
const CreateVenuePage = lazy(() =>
  import('@/pages/organizer/CreateVenuePage').then((m) => ({ default: m.CreateVenuePage }))
)

// Admin Pages
const AdminDashboard = lazy(() =>
  import('@/pages/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard }))
)
const OrganizerRequestsPage = lazy(() =>
  import('@/pages/admin/OrganizerRequestsPage').then((m) => ({ default: m.OrganizerRequestsPage }))
)
const AdminUsersPage = lazy(() =>
  import('@/pages/admin/AdminUsersPage').then((m) => ({ default: m.AdminUsersPage }))
)

function PageLoader() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl space-y-6">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-48 w-full rounded-xl" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
      </div>
    </div>
  )
}

function RootLayout() {
  return (
    <Layout>
      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
    </Layout>
  )
}

function NotFoundPage() {
  return (
    <div className="container mx-auto px-4 py-24 text-center max-w-md space-y-4">
      <h1 className="text-6xl font-extrabold text-primary">404</h1>
      <h2 className="text-2xl font-bold">Page Not Found</h2>
      <p className="text-muted-foreground text-sm">
        The page you are looking for does not exist or has been moved.
      </p>
      <a href="/" className="inline-block mt-4 text-sm font-semibold text-primary hover:underline">
        Return to Home
      </a>
    </div>
  )
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      // Public routes
      {
        index: true,
        element: <EventListPage />,
      },
      {
        path: 'events/:id',
        element: <EventDetailPage />,
      },
      {
        path: 'auth/login',
        element: <LoginPage />,
      },
      {
        path: 'auth/register',
        element: <RegisterPage />,
      },
      {
        path: 'auth/callback',
        element: <GoogleCallbackPage />,
      },

      // Authenticated User routes
      {
        path: 'tickets',
        element: (
          <ProtectedRoute>
            <MyTicketsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'profile',
        element: (
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        ),
      },

      // Organizer routes
      {
        path: 'organizer/events',
        element: (
          <ProtectedRoute requiredRole={['ORGANIZER', 'ADMIN']}>
            <OrganizerEventsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'organizer/events/create',
        element: (
          <ProtectedRoute requiredRole={['ORGANIZER', 'ADMIN']}>
            <CreateEventPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'organizer/events/:id/edit',
        element: (
          <ProtectedRoute requiredRole={['ORGANIZER', 'ADMIN']}>
            <EditEventPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'organizer/events/:id/analytics',
        element: (
          <ProtectedRoute requiredRole={['ORGANIZER', 'ADMIN']}>
            <EventAnalyticsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'organizer/venues',
        element: (
          <ProtectedRoute requiredRole={['ORGANIZER', 'ADMIN']}>
            <VenuesPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'organizer/venues/create',
        element: (
          <ProtectedRoute requiredRole={['ORGANIZER', 'ADMIN']}>
            <CreateVenuePage />
          </ProtectedRoute>
        ),
      },

      // Admin routes
      {
        path: 'admin',
        element: (
          <ProtectedRoute requiredRole="ADMIN">
            <AdminDashboard />
          </ProtectedRoute>
        ),
      },
      {
        path: 'admin/organizer-requests',
        element: (
          <ProtectedRoute requiredRole="ADMIN">
            <OrganizerRequestsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'admin/users',
        element: (
          <ProtectedRoute requiredRole="ADMIN">
            <AdminUsersPage />
          </ProtectedRoute>
        ),
      },

      // Catch-all
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
])

export function App() {
  return <RouterProvider router={router} />
}
