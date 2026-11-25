import { useState, useEffect, FormEvent } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ChevronLeft, Plus, Trash2, Loader2, Pencil, Users, UserCheck, BarChart3 } from 'lucide-react'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
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

  // Tier Modal State
  const [isTierModalOpen, setIsTierModalOpen] = useState(false)
  const [editingTier, setEditingTier] = useState<TicketTier | null>(null)
  const [tierForm, setTierForm] = useState({
    name: '',
    price: 0,
    total_quantity: 50,
    max_per_user: 4,
    description: '',
  })
  const [isTierSaving, setIsTierSaving] = useState(false)

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
        // Use either dedicated tier list or embedded tiers
        const loadedTiers = (tiersList && tiersList.length > 0) ? tiersList : (eventData.tiers || eventData.ticket_tiers || [])
        setTiers(loadedTiers)
      } catch (err) {
        console.error('Failed to load event for editing:', err)
        toast.error('Failed to load event data.')
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [id])

  const openAddTierModal = () => {
    setEditingTier(null)
    setTierForm({
      name: '',
      price: 0,
      total_quantity: 50,
      max_per_user: 4,
      description: '',
    })
    setIsTierModalOpen(true)
  }

  const openEditTierModal = (tier: TicketTier) => {
    setEditingTier(tier)
    setTierForm({
      name: tier.name,
      price: Number(tier.price),
      total_quantity: tier.total_quantity,
      max_per_user: tier.max_per_user,
      description: tier.description || '',
    })
    setIsTierModalOpen(true)
  }

  const handleSaveTier = async (e: FormEvent) => {
    e.preventDefault()
    if (!id) return

    if (!tierForm.name.trim()) {
      toast.error('Tier name is required.')
      return
    }
    if (tierForm.total_quantity <= 0) {
      toast.error('Total quantity must be greater than 0.')
      return
    }
    if (tierForm.price < 0) {
      toast.error('Price cannot be negative.')
      return
    }

    try {
      setIsTierSaving(true)
      if (editingTier) {
        const updated = await eventsApi.updateTier(id, editingTier.id, {
          name: tierForm.name.trim(),
          price: Number(tierForm.price),
          total_quantity: Number(tierForm.total_quantity),
          max_per_user: Number(tierForm.max_per_user),
          description: tierForm.description.trim() || undefined,
        })
        setTiers(tiers.map((t) => (t.id === editingTier.id ? updated : t)))
        toast.success(`Tier "${updated.name}" updated successfully!`)
      } else {
        const created = await eventsApi.createTier(id, {
          name: tierForm.name.trim(),
          price: Number(tierForm.price),
          total_quantity: Number(tierForm.total_quantity),
          max_per_user: Number(tierForm.max_per_user),
          description: tierForm.description.trim() || undefined,
        })
        setTiers([...tiers, created])
        toast.success(`Tier "${created.name}" added successfully!`)
      }
      setIsTierModalOpen(false)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Failed to save ticket tier.'
      toast.error(msg)
    } finally {
      setIsTierSaving(false)
    }
  }

  const handleDeleteTier = async (tierId: string) => {
    if (!id) return
    if (tiers.length <= 1) {
      toast.warning('Event must keep at least one ticket tier.')
      return
    }
    if (!window.confirm('Are you sure you want to delete this ticket tier?')) {
      return
    }
    try {
      await eventsApi.deleteTier(id, tierId)
      setTiers(tiers.filter((t) => t.id !== tierId))
      toast.success('Ticket tier removed.')
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Failed to delete ticket tier.'
      toast.error(msg)
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

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Event</h1>
          <p className="text-muted-foreground text-sm">
            Update event details, timing, or manage ticket allocations.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" asChild className="gap-1.5">
            <Link to={`/organizer/events/${id}/staff`}>
              <Users className="h-4 w-4 text-primary" />
              Event Staff
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild className="gap-1.5">
            <Link to={`/organizer/events/${id}/volunteers`}>
              <UserCheck className="h-4 w-4 text-emerald-600" />
              Volunteers
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild className="gap-1.5">
            <Link to={`/organizer/events/${id}/analytics`}>
              <BarChart3 className="h-4 w-4 text-indigo-600" />
              Analytics
            </Link>
          </Button>
        </div>
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
              <CardDescription>
                Configure pricing and capacity allocations for this event (editable anytime)
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openAddTierModal}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Add Tier
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {tiers.length === 0 ? (
              <div className="text-center py-6 border border-dashed rounded-lg space-y-2">
                <p className="text-sm text-muted-foreground">No ticket tiers configured for this event.</p>
                <Button type="button" variant="outline" size="sm" onClick={openAddTierModal}>
                  Create First Ticket Tier
                </Button>
              </div>
            ) : (
              tiers.map((tier) => (
                <div
                  key={tier.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border bg-muted/20 gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-sm text-foreground">{tier.name}</h4>
                      <Badge variant="outline" className="font-bold text-primary">
                        {Number(tier.price) === 0 ? 'Free' : `৳${tier.price}`}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {tier.available_quantity} / {tier.total_quantity} left
                      </Badge>
                    </div>
                    {tier.description && (
                      <p className="text-xs text-muted-foreground">{tier.description}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      Limit: {tier.max_per_user} {tier.max_per_user === 1 ? 'ticket' : 'tickets'} per attendee
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openEditTierModal(tier)}
                      className="gap-1 h-8 text-xs"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteTier(tier.id)}
                      className="h-8 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
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

      {/* Add / Edit Tier Modal */}
      <Dialog open={isTierModalOpen} onOpenChange={setIsTierModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSaveTier}>
            <DialogHeader>
              <DialogTitle>
                {editingTier ? `Edit Tier: ${editingTier.name}` : 'Add New Ticket Tier'}
              </DialogTitle>
              <DialogDescription>
                Configure pricing, capacity, and attendee limits for this ticket tier.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="tierName">Tier Name *</Label>
                <Input
                  id="tierName"
                  placeholder="e.g. VIP Pass, Early Bird, General"
                  value={tierForm.name}
                  onChange={(e) => setTierForm({ ...tierForm, name: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="tierPrice">Price (BDT ৳ — 0 for Free) *</Label>
                  <Input
                    id="tierPrice"
                    type="number"
                    min="0"
                    step="0.01"
                    value={tierForm.price}
                    onChange={(e) =>
                      setTierForm({ ...tierForm, price: parseFloat(e.target.value) || 0 })
                    }
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="tierQty">Total Quantity *</Label>
                  <Input
                    id="tierQty"
                    type="number"
                    min="1"
                    value={tierForm.total_quantity}
                    onChange={(e) =>
                      setTierForm({ ...tierForm, total_quantity: parseInt(e.target.value) || 1 })
                    }
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tierLimit">Max Tickets per Attendee *</Label>
                <Input
                  id="tierLimit"
                  type="number"
                  min="1"
                  max="20"
                  value={tierForm.max_per_user}
                  onChange={(e) =>
                    setTierForm({ ...tierForm, max_per_user: parseInt(e.target.value) || 1 })
                  }
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tierDesc">Perks / Description (Optional)</Label>
                <Input
                  id="tierDesc"
                  placeholder="Includes refreshments, front-row seat & kit"
                  value={tierForm.description}
                  onChange={(e) => setTierForm({ ...tierForm, description: e.target.value })}
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsTierModalOpen(false)}
                disabled={isTierSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isTierSaving}>
                {isTierSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : editingTier ? (
                  'Update Tier'
                ) : (
                  'Add Tier'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
