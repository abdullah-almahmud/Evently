import { useState, FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ChevronLeft, Loader2, Armchair } from 'lucide-react'
import { LayoutType } from '@/types'
import { venuesApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { toast } from 'sonner'

interface SectionSpec {
  name: string
  rows: number
  seats_per_row: number
}

const SEATED_CAPACITY_PRESETS = [
  { label: '30 Seats', subtitle: 'Seminar Room', value: 30 },
  { label: '50 Seats', subtitle: 'Standard Studio', value: 50 },
  { label: '100 Seats', subtitle: 'Seminar Hall', value: 100 },
  { label: '150 Seats', subtitle: 'Auditorium', value: 150 },
  { label: '200 Seats', subtitle: 'Grand Hall', value: 200 },
]

function buildGenericSections(capacity: number): SectionSpec[] {
  const cap = Math.max(10, Math.min(500, Math.floor(capacity || 50)))
  const cols = cap >= 240 ? 12 : 10
  const fullRows = Math.floor(cap / cols)
  const remainder = cap % cols

  const sections: SectionSpec[] = []
  if (fullRows >= 12) {
    const vipRows = Math.max(2, Math.round(fullRows * 0.2))
    const balconyRows = Math.max(2, Math.round(fullRows * 0.25))
    const mainRows = fullRows - vipRows - balconyRows
    sections.push({ name: 'VIP Front', rows: vipRows, seats_per_row: cols })
    sections.push({ name: 'Main Floor', rows: mainRows, seats_per_row: cols })
    sections.push({ name: 'Balcony', rows: balconyRows, seats_per_row: cols })
  } else if (fullRows >= 3) {
    const vipRows = Math.max(1, Math.round(fullRows * 0.3))
    const mainRows = fullRows - vipRows
    sections.push({ name: 'VIP Front', rows: vipRows, seats_per_row: cols })
    sections.push({ name: 'Main Hall', rows: mainRows, seats_per_row: cols })
  } else {
    sections.push({ name: 'Main Seating', rows: fullRows, seats_per_row: cols })
  }

  if (remainder > 0) {
    sections.push({ name: 'Side Gallery', rows: 1, seats_per_row: remainder })
  }

  return sections
}

export function CreateVenuePage() {
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [address, setAddress] = useState('United City, Madani Avenue, Badda, Dhaka 1212')
  const [city, setCity] = useState('Dhaka')
  const [totalCapacity, setTotalCapacity] = useState(50)
  const [layoutType, setLayoutType] = useState<LayoutType>('SEATED')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const genericSections = layoutType === 'SEATED' ? buildGenericSections(totalCapacity) : []
  const computedSeatTotal = genericSections.reduce((s, sec) => s + sec.rows * sec.seats_per_row, 0)

  const handleLayoutChange = (val: LayoutType) => {
    setLayoutType(val)
    if (val === 'SEATED' && totalCapacity > 500) {
      setTotalCapacity(150)
    } else if (val === 'SEATED' && totalCapacity < 30) {
      setTotalCapacity(50)
    } else if (val === 'GENERAL_ADMISSION' && totalCapacity <= 50) {
      setTotalCapacity(250)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!name.trim() || !address.trim() || !city.trim() || totalCapacity <= 0) {
      toast.error('Please fill in all required venue details.')
      return
    }

    if (layoutType === 'SEATED' && (totalCapacity < 20 || totalCapacity > 500)) {
      toast.error('Seated venues support 20 to 500 interactive seats (recommended: 50+).')
      return
    }

    try {
      setIsSubmitting(true)
      await venuesApi.createVenue({
        name: name.trim(),
        address: address.trim(),
        city: city.trim(),
        total_capacity: layoutType === 'SEATED' ? computedSeatTotal : Number(totalCapacity),
        layout_type: layoutType,
        description: description.trim() || undefined,
        sections: layoutType === 'SEATED' ? genericSections : undefined,
      })

      toast.success('Campus venue created successfully!')
      navigate('/organizer/venues')
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Failed to create venue.'
      toast.error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button variant="ghost" size="sm" asChild className="gap-1 p-0 h-auto">
          <Link to="/organizer/venues">
            <ChevronLeft className="h-4 w-4" />
            Back to Venues
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create Campus Venue</h1>
        <p className="text-muted-foreground text-sm">
          Register a campus hall, smart classroom, or open plaza for event bookings.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Venue Information</CardTitle>
            <CardDescription>Location, layout format, and total capacity</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="venueName">Venue Name *</Label>
              <Input
                id="venueName"
                placeholder="e.g. UIU Seminar Hall C"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="layoutType">Venue Type *</Label>
                <Select
                  value={layoutType}
                  onValueChange={(val) => handleLayoutChange(val as LayoutType)}
                >
                  <SelectTrigger id="layoutType">
                    <SelectValue placeholder="Select Layout" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SEATED">
                      Seated (Supports generic interactive seat maps)
                    </SelectItem>
                    <SelectItem value="GENERAL_ADMISSION">
                      General Admission (Open floor / unassigned)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="city">City / Campus Area *</Label>
                <Input
                  id="city"
                  placeholder="Dhaka"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="address">Full Campus Address *</Label>
              <Input
                id="address"
                placeholder="United City, Madani Avenue, Badda, Dhaka 1212"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="capacity">
                {layoutType === 'SEATED' ? 'Total Venue Seats (20 – 500) *' : 'Total Capacity *'}
              </Label>
              <Input
                id="capacity"
                type="number"
                min={layoutType === 'SEATED' ? 20 : 1}
                max={layoutType === 'SEATED' ? 500 : 50000}
                value={totalCapacity}
                onChange={(e) => setTotalCapacity(Number(e.target.value))}
                required
              />
              {layoutType === 'SEATED' && (
                <p className="text-xs text-muted-foreground">
                  Recommended: 50+ seats. Pick a preset below or enter any seat count up to 500.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Venue Description (Optional)</Label>
              <Textarea
                id="description"
                placeholder="Audio-visual setup, projector, air-conditioning, accessibility..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Generic Seating Layout Preview */}
        {layoutType === 'SEATED' && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Armchair className="h-5 w-5 text-primary" />
                Generic Auditorium Layout Preview
              </CardTitle>
              <CardDescription>
                Seats are automatically arranged in balanced rows from stage front to back
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {SEATED_CAPACITY_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setTotalCapacity(preset.value)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg border text-left transition-all text-xs',
                      totalCapacity === preset.value
                        ? 'border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary/30'
                        : 'bg-muted/30 hover:bg-muted/60 text-foreground'
                    )}
                  >
                    <div>{preset.label}</div>
                    <div className="text-[10px] text-muted-foreground font-normal">{preset.subtitle}</div>
                  </button>
                ))}
              </div>

              <div className="rounded-lg border bg-muted/20 p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span>Auto-Generated Section Breakdown</span>
                  <Badge variant="outline">{computedSeatTotal} Total Seats</Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  {genericSections.map((sec, idx) => (
                    <div key={idx} className="rounded-md border bg-background p-2.5 text-xs space-y-0.5">
                      <p className="font-semibold text-foreground">{sec.name}</p>
                      <p className="text-muted-foreground">
                        {sec.rows} {sec.rows === 1 ? 'row' : 'rows'} × {sec.seats_per_row} seats
                      </p>
                      <p className="text-primary font-semibold">{sec.rows * sec.seats_per_row} seats</p>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-end gap-3 pt-4">
          <Button variant="outline" type="button" asChild>
            <Link to="/organizer/venues">Cancel</Link>
          </Button>
          <Button type="submit" disabled={isSubmitting} className="min-w-32">
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Venue'
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
