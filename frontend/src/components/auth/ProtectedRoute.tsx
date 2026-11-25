import { ReactNode, useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { UserRole } from '@/types'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'

interface ProtectedRouteProps {
  children: ReactNode
  requiredRole?: UserRole | UserRole[]
  disallowedRole?: UserRole | UserRole[]
  requireStaff?: boolean
}

export function ProtectedRoute({
  children,
  requiredRole,
  disallowedRole,
  requireStaff = false,
}: ProtectedRouteProps) {
  const { user, isAuthenticated, isLoading, canAccessStaffPortal } = useAuth()
  const location = useLocation()

  const isRoleBlocked = (() => {
    if (!user) return false
    if (requiredRole) {
      const allowedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
      if (!allowedRoles.includes(user.role)) return true
    }
    if (disallowedRole) {
      const blockedRoles = Array.isArray(disallowedRole) ? disallowedRole : [disallowedRole]
      if (blockedRoles.includes(user.role)) return true
    }
    if (requireStaff && !canAccessStaffPortal) {
      return true
    }
    return false
  })()

  useEffect(() => {
    if (!isLoading && isAuthenticated && user && isRoleBlocked) {
      if (requireStaff && !canAccessStaffPortal) {
        toast.error('Access denied: Only approved event volunteers/staff can access the Staff Portal.')
      } else if (disallowedRole && user.role === 'ADMIN') {
        toast.info('Administrators use the Admin Console instead of personal attendee bookings.')
      } else {
        toast.error('Access denied: You do not have permission to view this page.')
      }
    }
  }, [isLoading, isAuthenticated, user, isRoleBlocked, requireStaff, canAccessStaffPortal, disallowedRole])

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-4xl space-y-6">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-48 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to={`/auth/login?redirect=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    )
  }

  if (isRoleBlocked) {
    if (user?.role === 'ADMIN' && disallowedRole) {
      return <Navigate to="/admin" replace />
    }
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
