import { useAuthStore } from '@/stores/authStore'

export function useAuth() {
  const { user, isAuthenticated, isLoading, login, logout, setUser, initialize } = useAuthStore()

  const isOrganizer = user?.role === 'ORGANIZER'
  const isAdmin = user?.role === 'ADMIN'
  const isAttendee = user?.role === 'ATTENDEE'
  const isStaff = Boolean(user?.is_staff)
  const canManageEvents = user?.role === 'ORGANIZER' || user?.role === 'ADMIN'
  const canAccessStaffPortal = Boolean(user?.is_staff) || user?.role === 'ORGANIZER' || user?.role === 'ADMIN'
  const canBookTickets = Boolean(user) && user?.role !== 'ADMIN'

  return {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    setUser,
    initialize,
    isOrganizer,
    isAdmin,
    isAttendee,
    isStaff,
    canManageEvents,
    canAccessStaffPortal,
    canBookTickets,
  }
}
