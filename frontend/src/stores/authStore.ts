import { create } from 'zustand'
import type { User } from '@/types'
import { usersApi, authApi } from '@/lib/api'

interface AuthStore {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (accessToken: string, refreshToken: string) => Promise<void>
  logout: () => void
  setUser: (user: User) => void
  initialize: () => Promise<void>
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  accessToken: localStorage.getItem('evently_access_token'),
  refreshToken: localStorage.getItem('evently_refresh_token'),
  isAuthenticated: Boolean(localStorage.getItem('evently_access_token')),
  isLoading: true,

  login: async (accessToken: string, refreshToken: string) => {
    localStorage.setItem('evently_access_token', accessToken)
    localStorage.setItem('evently_refresh_token', refreshToken)

    set({
      accessToken,
      refreshToken,
      isAuthenticated: true,
      isLoading: true,
    })

    try {
      const user = await usersApi.getMe()
      set({ user, isLoading: false })
    } catch (err) {
      console.error('Failed to load user profile on login:', err)
      set({ isLoading: false })
      throw err
    }
  },

  logout: () => {
    authApi.logout().catch(() => {})
    localStorage.removeItem('evently_access_token')
    localStorage.removeItem('evently_refresh_token')
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
    })
  },

  setUser: (user: User) => {
    set({ user })
  },

  initialize: async () => {
    const token = localStorage.getItem('evently_access_token')
    const refreshToken = localStorage.getItem('evently_refresh_token')

    if (!token) {
      set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        isLoading: false,
      })
      return
    }

    set({
      accessToken: token,
      refreshToken,
      isAuthenticated: true,
      isLoading: true,
    })

    try {
      const user = await usersApi.getMe()
      set({ user, isLoading: false })
    } catch (err) {
      console.warn('Initial session restore failed, clearing credentials:', err)
      get().logout()
    }
  },
}))
