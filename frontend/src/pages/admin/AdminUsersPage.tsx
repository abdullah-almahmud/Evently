import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Users, Search } from 'lucide-react'
import { User as UserType } from '@/types'
import { adminApi } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function AdminUsersPage() {
  const [users, setUsers] = useState<UserType[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
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
    fetchUsers()
  }, [])

  const filteredUsers = users.filter(
    (u) =>
      u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.username.toLowerCase().includes(search.toLowerCase())
  )

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

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Campus User Directory</h1>
          <p className="text-muted-foreground text-sm">
            Inspect all registered accounts, roles, and campus affiliations.
          </p>
        </div>

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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Registered Users</CardTitle>
          <CardDescription>
            {filteredUsers.length} user{filteredUsers.length === 1 ? '' : 's'} found
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
              <p>No user profiles matching your search query.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase border-b bg-muted/40">
                  <tr>
                    <th className="py-3 px-4">Name / Username</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-medium text-foreground">{user.full_name || user.username}</div>
                        <div className="text-xs text-muted-foreground">@{user.username}</div>
                      </td>
                      <td className="py-3 px-4 text-xs font-mono text-muted-foreground">
                        {user.email}
                      </td>
                      <td className="py-3 px-4">{getRoleBadge(user.role)}</td>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
