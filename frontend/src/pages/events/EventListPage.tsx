import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Sparkles, ChevronLeft, ChevronRight, Inbox } from 'lucide-react'
import { Event, EventCategory } from '@/types'
import { eventsApi } from '@/lib/api'
import { EventCard } from '@/components/events/EventCard'
import { EventFilters } from '@/components/events/EventFilters'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'

export function EventListPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const search = searchParams.get('search') || ''
  const category = (searchParams.get('category') as EventCategory | 'ALL') || 'ALL'
  const sort = (searchParams.get('sort') as 'upcoming' | 'newest' | 'price_asc' | 'price_desc') || 'upcoming'
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = 9

  const [events, setEvents] = useState<Event[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  const updateFilters = useCallback(
    (updates: Record<string, string | null>) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        Object.entries(updates).forEach(([key, val]) => {
          if (val === null || val === '' || val === 'ALL' || (key === 'page' && val === '1')) {
            next.delete(key)
          } else {
            next.set(key, val)
          }
        })
        return next
      })
    },
    [setSearchParams]
  )

  const loadEvents = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await eventsApi.listEvents({
        search: search || undefined,
        category: category !== 'ALL' ? category : undefined,
        sort,
        page,
        limit,
      })
      setEvents(res.items || [])
      setTotal(res.total || 0)
    } catch (err) {
      console.warn('API fetch failed, displaying local state:', err)
      // If backend is not running yet during development, ensure UI stays graceful
      setEvents([])
      setTotal(0)
    } finally {
      setIsLoading(false)
    }
  }, [search, category, sort, page, limit])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  const totalPages = Math.ceil(total / limit) || 1

  return (
    <div className="space-y-8 pb-12">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/10 via-background to-background py-16 md:py-24 border-b">
        <div className="container mx-auto px-4 text-center max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-3.5 py-1 text-xs font-semibold text-primary backdrop-blur-sm shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span>UIU Campus Community Hub</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground">
            Discover Exciting Events on Campus
          </h1>

          <p className="text-muted-foreground text-base md:text-lg leading-relaxed">
            From tech hackathons and cultural galas to sports tournaments and academic workshops.
            Book your tickets and stay connected with everything happening at UIU.
          </p>
        </div>
      </section>

      {/* Main Content */}
      <div className="container mx-auto px-4 space-y-6">
        {/* Filter Bar */}
        <EventFilters
          search={search}
          category={category}
          sort={sort}
          onSearchChange={(val) => updateFilters({ search: val, page: '1' })}
          onCategoryChange={(val) => updateFilters({ category: val, page: '1' })}
          onSortChange={(val) => updateFilters({ sort: val, page: '1' })}
          onReset={() => updateFilters({ search: null, category: null, sort: null, page: '1' })}
        />

        {/* Results summary */}
        <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
          <span>
            {isLoading ? 'Loading events...' : `Showing ${events.length} of ${total} events`}
          </span>
          {category !== 'ALL' && (
            <span className="font-medium text-foreground">Filter: {category}</span>
          )}
        </div>

        {/* Event Cards Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl border p-4 space-y-4">
                <Skeleton className="aspect-[16/9] w-full rounded-lg" />
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-full" />
                <div className="flex justify-between pt-2">
                  <Skeleton className="h-9 w-24" />
                  <Skeleton className="h-9 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : events.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          /* Empty State */
          <div className="rounded-2xl border border-dashed p-12 text-center space-y-4 max-w-md mx-auto my-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <Inbox className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No events found</h3>
            <p className="text-sm text-muted-foreground">
              {search || category !== 'ALL'
                ? 'Try adjusting your search criteria or clearing selected filters.'
                : 'There are currently no published events listed. Check back soon!'}
            </p>
            {(search || category !== 'ALL') && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateFilters({ search: null, category: null, sort: null, page: '1' })}
              >
                Clear all filters
              </Button>
            )}
          </div>
        )}

        {/* Pagination */}
        {!isLoading && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-6">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => updateFilters({ page: String(page - 1) })}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm font-medium px-3 text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => updateFilters({ page: String(page + 1) })}
              className="gap-1"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
