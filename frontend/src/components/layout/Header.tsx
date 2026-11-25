import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import {
  Calendar,
  Menu,
  X,
  User as UserIcon,
  Ticket,
  LogOut,
  Shield,
  Compass,
  PlusCircle,
  Building2,
  ShieldCheck,
  ShoppingBag,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'

export function Header() {
  const { user, isAuthenticated, isOrganizer, isAdmin, isStaff, canBookTickets, logout } = useAuth()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const getInitials = (name: string) => {
    if (!name) return 'U'
    const parts = name.trim().split(' ')
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium transition-colors hover:text-primary ${
      isActive ? 'text-primary font-semibold' : 'text-muted-foreground'
    }`

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6">
        {/* Brand */}
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center space-x-2 font-bold text-xl tracking-tight text-primary">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Calendar className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-primary to-indigo-600 bg-clip-text text-transparent">
              Evently
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-6">
            <NavLink to="/" className={navLinkClass} end>
              <span className="flex items-center gap-1.5">
                <Compass className="h-4 w-4" />
                Browse Events
              </span>
            </NavLink>

            {isAuthenticated && canBookTickets && (
              <>
                <NavLink to="/my-bookings" className={navLinkClass}>
                  <span className="flex items-center gap-1.5">
                    <ShoppingBag className="h-4 w-4" />
                    My Bookings
                  </span>
                </NavLink>
                <NavLink to="/tickets" className={navLinkClass}>
                  <span className="flex items-center gap-1.5">
                    <Ticket className="h-4 w-4" />
                    My Tickets
                  </span>
                </NavLink>
              </>
            )}

            {isAuthenticated && isStaff && (
              <NavLink to="/staff/events" className={navLinkClass}>
                <span className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
                  <ShieldCheck className="h-4 w-4" />
                  Staff Portal
                </span>
              </NavLink>
            )}

            {isOrganizer && (
              <>
                <NavLink to="/organizer/events" className={navLinkClass}>
                  Manage Events
                </NavLink>
                <NavLink to="/organizer/venues" className={navLinkClass}>
                  Venues
                </NavLink>
              </>
            )}

            {isAdmin && (
              <NavLink to="/admin" className={navLinkClass}>
                <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
                  <Shield className="h-4 w-4" />
                  Admin Console
                </span>
              </NavLink>
            )}
          </nav>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-3">
          {isAuthenticated && isOrganizer && (
            <Button
              asChild
              size="sm"
              variant="outline"
              className="hidden lg:inline-flex items-center gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
            >
              <Link to="/organizer/events/create">
                <PlusCircle className="h-4 w-4" />
                Create Event
              </Link>
            </Button>
          )}

          {isAuthenticated && user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full p-0">
                  <Avatar className="h-9 w-9 ring-2 ring-primary/20 transition-all hover:ring-primary/50">
                    {user.avatar_url && <AvatarImage src={user.avatar_url} alt={user.full_name} />}
                    <AvatarFallback>{getInitials(user.full_name || user.username)}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-semibold leading-none">{user.full_name || user.username}</p>
                    <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                    <div className="pt-1.5 flex items-center gap-1.5 flex-wrap">
                      <Badge variant="secondary" className="text-[10px] uppercase font-mono tracking-wider">
                        {user.role}
                      </Badge>
                      {isStaff && (
                        <Badge className="text-[10px] uppercase font-mono tracking-wider bg-indigo-600">
                          STAFF
                        </Badge>
                      )}
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/profile" className="cursor-pointer flex items-center">
                    <UserIcon className="mr-2 h-4 w-4" />
                    <span>Profile & Settings</span>
                  </Link>
                </DropdownMenuItem>

                {canBookTickets && (
                  <>
                    <DropdownMenuItem asChild>
                      <Link to="/my-bookings" className="cursor-pointer flex items-center">
                        <ShoppingBag className="mr-2 h-4 w-4" />
                        <span>My Bookings</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/tickets" className="cursor-pointer flex items-center">
                        <Ticket className="mr-2 h-4 w-4" />
                        <span>My Tickets</span>
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}

                {isStaff && (
                  <DropdownMenuItem asChild>
                    <Link to="/staff/events" className="cursor-pointer flex items-center text-indigo-600 dark:text-indigo-400">
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      <span>Staff Portal</span>
                    </Link>
                  </DropdownMenuItem>
                )}

                {isOrganizer && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to="/organizer/events" className="cursor-pointer flex items-center">
                        <Calendar className="mr-2 h-4 w-4" />
                        <span>Organizer Dashboard</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/organizer/venues" className="cursor-pointer flex items-center">
                        <Building2 className="mr-2 h-4 w-4" />
                        <span>Manage Venues</span>
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}

                {isAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to="/admin" className="cursor-pointer flex items-center text-amber-600 dark:text-amber-400">
                        <Shield className="mr-2 h-4 w-4" />
                        <span>Admin Console</span>
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}

                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="hidden sm:flex items-center gap-2">
              <Button variant="ghost" size="sm" asChild>
                <Link to="/auth/login">Log in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link to="/auth/register">Sign up</Link>
              </Button>
            </div>
          )}

          {/* Mobile hamburger button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle Menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Menu dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b bg-background px-4 py-4 space-y-3 animate-in slide-in-from-top-2">
          <nav className="flex flex-col space-y-2">
            <Link
              to="/"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 text-sm font-medium rounded-md hover:bg-accent"
            >
              Browse Events
            </Link>

            {isAuthenticated && canBookTickets && (
              <>
                <Link
                  to="/my-bookings"
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-3 py-2 text-sm font-medium rounded-md hover:bg-accent"
                >
                  My Bookings
                </Link>
                <Link
                  to="/tickets"
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-3 py-2 text-sm font-medium rounded-md hover:bg-accent"
                >
                  My Tickets
                </Link>
              </>
            )}

            {isAuthenticated && isStaff && (
              <Link
                to="/staff/events"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2 text-sm font-medium rounded-md hover:bg-accent text-indigo-600 dark:text-indigo-400"
              >
                Staff Portal
              </Link>
            )}

            {isOrganizer && (
              <>
                <Link
                  to="/organizer/events"
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-3 py-2 text-sm font-medium rounded-md hover:bg-accent"
                >
                  Manage Events
                </Link>
                <Link
                  to="/organizer/events/create"
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-3 py-2 text-sm font-medium rounded-md hover:bg-accent text-primary"
                >
                  + Create Event
                </Link>
                <Link
                  to="/organizer/venues"
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-3 py-2 text-sm font-medium rounded-md hover:bg-accent"
                >
                  Venues
                </Link>
              </>
            )}

            {isAdmin && (
              <Link
                to="/admin"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2 text-sm font-medium rounded-md hover:bg-accent text-amber-600"
              >
                Admin Console
              </Link>
            )}

            {!isAuthenticated && (
              <div className="pt-2 flex flex-col gap-2">
                <Button asChild variant="outline" className="w-full">
                  <Link to="/auth/login" onClick={() => setMobileMenuOpen(false)}>
                    Log in
                  </Link>
                </Button>
                <Button asChild className="w-full">
                  <Link to="/auth/register" onClick={() => setMobileMenuOpen(false)}>
                    Sign up
                  </Link>
                </Button>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  )
}
