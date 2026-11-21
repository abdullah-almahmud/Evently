import { Link, useParams } from 'react-router-dom'
import {
  ChevronLeft,
  TrendingUp,
  Users,
  Ticket,
  Clock,
  Sparkles,
  BarChart2,
} from 'lucide-react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const mockChartData = [
  { day: 'Mon', registrations: 12, revenue: 3600 },
  { day: 'Tue', registrations: 19, revenue: 5700 },
  { day: 'Wed', registrations: 34, revenue: 10200 },
  { day: 'Thu', registrations: 45, revenue: 13500 },
  { day: 'Fri', registrations: 68, revenue: 20400 },
  { day: 'Sat', registrations: 95, revenue: 28500 },
  { day: 'Sun', registrations: 120, revenue: 36000 },
]

export function EventAnalyticsPage() {
  const { id } = useParams<{ id: string }>()

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl space-y-8">
      {/* Top navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild className="gap-1 text-muted-foreground">
          <Link to="/organizer/events">
            <ChevronLeft className="h-4 w-4" />
            Back to Organizer Events
          </Link>
        </Button>
        <Badge variant="outline" className="border-primary/40 text-primary">
          Event ID: {id}
        </Badge>
      </div>

      {/* Header Banner */}
      <div className="rounded-2xl border bg-gradient-to-r from-primary/10 via-background to-background p-6 md:p-8 space-y-3">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/20 px-3 py-1 text-xs font-semibold text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Analytics Dashboard — Coming in the final milestone</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">Event Performance & Ticket Insights</h1>
        <p className="text-muted-foreground text-sm max-w-2xl leading-relaxed">
          Comprehensive real-time reporting including attendee check-in velocity, demographic distribution, ticket tier conversion rates, and revenue telemetry.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Registrations
            </CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">393</div>
            <p className="text-xs text-emerald-600 font-medium flex items-center gap-1 mt-1">
              <TrendingUp className="h-3.5 w-3.5" />
              +18.2% from last milestone
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Tickets Sold
            </CardTitle>
            <Ticket className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">85%</div>
            <p className="text-xs text-muted-foreground mt-1">340 / 400 total seats</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Gross Revenue
            </CardTitle>
            <BarChart2 className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">৳117,900</div>
            <p className="text-xs text-muted-foreground mt-1">Across 3 active tiers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Check-in Rate
            </CardTitle>
            <Clock className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Pending</div>
            <p className="text-xs text-muted-foreground mt-1">Activates on event day</p>
          </CardContent>
        </Card>
      </div>

      {/* Analytics Preview Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Registration Velocity (Preview)</CardTitle>
          <CardDescription>Daily ticket registrations and booking demand</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockChartData}>
                <defs>
                  <linearGradient id="colorReg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="day" stroke="#888888" fontSize={12} tickLine={false} />
                <YAxis stroke="#888888" fontSize={12} tickLine={false} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="registrations"
                  stroke="hsl(var(--primary))"
                  fillOpacity={1}
                  fill="url(#colorReg)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
