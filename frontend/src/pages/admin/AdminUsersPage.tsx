import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Users, Search, Loader2, ShieldAlert } from 'lucide-react'
import { User as UserType, UserRole } from '@/types'
import { adminApi } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

export function AdminUsersPage() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<UserType[]>([])
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('ALL')
  const [isLoading, setIsLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const fetchUsers = async () => {
    try {
      setIsLoading(true)
      const data = await adminApi.listUsers()
      setUsers(data || [])
    } catch (err) {
      console.warn('Failed to load users:', err)
      setUsers([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const handleRoleChange = async (targetUser: UserType, newRole: UserRole) => {
    if (targetUser.role === newRole) return
    try {
      setUpdatingId(targetUser.id)
      const updated = await adminApi.updateUserRole(targetUser.id, newRole)
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
      toast.success(`Updated ${targetUser.full_name || targetUser.username}'s role to ${newRole}.`)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Failed to update user role.'
      toast.error(msg)
    } finally {
      setUpdatingId(null)
    }
  }

  const handleToggleActive = async (targetUser: UserType) => {
    try {
      setUpdatingId(targetUser.id)
      const updated = await adminApi.toggleUserActive(targetUser.id)
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
      toast.success(
        `Account ${updated.is_active ? 'activated' : 'disabled'} for ${
          targetUser.full_name || targetUser.username
        }.`
      )
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Failed to update account status.'
      toast.error(msg)
    } finally {
      setUpdatingId(null)
    }
  }

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.username.toLowerCase().includes(search.toLowerCase())

    if (!matchesSearch) return false
    if (roleFilter === 'ALL') return true
    if (roleFilter === 'STAFF') return Boolean(u.is_staff)
    return u.role === roleFilter
  })

  const getRoleBadge = (role: UserType['role']) => {
    switch (role) {
      case 'ADMIN':
        return <Badge className="bg-amber-600 hover:bg-amber-700">Admin</Badge>
      case 'ORGANIZER':
        return <Badge className="bg-primary hover:bg-primary/90">Organizer</Badge>
      case 'ATTENDEE':
        return <Badge variant="secondary">Attendee</Badge>
      default:
        return <Badge variant="outline">{role}</Badge>
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button variant="ghost" size="sm" asChild className="gap-1 p-0 h-auto">
          <Link to="/admin">
            <ChevronLeft className="h-4 w-4" />
            Back to Admin Console
          </Link>
        </Button>
      </div>

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Directory & Role Management</h1>
          <p className="text-muted-foreground text-sm">
            Inspect all platform accounts, view staff assignments, and assign or modify user roles.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Filter by role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Roles</SelectItem>
              <SelectItem value="ADMIN">Admins</SelectItem>
              <SelectItem value="ORGANIZER">Organizers</SelectItem>
              <SelectItem value="ATTENDEE">Attendees</SelectItem>
              <SelectItem value="STAFF">Assigned Staff</SelectItem>
            </SelectContent>
          </Select>

          <div className="w-full sm:w-64 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Registered Accounts</CardTitle>
          <CardDescription>
            {filteredUsers.length} user{filteredUsers.length === 1 ? '' : 's'} matching criteria
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="space-y-1">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                  <Skeleton className="h-6 w-16" />
                </div>
              ))}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm space-y-2">
              <Users className="mx-auto h-8 w-8 text-muted-foreground/60" />
              <p>No user profiles matching your search or filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase border-b bg-muted/40">
                  <tr>
                    <th className="py-3 px-4">Name / Username</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Current Role</th>
                    <th className="py-3 px-4">Change Role</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Joined</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredUsers.map((user) => {
                    const isSelf = currentUser?.id === user.id
                    const isBusy = updatingId === user.id

                    return (
                      <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-medium text-foreground flex items-center gap-1.5">
                            {user.full_name || user.username}
                            {isSelf && (
                              <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                                You
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">@{user.username}</div>
                        </td>
                        <td className="py-3 px-4 text-xs font-mono text-muted-foreground">
                          {user.email}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {getRoleBadge(user.role)}
                            {user.is_staff && (
                              <Badge className="bg-indigo-600 hover:bg-indigo-700 text-[10px]">
                                Event Staff
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {isSelf ? (
                            <span className="text-xs text-muted-foreground italic flex items-center gap-1">
                              <ShieldAlert className="h-3.5 w-3.5" /> Protected
                            </span>
                          ) : (
                            <Select
                              value={user.role}
                              disabled={isBusy}
                              onValueChange={(val) => handleRoleChange(user, val as UserRole)}
                            >
                              <SelectTrigger className="h-8 w-36 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ATTENDEE">ATTENDEE</SelectItem>
                                <SelectItem value="ORGANIZER">ORGANIZER</SelectItem>
                                <SelectItem value="ADMIN">ADMIN</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                              user.is_active
                                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                : 'bg-destructive/10 text-destructive'
                            }`}
                          >
                            {user.is_active ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">
                          {formatDate(user.created_at, 'MMM d, yyyy')}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {!isSelf && (
                            <Button
                              size="sm"
                              variant={user.is_active ? 'outline' : 'default'}
                              className="h-7 text-xs"
                              disabled={isBusy}
                              onClick={() => handleToggleActive(user)}
                            >
                              {isBusy ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : user.is_active ? (
                                'Disable'
                              ) : (
                                'Enable'
                              )}
                            </Button>
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
