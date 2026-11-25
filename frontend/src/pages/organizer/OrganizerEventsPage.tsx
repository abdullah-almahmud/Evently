import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  PlusCircle,
  Calendar,
  BarChart3,
  Edit,
  Globe,
  Ban,
  Loader2,
  FolderOpen,
} from 'lucide-react'
import { Event } from '@/types'
import { eventsApi } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

export function OrganizerEventsPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)

  const loadMyEvents = async () => {
    try {
      setIsLoading(true)
      const data = await eventsApi.getMyEvents()
      setEvents(data || [])
    } catch (err) {
      console.warn('Failed to load organizer events:', err)
      setEvents([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadMyEvents()
  }, [])

  const handlePublish = async (id: string) => {
    try {
      setActionLoadingId(id)
      await eventsApi.publishEvent(id)
      toast.success('Event published successfully! It is now visible to attendees.')
      loadMyEvents()
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Failed to publish event. Please ensure the event has at least one ticket tier.'
      toast.error(msg)
      console.error(err)
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleCancel = async (id: string) => {
    if (!window.confirm('Are you sure you want to cancel this event? This action will notify attendees.')) {
      return
    }
    try {
      setActionLoadingId(id)
      await eventsApi.updateEvent(id, { status: 'CANCELLED' })
      toast.success('Event cancelled.')
      loadMyEvents()
    } catch (err) {
      toast.error('Failed to cancel event.')
      console.error(err)
    } finally {
      setActionLoadingId(null)
    }
  }

  const getStatusBadge = (status: Event['status']) => {
    switch (status) {
      case 'PUBLISHED':
        return <Badge className="bg-emerald-600 hover:bg-emerald-700">Published</Badge>
      case 'DRAFT':
        return <Badge variant="secondary">Draft</Badge>
      case 'SOLD_OUT':
        return <Badge className="bg-amber-600 hover:bg-amber-700">Sold Out</Badge>
      case 'CANCELLED':
        return <Badge variant="destructive">Cancelled</Badge>
      case 'COMPLETED':
        return <Badge variant="outline">Completed</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Organizer Events</h1>
          <p className="text-muted-foreground text-sm">
            Manage your created events, configure ticket tiers, and view attendance analytics.
          </p>
        </div>
        <Button asChild className="gap-2">
          <Link to="/organizer/events/create">
            <PlusCircle className="h-4 w-4" />
            Create Event
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Your Events</CardTitle>
          <CardDescription>
            {events.length} {events.length === 1 ? 'event' : 'events'} created under your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <Skeleton className="h-8 w-24" />
                </div>
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-12 space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <FolderOpen className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-base">No events created yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Get started by creating your first university event, defining venues, and ticket passes.
              </p>
              <Button asChild size="sm">
                <Link to="/organizer/events/create">Create My First Event</Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase border-b bg-muted/40">
                  <tr>
                    <th className="py-3 px-4">Event Title</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Tiers</th>
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {events.map((event) => {
                    const isBusy = actionLoadingId === event.id
                    const tierCount = event.tiers?.length ?? event.ticket_tiers?.length ?? 0
                    return (
                      <tr key={event.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4 font-medium text-foreground">
                          <Link
                            to={`/events/${event.id}`}
                            className="hover:text-primary transition-colors hover:underline"
                          >
                            {event.title}
                          </Link>
                        </td>
                        <td className="py-3 px-4">{getStatusBadge(event.status)}</td>
                        <td className="py-3 px-4">
                          {tierCount > 0 ? (
                            <Badge variant="outline" className="text-xs font-normal">
                              {tierCount} {tierCount === 1 ? 'tier' : 'tiers'}
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs font-normal">
                              0 tiers
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-primary" />
                            <span>{formatDate(event.start_datetime, 'MMM d, yyyy h:mm a')}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-xs font-mono">{event.category}</span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {event.status === 'DRAFT' && (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isBusy}
                                onClick={() => handlePublish(event.id)}
                                className="h-8 gap-1 text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                              >
                                {isBusy ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Globe className="h-3.5 w-3.5" />
                                )}
                                Publish
                              </Button>
                            )}

                            <Button variant="ghost" size="sm" asChild className="h-8 gap-1">
                              <Link to={`/organizer/events/${event.id}/edit`}>
                                <Edit className="h-3.5 w-3.5" />
                                Edit
                              </Link>
                            </Button>

                            <Button variant="ghost" size="sm" asChild className="h-8 gap-1">
                              <Link to={`/organizer/events/${event.id}/analytics`}>
                                <BarChart3 className="h-3.5 w-3.5" />
                                Analytics
                              </Link>
                            </Button>

                            {event.status === 'PUBLISHED' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={isBusy}
                                onClick={() => handleCancel(event.id)}
                                className="h-8 text-destructive hover:bg-destructive/10"
                              >
                                <Ban className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
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
    </div>
  )
}
