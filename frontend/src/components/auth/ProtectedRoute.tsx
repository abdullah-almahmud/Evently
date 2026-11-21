import { ReactNode, useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { UserRole } from '@/types'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'

interface ProtectedRouteProps {
  children: ReactNode
  requiredRole?: UserRole | UserRole[]
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  useEffect(() => {
    if (!isLoading && isAuthenticated && requiredRole && user) {
      const allowedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
      if (!allowedRoles.includes(user.role)) {
        toast.error('Access denied: You do not have permission to view this page.')
      }
    }
  }, [isLoading, isAuthenticated, requiredRole, user])

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

  if (requiredRole && user) {
    const allowedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
    if (!allowedRoles.includes(user.role)) {
      return <Navigate to="/" replace />
    }
  }

  return <>{children}</>
}
