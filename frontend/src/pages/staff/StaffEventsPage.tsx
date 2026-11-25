import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Calendar,
  MapPin,
  ScanLine,
  Loader2,
  FolderOpen,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { staffApi } from '@/lib/api'
import type { Event, StaffRole } from '@/types'

function roleBadge(role: StaffRole) {
  switch (role) {
    case 'COORDINATOR':
      return <Badge className="bg-indigo-600 hover:bg-indigo-700">Coordinator</Badge>
    default:
      return <Badge variant="secondary">Gate Staff</Badge>
  }
}

// The API returns Events with an extra 'role' field attached when coming from /staff/my-events
interface StaffEvent extends Event {
  role?: StaffRole
}

export function StaffEventsPage() {
  const [events, setEvents] = useState<StaffEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setLoading(true)
        const data = await staffApi.getMyEvents()
        setEvents((data as StaffEvent[]) || [])
      } catch {
        setEvents([])
      } finally {
        setLoading(false)
      }
    }
    fetchEvents()
  }, [])

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-7 w-7 text-primary" />
          My Staff Events
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Events you have been assigned to as staff. Open the gate dashboard to manage check-ins.
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-6 border rounded-xl space-y-3">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-10 w-36" />
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <Card className="text-center py-14">
          <CardContent className="space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <FolderOpen className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg">No staff assignments yet</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              You haven&apos;t been assigned to any events yet. Apply to volunteer for events to be
              assigned as Gate Staff.
            </p>
            <Button asChild variant="outline">
              <Link to="/">Browse Events</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {events.map((event) => (
            <Card key={event.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-6 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {event.role && roleBadge(event.role)}
                    <Badge
                      variant={event.status === 'PUBLISHED' ? 'default' : 'secondary'}
                      className="text-xs"
                    >
                      {event.status}
                    </Badge>
                  </div>

                  <h3 className="text-xl font-bold">{event.title}</h3>

                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-primary" />
                      <span>
                        {new Date(event.start_datetime).toLocaleDateString(undefined, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                    {event.venue?.name && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-primary" />
                        <span>{event.venue.name}</span>
                      </div>
                    )}
                  </div>
                </div>

                <Button asChild className="gap-2 shrink-0">
                  <Link to={`/staff/gate/${event.id}`}>
                    <ScanLine className="h-4 w-4" />
                    Open Gate Dashboard
                  </Link>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      )}
    </div>
  )
}
