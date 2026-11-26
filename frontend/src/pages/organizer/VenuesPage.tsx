import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Building2, PlusCircle, MapPin, Users, Armchair, Layers } from 'lucide-react'
import { Venue } from '@/types'
import { venuesApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

export function VenuesPage() {
  const [venues, setVenues] = useState<Venue[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchVenues = async () => {
      try {
        setIsLoading(true)
        const data = await venuesApi.listVenues()
        setVenues(data || [])
      } catch (err) {
        console.warn('Failed to load venues:', err)
        setVenues([])
      } finally {
        setIsLoading(false)
      }
    }
    fetchVenues()
  }, [])

  return (
    <div className="container mx-auto px-4 py-8 space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Campus Venues</h1>
          <p className="text-muted-foreground text-sm">
            Auditoriums, seminar halls, and open grounds registered for campus events.
          </p>
        </div>
        <Button asChild className="gap-2">
          <Link to="/organizer/venues/create">
            <PlusCircle className="h-4 w-4" />
            Add New Venue
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-5 space-y-3">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-20 w-full" />
            </div>
          ))}
        </div>
      ) : venues.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent className="space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Building2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-base">No venues configured yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Add your university hall, conference room, or stadium to start scheduling events.
            </p>
            <Button asChild size="sm">
              <Link to="/organizer/venues/create">Create Venue</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {venues.map((venue) => (
            <Card key={venue.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg font-bold leading-tight line-clamp-1">
                    {venue.name}
                  </CardTitle>
                  <Badge variant={venue.layout_type === 'SEATED' ? 'default' : 'secondary'}>
                    {venue.layout_type === 'SEATED' ? 'Seated' : 'General'}
                  </Badge>
                </div>
                <CardDescription className="flex items-center gap-1.5 text-xs pt-1">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="line-clamp-1">{venue.address}, {venue.city}</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {venue.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {venue.description}
                  </p>
                )}

                <div className="space-y-2.5 pt-2 border-t text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>
                        {venue.layout_type === 'SEATED' ? 'Seats:' : 'Capacity:'}{' '}
                        <strong>{venue.total_capacity}</strong>
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {venue.layout_type === 'SEATED' ? (
                        <Armchair className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span>
                        {venue.layout_type === 'SEATED' && venue.sections?.length
                          ? `${venue.sections.length} Sections`
                          : 'Open Floor'}
                      </span>
                    </div>
                  </div>

                  {venue.layout_type === 'SEATED' && venue.sections && venue.sections.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {venue.sections.map((sec) => (
                        <Badge key={sec.id} variant="outline" className="text-[11px] font-normal">
                          {sec.name}: {sec.rows * sec.seats_per_row} seats
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
