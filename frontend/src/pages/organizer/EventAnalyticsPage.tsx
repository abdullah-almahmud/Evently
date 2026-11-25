import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ChevronLeft,
  Users,
  Ticket,
  Clock,
  BarChart2,
  Calendar,
  MapPin,
  AlertCircle,
  Loader2,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { eventsApi, bookingsApi } from '@/lib/api'
import type { Event, TicketTier, Booking } from '@/types'

export function EventAnalyticsPage() {
  const { id } = useParams<{ id: string }>()
  const [event, setEvent] = useState<Event | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return

    const fetchEventData = async () => {
      try {
        setLoading(true)
        setError(null)
        const [eventData, bookingsData] = await Promise.all([
          eventsApi.getEvent(id),
          bookingsApi.getEventBookings(id).catch(() => []),
        ])
        setEvent(eventData)
        setBookings(bookingsData || [])
      } catch (err: unknown) {
        console.error('Failed to load event data for analytics:', err)
        setError('Unable to load event details. Please verify the event exists and you have permission.')
      } finally {
        setLoading(false)
      }
    }

    fetchEventData()
  }, [id])

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-20 max-w-5xl flex flex-col items-center justify-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">Loading event metrics...</p>
      </div>
    )
  }

  if (error || !event) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-5xl space-y-6">
        <Button variant="ghost" size="sm" asChild className="gap-1 text-muted-foreground">
          <Link to="/organizer/events">
            <ChevronLeft className="h-4 w-4" />
            Back to Organizer Events
          </Link>
        </Button>
        <Card className="border-destructive/30">
          <CardContent className="pt-6 flex flex-col items-center text-center space-y-3">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <h2 className="text-xl font-bold">Failed to Load Analytics</h2>
            <p className="text-muted-foreground text-sm max-w-md">{error || 'Event not found.'}</p>
            <Button asChild className="mt-2">
              <Link to="/organizer/events">Return to My Events</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const tiers: TicketTier[] = event.tiers || event.ticket_tiers || []
  const totalCapacity = tiers.reduce((acc, t) => acc + (t.total_quantity || 0), 0)
  const availableTickets = tiers.reduce((acc, t) => acc + (t.available_quantity ?? t.total_quantity ?? 0), 0)
  const soldTickets = Math.max(0, totalCapacity - availableTickets)
  const grossRevenue = tiers.reduce((acc, t) => {
    const sold = Math.max(0, (t.total_quantity || 0) - (t.available_quantity ?? t.total_quantity ?? 0))
    return acc + sold * (t.price || 0)
  }, 0)
  const activeTiers = tiers.filter((t) => t.is_active)
  const occupancyRate = totalCapacity > 0 ? ((soldTickets / totalCapacity) * 100).toFixed(1) : '0'
  const venueDisplay = event.venue?.name || event.venue_name

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl space-y-8">
      {/* Top navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild className="gap-1 text-muted-foreground">
          <Link to="/organizer/events">
            <ChevronLeft className="h-4 w-4" />
            Back to Organizer Events
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Badge variant={event.status === 'PUBLISHED' ? 'default' : 'secondary'}>
            {event.status}
          </Badge>
          <Badge variant="outline" className="border-primary/40 text-primary">
            ID: {id?.slice(0, 8)}...
          </Badge>
        </div>
      </div>

      {/* Header Banner */}
      <div className="rounded-2xl border bg-gradient-to-r from-primary/10 via-background to-background p-6 md:p-8 space-y-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {venueDisplay && (
            <span className="flex items-center gap-1 font-medium text-foreground">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              {venueDisplay}
            </span>
          )}
          {event.start_datetime && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {new Date(event.start_datetime).toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          )}
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">{event.title}</h1>
        <p className="text-muted-foreground text-sm max-w-2xl leading-relaxed">
          {event.description || 'Live capacity and sales reporting for this event.'}
        </p>
      </div>

      {/* Real KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Registrations
            </CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{soldTickets}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {availableTickets} of {totalCapacity} seats remaining
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Capacity Booked
            </CardTitle>
            <Ticket className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{occupancyRate}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {soldTickets} / {totalCapacity} seats allocated
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Gross Revenue
            </CardTitle>
            <BarChart2 className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">৳{grossRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Across {activeTiers.length} active tier{activeTiers.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Check-in Attendance
            </CardTitle>
            <Clock className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0 Scanned</div>
            <p className="text-xs text-muted-foreground mt-1">Check-in opens on event day</p>
          </CardContent>
        </Card>
      </div>

      {/* Ticket Tiers Allocation Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Configured Ticket Tiers</CardTitle>
              <CardDescription>Current tier capacities and availability</CardDescription>
            </div>
            <Badge variant="outline">{tiers.length} Tier{tiers.length !== 1 ? 's' : ''}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {tiers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm space-y-2">
              <p>No ticket tiers configured for this event yet.</p>
              <Button size="sm" variant="outline" asChild>
                <Link to={`/organizer/events/${id}/edit`}>Configure Tiers in Edit Event</Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase text-muted-foreground border-b">
                  <tr>
                    <th className="py-3 px-4">Tier Name</th>
                    <th className="py-3 px-4">Price</th>
                    <th className="py-3 px-4">Allocated Capacity</th>
                    <th className="py-3 px-4">Available</th>
                    <th className="py-3 px-4">Sold</th>
                    <th className="py-3 px-4">Max / User</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {tiers.map((tier) => {
                    const tierSold = Math.max(0, (tier.total_quantity || 0) - (tier.available_quantity ?? tier.total_quantity ?? 0))
                    return (
                      <tr key={tier.id} className="hover:bg-muted/40 transition-colors">
                        <td className="py-3 px-4 font-semibold text-foreground">
                          {tier.name}
                          {tier.description && (
                            <p className="text-xs text-muted-foreground font-normal mt-0.5 line-clamp-1">
                              {tier.description}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {tier.price === 0 ? (
                            <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 border-0">
                              Free
                            </Badge>
                          ) : (
                            <span className="font-semibold">৳{tier.price.toLocaleString()}</span>
                          )}
                        </td>
                        <td className="py-3 px-4">{tier.total_quantity}</td>
                        <td className="py-3 px-4 text-emerald-600 font-medium">
                          {tier.available_quantity ?? tier.total_quantity}
                        </td>
                        <td className="py-3 px-4">{tierSold}</td>
                        <td className="py-3 px-4">{tier.max_per_user}</td>
                        <td className="py-3 px-4">
                          <Badge variant={tier.is_active ? 'default' : 'secondary'} className="text-[10px] px-2 py-0.5">
                            {tier.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Bookings Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Event Bookings & Orders</CardTitle>
              <CardDescription>Attendee booking orders placed for this event</CardDescription>
            </div>
            <Badge variant="outline">{bookings.length} Order{bookings.length !== 1 ? 's' : ''}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {bookings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No ticket orders have been placed for this event yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase text-muted-foreground border-b">
                  <tr>
                    <th className="py-3 px-4">Booking ID</th>
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-4">Tickets</th>
                    <th className="py-3 px-4">Total Amount</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {bookings.map((booking) => {
                    const ticketCount = booking.items?.reduce((acc, it) => acc + it.quantity, 0) || 0
                    return (
                      <tr key={booking.id} className="hover:bg-muted/40 transition-colors">
                        <td className="py-3 px-4 font-mono text-xs font-semibold">
                          {booking.id.slice(0, 13)}...
                        </td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">
                          {new Date(booking.created_at).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-3 px-4">{ticketCount} {ticketCount === 1 ? 'ticket' : 'tickets'}</td>
                        <td className="py-3 px-4 font-semibold">
                          {Number(booking.total_amount) === 0 ? (
                            <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 border-0">
                              Free
                            </Badge>
                          ) : (
                            `৳${Number(booking.total_amount).toLocaleString()}`
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            variant={
                              booking.status === 'CONFIRMED'
                                ? 'default'
                                : booking.status === 'CANCELLED'
                                ? 'destructive'
                                : 'secondary'
                            }
                            className="text-[10px] px-2 py-0.5"
                          >
                            {booking.status}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Telemetry Notice */}
      <Card className="border-dashed bg-muted/20">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0 mt-0.5">
              <Info className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-sm">Real-time Telemetry & Graphs</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Registration velocity curves, attendee check-in velocity, and sales time-series graphs will dynamically populate here once attendee bookings and QR code scanning begin.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
