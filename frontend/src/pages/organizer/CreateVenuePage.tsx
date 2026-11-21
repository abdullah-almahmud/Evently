import { useState, FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ChevronLeft, Plus, Trash2, Loader2, Armchair } from 'lucide-react'
import { LayoutType } from '@/types'
import { venuesApi } from '@/lib/api'
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

interface SectionInput {
  name: string
  rows: number
  seats_per_row: number
}

export function CreateVenuePage() {
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('Dhaka')
  const [totalCapacity, setTotalCapacity] = useState(250)
  const [layoutType, setLayoutType] = useState<LayoutType>('GENERAL_ADMISSION')
  const [description, setDescription] = useState('')
  const [sections, setSections] = useState<SectionInput[]>([
    { name: 'Balcony', rows: 10, seats_per_row: 15 },
  ])
  const [isSubmitting, setIsSubmitting] = useState(false)

  const addSection = () => {
    setSections([...sections, { name: '', rows: 5, seats_per_row: 10 }])
  }

  const removeSection = (index: number) => {
    setSections(sections.filter((_, i) => i !== index))
  }

  const updateSection = (index: number, field: keyof SectionInput, val: string | number) => {
    const updated = [...sections]
    updated[index] = {
      ...updated[index],
      [field]: val,
    }
    setSections(updated)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!name.trim() || !address.trim() || !city.trim() || totalCapacity <= 0) {
      toast.error('Please fill in all required venue details.')
      return
    }

    try {
      setIsSubmitting(true)
      await venuesApi.createVenue({
        name: name.trim(),
        address: address.trim(),
        city: city.trim(),
        total_capacity: Number(totalCapacity),
        layout_type: layoutType,
        description: description.trim() || undefined,
        sections:
          layoutType === 'SEATED'
            ? sections.map((s) => ({
                name: s.name.trim(),
                rows: Number(s.rows),
                seats_per_row: Number(s.seats_per_row),
              }))
            : undefined,
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
          Register an auditorium, classroom complex, or sports ground for event bookings.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Venue Information</CardTitle>
            <CardDescription>Location and capacity details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="venueName">Venue Name *</Label>
              <Input
                id="venueName"
                placeholder="e.g. Main Auditorium (Campus Building 1)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

              <div className="space-y-1.5">
                <Label htmlFor="capacity">Total Capacity *</Label>
                <Input
                  id="capacity"
                  type="number"
                  min="1"
                  value={totalCapacity}
                  onChange={(e) => setTotalCapacity(Number(e.target.value))}
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
              <Label htmlFor="layoutType">Layout Configuration *</Label>
              <Select
                value={layoutType}
                onValueChange={(val) => setLayoutType(val as LayoutType)}
              >
                <SelectTrigger id="layoutType">
                  <SelectValue placeholder="Select Layout" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GENERAL_ADMISSION">
                    General Admission (Open floor / standing / unassigned)
                  </SelectItem>
                  <SelectItem value="SEATED">
                    Seated (Structured rows and numbered seats)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Venue Description (Optional)</Label>
              <Textarea
                id="description"
                placeholder="Sound system, projector availability, accessibility facilities..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Seated layout sections configuration */}
        {layoutType === 'SEATED' && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Armchair className="h-5 w-5 text-primary" />
                  Seating Sections
                </CardTitle>
                <CardDescription>Configure section rows and seats</CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addSection} className="gap-1.5">
                <Plus className="h-4 w-4" />
                Add Section
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {sections.map((section, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-lg border bg-muted/20 space-y-3 relative"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Section #{idx + 1}
                    </span>
                    {sections.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeSection(idx)}
                        className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Section Name</Label>
                      <Input
                        placeholder="e.g. VIP Front / Balcony"
                        value={section.name}
                        onChange={(e) => updateSection(idx, 'name', e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Rows</Label>
                      <Input
                        type="number"
                        min="1"
                        value={section.rows}
                        onChange={(e) => updateSection(idx, 'rows', Number(e.target.value))}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Seats Per Row</Label>
                      <Input
                        type="number"
                        min="1"
                        value={section.seats_per_row}
                        onChange={(e) => updateSection(idx, 'seats_per_row', Number(e.target.value))}
                        required
                      />
                    </div>
                  </div>
                </div>
              ))}
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
