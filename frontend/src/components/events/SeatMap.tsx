import React, { useState } from 'react'
import { Armchair, Check, Clock, Loader2, X } from 'lucide-react'
import { Seat, SeatSectionGroup, TicketTier } from '@/types'
import { cn, formatCurrency } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

interface SeatMapProps {
  sections: SeatSectionGroup[]
  tiers: TicketTier[]
  selectedSeats: Seat[]
  onSeatToggle: (seat: Seat, tier?: TicketTier) => void
  maxSelectable?: number
  disabled?: boolean
  seatHoldEnabled?: boolean
  remainingSeconds?: number | null
  pendingSeatId?: string | null
}

function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const mins = Math.floor(safe / 60)
  const secs = safe % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export const SeatMap: React.FC<SeatMapProps> = ({
  sections,
  tiers,
  selectedSeats,
  onSeatToggle,
  maxSelectable = 4,
  disabled = false,
  seatHoldEnabled = false,
  remainingSeconds = null,
  pendingSeatId = null,
}) => {
  const [filterSectionId, setFilterSectionId] = useState<string>('ALL')

  if (!sections || sections.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground space-y-2">
        <Armchair className="mx-auto h-10 w-10 text-muted-foreground/50" />
        <p className="text-sm font-medium">No seating sections configured for this venue.</p>
        <p className="text-xs">Seats will appear here once generated for the venue.</p>
      </div>
    )
  }

  const selectedSeatIds = new Set(selectedSeats.map((s) => s.id))
  const tierMap = new Map(tiers.map((t) => [t.id, t]))

  const totalSeats = sections.reduce((acc, s) => acc + s.seats.length, 0)
  const reservedSeats = sections.reduce(
    (acc, s) => acc + s.seats.filter((seat) => seat.status === 'RESERVED').length,
    0
  )
  const heldByOthersCount = sections.reduce(
    (acc, s) =>
      acc +
      s.seats.filter(
        (seat) => seat.status === 'HELD' && !seat.held_by_me && !selectedSeatIds.has(seat.id)
      ).length,
    0
  )
  const availableSeats = Math.max(0, totalSeats - reservedSeats - heldByOthersCount)

  const visibleSections =
    filterSectionId === 'ALL'
      ? sections
      : sections.filter((s) => s.section_id === filterSectionId)

  const resolveSeatTier = (seat: Seat, fallbackSectionTier?: TicketTier): TicketTier | undefined => {
    if (seat.tier_id && tierMap.has(seat.tier_id)) {
      return tierMap.get(seat.tier_id)
    }
    return fallbackSectionTier || tiers[0]
  }

  return (
    <div className="space-y-5">
      {/* Capacity Summary, Live Timer Pill & Distinct Color Legend */}
      <div className="flex flex-col gap-3 p-3.5 bg-muted/40 rounded-xl border text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">
              Full Venue: {availableSeats} / {totalSeats} Seats Available
            </span>
            {seatHoldEnabled && (
              <Badge variant="outline" className="text-[11px] font-medium gap-1 bg-background">
                <Clock className="h-3 w-3 text-pink-600" />
                10-Min Hold Active on Click
              </Badge>
            )}
          </div>

          {/* Non-distracting inline countdown timer when holding seats */}
          {seatHoldEnabled && remainingSeconds !== null && remainingSeconds > 0 && selectedSeats.length > 0 && (
            <div
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-xs font-semibold border transition-colors',
                remainingSeconds <= 60
                  ? 'bg-red-500/15 border-red-500/50 text-red-700 dark:text-red-300'
                  : remainingSeconds <= 180
                  ? 'bg-amber-500/15 border-amber-500/50 text-amber-800 dark:text-amber-300'
                  : 'bg-pink-500/15 border-pink-500/40 text-pink-700 dark:text-pink-300'
              )}
            >
              <Clock className="h-3.5 w-3.5" />
              <span>Hold time: {formatCountdown(remainingSeconds)}</span>
            </div>
          )}
        </div>

        {/* Color Legend — Green: Open, Pink: Chosen (visible to all users), Red: Taken */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-2 border-t border-border/60">
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-3.5 rounded-sm border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40" />
            <span className="text-foreground font-medium">Open</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-3.5 rounded-sm bg-pink-500 border-2 border-pink-600" />
            <span className="text-foreground font-semibold">Chosen (Yours ✓)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-3.5 rounded-sm bg-pink-300 border-2 border-pink-600 dark:bg-pink-600/80 dark:border-pink-400" />
            <span className="text-foreground font-medium">Chosen (Someone Else)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-3.5 rounded-sm bg-red-600 border-2 border-red-700" />
            <span className="text-muted-foreground font-medium">Taken</span>
          </div>
        </div>
      </div>

      {/* Section Quick Filter Bar (shows All Full Venue by default) */}
      {sections.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilterSectionId('ALL')}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
              filterSectionId === 'ALL'
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : 'bg-background text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            All Sections ({totalSeats} seats)
          </button>
          {sections.map((sec) => {
            const avail = sec.seats.filter(
              (s) => s.status === 'AVAILABLE' || (s.status === 'HELD' && s.held_by_me)
            ).length
            return (
              <button
                key={sec.section_id}
                type="button"
                onClick={() => setFilterSectionId(sec.section_id)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                  filterSectionId === sec.section_id
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-background text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                {sec.section_name} ({avail}/{sec.seats.length})
              </button>
            )
          })}
        </div>
      )}

      {/* Stage Banner */}
      <div className="relative py-2 text-center">
        <div className="mx-auto w-3/4 max-w-lg h-3 rounded-t-full bg-gradient-to-r from-primary/25 via-primary to-primary/25 shadow-sm" />
        <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Stage / Front Screen
        </p>
      </div>

      {/* Full Venue Sections Stacked Front-to-Back */}
      <div className="space-y-6">
        {visibleSections.map((sec) => {
          const secTier = sec.tier_id ? tierMap.get(sec.tier_id) : tiers[0]
          const secAvailable = sec.seats.filter((s) => s.status === 'AVAILABLE').length

          // Group distinct tiers present inside this section (e.g., single-section room with VIP front + Regular back)
          const distinctTierIds = Array.from(
            new Set(sec.seats.map((s) => s.tier_id).filter(Boolean) as string[])
          )

          return (
            <div key={sec.section_id} className="rounded-xl border bg-background/60 p-3 sm:p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-foreground">{sec.section_name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({secAvailable} of {sec.seats.length} open)
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {distinctTierIds.length > 0 ? (
                    distinctTierIds.map((tid) => {
                      const t = tierMap.get(tid)
                      if (!t) return null
                      return (
                        <Badge key={tid} variant="outline" className="text-[11px] font-medium">
                          {t.name} • {Number(t.price) === 0 ? 'Free' : formatCurrency(t.price)}
                        </Badge>
                      )
                    })
                  ) : secTier ? (
                    <Badge variant="outline" className="text-[11px] font-medium">
                      {secTier.name} • {Number(secTier.price) === 0 ? 'Free' : formatCurrency(secTier.price)}
                    </Badge>
                  ) : null}
                </div>
              </div>

              {renderSeatGrid(sec, secTier)}
            </div>
          )
        })}
      </div>

      {/* Selected Seats Chip Summary */}
      {selectedSeats.length > 0 && (
        <div className="p-4 rounded-xl border bg-pink-500/5 border-pink-500/25 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-foreground">
              Chosen Seats — Not Booked Yet ({selectedSeats.length} of max {maxSelectable}):
            </span>
            <span className="text-muted-foreground text-[11px]">Click a seat to unselect</span>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {selectedSeats.map((seat) => {
              const sec = sections.find((s) => s.section_id === seat.section_id)
              const t = resolveSeatTier(seat, sec?.tier_id ? tierMap.get(sec.tier_id) : undefined)

              return (
                <button
                  key={seat.id}
                  type="button"
                  onClick={() => onSeatToggle(seat, t)}
                  disabled={disabled || pendingSeatId === seat.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-pink-600 text-white text-xs font-medium hover:bg-pink-700 transition-colors shadow-sm"
                >
                  <span>
                    {sec?.section_name || 'Section'} • {seat.row_label}{seat.seat_number}
                  </span>
                  {t && (
                    <span className="opacity-85 text-[10px]">
                      ({Number(t.price) === 0 ? 'Free' : formatCurrency(t.price)})
                    </span>
                  )}
                  <X className="h-3 w-3 ml-0.5 opacity-80 hover:opacity-100" />
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )

  function renderSeatGrid(sec: SeatSectionGroup, fallbackSectionTier?: TicketTier) {
    const sRows = (sec.seats || []).reduce<Record<string, Seat[]>>((acc, s) => {
      if (!acc[s.row_label]) acc[s.row_label] = []
      acc[s.row_label].push(s)
      return acc
    }, {})

    const rowLabels = Object.keys(sRows).sort((a, b) =>
      a.length !== b.length ? a.length - b.length : a.localeCompare(b)
    )
    rowLabels.forEach((r) => sRows[r].sort((a, b) => a.seat_number - b.seat_number))

    return (
      <div className="overflow-x-auto pb-2 pt-1">
        <div className="min-w-fit mx-auto flex flex-col items-center gap-2 px-2">
          {rowLabels.map((rowLabel) => {
            const seatsInRow = sRows[rowLabel]
            const midIndex = seatsInRow.length >= 6 ? Math.floor(seatsInRow.length / 2) : -1
            const rowTier = resolveSeatTier(seatsInRow[0], fallbackSectionTier)

            return (
              <div key={rowLabel} className="flex items-center gap-2">
                {/* Row label left */}
                <span className="w-6 text-right font-mono text-[11px] font-bold text-muted-foreground select-none">
                  {rowLabel}
                </span>

                {/* Seat buttons with center aisle spacer */}
                <div className="flex items-center gap-1.5">
                  {seatsInRow.map((seat, seatIdx) => {
                    const isSelected = selectedSeatIds.has(seat.id)
                    const isReserved = seat.status === 'RESERVED'
                    const isHeldByOther = seat.status === 'HELD' && !seat.held_by_me && !isSelected
                    const isPending = pendingSeatId === seat.id
                    const seatTier = resolveSeatTier(seat, rowTier)
                    const isLocked = isReserved || isHeldByOther

                    return (
                      <React.Fragment key={seat.id}>
                        {midIndex > 0 && seatIdx === midIndex && (
                          <div className="w-3 sm:w-5 shrink-0" aria-hidden="true" />
                        )}
                        <button
                          type="button"
                          disabled={isLocked || disabled || isPending}
                          onClick={() => onSeatToggle(seat, seatTier)}
                          title={`${sec.section_name} • Row ${seat.row_label}, Seat ${seat.seat_number} (${
                            isReserved
                              ? 'Taken / Booked'
                              : isHeldByOther
                              ? 'Chosen by another attendee'
                              : isSelected
                              ? 'Chosen by you (click to unselect)'
                              : seatTier
                              ? `Open — ${seatTier.name} (${
                                  Number(seatTier.price) === 0 ? 'Free' : formatCurrency(seatTier.price)
                                })`
                              : 'Open'
                          })`}
                          className={cn(
                            'relative flex h-8 w-8 items-center justify-center rounded-md font-mono text-[11px] font-semibold transition-all select-none',
                            // Red: Taken / Booked
                            isReserved &&
                              'bg-red-600 text-white border-2 border-red-700 opacity-90 dark:bg-red-700 dark:border-red-500 cursor-not-allowed',
                            // Pink (Medium Pink): Chosen by another user (visible to everyone)
                            isHeldByOther &&
                              'bg-pink-300 text-pink-950 border-2 border-pink-600 dark:bg-pink-600/80 dark:border-pink-400 dark:text-white cursor-not-allowed',
                            // Pink (Vibrant): Chosen by current user (unbooked)
                            isSelected &&
                              'bg-pink-500 text-white border-2 border-pink-600 shadow-sm ring-2 ring-pink-300/60 scale-105 hover:bg-pink-600',
                            // Green: Open / Available
                            !isLocked &&
                              !isSelected &&
                              'bg-emerald-50/80 dark:bg-emerald-950/30 border-2 border-emerald-500 text-emerald-900 dark:text-emerald-200 hover:bg-emerald-500/20 hover:border-emerald-600 active:scale-95'
                          )}
                        >
                          {isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : isSelected ? (
                            <Check className="h-3.5 w-3.5 stroke-[3]" />
                          ) : isHeldByOther ? (
                            <Clock className="h-3.5 w-3.5" />
                          ) : isReserved ? (
                            <span className="text-[10px] font-bold">✕</span>
                          ) : (
                            seat.seat_number
                          )}
                        </button>
                      </React.Fragment>
                    )
                  })}
                </div>

                {/* Row label right */}
                <span className="w-6 text-left font-mono text-[11px] font-bold text-muted-foreground select-none">
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
