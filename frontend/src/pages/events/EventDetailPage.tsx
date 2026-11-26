import { useState, useEffect, useCallback } from 'react'
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
} from 'lucide-react'
import { Event, TicketTier, VolunteerApplication, Booking, Seat, EventSeatsResponse } from '@/types'
import { eventsApi, bookingsApi, volunteerApi } from '@/lib/api'
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
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null)
  const [bookingSuccessModalOpen, setBookingSuccessModalOpen] = useState(false)

  // Volunteer state
  const [volunteerApp, setVolunteerApp] = useState<VolunteerApplication | null>(null)
  const [volunteerModalOpen, setVolunteerModalOpen] = useState(false)
  const [volunteerMotivation, setVolunteerMotivation] = useState('')
  const [isSubmittingVolunteer, setIsSubmittingVolunteer] = useState(false)

  const isOrganizerOfThisEvent = Boolean(user && event && user.id === event.organizer_id)
  const canManageThisEvent = Boolean(isOrganizerOfThisEvent || isAdmin)
  const canBookThisEvent = !isAdmin && !isOrganizerOfThisEvent

  const isSeated = Boolean(event?.is_seated)
  const seatHoldEnabled = Boolean(event?.is_seated && (eventSeats?.seat_hold_enabled ?? event?.seat_hold_enabled))

  const applySeatsSnapshot = useCallback((seatsData: EventSeatsResponse) => {
    setEventSeats(seatsData)
    if (seatsData.server_time) {
      setServerOffsetMs(Date.parse(seatsData.server_time) - Date.now())
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

  const refreshSeatsSilently = useCallback(async () => {
    if (!id || !event?.is_seated) return
    try {
      const seatsData = await eventsApi.getSeats(id)
      applySeatsSnapshot(seatsData)
    } catch {
      // Silently ignore background polling errors
    }
  }, [id, event?.is_seated, applySeatsSnapshot])

  const fetchDetails = async () => {
    if (!id) return
    try {
      setIsLoading(true)
      const eventData = await eventsApi.getEvent(id)
      setEvent(eventData)

      // Load tiers
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

      // Only load seat layout if the organizer explicitly enabled interactive seats
      if (eventData.is_seated) {
        try {
          const seatsData = await eventsApi.getSeats(id)
          applySeatsSnapshot(seatsData)
        } catch (seatErr) {
          console.error('Failed to load event seats:', seatErr)
        }
      } else {
        setEventSeats(null)
        setSelectedSeats([])
        setHoldExpiresAt(null)
      }

      // Check volunteer status if authenticated non-admin and non-organizer
      if (isAuthenticated && user && user.role !== 'ADMIN' && user.id !== eventData.organizer_id) {
        try {
          const statusData = await volunteerApi.getMyStatus(id)
          setVolunteerApp(statusData)
        } catch {
          setVolunteerApp(null)
        }
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

  // Real-time 5-second seat sync when interactive seats are active on a published event
  useEffect(() => {
    if (!event?.is_seated || event.status !== 'PUBLISHED') return
    const timer = window.setInterval(() => {
      refreshSeatsSilently()
    }, 5000)
    return () => window.clearInterval(timer)
  }, [event?.is_seated, event?.status, refreshSeatsSilently])

  // Accurate server-synchronized 10-minute hold countdown timer
  useEffect(() => {
    if (!seatHoldEnabled || !holdExpiresAt || selectedSeats.length === 0) {
      setRemainingSeconds(null)
      return
    }

    const computeRemaining = () => {
      const serverNow = Date.now() + serverOffsetMs
      return Math.max(0, Math.floor((Date.parse(holdExpiresAt) - serverNow) / 1000))
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
          setServerOffsetMs(Date.parse(res.server_time) - Date.now())
        }
        setSelectedSeats((prev) => prev.filter((s) => s.id !== seat.id))
        // If no held seats remain, reset timer cleanly (expires_at = null)
        setHoldExpiresAt(res.active_hold_count > 0 ? res.expires_at || null : null)
        await refreshSeatsSilently()
      } else {
        if (selectedSeats.length >= 4) {
          toast.warning('You can hold a maximum of 4 seats per booking.')
          return
        }
        const res = await eventsApi.holdSeat(id, seat.id)
        if (res.server_time) {
          setServerOffsetMs(Date.parse(res.server_time) - Date.now())
        }
        if (res.expires_at) {
          setHoldExpiresAt(res.expires_at)
        }
        setSelectedSeats((prev) => (prev.some((s) => s.id === seat.id) ? prev : [...prev, { ...seat, status: 'HELD', held_by_me: true }]))
        await refreshSeatsSilently()
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
    try {
      await eventsApi.releaseAllSeatHolds(id)
      setSelectedSeats([])
      setHoldExpiresAt(null)
      await refreshSeatsSilently()
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
      const booking = await bookingsApi.create({
        event_id: id!,
        items,
      })

      setConfirmedBooking(booking)
      setBookingSuccessModalOpen(true)
      setSelectedQuantities({})
      setSelectedSeats([])
      setHoldExpiresAt(null)
      toast.success(
        booking.status === 'CONFIRMED'
          ? 'Booking confirmed! Digital tickets issued.'
          : 'Seats reserved! Check your booking in My Bookings.'
      )
      fetchDetails()
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
                      ? 'Clicking a seat places a 10-minute temporary hold until you confirm your booking'
                      : 'Choose your exact seats from the venue layout below'}
                  </CardDescription>
                </div>
                {canManageThisEvent && (
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
                          ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                          : remainingSeconds <= 180
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300'
                          : 'bg-blue-500/10 border-blue-500/30 text-blue-800 dark:text-blue-300'
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
                        <span className="text-foreground">Your Selected Seats ({selectedSeats.length}):</span>
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
                              className="flex items-center justify-between text-xs p-2 rounded-lg bg-blue-500/5 border border-blue-500/20"
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

      {/* Booking Confirmation Dialog */}
      <Dialog open={bookingSuccessModalOpen} onOpenChange={setBookingSuccessModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 mb-2">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <DialogTitle className="text-center text-xl">
              {confirmedBooking?.status === 'CONFIRMED' ? 'Booking Confirmed!' : 'Seats Reserved — Pending Payment'}
            </DialogTitle>
            <DialogDescription className="text-center">
              {confirmedBooking?.status === 'CONFIRMED' ? (
                <>
                  Your tickets for <strong className="text-foreground">{event.title}</strong> have been confirmed and issued with cryptographic QR passes.
                </>
              ) : (
                <>
                  Your booking for <strong className="text-foreground">{event.title}</strong> is saved under My Bookings awaiting payment confirmation.
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
                <span className="text-muted-foreground">Total Amount:</span>
                <span className="font-semibold text-primary">
                  {Number(confirmedBooking.total_amount) === 0
                    ? 'Free'
                    : formatCurrency(confirmedBooking.total_amount)}
                </span>
              </div>
            </div>
          )}

          <div className="space-y-2 pt-2">
            <Button
              className="w-full gap-1.5"
              onClick={() => {
                setBookingSuccessModalOpen(false)
                navigate('/my-bookings')
              }}
            >
              <Ticket className="h-4 w-4" />
              View My Bookings & Passes
            </Button>
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
