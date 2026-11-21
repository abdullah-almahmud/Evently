import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, isSameDay, parseISO, isValid } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  if (amount === 0) return 'Free'
  return `৳${amount.toLocaleString('en-BD')}`
}

export function parseDateSafe(date: string | Date): Date | null {
  if (date instanceof Date) return isNaN(date.getTime()) ? null : date
  if (!date) return null
  try {
    const parsed = parseISO(date)
    if (isValid(parsed)) return parsed
    const fallback = new Date(date)
    return isNaN(fallback.getTime()) ? null : fallback
  } catch {
    return null
  }
}

export function formatDate(date: string | Date, formatStr = 'MMM d, yyyy, h:mm a'): string {
  const d = parseDateSafe(date)
  if (!d) return 'TBD'
  return format(d, formatStr)
}

export function formatDateRange(start: string | Date, end: string | Date): string {
  const startDate = parseDateSafe(start)
  const endDate = parseDateSafe(end)

  if (!startDate && !endDate) return 'TBD'
  if (startDate && !endDate) return formatDate(startDate)
  if (!startDate && endDate) return formatDate(endDate)
  if (!startDate || !endDate) return 'TBD'

  if (isSameDay(startDate, endDate)) {
    return `${format(startDate, 'MMM d, yyyy, h:mm a')} – ${format(endDate, 'h:mm a')}`
  }

  return `${format(startDate, 'MMM d, yyyy')} – ${format(endDate, 'MMM d, yyyy')}`
}
