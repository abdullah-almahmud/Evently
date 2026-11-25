import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronLeft,
  Calendar,
  BarChart3,
  Edit,
  Users,
  UserCheck,
  ScanLine,
  Search,
  FolderOpen,
} from 'lucide-react'
import { Event } from '@/types'
import { adminApi } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function AdminEventsPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setIsLoading(true)
        const data = await adminApi.listAllEvents()
        setEvents(data || [])
      } catch (err) {
        console.warn('Failed to load platform events:', err)
        setEvents([])
      } finally {
        setIsLoading(false)
      }
    }
    fetchEvents()
  }, [])

  const filteredEvents = events.filter(
    (e) =>
      e.title.toLowerCase().includes(search.toLowerCase()) ||
      e.organizer?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      e.organizer?.email?.toLowerCase().includes(search.toLowerCase()) ||
      e.category.toLowerCase().includes(search.toLowerCase())
  )

  const getStatusBadge = (status: Event['status']) => {
    switch (status) {
      case 'PUBLISHED':
        return <Badge className="bg-emerald-600 hover:bg-emerald-700">Published</Badge>
      case 'DRAFT':
        return <Badge variant="secondary">Draft</Badge>
      case 'CANCELLED':
        return <Badge variant="destructive">Cancelled</Badge>
      case 'SOLD_OUT':
        return <Badge className="bg-amber-600 hover:bg-amber-700">Sold Out</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button variant="ghost" size="sm" asChild className="gap-1 p-0 h-auto">
          <Link to="/admin">
            <ChevronLeft className="h-4 w-4" />
            Back to Admin Console
          </Link>
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Platform Events Oversight</h1>
          <p className="text-muted-foreground text-sm">
            Inspect all campus events created by organizers across drafts, published events, and cancellations.
          </p>
        </div>

        <div className="w-full sm:w-64 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search event or organizer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">All Campus Events</CardTitle>
          <CardDescription>
            {filteredEvents.length} event{filteredEvents.length === 1 ? '' : 's'} on the platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-4 border rounded-lg space-y-2">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-12 space-y-3 text-muted-foreground text-sm">
              <FolderOpen className="mx-auto h-8 w-8 text-muted-foreground/60" />
              <p>No events found matching your search.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase border-b bg-muted/40">
                  <tr>
                    <th className="py-3 px-4">Event</th>
                    <th className="py-3 px-4">Organizer</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Schedule</th>
                    <th className="py-3 px-4 text-right">Oversight Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredEvents.map((event) => (
                    <tr key={event.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4">
                        <Link
                          to={`/events/${event.id}`}
                          className="font-semibold text-foreground hover:text-primary hover:underline"
                        >
                          {event.title}
                        </Link>
                        <div className="text-xs text-muted-foreground font-mono">
                          {event.category} • {event.venue_name || 'Campus Venue'}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-xs">
                          {event.organizer?.full_name || 'Unknown'}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {event.organizer?.email || ''}
                        </div>
                      </td>
                      <td className="py-3 px-4">{getStatusBadge(event.status)}</td>
                      <td className="py-3 px-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-primary" />
                          <span>{formatDate(event.start_datetime, 'MMM d, yyyy')}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          <Button variant="ghost" size="sm" asChild className="h-8 gap-1">
                            <Link to={`/organizer/events/${event.id}/analytics`}>
                              <BarChart3 className="h-3.5 w-3.5" />
                              Analytics
                            </Link>
                          </Button>
                          <Button variant="ghost" size="sm" asChild className="h-8 gap-1">
                            <Link to={`/organizer/events/${event.id}/staff`}>
                              <Users className="h-3.5 w-3.5" />
                              Staff
                            </Link>
                          </Button>
                          <Button variant="ghost" size="sm" asChild className="h-8 gap-1">
                            <Link to={`/organizer/events/${event.id}/volunteers`}>
                              <UserCheck className="h-3.5 w-3.5" />
                              Volunteers
                            </Link>
                          </Button>
                          <Button variant="ghost" size="sm" asChild className="h-8 gap-1">
                            <Link to={`/staff/gate/${event.id}`}>
                              <ScanLine className="h-3.5 w-3.5" />
                              Gate
                            </Link>
                          </Button>
                          <Button variant="ghost" size="sm" asChild className="h-8 gap-1">
                            <Link to={`/organizer/events/${event.id}/edit`}>
                              <Edit className="h-3.5 w-3.5" />
                              Edit
                            </Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
