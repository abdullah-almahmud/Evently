import { useState, useEffect, FormEvent } from 'react'
import {
  User as UserIcon,
  Mail,
  Shield,
  Send,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usersApi } from '@/lib/api'
import { OrganizerRequest } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

export function ProfilePage() {
  const { user, setUser } = useAuth()

  const [fullName, setFullName] = useState(user?.full_name || '')
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false)

  // Organizer Request state
  const [organizerRequest, setOrganizerRequest] = useState<OrganizerRequest | null>(null)
  const [requestReason, setRequestReason] = useState('')
  const [isLoadingRequest, setIsLoadingRequest] = useState(false)
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false)

  useEffect(() => {
    if (user?.full_name) {
      setFullName(user.full_name)
    }
  }, [user])

  useEffect(() => {
    if (user?.role === 'ATTENDEE') {
      const fetchMyRequest = async () => {
        try {
          setIsLoadingRequest(true)
          const req = await usersApi.getMyOrganizerRequest()
          setOrganizerRequest(req)
        } catch (err) {
          console.warn('Could not load organizer request status:', err)
        } finally {
          setIsLoadingRequest(false)
        }
      }
      fetchMyRequest()
    }
  }, [user?.role])

  const handleUpdateProfile = async (e: FormEvent) => {
    e.preventDefault()
    if (!fullName.trim()) {
      toast.error('Full name cannot be blank.')
      return
    }

    try {
      setIsUpdatingProfile(true)
      const updated = await usersApi.updateMe({ full_name: fullName.trim() })
      setUser(updated)
      toast.success('Profile details updated successfully.')
    } catch {
      toast.error('Failed to update profile.')
    } finally {
      setIsUpdatingProfile(false)
    }
  }

  const handleSubmitOrganizerRequest = async (e: FormEvent) => {
    e.preventDefault()
    if (!requestReason.trim()) {
      toast.error('Please specify the reason and club/department affiliation.')
      return
    }

    try {
      setIsSubmittingRequest(true)
      const req = await usersApi.submitOrganizerRequest(requestReason.trim())
      setOrganizerRequest(req)
      toast.success('Organizer application submitted for administrative review!')
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Failed to submit organizer application.'
      toast.error(msg)
    } finally {
      setIsSubmittingRequest(false)
    }
  }

  if (!user) return null

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Account Profile</h1>
        <p className="text-muted-foreground text-sm">
          Manage your personal university credentials and organizer permissions.
        </p>
      </div>

      {/* User Information Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {user.avatar_url && <AvatarImage src={user.avatar_url} alt={user.full_name} />}
              <AvatarFallback className="text-xl">
                {(user.full_name || user.username).slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-xl">{user.full_name || user.username}</CardTitle>
              <CardDescription className="flex items-center gap-2 pt-1">
                <span>@{user.username}</span>
                <span>•</span>
                <Badge variant="outline" className="font-mono text-xs">
                  {user.role}
                </Badge>
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <form onSubmit={handleUpdateProfile}>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="fullName">Full Name</Label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="pl-9"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">Email Address (Read-only)</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    value={user.email}
                    disabled
                    className="pl-9 bg-muted/50 cursor-not-allowed"
                  />
                </div>
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex justify-end border-t pt-4">
            <Button type="submit" disabled={isUpdatingProfile} size="sm">
              {isUpdatingProfile ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* Organizer Request Section */}
      {user.role === 'ATTENDEE' && (
        <Card className="border-primary/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Event Organizer Application</CardTitle>
            </div>
            <CardDescription>
              Are you a campus club president, department coordinator, or faculty member? Apply to host and manage events on Evently.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {isLoadingRequest ? (
              <div className="space-y-2">
                <div className="h-4 w-1/3 bg-muted animate-pulse rounded" />
                <div className="h-10 w-full bg-muted animate-pulse rounded" />
              </div>
            ) : organizerRequest ? (
              <div className="rounded-lg border p-4 bg-muted/20 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Application Status</span>
                  {organizerRequest.status === 'PENDING' && (
                    <Badge variant="secondary" className="gap-1">
                      <Clock className="h-3 w-3" /> Under Review
                    </Badge>
                  )}
                  {organizerRequest.status === 'APPROVED' && (
                    <Badge className="bg-emerald-600 gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Approved
                    </Badge>
                  )}
                  {organizerRequest.status === 'REJECTED' && (
                    <Badge variant="destructive" className="gap-1">
                      <XCircle className="h-3 w-3" /> Rejected
                    </Badge>
                  )}
                </div>

                <div className="space-y-1 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Reason provided:</p>
                  <p className="italic bg-background p-2 rounded border">
                    &quot;{organizerRequest.reason}&quot;
                  </p>
                </div>

                {organizerRequest.status === 'PENDING' && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Your request is in the admin queue. You will receive organizer permissions once verified.
                  </p>
                )}
              </div>
            ) : (
              <form onSubmit={handleSubmitOrganizerRequest} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="reason">Club / Organization Details & Reason</Label>
                  <Textarea
                    id="reason"
                    placeholder="e.g. Executive of UIU Computer Club (UIUCCL) hosting national hackathons and robotics symposiums..."
                    value={requestReason}
                    onChange={(e) => setRequestReason(e.target.value)}
                    rows={4}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    State your student ID, club designation, and upcoming planned events.
                  </p>
                </div>

                <Button type="submit" disabled={isSubmittingRequest} className="gap-1.5">
                  {isSubmittingRequest ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Submit Organizer Application
                    </>
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {user.role === 'ORGANIZER' && (
        <Card className="bg-emerald-500/5 border-emerald-500/20">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
              Verified Event Organizer
            </CardTitle>
            <CardDescription>
              Your account has verified organizer privileges. You can publish events, configure venue layouts, and view attendee registrations.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  )
}
