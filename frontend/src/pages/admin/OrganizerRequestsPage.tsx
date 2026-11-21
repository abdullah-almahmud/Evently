import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronLeft,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { OrganizerRequest, OrganizerRequestStatus } from '@/types'
import { adminApi } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

export function OrganizerRequestsPage() {
  const [requests, setRequests] = useState<OrganizerRequest[]>([])
  const [filterStatus, setFilterStatus] = useState<string>('ALL')
  const [isLoading, setIsLoading] = useState(true)

  // Dialog state for confirm
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    requestId: string | null
    action: 'APPROVED' | 'REJECTED' | null
    userName?: string
  }>({
    open: false,
    requestId: null,
    action: null,
  })
  const [isProcessing, setIsProcessing] = useState(false)

  const loadRequests = async () => {
    try {
      setIsLoading(true)
      const statusParam =
        filterStatus !== 'ALL' ? (filterStatus as OrganizerRequestStatus) : undefined
      const data = await adminApi.listOrganizerRequests(statusParam)
      setRequests(data || [])
    } catch (err) {
      console.warn('Failed to load organizer requests:', err)
      setRequests([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadRequests()
  }, [filterStatus])

  const openConfirmation = (req: OrganizerRequest, action: 'APPROVED' | 'REJECTED') => {
    setConfirmDialog({
      open: true,
      requestId: req.id,
      action,
      userName: req.user?.full_name || req.user?.username || req.user_id,
    })
  }

  const handleConfirmAction = async () => {
    if (!confirmDialog.requestId || !confirmDialog.action) return

    try {
      setIsProcessing(true)
      await adminApi.reviewOrganizerRequest(confirmDialog.requestId, confirmDialog.action)
      toast.success(
        `Request ${confirmDialog.action === 'APPROVED' ? 'approved' : 'rejected'} successfully.`
      )
      setConfirmDialog({ open: false, requestId: null, action: null })
      loadRequests()
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Failed to process request.'
      toast.error(msg)
    } finally {
      setIsProcessing(false)
    }
  }

  const getStatusBadge = (status: OrganizerRequestStatus) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Pending</Badge>
      case 'APPROVED':
        return <Badge className="bg-emerald-600 hover:bg-emerald-700 gap-1"><CheckCircle className="h-3 w-3" /> Approved</Badge>
      case 'REJECTED':
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Rejected</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
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
          <h1 className="text-3xl font-bold tracking-tight">Organizer Requests</h1>
          <p className="text-muted-foreground text-sm">
            Approve or reject applications submitted by attendees requesting event creator privileges.
          </p>
        </div>

        <div className="w-48">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Requests</SelectItem>
              <SelectItem value="PENDING">Pending Only</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Applications Queue</CardTitle>
          <CardDescription>
            {requests.length} total request{requests.length === 1 ? '' : 's'} matching filter
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-4 border rounded-lg space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ))}
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm space-y-2">
              <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground/60" />
              <p>No organizer applications found matching this status.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase border-b bg-muted/40">
                  <tr>
                    <th className="py-3 px-4">Applicant</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Reason / Club Affiliation</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {requests.map((req) => (
                    <tr key={req.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4 font-medium">
                        {req.user?.full_name || req.user?.username || req.user_id}
                      </td>
                      <td className="py-3 px-4 text-xs text-muted-foreground font-mono">
                        {req.user?.email || 'N/A'}
                      </td>
                      <td className="py-3 px-4 max-w-xs text-xs text-foreground/90">
                        {req.reason}
                      </td>
                      <td className="py-3 px-4 text-xs text-muted-foreground">
                        {formatDate(req.created_at, 'MMM d, yyyy')}
                      </td>
                      <td className="py-3 px-4">{getStatusBadge(req.status)}</td>
                      <td className="py-3 px-4 text-right">
                        {req.status === 'PENDING' ? (
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                              onClick={() => openConfirmation(req, 'APPROVED')}
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-8 gap-1"
                              onClick={() => openConfirmation(req, 'REJECTED')}
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Reviewed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog
        open={confirmDialog.open}
        onOpenChange={(open) => !open && setConfirmDialog({ open: false, requestId: null, action: null })}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmDialog.action === 'APPROVED' ? 'Approve Organizer Role' : 'Reject Organizer Role'}
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to {confirmDialog.action === 'APPROVED' ? 'grant organizer privileges to' : 'reject the application from'}{' '}
              <strong className="text-foreground">{confirmDialog.userName}</strong>?
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setConfirmDialog({ open: false, requestId: null, action: null })}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              variant={confirmDialog.action === 'APPROVED' ? 'default' : 'destructive'}
              className={confirmDialog.action === 'APPROVED' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
              onClick={handleConfirmAction}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Confirm Action'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
