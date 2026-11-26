import React, { useState } from 'react'
import { Armchair, Check, X } from 'lucide-react'
import { Seat, SeatSectionGroup, TicketTier } from '@/types'
import { cn, formatCurrency } from '@/lib/utils'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'

interface SeatMapProps {
  sections: SeatSectionGroup[]
  tiers: TicketTier[]
  selectedSeats: Seat[]
  onSeatToggle: (seat: Seat, tier?: TicketTier) => void
  maxSelectable?: number
  disabled?: boolean
}

export const SeatMap: React.FC<SeatMapProps> = ({
  sections,
  tiers,
  selectedSeats,
  onSeatToggle,
  maxSelectable = 4,
  disabled = false,
}) => {
  const [activeSectionId, setActiveSectionId] = useState<string>(
    sections.length > 0 ? sections[0].section_id : ''
  )

  if (!sections || sections.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground space-y-2">
        <Armchair className="mx-auto h-10 w-10 text-muted-foreground/50" />
        <p className="text-sm font-medium">No seating sections configured for this venue.</p>
        <p className="text-xs">Seats will appear here once configured by the organizer.</p>
      </div>
    )
  }

  const selectedSeatIds = new Set(selectedSeats.map((s) => s.id))
  const tierMap = new Map(tiers.map((t) => [t.id, t]))

  // Find the active section group
  const currentSection =
    sections.find((s) => s.section_id === activeSectionId) || sections[0]

  // Group seats of the current section by row_label
  const seatsByRow = (currentSection.seats || []).reduce<Record<string, Seat[]>>(
    (acc, seat) => {
      if (!acc[seat.row_label]) {
        acc[seat.row_label] = []
      }
      acc[seat.row_label].push(seat)
      return acc
    },
    {}
  )

  // Sort rows alphabetically and seats within rows by seat_number
  const sortedRowLabels = Object.keys(seatsByRow).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  )
  sortedRowLabels.forEach((row) => {
    seatsByRow[row].sort((a, b) => a.seat_number - b.seat_number)
  })

  const sectionTier = currentSection.tier_id
    ? tierMap.get(currentSection.tier_id)
    : tiers[0]

  const totalSeats = sections.reduce((acc, s) => acc + s.seats.length, 0)
  const reservedSeats = sections.reduce(
    (acc, s) => acc + s.seats.filter((seat) => seat.status === 'RESERVED').length,
    0
  )
  const availableSeats = totalSeats - reservedSeats

  return (
    <div className="space-y-6">
      {/* Overview Stats & Legend */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-muted/40 rounded-xl border text-xs">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-foreground">
            Capacity: {availableSeats} / {totalSeats} Available
          </span>
          {sectionTier && (
            <Badge variant="outline" className="font-normal text-xs">
              {sectionTier.name} —{' '}
              {Number(sectionTier.price) === 0 ? 'Free' : formatCurrency(sectionTier.price)}
            </Badge>
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="h-3.5 w-3.5 rounded-sm border-2 border-emerald-500 bg-emerald-500/15" />
            <span className="text-muted-foreground">Available</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3.5 w-3.5 rounded-sm bg-primary border-2 border-primary" />
            <span className="text-muted-foreground">Selected</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3.5 w-3.5 rounded-sm bg-muted-foreground/20 border-2 border-muted-foreground/30 opacity-60" />
            <span className="text-muted-foreground">Reserved</span>
          </div>
        </div>
      </div>

      {/* Stage Banner */}
      <div className="relative py-2 text-center">
        <div className="mx-auto w-3/4 max-w-lg h-2.5 rounded-t-full bg-gradient-to-r from-primary/30 via-primary to-primary/30 shadow-sm" />
        <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Stage / Screen
        </p>
      </div>

      {/* Section Tabs (if multiple) */}
      {sections.length > 1 ? (
        <Tabs
          value={activeSectionId}
          onValueChange={setActiveSectionId}
          className="w-full"
        >
          <TabsList className="w-full justify-start overflow-x-auto flex-nowrap h-auto p-1 bg-muted/60">
            {sections.map((sec) => (
              <TabsTrigger
                key={sec.section_id}
                value={sec.section_id}
                className="text-xs px-3 py-1.5 shrink-0"
              >
                {sec.section_name}
                <span className="ml-1.5 text-[10px] opacity-70">
                  ({sec.seats.filter((s) => s.status === 'AVAILABLE').length} left)
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
          {sections.map((sec) => (
            <TabsContent key={sec.section_id} value={sec.section_id} className="mt-4">
              {renderSeatGrid(sec)}
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <div className="mt-2">
          <div className="text-xs font-semibold text-muted-foreground mb-3 px-1">
            {currentSection.section_name}
          </div>
          {renderSeatGrid(currentSection)}
        </div>
      )}

      {/* Selected Seats Summary */}
      {selectedSeats.length > 0 && (
        <div className="p-4 rounded-xl border bg-primary/5 border-primary/20 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-foreground">
              Selected Seats ({selectedSeats.length} of max {maxSelectable}):
            </span>
            <span className="text-muted-foreground text-[11px]">Click a seat to remove</span>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {selectedSeats.map((seat) => {
              const sec = sections.find((s) => s.section_id === seat.section_id)
              const t = sec?.tier_id ? tierMap.get(sec.tier_id) : tiers[0]

              return (
                <button
                  key={seat.id}
                  type="button"
                  onClick={() => onSeatToggle(seat, t)}
                  disabled={disabled}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/80 transition-colors shadow-sm"
                >
                  <span>
                    {sec?.section_name || 'Section'} • Row {seat.row_label}-{seat.seat_number}
                  </span>
                  {t && (
                    <span className="opacity-80 text-[10px]">
                      ({Number(t.price) === 0 ? 'Free' : formatCurrency(t.price)})
                    </span>
                  )}
                  <X className="h-3 w-3 ml-0.5 opacity-70 hover:opacity-100" />
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )

  function renderSeatGrid(sec: SeatSectionGroup) {
    const sRows = (sec.seats || []).reduce<Record<string, Seat[]>>((acc, s) => {
      if (!acc[s.row_label]) acc[s.row_label] = []
      acc[s.row_label].push(s)
      return acc
    }, {})

    const rowLabels = Object.keys(sRows).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    )
    rowLabels.forEach((r) => sRows[r].sort((a, b) => a.seat_number - b.seat_number))

    const secTier = sec.tier_id ? tierMap.get(sec.tier_id) : tiers[0]

    return (
      <div className="overflow-x-auto pb-4 pt-2">
        <div className="min-w-fit mx-auto flex flex-col items-center gap-2.5 px-4">
          {rowLabels.map((rowLabel) => {
            const seatsInRow = sRows[rowLabel]

            return (
              <div key={rowLabel} className="flex items-center gap-2">
                {/* Row label left */}
                <span className="w-6 text-right font-mono text-xs font-bold text-muted-foreground select-none">
                  {rowLabel}
                </span>

                {/* Seat buttons */}
                <div className="flex items-center gap-1.5">
                  {seatsInRow.map((seat) => {
                    const isSelected = selectedSeatIds.has(seat.id)
                    const isReserved = seat.status === 'RESERVED'
                    const isAvailable = seat.status === 'AVAILABLE'

                    return (
                      <button
                        key={seat.id}
                        type="button"
                        disabled={isReserved || disabled}
                        onClick={() => onSeatToggle(seat, secTier)}
                        title={`Row ${seat.row_label}, Seat ${seat.seat_number} (${
                          isReserved
                            ? 'Reserved'
                            : isSelected
                            ? 'Selected'
                            : secTier
                            ? `${secTier.name} - ${
                                Number(secTier.price) === 0 ? 'Free' : formatCurrency(secTier.price)
                              }`
                            : 'Available'
                        })`}
                        className={cn(
                          'relative flex h-8 w-8 items-center justify-center rounded-md font-mono text-[11px] font-semibold transition-all select-none',
                          // Reserved
                          isReserved &&
                            'bg-muted text-muted-foreground/40 border border-muted-foreground/20 cursor-not-allowed opacity-60',
                          // Selected
                          isSelected &&
                            'bg-primary text-primary-foreground border-2 border-primary shadow-sm ring-2 ring-primary/30 scale-105',
                          // Available & not selected
                          isAvailable &&
                            !isSelected &&
                            'bg-background border-2 border-emerald-500 text-foreground hover:bg-emerald-500/10 hover:border-emerald-600 active:scale-95'
                        )}
                      >
                        {isSelected ? (
                          <Check className="h-3.5 w-3.5 stroke-[3]" />
                        ) : isReserved ? (
                          <span className="text-[9px]">✕</span>
                        ) : (
                          seat.seat_number
                        )}
                      </button>
                    )
                  })}
                </div>

                {/* Row label right */}
                <span className="w-6 text-left font-mono text-xs font-bold text-muted-foreground select-none">
                  {rowLabel}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }
}
