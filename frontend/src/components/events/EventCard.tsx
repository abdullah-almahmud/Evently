import { Link } from 'react-router-dom'
import { Calendar, MapPin, Tag } from 'lucide-react'
import { Event } from '@/types'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDateRange, formatCurrency } from '@/lib/utils'

interface EventCardProps {
  event: Event
}

const categoryColors: Record<string, string> = {
  CONCERT: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-200',
  FESTIVAL: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200',
  CONFERENCE: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200',
  WORKSHOP: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200',
  SPORTS: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-200',
  CULTURAL: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-200',
  OTHER: 'bg-gray-500/10 text-gray-700 dark:text-gray-300 border-gray-200',
}

const statusBadgeVariants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  DRAFT: 'secondary',
  PUBLISHED: 'default',
  SOLD_OUT: 'destructive',
  CANCELLED: 'destructive',
  COMPLETED: 'outline',
}

export function EventCard({ event }: EventCardProps) {
  // Determine pricing string
  const displayPrice = () => {
    const tiers = event.tiers || event.ticket_tiers
    if (tiers && tiers.length > 0) {
      const prices = tiers.map((t) => Number(t.price))
      const min = Math.min(...prices)
      return min === 0 ? 'Free' : `From ${formatCurrency(min)}`
    }
    if (event.min_price !== undefined) {
      return event.min_price === 0 ? 'Free' : `From ${formatCurrency(event.min_price)}`
    }
    return 'Free'
  }

  return (
    <Card className="group overflow-hidden rounded-xl border border-border/60 bg-card hover:shadow-lg transition-all duration-300 flex flex-col justify-between">
      <div>
        {/* Banner with gradient fallback */}
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-tr from-slate-900 via-indigo-950 to-primary/80">
          {event.banner_url ? (
            <img
              src={event.banner_url}
              alt={event.title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              onError={(e) => {
                // Hide broken image and fall back to background
                ;(e.target as HTMLElement).style.display = 'none'
              }}
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center p-6 text-center text-white/90">
              <span className="text-xl font-bold tracking-tight opacity-90 line-clamp-2">
                {event.title}
              </span>
            </div>
          )}

          {/* Top badges */}
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 z-10">
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border backdrop-blur-md ${
                categoryColors[event.category] || categoryColors.OTHER
              }`}
            >
              {event.category}
            </span>
          </div>

          {event.status !== 'PUBLISHED' && (
            <div className="absolute top-3 right-3 z-10">
              <Badge variant={statusBadgeVariants[event.status] || 'secondary'}>
                {event.status.replace('_', ' ')}
              </Badge>
            </div>
          )}
        </div>

        {/* Content */}
        <CardContent className="p-5 space-y-3">
          <h3 className="font-bold text-lg leading-snug line-clamp-2 group-hover:text-primary transition-colors">
            <Link to={`/events/${event.id}`}>{event.title}</Link>
          </h3>

          <div className="space-y-1.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>{formatDateRange(event.start_datetime, event.end_datetime)}</span>
            </div>

            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="line-clamp-1">{event.venue?.name || 'Campus Venue'}</span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground line-clamp-2 pt-1">
            {event.description}
          </p>
        </CardContent>
      </div>

      {/* Footer */}
      <CardFooter className="px-5 py-4 border-t bg-muted/20 flex items-center justify-between mt-auto">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Tag className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <span>{displayPrice()}</span>
        </div>

        <Button asChild size="sm">
          <Link to={`/events/${event.id}`}>View Event</Link>
        </Button>
      </CardFooter>
    </Card>
  )
}
