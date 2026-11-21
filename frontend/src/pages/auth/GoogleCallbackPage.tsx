import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { toast } from 'sonner'

export function GoogleCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)
  const processed = useRef(false)

  useEffect(() => {
    if (processed.current) return
    processed.current = true

    const accessToken = searchParams.get('access_token')
    const refreshToken = searchParams.get('refresh_token')
    const error = searchParams.get('error')

    if (error) {
      toast.error(`Authentication failed: ${error}`)
      navigate('/auth/login', { replace: true })
      return
    }

    if (!accessToken) {
      toast.error('No authentication token received from Google OAuth.')
      navigate('/auth/login', { replace: true })
      return
    }

    login(accessToken, refreshToken || accessToken)
      .then(() => {
        toast.success('Successfully signed in with Google!')
        navigate('/', { replace: true })
      })
      .catch((err) => {
        console.error('Google login processing failed:', err)
        toast.error('Failed to complete Google authentication.')
        navigate('/auth/login', { replace: true })
      })
  }, [searchParams, login, navigate])

  return (
    <div className="min-h-[calc(100vh-10rem)] flex flex-col items-center justify-center p-6 text-center space-y-4">
      <div className="relative">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
        </div>
      </div>
      <h2 className="text-xl font-bold tracking-tight">Authenticating with Google...</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        Please wait while we verify your credentials and configure your session.
      </p>
    </div>
  )
}
