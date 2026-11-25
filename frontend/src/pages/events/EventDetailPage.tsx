import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Calendar,
  MapPin,
  Share2,
  Ticket,
  ChevronLeft,
  Users,
  CheckCircle2,
  Clock,
  Sparkles,
  Info,
} from 'lucide-react'
import { Event, TicketTier } from '@/types'
import { eventsApi } from '@/lib/api'
import { formatDateRange, formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [event, setEvent] = useState<Event | null>(null)
  const [tiers, setTiers] = useState<TicketTier[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [bookingModalOpen, setBookingModalOpen] = useState(false)
  const [selectedTier, setSelectedTier] = useState<TicketTier | null>(null)

  useEffect(() => {
    if (!id) return

    const fetchDetails = async () => {
      try {
        setIsLoading(true)
        const eventData = await eventsApi.getEvent(id)
        setEvent(eventData)

        // Load tiers from event response or fallback to dedicated tier endpoint
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
      } catch (err) {
        console.error('Failed to load event details:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchDetails()
  }, [id])

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href)
    toast.success('Event link copied to clipboard!')
  }

  const handleBookTicket = (tier?: TicketTier) => {
    setSelectedTier(tier || (tiers.length > 0 ? tiers[0] : null))
    setBookingModalOpen(true)
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
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <Info className="h-6 w-6" />
        </div>
        <h2 className="text-2xl font-bold">Event Not Found</h2>
        <p className="text-muted-foreground text-sm">
          The event you are looking for may have been removed or does not exist.
        </p>
        <Button asChild>
          <Link to="/">Back to All Events</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl space-y-8">
      {/* Top back & actions */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild className="gap-1 text-muted-foreground hover:text-foreground">
          <Link to="/">
            <ChevronLeft className="h-4 w-4" />
            All Events
          </Link>
        </Button>

        <Button variant="outline" size="sm" onClick={handleShare} className="gap-1.5">
          <Share2 className="h-4 w-4" />
          Share Event
        </Button>
      </div>

      {/* Hero Banner */}
      <div className="relative aspect-[21/9] w-full overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-primary/80 shadow-md">
        {event.banner_url ? (
          <img
            src={event.banner_url}
            alt={event.title}
            className="h-full w-full object-cover"
            onError={(e) => {
              ;(e.target as HTMLElement).style.display = 'none'
            }}
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center p-8 text-center text-white/90">
            <div>
              <Sparkles className="mx-auto h-12 w-12 text-primary/80 mb-3" />
              <h1 className="text-3xl md:text-4xl font-extrabold max-w-2xl">{event.title}</h1>
            </div>
          </div>
        )}

        <div className="absolute top-4 left-4 flex gap-2">
          <Badge variant="secondary" className="backdrop-blur-md bg-background/80 font-medium">
            {event.category}
          </Badge>
          {event.status !== 'PUBLISHED' && (
            <Badge variant="destructive">{event.status.replace('_', ' ')}</Badge>
          )}
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Details & Description */}
        <div className="lg:col-span-2 space-y-6">
          <div className="space-y-3">
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground">
              {event.title}
            </h1>

            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground pt-1">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary shrink-0" />
                <span>{formatDateRange(event.start_datetime, event.end_datetime)}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary shrink-0" />
                <span>{event.venue?.name || 'Main Auditorium, UIU'}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-6 space-y-4">
            <h2 className="text-xl font-bold">About this event</h2>
            <div className="text-foreground/90 whitespace-pre-line leading-relaxed text-sm md:text-base">
              {event.description}
            </div>
          </div>

          {/* Venue & Organizer Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  Venue Details
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <p className="font-semibold text-foreground">{event.venue?.name || 'UIU Campus Venue'}</p>
                <p className="text-muted-foreground text-xs">
                  {event.venue?.address || 'United City, Madani Avenue, Badda, Dhaka 1212'}
                </p>
                <p className="text-muted-foreground text-xs pt-1">
                  Type: {event.is_seated ? 'Seated Admission' : 'General Admission'}
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
        </div>

        {/* Right Column: Ticket Tiers & Booking Card */}
        <div className="space-y-6">
          <Card className="sticky top-24 border-primary/20 shadow-md">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Tickets & Passes</span>
                <Ticket className="h-5 w-5 text-primary" />
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              {tiers.length > 0 ? (
                <div className="space-y-3">
                  {tiers.map((tier) => {
                    const isAvailable = tier.available_quantity > 0 && tier.is_active
                    return (
                      <div
                        key={tier.id}
                        className="rounded-lg border p-3 hover:border-primary/50 transition-colors space-y-2 bg-muted/20"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-semibold text-sm">{tier.name}</h4>
                            {tier.description && (
                              <p className="text-xs text-muted-foreground">{tier.description}</p>
                            )}
                          </div>
                          <span className="font-bold text-sm text-primary">
                            {formatCurrency(tier.price)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                          <span>
                            {tier.available_quantity} of {tier.total_quantity} left
                          </span>
                          <span className="text-[11px]">Max {tier.max_per_user} / user</span>
                        </div>

                        <Button
                          size="sm"
                          className="w-full mt-2"
                          disabled={!isAvailable}
                          onClick={() => handleBookTicket(tier)}
                        >
                          {isAvailable ? 'Select Ticket' : 'Sold Out'}
                        </Button>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-6 space-y-3">
                  <p className="text-sm text-muted-foreground">General Admission is free for this event.</p>
                  <Button className="w-full" onClick={() => handleBookTicket()}>
                    Register for Free
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Booking Dialog Modal (Coming Soon in 70% milestone) */}
      <Dialog open={bookingModalOpen} onOpenChange={setBookingModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ticket className="h-5 w-5 text-primary" />
              Book Tickets: {event.title}
            </DialogTitle>
            <DialogDescription>
              {selectedTier ? `Selected tier: ${selectedTier.name} (${formatCurrency(selectedTier.price)})` : 'Free Registration'}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="rounded-lg bg-primary/10 border border-primary/20 p-4 space-y-2 text-center">
              <Clock className="h-8 w-8 text-primary mx-auto" />
              <h4 className="font-semibold text-foreground">Online Booking Gateway</h4>
              <p className="text-xs text-muted-foreground">
                Payment gateway integration (bKash, Nagad, card) and automated QR ticket issuance will be activated in the next project release (70% milestone).
              </p>
            </div>

            <div className="space-y-2 text-xs text-muted-foreground border-t pt-3">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>Instant confirmation and QR pass generation</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>Access your digital passes under My Tickets anytime</span>
              </div>
            </div>
          </div>

          <Button onClick={() => setBookingModalOpen(false)} className="w-full">
            Understood
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
