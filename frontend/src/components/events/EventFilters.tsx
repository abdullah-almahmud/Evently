import { Search, X, SlidersHorizontal } from 'lucide-react'
import { EventCategory } from '@/types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface EventFiltersProps {
  search: string
  category: string
  sort: string
  onSearchChange: (value: string) => void
  onCategoryChange: (value: string) => void
  onSortChange: (value: string) => void
  onReset: () => void
}

const categories: { label: string; value: EventCategory | 'ALL' }[] = [
  { label: 'All Categories', value: 'ALL' },
  { label: 'Concert', value: 'CONCERT' },
  { label: 'Festival', value: 'FESTIVAL' },
  { label: 'Conference', value: 'CONFERENCE' },
  { label: 'Workshop', value: 'WORKSHOP' },
  { label: 'Sports', value: 'SPORTS' },
  { label: 'Cultural', value: 'CULTURAL' },
  { label: 'Other', value: 'OTHER' },
]

export function EventFilters({
  search,
  category,
  sort,
  onSearchChange,
  onCategoryChange,
  onSortChange,
  onReset,
}: EventFiltersProps) {
  const hasActiveFilters = Boolean(search || (category && category !== 'ALL') || (sort && sort !== 'upcoming'))

  return (
    <div className="bg-card border rounded-xl p-4 shadow-sm space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
        {/* Search input */}
        <div className="relative md:col-span-6 lg:col-span-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search events by title or keyword..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 pr-9"
          />
          {search && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Category Select */}
        <div className="md:col-span-3 lg:col-span-3">
          <Select value={category || 'ALL'} onValueChange={onCategoryChange}>
            <SelectTrigger>
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sort Select */}
        <div className="md:col-span-3 lg:col-span-3">
          <Select value={sort || 'upcoming'} onValueChange={onSortChange}>
            <SelectTrigger>
              <SelectValue placeholder="Sort By" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="upcoming">Upcoming First</SelectItem>
              <SelectItem value="newest">Recently Added</SelectItem>
              <SelectItem value="price_asc">Price: Low to High</SelectItem>
              <SelectItem value="price_desc">Price: High to Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {hasActiveFilters && (
        <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
            <span>Filters active</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Clear all filters
          </Button>
        </div>
      )}
    </div>
  )
}
