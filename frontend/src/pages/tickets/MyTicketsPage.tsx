import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Ticket as TicketIcon, Calendar, QrCode, Sparkles, MapPin, Compass } from 'lucide-react'
import QRCode from 'react-qr-code'
import { Ticket } from '@/types'
import { ticketsApi } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function MyTicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)

  useEffect(() => {
    const fetchTickets = async () => {
      try {
        setIsLoading(true)
        const data = await ticketsApi.getMyTickets()
        setTickets(data || [])
      } catch (err) {
        console.warn('Could not load tickets:', err)
        setTickets([])
      } finally {
        setIsLoading(false)
      }
    }
    fetchTickets()
  }, [])

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Tickets & Passes</h1>
        <p className="text-muted-foreground text-sm">
          Access your digital admission passes, QR codes for venue check-in, and purchase receipts.
        </p>
      </div>

      {/* Release Notice Banner */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
        <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground text-sm">
            Live Ticket Booking System Integration
          </p>
          <p>
            Ticket booking and automated QR check-in will be fully active in the upcoming release. Your registered passes and event tickets will automatically appear here.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="p-6 border rounded-xl space-y-3">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-10 w-24" />
            </div>
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <Card className="text-center py-14">
          <CardContent className="space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <TicketIcon className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg">No tickets yet</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              You haven&apos;t booked any tickets yet. Explore exciting campus events happening at UIU and grab your tickets!
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
          {tickets.map((ticket) => (
            <Card key={ticket.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-6 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={ticket.status === 'ACTIVE' ? 'default' : 'secondary'}>
                      {ticket.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono">
                      #{ticket.id.slice(0, 8)}
                    </span>
                  </div>

                  <h3 className="text-xl font-bold">
                    {ticket.event?.title || 'Campus Event Pass'}
                  </h3>

                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-primary" />
                      <span>
                        {ticket.event?.start_datetime
                          ? formatDate(ticket.event.start_datetime)
                          : 'Campus Schedule'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-primary" />
                      <span>{ticket.event?.venue?.name || 'UIU Main Campus'}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <TicketIcon className="h-3.5 w-3.5 text-primary" />
                      <span className="font-semibold text-foreground">
                        {ticket.tier?.name || 'General Admission'}
                      </span>
                    </div>
                  </div>
                </div>

                <Button
                  variant="outline"
                  onClick={() => setSelectedTicket(ticket)}
                  className="gap-2 shrink-0"
                >
                  <QrCode className="h-4 w-4" />
                  Show QR Pass
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* QR Code Dialog Modal */}
      <Dialog open={Boolean(selectedTicket)} onOpenChange={(open) => !open && setSelectedTicket(null)}>
        <DialogContent className="sm:max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="text-center">Campus Entry Pass</DialogTitle>
            <DialogDescription className="text-center">
              Scan this QR code at the entrance turnstile
            </DialogDescription>
          </DialogHeader>

          {selectedTicket && (
            <div className="py-4 flex flex-col items-center justify-center space-y-4">
              <div className="p-4 bg-white rounded-xl shadow-inner border">
                <QRCode
                  value={selectedTicket.qr_code || `EVENTLY:${selectedTicket.id}`}
                  size={180}
                  level="H"
                />
              </div>

              <div className="text-center space-y-1">
                <p className="font-semibold text-sm">
                  {selectedTicket.event?.title || 'Event Admission'}
                </p>
                <p className="text-xs text-muted-foreground font-mono">
                  Ticket ID: {selectedTicket.id}
                </p>
              </div>
            </div>
          )}

          <Button onClick={() => setSelectedTicket(null)} className="w-full">
            Done
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
