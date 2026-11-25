import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ChevronLeft,
  ScanLine,
  Users,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { checkinApi } from '@/lib/api'
import type { CheckInResult, CheckInStats, CheckInTicketItem, TicketStatus } from '@/types'
import { toast } from 'sonner'

function ticketStatusBadge(status: TicketStatus) {
  switch (status) {
    case 'USED':
      return <Badge className="bg-emerald-600 hover:bg-emerald-700">Checked In</Badge>
    case 'CANCELLED':
      return <Badge variant="destructive">Cancelled</Badge>
    default:
      return <Badge variant="secondary">Active</Badge>
  }
}

export function GateDashboardPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const [qrInput, setQrInput] = useState('')
  const [validating, setValidating] = useState(false)
  const [result, setResult] = useState<CheckInResult | null>(null)

  const [stats, setStats] = useState<CheckInStats | null>(null)
  const [tickets, setTickets] = useState<CheckInTicketItem[]>([])
  const [attendanceLoading, setAttendanceLoading] = useState(true)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  const fetchAttendance = useCallback(async () => {
    if (!eventId) return
    try {
      setAttendanceLoading(true)
      const [statsData, ticketsData] = await Promise.all([
        checkinApi.getStats(eventId),
        checkinApi.getTicketList(eventId),
      ])
      setStats(statsData)
      setTickets(ticketsData || [])
      setLastRefreshed(new Date())
    } catch {
      // silently fail on refresh
    } finally {
      setAttendanceLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    fetchAttendance()
    // Refresh every 30 seconds
    const interval = setInterval(fetchAttendance, 30000)
    return () => clearInterval(interval)
  }, [fetchAttendance])

  const handleValidate = async () => {
    if (!qrInput.trim()) {
      toast.error('Please enter a ticket code or QR value.')
      return
    }
    try {
      setValidating(true)
      setResult(null)
      const res = await checkinApi.validate(qrInput.trim())
      setResult(res)
      if (res.valid) {
        toast.success('Check-in successful!')
        fetchAttendance()
      } else {
        toast.error(res.message || 'Invalid ticket.')
      }
      setQrInput('')
    } catch {
      toast.error('Failed to validate ticket.')
    } finally {
      setValidating(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild className="gap-1 text-muted-foreground">
          <Link to="/staff/events">
            <ChevronLeft className="h-4 w-4" />
            My Staff Events
          </Link>
        </Button>
        <Badge variant="outline" className="font-mono text-xs">
          Event: {eventId?.slice(0, 8)}...
        </Badge>
      </div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <ScanLine className="h-7 w-7 text-primary" />
          Gate Dashboard
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Scan attendee QR codes to validate tickets and monitor attendance.
        </p>
      </div>

      <Tabs defaultValue="scan">
        <TabsList className="grid grid-cols-2 w-full max-w-sm">
          <TabsTrigger value="scan" className="gap-2">
            <ScanLine className="h-4 w-4" />
            Scan / Validate
          </TabsTrigger>
          <TabsTrigger value="attendance" className="gap-2">
            <Users className="h-4 w-4" />
            Attendance
          </TabsTrigger>
        </TabsList>

        {/* Scan Tab */}
        <TabsContent value="scan" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Validate Ticket</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="qr-input">Scan QR Code or Enter Ticket Code</Label>
                <div className="flex gap-2">
                  <Input
                    id="qr-input"
                    value={qrInput}
                    onChange={(e) => setQrInput(e.target.value)}
                    placeholder="Paste QR code value or type ticket code..."
                    className="font-mono text-sm"
                    onKeyDown={(e) => e.key === 'Enter' && handleValidate()}
                    autoFocus
                  />
                  <Button onClick={handleValidate} disabled={validating} className="shrink-0">
                    {validating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ScanLine className="h-4 w-4 mr-2" />
                    )}
                    {validating ? 'Validating...' : 'Validate'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Attendees show their QR code on the ticket. Paste the value here or scan directly.
                  Press Enter to validate quickly.
                </p>
              </div>

              {/* Result Display */}
              {result && (
                <div
                  className={`rounded-xl border p-6 text-center space-y-3 ${
                    result.valid
                      ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20'
                      : 'border-destructive/30 bg-destructive/5'
                  }`}
                >
                  <div className="flex justify-center">
                    {result.valid ? (
                      <CheckCircle2 className="h-16 w-16 text-emerald-600" />
                    ) : (
                      <XCircle className="h-16 w-16 text-destructive" />
                    )}
                  </div>
                  <div>
                    <h3
                      className={`text-2xl font-bold ${
                        result.valid ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'
                      }`}
                    >
                      {result.valid ? '✓ Valid' : '✗ Invalid'}
                    </h3>
                    <p className="text-muted-foreground text-sm mt-1">{result.message}</p>
                  </div>
                  {result.valid && (
                    <div className="text-sm space-y-1 pt-2 border-t border-current/10">
                      {result.attendee_name && (
                        <p>
                          <span className="font-semibold">Attendee:</span> {result.attendee_name}
                        </p>
                      )}
                      {result.ticket?.tier?.name && (
                        <p>
                          <span className="font-semibold">Tier:</span> {result.ticket.tier.name}
                        </p>
                      )}
                      {result.ticket?.checked_in_at && (
                        <p className="text-xs text-muted-foreground">
                          Checked in at{' '}
                          {new Date(result.ticket.checked_in_at).toLocaleTimeString()}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Attendance Tab */}
        <TabsContent value="attendance" className="space-y-4 mt-4">
          {/* Stats Cards */}
          {stats && (
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-4 pb-4 text-center">
                  <div className="text-3xl font-bold">{stats.total_tickets}</div>
                  <p className="text-xs text-muted-foreground mt-1">Total Tickets</p>
                </CardContent>
              </Card>
              <Card className="border-emerald-300">
                <CardContent className="pt-4 pb-4 text-center">
                  <div className="text-3xl font-bold text-emerald-600">{stats.checked_in}</div>
                  <p className="text-xs text-muted-foreground mt-1">Checked In</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4 text-center">
                  <div className="text-3xl font-bold text-amber-600">{stats.remaining}</div>
                  <p className="text-xs text-muted-foreground mt-1">Remaining</p>
                </CardContent>
              </Card>
            </div>
          )}

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Ticket List</CardTitle>
                <div className="flex items-center gap-2">
                  {lastRefreshed && (
                    <span className="text-xs text-muted-foreground">
                      Updated {lastRefreshed.toLocaleTimeString()}
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={fetchAttendance}
                    disabled={attendanceLoading}
                    className="h-8 gap-1"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${attendanceLoading ? 'animate-spin' : ''}`}
                    />
                    Refresh
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {attendanceLoading && tickets.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : tickets.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No tickets issued for this event yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-muted-foreground uppercase border-b bg-muted/40">
                      <tr>
                        <th className="py-3 px-4">Attendee</th>
                        <th className="py-3 px-4">Tier</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Check-in Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {tickets.map((t) => (
                        <tr key={t.ticket_id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-4 font-medium">{t.attendee_name}</td>
                          <td className="py-3 px-4 text-muted-foreground text-xs">{t.tier_name}</td>
                          <td className="py-3 px-4">{ticketStatusBadge(t.status)}</td>
                          <td className="py-3 px-4 text-xs text-muted-foreground">
                            {t.checked_in_at
                              ? new Date(t.checked_in_at).toLocaleTimeString()
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {!stats && !attendanceLoading && (
            <Card className="border-destructive/30">
              <CardContent className="pt-6 flex flex-col items-center text-center space-y-3">
                <AlertCircle className="h-10 w-10 text-destructive" />
                <p className="text-muted-foreground text-sm">
                  Failed to load attendance stats. Check your connection.
                </p>
                <Button size="sm" onClick={fetchAttendance}>
                  Retry
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
