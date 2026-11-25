import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Calendar,
  MapPin,
  Ticket as TicketIcon,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Compass,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { bookingsApi } from '@/lib/api'
import type { Booking, BookingStatus } from '@/types'
import { toast } from 'sonner'

function statusBadge(status: BookingStatus, totalAmount: number) {
  if (status === 'CONFIRMED' && Number(totalAmount) === 0) {
    return (
      <Badge className="bg-emerald-600 hover:bg-emerald-700 gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Free - Confirmed ✓
      </Badge>
    )
  }
  switch (status) {
    case 'CONFIRMED':
      return <Badge className="bg-emerald-600 hover:bg-emerald-700">Confirmed</Badge>
    case 'PENDING':
      return <Badge variant="secondary">Pending</Badge>
    case 'CANCELLED':
      return <Badge variant="destructive">Cancelled</Badge>
    case 'REFUNDED':
      return <Badge variant="outline">Refunded</Badge>
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

export function MyBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null)

  const fetchBookings = async () => {
    try {
      setLoading(true)
      const data = await bookingsApi.getMyBookings()
      setBookings(data || [])
    } catch {
      setBookings([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBookings()
  }, [])

  const handleCancel = async (id: string) => {
    try {
      setCancellingId(id)
      await bookingsApi.cancel(id)
      setBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: 'CANCELLED' as BookingStatus } : b))
      )
      toast.success('Booking cancelled successfully.')
    } catch {
      toast.error('Failed to cancel booking.')
    } finally {
      setCancellingId(null)
      setConfirmCancelId(null)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-20 flex flex-col items-center justify-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">Loading your bookings...</p>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Bookings</h1>
        <p className="text-muted-foreground text-sm">
          View and manage your event bookings and tickets.
        </p>
      </div>

      {bookings.length === 0 ? (
        <Card className="text-center py-14">
          <CardContent className="space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <TicketIcon className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg">No bookings yet</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              You haven&apos;t booked any event tickets yet. Explore campus events and grab your tickets!
            </p>
            <Button asChild className="gap-2">
              <Link to="/">
                <Compass className="h-4 w-4" />
                Browse Events
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => {
            const isExpanded = expandedId === booking.id
            const totalItems = booking.items?.reduce((s, i) => s + i.quantity, 0) || 0
            const canCancel =
              booking.status === 'PENDING' || booking.status === 'CONFIRMED'

            return (
              <Card key={booking.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <div className="p-5 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        {statusBadge(booking.status, booking.total_amount)}
                        <span className="text-xs text-muted-foreground font-mono">
                          #{booking.id.slice(0, 8)}
                        </span>
                      </div>

                      <h3 className="text-xl font-bold">
                        {booking.event?.title || 'Campus Event'}
                      </h3>

                      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-primary" />
                          <span>
                            Booked{' '}
                            {new Date(booking.created_at).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </span>
                        </div>
                        {booking.event?.venue?.name && (
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-primary" />
                            <span>{booking.event.venue.name}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <TicketIcon className="h-3.5 w-3.5 text-primary" />
                          <span>
                            {totalItems} ticket{totalItems !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <div className="text-xl font-bold text-primary">
                        {Number(booking.total_amount) === 0
                          ? 'Free'
                          : `৳${Number(booking.total_amount).toLocaleString()}`}
                      </div>

                      <div className="flex items-center gap-2">
                        {canCancel && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-destructive border-destructive/30 hover:bg-destructive/10"
                            onClick={() => setConfirmCancelId(booking.id)}
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1" />
                            Cancel
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 gap-1"
                          onClick={() => setExpandedId(isExpanded ? null : booking.id)}
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="h-3.5 w-3.5" />
                              Hide Details
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-3.5 w-3.5" />
                              View Details
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {isExpanded && booking.items && booking.items.length > 0 && (
                    <div className="border-t pt-3 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Booking Items
                      </p>
                      <div className="rounded-lg border overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/40 text-xs text-muted-foreground">
                            <tr>
                              <th className="py-2 px-3 text-left">Tier</th>
                              <th className="py-2 px-3 text-center">Qty</th>
                              <th className="py-2 px-3 text-right">Unit Price</th>
                              <th className="py-2 px-3 text-right">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {booking.items.map((item) => (
                              <tr key={item.id} className="hover:bg-muted/20">
                                <td className="py-2 px-3 font-medium">
                                  {item.tier?.name || `Tier ${item.tier_id.slice(0, 6)}...`}
                                </td>
                                <td className="py-2 px-3 text-center">{item.quantity}</td>
                                <td className="py-2 px-3 text-right text-muted-foreground">
                                  {Number(item.unit_price) === 0 ? 'Free' : `৳${Number(item.unit_price).toLocaleString()}`}
                                </td>
                                <td className="py-2 px-3 text-right font-semibold">
                                  {Number(item.unit_price) === 0
                                    ? 'Free'
                                    : `৳${(Number(item.unit_price) * item.quantity).toLocaleString()}`}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex justify-end">
                        <Button size="sm" variant="outline" asChild>
                          <Link to="/tickets">
                            <TicketIcon className="h-3.5 w-3.5 mr-1" />
                            View My Tickets
                          </Link>
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Confirm Cancel Dialog */}
      <Dialog
        open={Boolean(confirmCancelId)}
        onOpenChange={(open) => !open && setConfirmCancelId(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel Booking</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this booking? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setConfirmCancelId(null)}
              disabled={Boolean(cancellingId)}
            >
              Keep Booking
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={Boolean(cancellingId)}
              onClick={() => confirmCancelId && handleCancel(confirmCancelId)}
            >
              {cancellingId ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <XCircle className="h-4 w-4 mr-2" />
              )}
              Cancel Booking
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
