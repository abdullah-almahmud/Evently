import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronLeft, Users, CheckCircle2, XCircle, Clock, Loader2, AlertCircle, UserCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { volunteerApi } from '@/lib/api'
import type { VolunteerApplication, VolunteerApplicationStatus } from '@/types'
import { toast } from 'sonner'

function statusBadge(status: VolunteerApplicationStatus) {
  switch (status) {
    case 'APPROVED':
      return <Badge className="bg-emerald-600 hover:bg-emerald-700">Approved</Badge>
    case 'REJECTED':
      return <Badge variant="destructive">Rejected</Badge>
    default:
      return <Badge variant="secondary">Pending</Badge>
  }
}

export function VolunteerApplicationsPage() {
  const { id } = useParams<{ id: string }>()
  const [applications, setApplications] = useState<VolunteerApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionId, setActionId] = useState<string | null>(null)

  const fetchApplications = async () => {
    if (!id) return
    try {
      setLoading(true)
      setError(null)
      const data = await volunteerApi.listApplications(id)
      setApplications(data || [])
    } catch {
      setError('Failed to load volunteer applications.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchApplications()
  }, [id])

  const handleReview = async (appId: string, status: 'APPROVED' | 'REJECTED') => {
    if (!id) return
    try {
      setActionId(appId)
      const updated = await volunteerApi.review(id, appId, status)
      setApplications((prev) => prev.map((a) => (a.id === appId ? updated : a)))
      toast.success(
        status === 'APPROVED'
          ? 'Application approved! User has been assigned as Gate Staff.'
          : 'Application rejected.'
      )
    } catch {
      toast.error('Failed to update application status.')
    } finally {
      setActionId(null)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-20 flex flex-col items-center justify-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">Loading volunteer applications...</p>
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
      </div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Users className="h-7 w-7 text-primary" />
          Volunteer Applications
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Review applications from attendees who want to volunteer for this event.
          Approved volunteers are automatically assigned as Gate Staff.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Applications</CardTitle>
          <CardDescription>
            {applications.length} application{applications.length !== 1 ? 's' : ''} received
          </CardDescription>
        </CardHeader>
        <CardContent>
          {applications.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Users className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="font-semibold">No applications yet</h3>
              <p className="text-sm text-muted-foreground">
                Attendees can apply to volunteer for your event from the event detail page.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase border-b bg-muted/40">
                  <tr>
                    <th className="py-3 px-4">Applicant</th>
                    <th className="py-3 px-4">Motivation</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Applied At</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {applications.map((app) => {
                    const isBusy = actionId === app.id
                    return (
                      <tr key={app.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4">
                          <div>
                            <p className="font-semibold text-foreground">
                              {app.user?.full_name || 'Unknown'}
                            </p>
                            <p className="text-xs text-muted-foreground">{app.user?.email}</p>
                          </div>
                        </td>
                        <td className="py-3 px-4 max-w-xs">
                          <p className="line-clamp-2 text-xs text-muted-foreground">
                            {app.motivation}
                          </p>
                        </td>
                        <td className="py-3 px-4">
                          {statusBadge(app.status)}
                          {app.status === 'APPROVED' && (
                            <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                              <UserCheck className="h-3 w-3" />
                              Gate Staff
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">
                          {new Date(app.created_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {app.status === 'PENDING' ? (
                            <div className="flex items-center justify-end gap-2">
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
                          ) : (
                            <span className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                              <Clock className="h-3 w-3" />
                              Reviewed
                            </span>
                          )}
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
    </div>
  )
}
