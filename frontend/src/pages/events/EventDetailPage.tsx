import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  Calendar,
  MapPin,
  Share2,
  Ticket,
  ChevronLeft,
  Users,
  CheckCircle2,
  Clock,
  Minus,
  Plus,
  ShieldCheck,
  HeartHandshake,
  Loader2,
  ExternalLink,
  Armchair,
  RefreshCw,
  CreditCard,
} from 'lucide-react'
import { Event, TicketTier, VolunteerApplication, Booking, Seat, EventSeatsResponse } from '@/types'
import { eventsApi, bookingsApi, paymentsApi, volunteerApi, getEventWebSocketUrl } from '@/lib/api'
import { SeatMap } from '@/components/events/SeatMap'
import { formatDateRange, formatCurrency, cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

function parseUtcMs(iso: string): number {
  const normalized = /[zZ]$|[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso}Z`
  return Date.parse(normalized)
}

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, isAuthenticated, isAdmin } = useAuth()

  const [event, setEvent] = useState<Event | null>(null)
  const [tiers, setTiers] = useState<TicketTier[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Booking state
  const [selectedQuantities, setSelectedQuantities] = useState<Record<string, number>>({})
  const [selectedSeats, setSelectedSeats] = useState<Seat[]>([])
  const [eventSeats, setEventSeats] = useState<EventSeatsResponse | null>(null)
  const [isGeneratingSeats, setIsGeneratingSeats] = useState(false)
  const [pendingSeatId, setPendingSeatId] = useState<string | null>(null)
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null)
  const [serverOffsetMs, setServerOffsetMs] = useState<number>(0)
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null)
  const [isBooking, setIsBooking] = useState(false)
  const [isPaying, setIsPaying] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('bKash (Sandbox)')
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null)
  const [bookingSuccessModalOpen, setBookingSuccessModalOpen] = useState(false)

  // Volunteer state
  const [volunteerApp, setVolunteerApp] = useState<VolunteerApplication | null>(null)
  const [volunteerModalOpen, setVolunteerModalOpen] = useState(false)
  const [volunteerMotivation, setVolunteerMotivation] = useState('')
  const [isSubmittingVolunteer, setIsSubmittingVolunteer] = useState(false)

  const isFetchingSeatsRef = useRef(false)
  const pendingSeatRef = useRef<string | null>(null)
  pendingSeatRef.current = pendingSeatId

  const isOrganizerOfThisEvent = Boolean(user && event && user.id === event.organizer_id)
  const canManageThisEvent = Boolean(isOrganizerOfThisEvent || isAdmin)
  const canBookThisEvent = !isAdmin && !isOrganizerOfThisEvent

  const isSeated = Boolean(event?.is_seated)
  const seatHoldEnabled = Boolean(event?.is_seated && (eventSeats?.seat_hold_enabled ?? event?.seat_hold_enabled))

  const applySeatsSnapshot = useCallback((seatsData: EventSeatsResponse) => {
    setEventSeats(seatsData)
    if (seatsData.server_time) {
      setServerOffsetMs(parseUtcMs(seatsData.server_time) - Date.now())
    }

    const allSeatsMap = new Map<string, Seat>()
    seatsData.sections.forEach((sec) => sec.seats.forEach((s) => allSeatsMap.set(s.id, s)))

    if (seatsData.seat_hold_enabled) {
      // Server-authoritative holds: synchronize active holds owned by current user
      const myHeldSeats: Seat[] = []
      allSeatsMap.forEach((s) => {
        if (s.status === 'HELD' && s.held_by_me) {
          myHeldSeats.push(s)
        }
      })
      setSelectedSeats(myHeldSeats)
      setHoldExpiresAt(myHeldSeats.length > 0 ? seatsData.my_hold_expires_at || null : null)
    } else {
      // Standard mode: drop any locally selected seat if another user just booked it
      setSelectedSeats((prev) => {
        const filtered = prev.filter((sel) => {
          const fresh = allSeatsMap.get(sel.id)
          return fresh && fresh.status !== 'RESERVED'
        })
        if (filtered.length < prev.length) {
          toast.warning('One or more seats you selected were just booked and have been unselected.')
        }
        return filtered
      })
    }
  }, [])

  const patchSeatStatusesInState = useCallback(
    (
      updates: Array<{
        id: string
        status: 'AVAILABLE' | 'HELD' | 'RESERVED'
        holder_id?: string | null
        hold_expires_at?: string | null
      }>
    ) => {
      if (!updates.length) return
      const updateMap = new Map(updates.map((u) => [u.id, u]))

      setEventSeats((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          sections: prev.sections.map((sec) => ({
            ...sec,
            seats: sec.seats.map((s) => {
              const u = updateMap.get(s.id)
              if (!u) return s
              return {
                ...s,
                status: u.status,
                held_by_me: u.status === 'HELD' && Boolean(user?.id && u.holder_id === user.id),
                hold_expires_at: u.hold_expires_at ?? null,
              }
            }),
          })),
        }
      })

      // Drop any locally selected seats if someone else booked/held them
      setSelectedSeats((prev) =>
        prev.filter((sel) => {
          const u = updateMap.get(sel.id)
          if (!u) return true
          if (u.status === 'RESERVED') return false
          if (u.status === 'HELD' && u.holder_id && u.holder_id !== user?.id) return false
          return true
        })
      )
    },
    [user?.id]
  )

  const refreshSeatsSilently = useCallback(async () => {
    if (!id || !event?.is_seated || isFetchingSeatsRef.current) return
    try {
      isFetchingSeatsRef.current = true
      const seatsData = await eventsApi.getSeats(id)
      applySeatsSnapshot(seatsData)
    } catch {
      // Silently ignore background sync errors
    } finally {
      isFetchingSeatsRef.current = false
    }
  }, [id, event?.is_seated, applySeatsSnapshot])

  const fetchDetails = async () => {
    if (!id) return
    try {
      setIsLoading(true)

      // Launch event, seat map, and volunteer check in parallel (eliminates sequential waterfall)
      const [eventRes, seatsRes, volunteerRes] = await Promise.allSettled([
        eventsApi.getEvent(id),
        eventsApi.getSeats(id),
        isAuthenticated && user && user.role !== 'ADMIN'
          ? volunteerApi.getMyStatus(id)
          : Promise.resolve(null),
      ])

      if (eventRes.status !== 'fulfilled') {
        throw eventRes.reason
      }

      const eventData = eventRes.value
      setEvent(eventData)

      const eventTiers = eventData.tiers || eventData.ticket_tiers
      if (eventTiers && eventTiers.length > 0) {
        setTiers(eventTiers)
      } else {
        try {
          const tiersData = await eventsApi.getEventTiers(id)
          setTiers(tiersData || [])
        } catch {
          setTiers([])
        }
      }

      if (eventData.is_seated) {
        if (seatsRes.status === 'fulfilled' && seatsRes.value) {
          applySeatsSnapshot(seatsRes.value)
        }
      } else {
        setEventSeats(null)
        setSelectedSeats([])
        setHoldExpiresAt(null)
      }

      if (
        volunteerRes.status === 'fulfilled' &&
        volunteerRes.value &&
        user?.id !== eventData.organizer_id
      ) {
        setVolunteerApp(volunteerRes.value)
      } else {
        setVolunteerApp(null)
      }
    } catch (err) {
      console.error('Failed to load event details:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchDetails()
  }, [id, isAuthenticated])

  // Real-time WebSocket push (<50ms) with auto-reconnect + 20s visible-tab fallback sync
  useEffect(() => {
    if (!id || !event?.is_seated || event.status !== 'PUBLISHED') return

    let ws: WebSocket | null = null
    let pingInterval: number | null = null
    let reconnectTimer: number | null = null
    let closedByCleanup = false

    const connectWebSocket = () => {
      if (closedByCleanup) return
      try {
        ws = new WebSocket(getEventWebSocketUrl(id))
        ws.onopen = () => {
          // Catch any seat holds placed right before socket finished connecting
          refreshSeatsSilently()
          if (pingInterval !== null) window.clearInterval(pingInterval)
          pingInterval = window.setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send('ping')
            }
          }, 25000)
        }
        ws.onmessage = (msg) => {
          try {
            const data = JSON.parse(msg.data)
            if (data?.type === 'seat_update' && Array.isArray(data.seats)) {
              patchSeatStatusesInState(data.seats)
            }
          } catch {
            // Ignore malformed WS payloads
          }
        }
        ws.onerror = () => {
          if (!closedByCleanup) {
            ws?.close()
          }
        }
        ws.onclose = () => {
          if (pingInterval !== null) {
            window.clearInterval(pingInterval)
            pingInterval = null
          }
          if (!closedByCleanup && reconnectTimer === null) {
            reconnectTimer = window.setTimeout(() => {
              reconnectTimer = null
              connectWebSocket()
            }, 3000)
          }
        }
      } catch {
        // Fallback interval handles updates if WebSocket is unavailable
      }
    }

    connectWebSocket()

    const fallbackTimer = window.setInterval(() => {
      if (
        document.visibilityState === 'visible' &&
        !pendingSeatRef.current &&
        !isFetchingSeatsRef.current
      ) {
        refreshSeatsSilently()
      }
    }, 20000)

    return () => {
      closedByCleanup = true
      window.clearInterval(fallbackTimer)
      if (pingInterval !== null) window.clearInterval(pingInterval)
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
      if (ws) {
        ws.close()
      }
    }
  }, [id, event?.is_seated, event?.status, patchSeatStatusesInState, refreshSeatsSilently])

  // Accurate server-synchronized 10-minute hold countdown timer
  useEffect(() => {
    if (!seatHoldEnabled || !holdExpiresAt || selectedSeats.length === 0) {
      setRemainingSeconds(null)
      return
    }

    const computeRemaining = () => {
      const serverNow = Date.now() + serverOffsetMs
      return Math.max(0, Math.floor((parseUtcMs(holdExpiresAt) - serverNow) / 1000))
    }

    const initial = computeRemaining()
    setRemainingSeconds(initial)

    if (initial <= 0) {
      setSelectedSeats([])
      setHoldExpiresAt(null)
      refreshSeatsSilently()
      toast.warning('Your 10-minute seat reservation expired. Seats have been released.')
      return
    }

    const interval = window.setInterval(() => {
      const secs = computeRemaining()
      setRemainingSeconds(secs)
      if (secs <= 0) {
        window.clearInterval(interval)
        setSelectedSeats([])
        setHoldExpiresAt(null)
        refreshSeatsSilently()
        toast.warning('Your 10-minute seat reservation expired. Seats have been released.')
      }
    }, 1000)

    return () => window.clearInterval(interval)
  }, [seatHoldEnabled, holdExpiresAt, selectedSeats.length, serverOffsetMs, refreshSeatsSilently])

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href)
    toast.success('Event link copied to clipboard!')
  }

  const handleQuantityChange = (tierId: string, delta: number, maxAllowed: number) => {
    setSelectedQuantities((prev) => {
      const current = prev[tierId] || 0
      const updated = Math.max(0, Math.min(maxAllowed, current + delta))
      return { ...prev, [tierId]: updated }
    })
  }

  const getSeatTier = (seat: Seat): TicketTier | undefined => {
    if (seat.tier_id) {
      const exact = tiers.find((t) => t.id === seat.tier_id)
      if (exact) return exact
    }
    const sec = eventSeats?.sections.find((s) => s.section_id === seat.section_id)
    if (sec?.tier_id) {
      const secTier = tiers.find((t) => t.id === sec.tier_id)
      if (secTier) return secTier
    }
    return tiers[0]
  }

  const handleSeatToggle = async (seat: Seat) => {
    if (!id || !canBookThisEvent) return

    const isAlreadySelected = selectedSeats.some((s) => s.id === seat.id)

    // Standard mode (no timer): pure local selection until booking confirmation
    if (!seatHoldEnabled) {
      if (isAlreadySelected) {
        setSelectedSeats((prev) => prev.filter((s) => s.id !== seat.id))
      } else {
        if (selectedSeats.length >= 4) {
          toast.warning('You can select a maximum of 4 seats per booking.')
          return
        }
        setSelectedSeats((prev) => [...prev, seat])
      }
      return
    }

    // Competitive Timed Hold Mode
    if (!isAuthenticated) {
      toast.info('Please log in to hold and book seats.')
      navigate(`/auth/login?redirect=/events/${id}`)
      return
    }

    try {
      setPendingSeatId(seat.id)
      if (isAlreadySelected) {
        const res = await eventsApi.releaseSeatHold(id, seat.id)
        if (res.server_time) {
          setServerOffsetMs(parseUtcMs(res.server_time) - Date.now())
        }
        setSelectedSeats((prev) => prev.filter((s) => s.id !== seat.id))
        setHoldExpiresAt(res.active_hold_count > 0 ? res.expires_at || null : null)
        patchSeatStatusesInState([
          { id: seat.id, status: 'AVAILABLE', holder_id: null, hold_expires_at: null },
        ])
      } else {
        if (selectedSeats.length >= 4) {
          toast.warning('You can hold a maximum of 4 seats per booking.')
          return
        }
        const res = await eventsApi.holdSeat(id, seat.id)
        if (res.server_time) {
          setServerOffsetMs(parseUtcMs(res.server_time) - Date.now())
        }
        if (res.expires_at) {
          setHoldExpiresAt(res.expires_at)
        }
        setSelectedSeats((prev) =>
          prev.some((s) => s.id === seat.id) ? prev : [...prev, { ...seat, status: 'HELD', held_by_me: true }]
        )
        patchSeatStatusesInState([
          {
            id: seat.id,
            status: 'HELD',
            holder_id: user?.id || null,
            hold_expires_at: res.expires_at || null,
          },
        ])
      }
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Could not update seat hold.'
      toast.error(errorMsg)
      await refreshSeatsSilently()
    } finally {
      setPendingSeatId(null)
    }
  }

  const handleClearSeats = async () => {
    if (!id) return
    if (!seatHoldEnabled) {
      setSelectedSeats([])
      return
    }
    const prevIds = selectedSeats.map((s) => s.id)
    try {
      await eventsApi.releaseAllSeatHolds(id)
      setSelectedSeats([])
      setHoldExpiresAt(null)
      patchSeatStatusesInState(
        prevIds.map((sid) => ({ id: sid, status: 'AVAILABLE', holder_id: null, hold_expires_at: null }))
      )
    } catch {
      setSelectedSeats([])
      setHoldExpiresAt(null)
    }
  }

  const handleGenerateSeats = async () => {
    if (!id) return
    try {
      setIsGeneratingSeats(true)
      const data = await eventsApi.generateSeats(id)
      applySeatsSnapshot(data)
      toast.success('Full venue seating layout synchronized!')
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Failed to generate seats.'
      toast.error(errorMsg)
    } finally {
      setIsGeneratingSeats(false)
    }
  }

  const totalTicketsSelected = isSeated
    ? selectedSeats.length
    : Object.values(selectedQuantities).reduce((a, b) => a + b, 0)

  const totalCost = isSeated
    ? selectedSeats.reduce((sum, seat) => {
        const t = getSeatTier(seat)
        return sum + Number(t?.price || 0)
      }, 0)
    : tiers.reduce((sum, tier) => {
        const qty = selectedQuantities[tier.id] || 0
        return sum + Number(tier.price) * qty
      }, 0)

  const handleCreateBooking = async () => {
    if (!isAuthenticated) {
      toast.info('Please log in to book tickets.')
      navigate(`/auth/login?redirect=/events/${id}`)
      return
    }

    if (isOrganizerOfThisEvent) {
      toast.error('You are an organizer for this event.')
      return
    }

    let items: Array<{ tier_id: string; quantity: number; seat_id?: string }> = []

    if (isSeated) {
      if (selectedSeats.length === 0) {
        toast.warning('Please select at least one seat before proceeding.')
        return
      }
      items = selectedSeats.map((seat) => {
        const t = getSeatTier(seat)
        return {
          tier_id: t?.id || tiers[0]?.id,
          quantity: 1,
          seat_id: seat.id,
        }
      })
    } else {
      items = Object.entries(selectedQuantities)
        .filter(([_, qty]) => qty > 0)
        .map(([tier_id, quantity]) => ({ tier_id, quantity }))

      if (items.length === 0) {
        toast.warning('Please select at least one ticket before proceeding.')
        return
      }
    }

    try {
      setIsBooking(true)
      const bookedSeatIds = isSeated ? selectedSeats.map((s) => s.id) : []
      const qtyByTier = items.reduce<Record<string, number>>((acc, it) => {
        acc[it.tier_id] = (acc[it.tier_id] || 0) + it.quantity
        return acc
      }, {})

      const booking = await bookingsApi.create({
        event_id: id!,
        items,
      })

      setConfirmedBooking(booking)
      setBookingSuccessModalOpen(true)
      setSelectedQuantities({})
      setSelectedSeats([])
      setHoldExpiresAt(null)
      setTiers((prev) =>
        prev.map((t) =>
          qtyByTier[t.id]
            ? { ...t, available_quantity: Math.max(0, t.available_quantity - qtyByTier[t.id]) }
            : t
        )
      )
      if (bookedSeatIds.length > 0) {
        patchSeatStatusesInState(
          bookedSeatIds.map((sid) => ({ id: sid, status: 'RESERVED', holder_id: null, hold_expires_at: null }))
        )
      }
      toast.success(
        booking.status === 'CONFIRMED'
          ? 'Booking confirmed! Digital tickets issued.'
          : 'Seats reserved! Check your booking in My Bookings.'
      )
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Failed to complete booking. Please try again.'
      toast.error(errorMsg)
      if (isSeated) {
        refreshSeatsSilently()
      }
    } finally {
      setIsBooking(false)
    }
  }

  const handleVolunteerApply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id || !volunteerMotivation.trim()) return

    try {
      setIsSubmittingVolunteer(true)
      const app = await volunteerApi.apply(id, volunteerMotivation.trim())
      setVolunteerApp(app)
      setVolunteerModalOpen(false)
      setVolunteerMotivation('')
      toast.success('Volunteer application submitted! The organizer will review it soon.')
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Failed to submit volunteer application.'
      toast.error(errorMsg)
    } finally {
      setIsSubmittingVolunteer(false)
    }
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-5xl space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="aspect-[21/9] w-full rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-32 w-full" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        </div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="container mx-auto px-4 py-16 text-center max-w-md space-y-4">
        <h2 className="text-2xl font-bold">Event Not Found</h2>
        <p className="text-muted-foreground text-sm">
          The requested event could not be found or has been removed.
        </p>
        <Button asChild>
          <Link to="/">Browse Other Events</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl space-y-8">
      {/* Back button */}
      <div>
        <Button variant="ghost" size="sm" asChild className="gap-1 text-muted-foreground">
          <Link to="/">
            <ChevronLeft className="h-4 w-4" />
            Back to Events
          </Link>
        </Button>
      </div>

      {/* Hero Banner */}
      <div className="relative aspect-[21/9] w-full overflow-hidden rounded-2xl border bg-muted shadow-sm">
        {event.banner_url ? (
          <img
            src={event.banner_url}
            alt={event.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 via-background to-secondary/30">
            <Calendar className="h-16 w-16 text-primary/40" />
          </div>
        )}
        <div className="absolute top-4 right-4 flex gap-2">
          <Badge className="bg-background/80 text-foreground backdrop-blur font-mono text-xs shadow-sm">
            {event.category}
          </Badge>
          <Badge
            variant={event.status === 'PUBLISHED' ? 'default' : 'secondary'}
            className="shadow-sm"
          >
            {event.status}
          </Badge>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Details */}
        <div className="lg:col-span-2 space-y-8">
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
              {event.title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-primary" />
                {formatDateRange(event.start_datetime, event.end_datetime)}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-primary" />
                {event.venue?.name || event.venue_name || 'UIU Campus'}
              </span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={handleShare} className="gap-1.5">
              <Share2 className="h-4 w-4" />
              Share Event
            </Button>
            {canManageThisEvent && (
              <Button variant="outline" size="sm" asChild className="gap-1.5">
                <Link to={`/organizer/events/${event.id}/edit`}>
                  Manage Event
                </Link>
              </Button>
            )}
          </div>

          {/* Description */}
          <div className="space-y-3">
            <h3 className="text-xl font-bold tracking-tight">About this Event</h3>
            <p className="text-muted-foreground whitespace-pre-line leading-relaxed text-sm">
              {event.description || 'No description provided for this campus event.'}
            </p>
          </div>

          {/* Venue & Organizer Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  Venue Information
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <p className="font-semibold text-foreground">{event.venue?.name || event.venue_name || 'UIU Campus Venue'}</p>
                <p className="text-muted-foreground text-xs">
                  {event.venue?.address || 'United City, Madani Avenue, Badda, Dhaka 1212'}
                </p>
                <p className="text-muted-foreground text-xs pt-1">
                  {event.is_seated
                    ? `Seated Venue • ${event.venue?.total_capacity ? `${event.venue.total_capacity} total seats` : 'Assigned seating'}`
                    : `General Admission${event.venue?.total_capacity ? ` • Cap: ${event.venue.total_capacity}` : ''}`}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Organized by
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <p className="font-semibold text-foreground">
                  {event.organizer?.full_name || 'UIU Campus Club / Authority'}
                </p>
                <p className="text-muted-foreground text-xs">
                  Official Campus Event Organizer
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Seating Map Card — strictly rendered ONLY when organizer opted into interactive seats */}
          {event.is_seated && (
            <Card className="border-primary/20 shadow-sm">
              <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Armchair className="h-5 w-5 text-primary" />
                    Interactive Seat Selection
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {seatHoldEnabled
                      ? 'Clicking an open green seat holds it (pink) for everyone for 10 minutes until booking completes'
                      : 'Choose open green seats from the venue layout below (10-min hold timer is off for this event)'}
                  </CardDescription>
                </div>
                {canManageThisEvent && (
                  <div className="flex items-center gap-2 shrink-0">
                    {!seatHoldEnabled && (
                      <Button type="button" variant="secondary" size="sm" asChild className="h-8 text-xs">
                        <Link to={`/organizer/events/${event.id}/edit`}>
                          <Clock className="h-3.5 w-3.5 mr-1 text-pink-600" />
                          Enable 10m Hold Timer
                        </Link>
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleGenerateSeats}
                      disabled={isGeneratingSeats}
                      className="gap-1.5 text-xs h-8 shrink-0"
                    >
                      {isGeneratingSeats ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      Sync Venue Seats
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <SeatMap
                  sections={eventSeats?.sections || []}
                  tiers={tiers}
                  selectedSeats={selectedSeats}
                  onSeatToggle={handleSeatToggle}
                  maxSelectable={4}
                  disabled={!canBookThisEvent}
                  seatHoldEnabled={seatHoldEnabled}
                  remainingSeconds={remainingSeconds}
                  pendingSeatId={pendingSeatId}
                />
              </CardContent>
            </Card>
          )}

          {/* Volunteer Section (Hidden for Admins and the event's own Organizer) */}
          {canBookThisEvent && (
            <Card className="border-indigo-500/20 bg-indigo-500/5">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2 text-foreground">
                    <HeartHandshake className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                    Volunteer for this Event
                  </CardTitle>
                  {volunteerApp && (
                    <Badge
                      variant={
                        volunteerApp.status === 'APPROVED'
                          ? 'default'
                          : volunteerApp.status === 'REJECTED'
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {volunteerApp.status === 'APPROVED'
                        ? 'Staff Volunteer ✓'
                        : volunteerApp.status === 'REJECTED'
                        ? 'Not Selected'
                        : 'Application Pending'}
                    </Badge>
                  )}
                </div>
                <CardDescription className="text-xs">
                  Join the volunteer team to help coordinate attendee entry and gate check-in scanning.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {volunteerApp ? (
                  <div className="text-xs space-y-2">
                    {volunteerApp.status === 'APPROVED' ? (
                      <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-800 dark:text-emerald-300 space-y-2">
                        <p className="font-semibold flex items-center gap-1.5">
                          <CheckCircle2 className="h-4 w-4" />
                          You are an approved Gate Staff volunteer for this event!
                        </p>
                        <p className="text-xs opacity-90">
                          You have gate check-in privileges to scan attendee QR tickets on event day.
                        </p>
                        <Button size="sm" asChild className="gap-1.5 mt-1 bg-emerald-600 hover:bg-emerald-700">
                          <Link to={`/staff/gate/${event.id}`}>
                            Open Gate Scanner
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </div>
                    ) : volunteerApp.status === 'PENDING' ? (
                      <p className="text-muted-foreground">
                        Your application is currently pending review by the event organizer. You will be notified once reviewed.
                      </p>
                    ) : (
                      <p className="text-muted-foreground">
                        Your volunteer application was not accepted for this event. Thank you for your interest!
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
                    <p className="text-xs text-muted-foreground">
                      Help organize gate validation and attendee assistance on event day.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-indigo-500/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 shrink-0"
                      onClick={() => {
                        if (!isAuthenticated) {
                          toast.info('Please log in to apply as a volunteer.')
                          navigate(`/auth/login?redirect=/events/${id}`)
                          return
                        }
                        setVolunteerModalOpen(true)
                      }}
                    >
                      <ShieldCheck className="h-4 w-4 mr-1.5" />
                      Apply to Volunteer
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: Ticket Tiers & Booking Card */}
        <div className="space-y-6">
          <Card className="sticky top-24 border-primary/20 shadow-md">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>{isSeated ? 'Selected Seats' : 'Select Tickets'}</span>
                {isSeated ? <Armchair className="h-5 w-5 text-primary" /> : <Ticket className="h-5 w-5 text-primary" />}
              </CardTitle>
              <CardDescription className="text-xs">
                {isSeated
                  ? seatHoldEnabled
                    ? 'First seat click holds your picks for 10 minutes'
                    : 'Select seats from the floor plan to complete booking'
                  : 'Select quantities for your desired passes'}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {isSeated ? (
                <div className="space-y-4">
                  {/* Subtle, visible sticky countdown timer when holding seats */}
                  {seatHoldEnabled && selectedSeats.length > 0 && remainingSeconds !== null && (
                    <div
                      className={cn(
                        'flex items-center justify-between rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                        remainingSeconds <= 60
                          ? 'bg-red-500/10 border-red-500/40 text-red-700 dark:text-red-300'
                          : remainingSeconds <= 180
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300'
                          : 'bg-pink-500/10 border-pink-500/30 text-pink-700 dark:text-pink-300'
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        Seat hold expires in
                      </span>
                      <span className="font-mono font-bold text-sm tabular-nums">
                        {String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:
                        {String(remainingSeconds % 60).padStart(2, '0')}
                      </span>
                    </div>
                  )}

                  {selectedSeats.length > 0 ? (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="text-foreground">Your Chosen Seats ({selectedSeats.length}):</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-destructive"
                          onClick={handleClearSeats}
                        >
                          Clear all
                        </Button>
                      </div>

                      <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
                        {selectedSeats.map((seat) => {
                          const sec = eventSeats?.sections.find((s) => s.section_id === seat.section_id)
                          const t = getSeatTier(seat)
                          return (
                            <div
                              key={seat.id}
                              className="flex items-center justify-between text-xs p-2 rounded-lg bg-pink-500/5 border border-pink-500/25"
                            >
                              <div>
                                <span className="font-semibold text-foreground">
                                  Row {seat.row_label}, Seat {seat.seat_number}
                                </span>
                                <span className="text-[11px] text-muted-foreground ml-1.5">
                                  ({sec?.section_name || 'Section'})
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-primary">
                                  {Number(t?.price || 0) === 0 ? 'Free' : formatCurrency(t?.price || 0)}
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  disabled={pendingSeatId === seat.id}
                                  className="h-5 w-5 text-muted-foreground hover:text-destructive p-0"
                                  onClick={() => handleSeatToggle(seat)}
                                >
                                  <Minus className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground space-y-1">
                      <Armchair className="mx-auto h-6 w-6 text-muted-foreground/40 mb-1" />
                      <p className="font-medium text-foreground">No seats selected</p>
                      <p>
                        {seatHoldEnabled
                          ? 'Click green seats on the map to reserve them for 10 minutes.'
                          : 'Click green seats in the Interactive Seat Selection map.'}
                      </p>
                    </div>
                  )}

                  {/* Summary & Booking Button */}
                  {canBookThisEvent ? (
                    <div className="pt-3 border-t space-y-3">
                      <div className="flex items-center justify-between text-sm font-semibold">
                        <span>Total ({selectedSeats.length} {selectedSeats.length === 1 ? 'seat' : 'seats'}):</span>
                        <span className="text-base text-primary">
                          {totalCost === 0 ? 'Free' : formatCurrency(totalCost)}
                        </span>
                      </div>

                      <Button
                        className="w-full font-semibold shadow-sm"
                        disabled={selectedSeats.length === 0 || isBooking}
                        onClick={handleCreateBooking}
                      >
                        {isBooking ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Reserving Seats...
                          </>
                        ) : totalCost === 0 ? (
                          `Confirm Free Reservation (${selectedSeats.length})`
                        ) : (
                          `Book Seats (${formatCurrency(totalCost)})`
                        )}
                      </Button>

                      <p className="text-[11px] text-muted-foreground text-center">
                        Instant digital QR pass generation with assigned seats.
                      </p>
                    </div>
                  ) : (
                    <div className="pt-3 border-t text-xs text-muted-foreground text-center space-y-2">
                      <p>
                        {isAdmin
                          ? 'Administrators do not book personal attendee tickets.'
                          : 'You are the organizer of this event.'}
                      </p>
                      <Button variant="outline" size="sm" asChild className="w-full">
                        <Link to={`/organizer/events/${event.id}/analytics`}>
                          View Event Analytics & Orders
                        </Link>
                      </Button>
                    </div>
                  )}
                </div>
              ) : tiers.length > 0 ? (
                <div className="space-y-3">
                  {tiers.map((tier) => {
                    const isAvailable = tier.available_quantity > 0 && tier.is_active
                    const maxAllowed = Math.min(tier.max_per_user, tier.available_quantity)
                    const currentQty = selectedQuantities[tier.id] || 0

                    return (
                      <div
                        key={tier.id}
                        className="rounded-lg border p-3.5 hover:border-primary/40 transition-colors space-y-2 bg-muted/20"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-semibold text-sm">{tier.name}</h4>
                            {tier.description && (
                              <p className="text-xs text-muted-foreground line-clamp-1">{tier.description}</p>
                            )}
                          </div>
                          <span className="font-bold text-sm text-primary">
                            {Number(tier.price) === 0 ? 'Free' : formatCurrency(tier.price)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                          <span>
                            {tier.available_quantity} of {tier.total_quantity} left
                          </span>
                          <span className="text-[11px]">Max {tier.max_per_user} / user</span>
                        </div>

                        {/* Quantity Stepper */}
                        {!canBookThisEvent ? (
                          <div className="pt-2 border-t mt-2 text-xs text-muted-foreground">
                            {isAdmin ? 'Admin inspection mode' : 'Organizer view'}
                          </div>
                        ) : isAvailable ? (
                          <div className="flex items-center justify-between pt-2 border-t mt-2">
                            <span className="text-xs font-medium">Quantity</span>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-7 w-7 rounded-md"
                                disabled={currentQty === 0 || isBooking}
                                onClick={() => handleQuantityChange(tier.id, -1, maxAllowed)}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="w-6 text-center text-sm font-semibold">{currentQty}</span>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-7 w-7 rounded-md"
                                disabled={currentQty >= maxAllowed || isBooking}
                                onClick={() => handleQuantityChange(tier.id, 1, maxAllowed)}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Badge variant="secondary" className="w-full justify-center mt-2 text-xs py-1">
                            Sold Out
                          </Badge>
                        )}
                      </div>
                    )
                  })}

                  {/* Summary & Booking Button */}
                  {canBookThisEvent ? (
                    <div className="pt-3 border-t space-y-3">
                      <div className="flex items-center justify-between text-sm font-semibold">
                        <span>Total ({totalTicketsSelected} {totalTicketsSelected === 1 ? 'ticket' : 'tickets'}):</span>
                        <span className="text-base text-primary">
                          {totalCost === 0 ? 'Free' : formatCurrency(totalCost)}
                        </span>
                      </div>

                      <Button
                        className="w-full font-semibold shadow-sm"
                        disabled={totalTicketsSelected === 0 || isBooking}
                        onClick={handleCreateBooking}
                      >
                        {isBooking ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Processing Booking...
                          </>
                        ) : totalCost === 0 ? (
                          `Confirm Free Registration (${totalTicketsSelected})`
                        ) : (
                          `Book Tickets (${formatCurrency(totalCost)})`
                        )}
                      </Button>

                      <p className="text-[11px] text-muted-foreground text-center">
                        Instant digital QR pass generation. Zero booking fees.
                      </p>
                    </div>
                  ) : (
                    <div className="pt-3 border-t text-xs text-muted-foreground text-center space-y-2">
                      <p>
                        {isAdmin
                          ? 'Administrators do not book personal attendee tickets.'
                          : 'You are the organizer of this event.'}
                      </p>
                      <Button variant="outline" size="sm" asChild className="w-full">
                        <Link to={`/organizer/events/${event.id}/analytics`}>
                          View Event Analytics & Orders
                        </Link>
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-6 space-y-3">
                  <p className="text-sm text-muted-foreground">No active ticket tiers configured yet.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Volunteer Application Dialog */}
      <Dialog open={volunteerModalOpen} onOpenChange={setVolunteerModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HeartHandshake className="h-5 w-5 text-indigo-600" />
              Apply as Volunteer Staff
            </DialogTitle>
            <DialogDescription>
              Submit your motivation to the event organizer to join the gate check-in & event team.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleVolunteerApply} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="motivation">Motivation & Experience *</Label>
              <Textarea
                id="motivation"
                placeholder="Why would you like to volunteer for this event? Mention your availability or past experience."
                rows={4}
                value={volunteerMotivation}
                onChange={(e) => setVolunteerMotivation(e.target.value)}
                required
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setVolunteerModalOpen(false)}
                disabled={isSubmittingVolunteer}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmittingVolunteer || !volunteerMotivation.trim()}>
                {isSubmittingVolunteer ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Application'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Booking / Payment Checkout Dialog */}
      <Dialog open={bookingSuccessModalOpen} onOpenChange={setBookingSuccessModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div
              className={cn(
                'mx-auto flex h-12 w-12 items-center justify-center rounded-full mb-2',
                confirmedBooking?.status === 'CONFIRMED'
                  ? 'bg-emerald-500/10 text-emerald-600'
                  : 'bg-pink-500/10 text-pink-600'
              )}
            >
              {confirmedBooking?.status === 'CONFIRMED' ? (
                <CheckCircle2 className="h-8 w-8" />
              ) : (
                <CreditCard className="h-7 w-7" />
              )}
            </div>
            <DialogTitle className="text-center text-xl">
              {confirmedBooking?.status === 'CONFIRMED'
                ? 'Booking Confirmed!'
                : 'Complete Payment to Issue Tickets'}
            </DialogTitle>
            <DialogDescription className="text-center">
              {confirmedBooking?.status === 'CONFIRMED' ? (
                <>
                  Your tickets for <strong className="text-foreground">{event.title}</strong> are confirmed and now live in <strong>My Tickets</strong> with QR codes.
                </>
              ) : (
                <>
                  Your reservation for <strong className="text-foreground">{event.title}</strong> is ready. Complete checkout below to confirm your booking and generate QR passes.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {confirmedBooking && (
            <div className="p-4 bg-muted/40 rounded-xl space-y-2 text-xs border">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Booking ID:</span>
                <span className="font-mono font-medium">{confirmedBooking.id.slice(0, 13)}...</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Tickets:</span>
                <span className="font-semibold">
                  {confirmedBooking.items.reduce((acc, it) => acc + it.quantity, 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status:</span>
                <span
                  className={cn(
                    'font-semibold',
                    confirmedBooking.status === 'CONFIRMED' ? 'text-emerald-600' : 'text-amber-600'
                  )}
                >
                  {confirmedBooking.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Amount:</span>
                <span className="font-semibold text-primary">
                  {Number(confirmedBooking.total_amount) === 0
                    ? 'Free'
                    : formatCurrency(confirmedBooking.total_amount)}
                </span>
              </div>
            </div>
          )}

          {confirmedBooking?.status === 'PENDING' && (
            <div className="space-y-3 pt-1">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Select Payment Method (Sandbox)</Label>
                <div className="grid grid-cols-3 gap-2">
                  {['bKash (Sandbox)', 'Nagad (Sandbox)', 'Card (Visa/MC)'].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPaymentMethod(m)}
                      className={cn(
                        'px-2.5 py-2 rounded-lg border text-xs font-medium transition-colors',
                        paymentMethod === m
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border hover:bg-muted/50 text-muted-foreground'
                      )}
                    >
                      {m.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>

              <Button
                className="w-full gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={isPaying}
                onClick={async () => {
                  if (!confirmedBooking) return
                  try {
                    setIsPaying(true)
                    const initRes = await paymentsApi.initiate(confirmedBooking.id, paymentMethod)
                    if (initRes.mode === 'sslcommerz' && initRes.gateway_url) {
                      window.location.href = initRes.gateway_url
                      return
                    }
                    const paidBooking = await paymentsApi.confirm(confirmedBooking.id, paymentMethod)
                    setConfirmedBooking(paidBooking)
                    toast.success('Payment verified! Digital tickets are now in My Tickets.')
                  } catch (err: unknown) {
                    const msg =
                      (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
                      'Payment confirmation failed. Please try from My Bookings.'
                    toast.error(msg)
                  } finally {
                    setIsPaying(false)
                  }
                }}
              >
                {isPaying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing Payment...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4" />
                    Pay {formatCurrency(confirmedBooking.total_amount)} &amp; Issue Tickets
                  </>
                )}
              </Button>
            </div>
          )}

          <div className="space-y-2 pt-2">
            {confirmedBooking?.status === 'CONFIRMED' ? (
              <Button
                className="w-full gap-1.5"
                onClick={() => {
                  setBookingSuccessModalOpen(false)
                  navigate('/tickets')
                }}
              >
                <Ticket className="h-4 w-4" />
                View My Tickets &amp; QR Passes
              </Button>
            ) : (
              <Button
                variant="secondary"
                className="w-full gap-1.5"
                onClick={() => {
                  setBookingSuccessModalOpen(false)
                  navigate('/my-bookings')
                }}
              >
                Pay Later in My Bookings
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setBookingSuccessModalOpen(false)}
            >
              Continue Browsing
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
