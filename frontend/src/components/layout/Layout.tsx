import { ReactNode } from 'react'
import { Header } from './Header'
import { Calendar, Heart } from 'lucide-react'
import { Link } from 'react-router-dom'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-background selection:bg-primary/20 selection:text-primary">
      <Header />
      <main className="flex-1 w-full pb-12">{children}</main>
      <footer className="border-t bg-muted/30 py-8 text-sm text-muted-foreground">
        <div className="container mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <Calendar className="h-4 w-4 text-primary" />
            <span>Evently — Campus Event Management</span>
          </div>
          <div className="flex items-center gap-6 text-xs">
            <Link to="/" className="hover:text-primary transition-colors">
              Browse Events
            </Link>
            <Link to="/tickets" className="hover:text-primary transition-colors">
              My Tickets
            </Link>
            <Link to="/profile" className="hover:text-primary transition-colors">
              Profile
            </Link>
          </div>
          <p className="flex items-center gap-1 text-xs">
            Built with <Heart className="h-3 w-3 text-red-500 fill-red-500 inline" /> for UIU Campus
          </p>
        </div>
      </footer>
    </div>
  )
}
