export type UserRole = 'ADMIN' | 'ORGANIZER' | 'ATTENDEE'
export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'SOLD_OUT' | 'CANCELLED' | 'COMPLETED'
export type EventCategory =
  | 'CONCERT'
  | 'FESTIVAL'
  | 'CONFERENCE'
  | 'WORKSHOP'
  | 'SPORTS'
  | 'CULTURAL'
  | 'OTHER'
export type LayoutType = 'SEATED' | 'GENERAL_ADMISSION'
export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'REFUNDED'
export type TicketStatus = 'ACTIVE' | 'USED' | 'CANCELLED'
export type OrganizerRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface User {
  id: string
  email: string
  username: string
  full_name: string
  avatar_url?: string | null
  role: UserRole
  is_active: boolean
  created_at: string
}

export interface TicketTier {
  id: string
  event_id: string
  name: string
  description?: string | null
  price: number
  total_quantity: number
  available_quantity: number
  max_per_user: number
  is_active: boolean
}

export interface VenueSection {
  id: string
  venue_id: string
  name: string
  rows: number
  seats_per_row: number
}

export interface Venue {
  id: string
  name: string
  address: string
  city: string
  total_capacity: number
  layout_type: LayoutType
  description?: string | null
  created_by?: string
  sections?: VenueSection[]
}

export interface Event {
  id: string
  title: string
  description: string
  category: EventCategory
  organizer_id: string
  venue_id: string
  banner_url?: string | null
  start_datetime: string
  end_datetime: string
  registration_start?: string | null
  registration_end?: string | null
  status: EventStatus
  is_seated: boolean
  created_at: string
  // Optional enriched relations
  venue?: Venue
  organizer?: User
  ticket_tiers?: TicketTier[]
  min_price?: number
  max_price?: number
  tickets_sold?: number
}

export interface OrganizerRequest {
  id: string
  user_id: string
  reason: string
  status: OrganizerRequestStatus
  reviewed_by?: string | null
  reviewed_at?: string | null
  created_at: string
  user?: User
}

export interface Ticket {
  id: string
  event_id: string
  tier_id: string
  seat_id?: string | null
  qr_code: string
  status: TicketStatus
  checked_in_at?: string | null
  event?: Event
  tier?: TicketTier
}

export interface Booking {
  id: string
  user_id: string
  event_id: string
  total_amount: number
  status: BookingStatus
  created_at: string
  tickets?: Ticket[]
  event?: Event
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  limit: number
}

// Auth DTOs
export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  full_name: string
  email: string
  username: string
  password: string
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  token_type?: string
  user?: User
}

// Event DTOs
export interface CreateEventRequest {
  title: string
  description: string
  category: EventCategory
  venue_id: string
  banner_url?: string
  start_datetime: string
  end_datetime: string
  registration_start?: string
  registration_end?: string
  is_seated: boolean
  ticket_tiers?: Array<{
    name: string
    description?: string
    price: number
    total_quantity: number
    max_per_user: number
  }>
}

export interface UpdateEventRequest extends Partial<CreateEventRequest> {
  status?: EventStatus
}

export interface CreateTierRequest {
  name: string
  description?: string
  price: number
  total_quantity: number
  max_per_user: number
}

export interface UpdateTierRequest extends Partial<CreateTierRequest> {
  is_active?: boolean
}

// Venue DTOs
export interface CreateVenueRequest {
  name: string
  address: string
  city: string
  total_capacity: number
  layout_type: LayoutType
  description?: string
  sections?: Array<{
    name: string
    rows: number
    seats_per_row: number
  }>
}

export interface UpdateVenueRequest extends Partial<CreateVenueRequest> {}

export interface EventFilterParams {
  search?: string
  category?: EventCategory | 'ALL'
  status?: EventStatus
  venue_id?: string
  page?: number
  limit?: number
  sort?: 'upcoming' | 'newest' | 'price_asc' | 'price_desc'
}
