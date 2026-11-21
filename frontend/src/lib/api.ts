import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import type {
  User,
  Event,
  TicketTier,
  Venue,
  VenueSection,
  OrganizerRequest,
  OrganizerRequestStatus,
  Ticket,
  Booking,
  PaginatedResponse,
  LoginRequest,
  RegisterRequest,
  AuthTokens,
  CreateEventRequest,
  UpdateEventRequest,
  CreateTierRequest,
  UpdateTierRequest,
  CreateVenueRequest,
  UpdateVenueRequest,
  EventFilterParams,
} from '@/types'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to attach JWT access token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('evently_access_token')
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor with auto refresh on 401
let isRefreshing = false
let failedQueue: Array<{
  resolve: (value?: unknown) => void
  reject: (reason?: unknown) => void
}> = []

const processQueue = (error: AxiosError | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token)
    }
  })
  failedQueue = []
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    // If 401 and not already retried
    if (error.response?.status === 401 && !originalRequest._retry) {
      const refreshToken = localStorage.getItem('evently_refresh_token')

      // Avoid infinite loop on auth endpoints
      if (
        originalRequest.url?.includes('/auth/login') ||
        originalRequest.url?.includes('/auth/refresh') ||
        !refreshToken
      ) {
        localStorage.removeItem('evently_access_token')
        localStorage.removeItem('evently_refresh_token')
        return Promise.reject(error)
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`
            }
            return api(originalRequest)
          })
          .catch((err) => Promise.reject(err))
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const response = await axios.post<AuthTokens>(`${API_BASE_URL}/auth/refresh`, {
          refresh_token: refreshToken,
        })

        const newAccessToken = response.data.access_token
        const newRefreshToken = response.data.refresh_token || refreshToken

        localStorage.setItem('evently_access_token', newAccessToken)
        localStorage.setItem('evently_refresh_token', newRefreshToken)

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
        }

        processQueue(null, newAccessToken)
        return api(originalRequest)
      } catch (refreshErr) {
        processQueue(refreshErr as AxiosError, null)
        localStorage.removeItem('evently_access_token')
        localStorage.removeItem('evently_refresh_token')

        // Redirect to login if in browser environment and not already on auth page
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/auth/')) {
          window.location.href = `/auth/login?redirect=${encodeURIComponent(
            window.location.pathname + window.location.search
          )}`
        }

        return Promise.reject(refreshErr)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)

/* ==========================================================================
   API Modules
   ========================================================================== */

export const authApi = {
  login: async (credentials: LoginRequest): Promise<AuthTokens> => {
    const res = await api.post<AuthTokens>('/auth/login', credentials)
    return res.data
  },

  register: async (userData: RegisterRequest): Promise<User> => {
    const res = await api.post<User>('/auth/register', userData)
    return res.data
  },

  refresh: async (refreshToken: string): Promise<AuthTokens> => {
    const res = await api.post<AuthTokens>('/auth/refresh', { refresh_token: refreshToken })
    return res.data
  },

  logout: async (): Promise<void> => {
    try {
      await api.post('/auth/logout')
    } catch {
      // Ignore network errors on logout
    } finally {
      localStorage.removeItem('evently_access_token')
      localStorage.removeItem('evently_refresh_token')
    }
  },

  getGoogleAuthUrl: (): string => {
    return `${API_BASE_URL}/auth/google`
  },
}

export const usersApi = {
  getMe: async (): Promise<User> => {
    const res = await api.get<User>('/users/me')
    return res.data
  },

  updateMe: async (data: Partial<Pick<User, 'full_name' | 'avatar_url'>>): Promise<User> => {
    const res = await api.patch<User>('/users/me', data)
    return res.data
  },

  submitOrganizerRequest: async (reason: string): Promise<OrganizerRequest> => {
    const res = await api.post<OrganizerRequest>('/users/organizer-request', { reason })
    return res.data
  },

  getMyOrganizerRequest: async (): Promise<OrganizerRequest | null> => {
    try {
      const res = await api.get<OrganizerRequest>('/users/organizer-request/me')
      return res.data
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        return null
      }
      throw err
    }
  },
}

export const eventsApi = {
  listEvents: async (params?: EventFilterParams): Promise<PaginatedResponse<Event>> => {
    const res = await api.get<PaginatedResponse<Event>>('/events', { params })
    return res.data
  },

  getEvent: async (id: string): Promise<Event> => {
    const res = await api.get<Event>(`/events/${id}`)
    return res.data
  },

  createEvent: async (data: CreateEventRequest): Promise<Event> => {
    const res = await api.post<Event>('/events', data)
    return res.data
  },

  updateEvent: async (id: string, data: UpdateEventRequest): Promise<Event> => {
    const res = await api.patch<Event>(`/events/${id}`, data)
    return res.data
  },

  deleteEvent: async (id: string): Promise<void> => {
    await api.delete(`/events/${id}`)
  },

  publishEvent: async (id: string): Promise<Event> => {
    const res = await api.post<Event>(`/events/${id}/publish`)
    return res.data
  },

  getMyEvents: async (): Promise<Event[]> => {
    const res = await api.get<Event[]>('/events/my-events')
    return res.data
  },

  // Ticket Tiers for events
  getEventTiers: async (eventId: string): Promise<TicketTier[]> => {
    const res = await api.get<TicketTier[]>(`/events/${eventId}/tiers`)
    return res.data
  },

  createTier: async (eventId: string, data: CreateTierRequest): Promise<TicketTier> => {
    const res = await api.post<TicketTier>(`/events/${eventId}/tiers`, data)
    return res.data
  },

  updateTier: async (eventId: string, tierId: string, data: UpdateTierRequest): Promise<TicketTier> => {
    const res = await api.patch<TicketTier>(`/events/${eventId}/tiers/${tierId}`, data)
    return res.data
  },

  deleteTier: async (eventId: string, tierId: string): Promise<void> => {
    await api.delete(`/events/${eventId}/tiers/${tierId}`)
  },
}

export const venuesApi = {
  listVenues: async (): Promise<Venue[]> => {
    const res = await api.get<Venue[]>('/venues')
    return res.data
  },

  getVenue: async (id: string): Promise<Venue> => {
    const res = await api.get<Venue>(`/venues/${id}`)
    return res.data
  },

  createVenue: async (data: CreateVenueRequest): Promise<Venue> => {
    const res = await api.post<Venue>('/venues', data)
    return res.data
  },

  updateVenue: async (id: string, data: UpdateVenueRequest): Promise<Venue> => {
    const res = await api.patch<Venue>(`/venues/${id}`, data)
    return res.data
  },

  createSection: async (
    venueId: string,
    data: Omit<VenueSection, 'id' | 'venue_id'>
  ): Promise<VenueSection> => {
    const res = await api.post<VenueSection>(`/venues/${venueId}/sections`, data)
    return res.data
  },

  deleteSection: async (venueId: string, sectionId: string): Promise<void> => {
    await api.delete(`/venues/${venueId}/sections/${sectionId}`)
  },
}

export const adminApi = {
  listOrganizerRequests: async (status?: OrganizerRequestStatus): Promise<OrganizerRequest[]> => {
    const res = await api.get<OrganizerRequest[]>('/admin/organizer-requests', {
      params: status ? { status } : undefined,
    })
    return res.data
  },

  reviewOrganizerRequest: async (
    requestId: string,
    status: 'APPROVED' | 'REJECTED'
  ): Promise<OrganizerRequest> => {
    const res = await api.post<OrganizerRequest>(`/admin/organizer-requests/${requestId}/review`, {
      status,
    })
    return res.data
  },

  listUsers: async (): Promise<User[]> => {
    const res = await api.get<User[]>('/admin/users')
    return res.data
  },
}

export const ticketsApi = {
  getMyTickets: async (): Promise<Ticket[]> => {
    const res = await api.get<Ticket[]>('/tickets/my-tickets')
    return res.data
  },
}

export const bookingsApi = {
  createBooking: async (data: {
    event_id: string
    tier_id: string
    quantity: number
  }): Promise<Booking> => {
    const res = await api.post<Booking>('/bookings', data)
    return res.data
  },
}
