import { useAuthStore } from '@/stores/authStore'

export function useAuth() {
  const { user, isAuthenticated, isLoading, login, logout, setUser, initialize } = useAuthStore()

  const isOrganizer = user?.role === 'ORGANIZER' || user?.role === 'ADMIN'
  const isAdmin = user?.role === 'ADMIN'
  const isAttendee = user?.role === 'ATTENDEE'

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
  }
}
