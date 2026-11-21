import { useState, useEffect, FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  ChevronLeft,
  Plus,
  Trash2,
  Loader2,
} from 'lucide-react'
import { EventCategory, Venue } from '@/types'
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
import { toast } from 'sonner'

interface TierFormItem {
  name: string
  description: string
  price: number
  total_quantity: number
  max_per_user: number
}

export function CreateEventPage() {
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
  const [isLoadingVenues, setIsLoadingVenues] = useState(true)

  // Ticket Tiers
  const [tiers, setTiers] = useState<TierFormItem[]>([
    {
      name: 'General Admission',
      description: 'Standard campus pass',
      price: 0,
      total_quantity: 100,
      max_per_user: 2,
    },
  ])

  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const fetchVenues = async () => {
      try {
        setIsLoadingVenues(true)
        const data = await venuesApi.listVenues()
        setVenues(data || [])
        if (data && data.length > 0) {
          setVenueId(data[0].id)
        }
      } catch (err) {
        console.warn('Could not fetch venues:', err)
      } finally {
        setIsLoadingVenues(false)
      }
    }
    fetchVenues()
  }, [])

  const addTier = () => {
    setTiers([
      ...tiers,
      {
        name: '',
        description: '',
        price: 0,
        total_quantity: 50,
        max_per_user: 2,
      },
    ])
  }

  const removeTier = (index: number) => {
    if (tiers.length <= 1) {
      toast.warning('Event must have at least one ticket tier.')
      return
    }
    setTiers(tiers.filter((_, i) => i !== index))
  }

  const updateTierField = (index: number, field: keyof TierFormItem, value: string | number) => {
    const updated = [...tiers]
    updated[index] = {
      ...updated[index],
      [field]: value,
    }
    setTiers(updated)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!title.trim() || !description.trim() || !venueId || !startDatetime || !endDatetime) {
      toast.error('Please fill in all required fields.')
      return
    }

    if (new Date(endDatetime) <= new Date(startDatetime)) {
      toast.error('Event end time must be after the start time.')
      return
    }

    // Validate tiers
    for (const tier of tiers) {
      if (!tier.name.trim()) {
        toast.error('All ticket tiers must have a name.')
        return
      }
      if (tier.total_quantity <= 0) {
        toast.error(`Quantity for tier "${tier.name}" must be greater than 0.`)
        return
      }
    }

    try {
      setIsSubmitting(true)
      await eventsApi.createEvent({
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
        ticket_tiers: tiers.map((t) => ({
          name: t.name.trim(),
          description: t.description.trim() || undefined,
          price: Number(t.price),
          total_quantity: Number(t.total_quantity),
          max_per_user: Number(t.max_per_user),
        })),
      })

      toast.success('Event created successfully as a draft!')
      navigate('/organizer/events')
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Failed to create event. Please check inputs and try again.'
      toast.error(msg)
      console.error(err)
    } finally {
      setIsSubmitting(false)
    }
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
        <h1 className="text-3xl font-bold tracking-tight">Create New Event</h1>
        <p className="text-muted-foreground text-sm">
          Set up a campus event, choose venue layout, and configure ticket allocations.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Basic Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Event Details</CardTitle>
            <CardDescription>Primary information displayed to students and staff</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Event Title *</Label>
              <Input
                id="title"
                placeholder="e.g. UIU CSE Tech Fest 2025"
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
                <div className="flex items-center justify-between">
                  <Label htmlFor="venue">Campus Venue *</Label>
                  <Link to="/organizer/venues/create" className="text-xs text-primary hover:underline">
                    + Add New Venue
                  </Link>
                </div>
                <Select
                  value={venueId}
                  onValueChange={setVenueId}
                  disabled={isLoadingVenues || venues.length === 0}
                >
                  <SelectTrigger id="venue">
                    <SelectValue placeholder={isLoadingVenues ? 'Loading venues...' : 'Select Venue'} />
                  </SelectTrigger>
                  <SelectContent>
                    {venues.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name} ({v.city}) — Cap: {v.total_capacity}
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
                placeholder="https://example.com/banner.jpg"
                value={bannerUrl}
                onChange={(e) => setBannerUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Optional: direct image link for the event header and cards.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Event Description *</Label>
              <Textarea
                id="description"
                placeholder="Describe schedule, guest speakers, eligibility, prerequisites, and prizes..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                required
              />
            </div>
          </CardContent>
        </Card>

        {/* Schedule & Registration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Schedule & Registration Window</CardTitle>
            <CardDescription>Specify dates for attendance and ticket sales</CardDescription>
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
                <Label htmlFor="regStart">Registration Opens (Optional)</Label>
                <Input
                  id="regStart"
                  type="datetime-local"
                  value={registrationStart}
                  onChange={(e) => setRegistrationStart(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="regEnd">Registration Closes (Optional)</Label>
                <Input
                  id="regEnd"
                  type="datetime-local"
                  value={registrationEnd}
                  onChange={(e) => setRegistrationEnd(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center space-x-3 pt-3 border-t">
              <input
                id="isSeated"
                type="checkbox"
                checked={isSeated}
                onChange={(e) => setIsSeated(e.target.checked)}
                className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
              />
              <Label htmlFor="isSeated" className="cursor-pointer">
                Seated Layout (Assign specific rows and seat numbers for attendees)
              </Label>
            </div>
          </CardContent>
        </Card>

        {/* Ticket Tiers */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Ticket Tiers & Passes</CardTitle>
              <CardDescription>Define prices and quantity limits for registration</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addTier} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Add Tier
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {tiers.map((tier, idx) => (
              <div
                key={idx}
                className="rounded-lg border p-4 bg-muted/20 space-y-3 relative group"
              >
                <div className="flex items-center justify-between pb-2 border-b">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Tier #{idx + 1}
                  </span>
                  {tiers.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeTier(idx)}
                      className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Tier Name *</Label>
                    <Input
                      placeholder="e.g. Early Bird / VIP / Student Pass"
                      value={tier.name}
                      onChange={(e) => updateTierField(idx, 'name', e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Price (BDT ৳ — 0 for Free)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={tier.price}
                      onChange={(e) => updateTierField(idx, 'price', Number(e.target.value))}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Total Quantity *</Label>
                    <Input
                      type="number"
                      min="1"
                      value={tier.total_quantity}
                      onChange={(e) => updateTierField(idx, 'total_quantity', Number(e.target.value))}
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Max Tickets per Attendee</Label>
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      value={tier.max_per_user}
                      onChange={(e) => updateTierField(idx, 'max_per_user', Number(e.target.value))}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Short Description / Perks (Optional)</Label>
                  <Input
                    placeholder="Includes refreshments, welcome kit & certificate"
                    value={tier.description}
                    onChange={(e) => updateTierField(idx, 'description', e.target.value)}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Submit Bar */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <Button variant="outline" type="button" asChild>
            <Link to="/organizer/events">Cancel</Link>
          </Button>
          <Button type="submit" disabled={isSubmitting} className="min-w-32">
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Create Event'
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
