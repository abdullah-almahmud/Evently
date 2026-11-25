import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Shield, Users, Calendar, UserCheck, ArrowRight, Clock, Ticket, Building2 } from 'lucide-react'
import { adminApi } from '@/lib/api'
import type { AdminOverview } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function AdminDashboard() {
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchAdminStats = async () => {
      try {
        setIsLoading(true)
        const data = await adminApi.getOverview()
        setOverview(data)
      } catch (err) {
        console.warn('Admin overview fetch warning:', err)
        setOverview(null)
      } finally {
        setIsLoading(false)
      }
    }

    fetchAdminStats()
  }, [])

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Shield className="h-6 w-6" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Admin Console</h1>
          </div>
          <p className="text-muted-foreground text-sm pt-1">
            Platform governance, user role management, organizer approvals, and campus event oversight.
          </p>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card className="border-border hover:shadow-sm transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Users
            </CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-3xl font-bold">{overview?.total_users ?? 0}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {overview
                ? `${overview.organizers_count} Organizers • ${overview.staff_users_count} Staff • ${overview.attendees_count} Attendees`
                : 'Campus accounts'}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border hover:shadow-sm transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Events
            </CardTitle>
            <Calendar className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-3xl font-bold">{overview?.total_events ?? 0}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {overview
                ? `${overview.published_events} Published • ${overview.draft_events} Drafts`
                : 'Published & Drafts'}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border hover:shadow-sm transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Requests
            </CardTitle>
            <Clock className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                {overview?.pending_organizer_requests ?? 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Awaiting organizer review</p>
          </CardContent>
        </Card>

        <Card className="border-border hover:shadow-sm transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tickets & Bookings
            </CardTitle>
            <Ticket className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-3xl font-bold">{overview?.total_tickets ?? 0}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Across {overview?.total_bookings ?? 0} total orders
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Links & Management Modules */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" />
              Organizer Role Applications
            </CardTitle>
            <CardDescription>
              Review club executives and faculty requests to host campus events
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Attendees can apply to become verified event organizers. Approve or reject applications here.
            </p>
            <Button asChild className="gap-2">
              <Link to="/admin/organizer-requests">
                Manage Requests
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              User Directory & Role Assignment
            </CardTitle>
            <CardDescription>
              View every platform account and modify roles (Admin, Organizer, Attendee)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Search users, inspect Event Staff badges, change platform roles directly, or disable accounts.
            </p>
            <Button asChild variant="outline" className="gap-2">
              <Link to="/admin/users">
                Manage Users & Roles
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              All Platform Events Oversight
            </CardTitle>
            <CardDescription>
              Inspect events across all organizers, review analytics, staff, and bookings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Organizers create and run events; administrators maintain full platform-wide visibility and moderation access.
            </p>
            <Button asChild variant="outline" className="gap-2">
              <Link to="/admin/events">
                Inspect All Events
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Campus Venues Oversight
            </CardTitle>
            <CardDescription>
              Review registered campus auditoriums, halls, and seating configurations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Inspect campus venues configured by organizers or register new institutional venues.
            </p>
            <Button asChild variant="outline" className="gap-2">
              <Link to="/organizer/venues">
                View Campus Venues
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
