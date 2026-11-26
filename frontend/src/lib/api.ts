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
  VolunteerApplication,
  EventStaff,
  CreateBookingRequest,
  CheckInResult,
  CheckInStats,
  CheckInTicketItem,
  AdminOverview,
  UserRole,
  EventSeatsResponse,
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
    const res = await api.post<OrganizerRequest>('/users/me/organizer-request', { reason })
    return res.data
  },

  getMyOrganizerRequest: async (): Promise<OrganizerRequest | null> => {
    try {
      const res = await api.get<OrganizerRequest>('/users/me/organizer-request')
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

  // Seats layout & generation
  getSeats: async (eventId: string): Promise<EventSeatsResponse> => {
    const res = await api.get<EventSeatsResponse>(`/events/${eventId}/seats`)
    return res.data
  },

  generateSeats: async (eventId: string): Promise<EventSeatsResponse> => {
    const res = await api.post<EventSeatsResponse>(`/events/${eventId}/seats/generate`)
    return res.data
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
  getOverview: async (): Promise<AdminOverview> => {
    const res = await api.get<AdminOverview>('/admin/overview')
    return res.data
  },

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
    const res = await api.put<OrganizerRequest>(`/admin/organizer-requests/${requestId}`, {
      status,
    })
    return res.data
  },

  listUsers: async (): Promise<User[]> => {
    const res = await api.get<User[]>('/admin/users')
    return res.data
  },

  updateUserRole: async (userId: string, role: UserRole): Promise<User> => {
    const res = await api.put<User>(`/admin/users/${userId}/role`, { role })
    return res.data
  },

  toggleUserActive: async (userId: string): Promise<User> => {
    const res = await api.put<User>(`/admin/users/${userId}/toggle-active`)
    return res.data
  },

  listAllEvents: async (): Promise<Event[]> => {
    const res = await api.get<Event[]>('/admin/events')
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
  create: async (data: CreateBookingRequest): Promise<Booking> => {
    const res = await api.post<Booking>('/bookings/', data)
    return res.data
  },

  getMyBookings: async (): Promise<Booking[]> => {
    const res = await api.get<Booking[]>('/bookings/my-bookings')
    return res.data
  },

  getBooking: async (id: string): Promise<Booking> => {
    const res = await api.get<Booking>(`/bookings/${id}`)
    return res.data
  },

  cancel: async (id: string): Promise<void> => {
    await api.post(`/bookings/${id}/cancel`)
  },

  getEventBookings: async (eventId: string): Promise<Booking[]> => {
    const res = await api.get<Booking[]>(`/bookings/event/${eventId}`)
    return res.data
  },
}

export const volunteerApi = {
  apply: async (eventId: string, motivation: string): Promise<VolunteerApplication> => {
    const res = await api.post<VolunteerApplication>(`/events/${eventId}/volunteer-apply`, {
      motivation,
    })
    return res.data
  },

  getMyStatus: async (eventId: string): Promise<VolunteerApplication | null> => {
    try {
      const res = await api.get<VolunteerApplication>(`/events/${eventId}/my-volunteer-status`)
      return res.data
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        return null
      }
      throw err
    }
  },

  listApplications: async (eventId: string): Promise<VolunteerApplication[]> => {
    const res = await api.get<VolunteerApplication[]>(`/events/${eventId}/volunteer-applications`)
    return res.data
  },

  review: async (
    eventId: string,
    appId: string,
    status: 'APPROVED' | 'REJECTED'
  ): Promise<VolunteerApplication> => {
    const res = await api.post<VolunteerApplication>(
      `/events/${eventId}/volunteer-applications/${appId}/review`,
      { status }
    )
    return res.data
  },
}

export const staffApi = {
  listEventStaff: async (eventId: string): Promise<EventStaff[]> => {
    const res = await api.get<EventStaff[]>(`/events/${eventId}/staff`)
    return res.data
  },

  removeStaff: async (eventId: string, staffId: string): Promise<void> => {
    await api.delete(`/events/${eventId}/staff/${staffId}`)
  },

  getMyEvents: async (): Promise<Event[]> => {
    const res = await api.get<Event[]>('/staff/my-events')
    return res.data
  },
}

export const checkinApi = {
  validate: async (qrCode: string): Promise<CheckInResult> => {
    const res = await api.post<CheckInResult>('/checkin/validate', { qr_code: qrCode })
    return res.data
  },

  getStats: async (eventId: string): Promise<CheckInStats> => {
    const res = await api.get<CheckInStats>(`/checkin/event/${eventId}/stats`)
    return res.data
  },

  getTicketList: async (eventId: string): Promise<CheckInTicketItem[]> => {
    const res = await api.get<CheckInTicketItem[]>(`/checkin/event/${eventId}/tickets`)
    return res.data
  },
}
