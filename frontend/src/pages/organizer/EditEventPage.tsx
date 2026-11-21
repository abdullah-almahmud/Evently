import { useState, useEffect, FormEvent } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ChevronLeft, Plus, Trash2, Loader2 } from 'lucide-react'
import { EventCategory, Venue, TicketTier } from '@/types'
import { eventsApi, venuesApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

export function EditEventPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  // Form State
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<EventCategory>('WORKSHOP')
  const [venueId, setVenueId] = useState('')
  const [bannerUrl, setBannerUrl] = useState('')
  const [startDatetime, setStartDatetime] = useState('')
  const [endDatetime, setEndDatetime] = useState('')
  const [registrationStart, setRegistrationStart] = useState('')
  const [registrationEnd, setRegistrationEnd] = useState('')
  const [isSeated, setIsSeated] = useState(false)

  // Venues List
  const [venues, setVenues] = useState<Venue[]>([])
  const [tiers, setTiers] = useState<TicketTier[]>([])

  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Format date helper for datetime-local input
  const toLocalISO = (isoString?: string | null) => {
    if (!isoString) return ''
    const d = new Date(isoString)
    const pad = (n: number) => n.toString().padStart(2, '0')
    const year = d.getFullYear()
    const month = pad(d.getMonth() + 1)
    const day = pad(d.getDate())
    const hours = pad(d.getHours())
    const minutes = pad(d.getMinutes())
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }

  useEffect(() => {
    if (!id) return

    const loadData = async () => {
      try {
        setIsLoading(true)
        const [eventData, venuesList, tiersList] = await Promise.all([
          eventsApi.getEvent(id),
          venuesApi.listVenues(),
          eventsApi.getEventTiers(id).catch(() => []),
        ])

        setTitle(eventData.title)
        setDescription(eventData.description)
        setCategory(eventData.category)
        setVenueId(eventData.venue_id)
        setBannerUrl(eventData.banner_url || '')
        setStartDatetime(toLocalISO(eventData.start_datetime))
        setEndDatetime(toLocalISO(eventData.end_datetime))
        setRegistrationStart(toLocalISO(eventData.registration_start))
        setRegistrationEnd(toLocalISO(eventData.registration_end))
        setIsSeated(eventData.is_seated)

        setVenues(venuesList || [])
        setTiers(tiersList || [])
      } catch (err) {
        console.error('Failed to load event for editing:', err)
        toast.error('Failed to load event data.')
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [id])

  const handleAddTier = async () => {
    if (!id) return
    try {
      const newTier = await eventsApi.createTier(id, {
        name: 'New Ticket Tier',
        price: 0,
        total_quantity: 50,
        max_per_user: 2,
      })
      setTiers([...tiers, newTier])
      toast.success('Ticket tier added.')
    } catch {
      toast.error('Failed to add ticket tier.')
    }
  }

  const handleDeleteTier = async (tierId: string) => {
    if (!id) return
    if (tiers.length <= 1) {
      toast.warning('Event must keep at least one ticket tier.')
      return
    }
    try {
      await eventsApi.deleteTier(id, tierId)
      setTiers(tiers.filter((t) => t.id !== tierId))
      toast.success('Ticket tier removed.')
    } catch {
      toast.error('Failed to delete ticket tier.')
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!id) return

    if (!title.trim() || !description.trim() || !venueId || !startDatetime || !endDatetime) {
      toast.error('Please fill in all required fields.')
      return
    }

    try {
      setIsSubmitting(true)
      await eventsApi.updateEvent(id, {
        title: title.trim(),
        description: description.trim(),
        category,
        venue_id: venueId,
        banner_url: bannerUrl.trim() || undefined,
        start_datetime: new Date(startDatetime).toISOString(),
        end_datetime: new Date(endDatetime).toISOString(),
        registration_start: registrationStart ? new Date(registrationStart).toISOString() : undefined,
        registration_end: registrationEnd ? new Date(registrationEnd).toISOString() : undefined,
        is_seated: isSeated,
      })

      toast.success('Event details updated successfully!')
      navigate('/organizer/events')
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Failed to update event.'
      toast.error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button variant="ghost" size="sm" asChild className="gap-1 p-0 h-auto">
          <Link to="/organizer/events">
            <ChevronLeft className="h-4 w-4" />
            Back to Events
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Edit Event</h1>
        <p className="text-muted-foreground text-sm">
          Update event details, timing, or manage ticket allocations.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Event Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Event Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="category">Category *</Label>
                <Select value={category} onValueChange={(val) => setCategory(val as EventCategory)}>
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WORKSHOP">Workshop</SelectItem>
                    <SelectItem value="CONFERENCE">Conference</SelectItem>
                    <SelectItem value="CONCERT">Concert</SelectItem>
                    <SelectItem value="FESTIVAL">Festival</SelectItem>
                    <SelectItem value="SPORTS">Sports</SelectItem>
                    <SelectItem value="CULTURAL">Cultural</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="venue">Campus Venue *</Label>
                <Select value={venueId} onValueChange={setVenueId}>
                  <SelectTrigger id="venue">
                    <SelectValue placeholder="Select Venue" />
                  </SelectTrigger>
                  <SelectContent>
                    {venues.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name} ({v.city})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bannerUrl">Banner Image URL</Label>
              <Input
                id="bannerUrl"
                value={bannerUrl}
                onChange={(e) => setBannerUrl(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Event Description *</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                required
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Schedule & Registration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="startDatetime">Event Start Date & Time *</Label>
                <Input
                  id="startDatetime"
                  type="datetime-local"
                  value={startDatetime}
                  onChange={(e) => setStartDatetime(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="endDatetime">Event End Date & Time *</Label>
                <Input
                  id="endDatetime"
                  type="datetime-local"
                  value={endDatetime}
                  onChange={(e) => setEndDatetime(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="regStart">Registration Opens</Label>
                <Input
                  id="regStart"
                  type="datetime-local"
                  value={registrationStart}
                  onChange={(e) => setRegistrationStart(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="regEnd">Registration Closes</Label>
                <Input
                  id="regEnd"
                  type="datetime-local"
                  value={registrationEnd}
                  onChange={(e) => setRegistrationEnd(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Existing Tiers */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Ticket Tiers</CardTitle>
              <CardDescription>Existing tiers associated with this event</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={handleAddTier} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Add Tier
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {tiers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No custom ticket tiers set.</p>
            ) : (
              tiers.map((tier) => (
                <div
                  key={tier.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/20"
                >
                  <div>
                    <h4 className="font-semibold text-sm">{tier.name}</h4>
                    <p className="text-xs text-muted-foreground">
                      Price: ৳{tier.price} | Total: {tier.total_quantity} | Available: {tier.available_quantity}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteTier(tier.id)}
                    className="text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-3 pt-4">
          <Button variant="outline" type="button" asChild>
            <Link to="/organizer/events">Cancel</Link>
          </Button>
          <Button type="submit" disabled={isSubmitting} className="min-w-32">
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
