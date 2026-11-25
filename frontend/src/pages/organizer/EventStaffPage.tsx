import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ChevronLeft,
  Users,
  UserMinus,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { staffApi, volunteerApi } from '@/lib/api'
import type { EventStaff, VolunteerApplication, StaffRole } from '@/types'
import { toast } from 'sonner'

function roleBadge(role: StaffRole) {
  switch (role) {
    case 'COORDINATOR':
      return <Badge className="bg-indigo-600 hover:bg-indigo-700">Coordinator</Badge>
    default:
      return <Badge variant="secondary">Gate Staff</Badge>
  }
}

export function EventStaffPage() {
  const { id } = useParams<{ id: string }>()
  const [staff, setStaff] = useState<EventStaff[]>([])
  const [pendingApps, setPendingApps] = useState<VolunteerApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [actionId, setActionId] = useState<string | null>(null)

  const fetchData = async () => {
    if (!id) return
    try {
      setLoading(true)
      setError(null)
      const [staffData, appsData] = await Promise.all([
        staffApi.listEventStaff(id),
        volunteerApi.listApplications(id),
      ])
      setStaff(staffData || [])
      setPendingApps((appsData || []).filter((a) => a.status === 'PENDING'))
    } catch {
      setError('Failed to load staff data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [id])

  const handleRemove = async (staffId: string) => {
    if (!id) return
    if (!window.confirm('Remove this staff member?')) return
    try {
      setRemovingId(staffId)
      await staffApi.removeStaff(id, staffId)
      setStaff((prev) => prev.filter((s) => s.id !== staffId))
      toast.success('Staff member removed.')
    } catch {
      toast.error('Failed to remove staff member.')
    } finally {
      setRemovingId(null)
    }
  }

  const handleReview = async (appId: string, status: 'APPROVED' | 'REJECTED') => {
    if (!id) return
    try {
      setActionId(appId)
      await volunteerApi.review(id, appId, status)
      setPendingApps((prev) => prev.filter((a) => a.id !== appId))
      if (status === 'APPROVED') {
        toast.success('Volunteer approved and added as Gate Staff.')
        // Refresh staff list
        const staffData = await staffApi.listEventStaff(id)
        setStaff(staffData || [])
      } else {
        toast.success('Application rejected.')
      }
    } catch {
      toast.error('Failed to update application.')
    } finally {
      setActionId(null)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-20 flex flex-col items-center justify-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">Loading staff data...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <Card className="border-destructive/30">
          <CardContent className="pt-6 flex flex-col items-center text-center space-y-3">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <p className="text-muted-foreground text-sm">{error}</p>
            <Button asChild><Link to="/organizer/events">Back to Events</Link></Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild className="gap-1 text-muted-foreground">
          <Link to="/organizer/events">
            <ChevronLeft className="h-4 w-4" />
            Back to Events
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/organizer/events/${id}/volunteers`}>
            <Users className="h-4 w-4 mr-1" />
            View All Applications
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-7 w-7 text-primary" />
          Staff Management
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage event staff assignments and review pending volunteer applications.
        </p>
      </div>

      {/* Current Staff */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Current Staff</CardTitle>
          <CardDescription>
            {staff.length} staff member{staff.length !== 1 ? 's' : ''} assigned
          </CardDescription>
        </CardHeader>
        <CardContent>
          {staff.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No staff assigned yet. Approve volunteer applications below to add Gate Staff.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase border-b bg-muted/40">
                  <tr>
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Assigned</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {staff.map((s) => {
                    const isBusy = removingId === s.id
                    return (
                      <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4 font-medium">{s.user?.full_name || '—'}</td>
                        <td className="py-3 px-4 text-muted-foreground text-xs">{s.user?.email || '—'}</td>
                        <td className="py-3 px-4">{roleBadge(s.role)}</td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">
                          {new Date(s.created_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-destructive hover:bg-destructive/10"
                            disabled={isBusy}
                            onClick={() => handleRemove(s.id)}
                          >
                            {isBusy ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <UserMinus className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Volunteer Applications */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Pending Volunteer Applications</CardTitle>
          <CardDescription>
            {pendingApps.length} pending application{pendingApps.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pendingApps.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No pending applications.
            </div>
          ) : (
            <div className="space-y-3">
              {pendingApps.map((app) => {
                const isBusy = actionId === app.id
                return (
                  <div
                    key={app.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border bg-muted/20"
                  >
                    <div className="space-y-1">
                      <p className="font-semibold text-sm">{app.user?.full_name || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">{app.user?.email}</p>
                      <p className="text-xs text-foreground/80 italic line-clamp-2">
                        "{app.motivation}"
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700"
                        disabled={isBusy}
                        onClick={() => handleReview(app.id, 'APPROVED')}
                      >
                        {isBusy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-8 gap-1"
                        disabled={isBusy}
                        onClick={() => handleReview(app.id, 'REJECTED')}
                      >
                        {isBusy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5" />
                        )}
                        Reject
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
