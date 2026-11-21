import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Shield, Users, Calendar, UserCheck, ArrowRight, Clock } from 'lucide-react'
import { adminApi, eventsApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function AdminDashboard() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalEvents: 0,
    pendingRequests: 0,
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchAdminStats = async () => {
      try {
        setIsLoading(true)
        const [users, eventsRes, requests] = await Promise.all([
          adminApi.listUsers().catch(() => []),
          eventsApi.listEvents({ limit: 1 }).catch(() => ({ total: 0, items: [], page: 1, limit: 1 })),
          adminApi.listOrganizerRequests('PENDING').catch(() => []),
        ])

        setStats({
          totalUsers: users?.length || 0,
          totalEvents: eventsRes?.total || 0,
          pendingRequests: requests?.length || 0,
        })
      } catch (err) {
        console.warn('Admin stats fetch warning:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchAdminStats()
  }, [])

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl space-y-8">
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
            System administration, user access governance, and organizer authorization.
          </p>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
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
              <div className="text-3xl font-bold">{stats.totalUsers}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Campus accounts</p>
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
              <div className="text-3xl font-bold">{stats.totalEvents}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Published & Drafts</p>
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
                {stats.pendingRequests}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Awaiting organizer review</p>
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
              Users with ATTENDEE status can submit an application to become verified organizers.
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
              User Directory & Roles
            </CardTitle>
            <CardDescription>
              Inspect registered campus profiles, roles, and status
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              View all students, staff, and organizers with assigned administrative privileges.
            </p>
            <Button asChild variant="outline" className="gap-2">
              <Link to="/admin/users">
                View User Directory
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
