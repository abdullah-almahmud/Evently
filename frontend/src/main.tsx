import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { Toaster } from '@/components/ui/toaster'
import { useAuthStore } from '@/stores/authStore'
import './index.css'

function Root() {
  const initializeAuth = useAuthStore((state) => state.initialize)

  useEffect(() => {
    initializeAuth()
  }, [initializeAuth])

  return (
    <React.StrictMode>
      <App />
      <Toaster />
    </React.StrictMode>
  )
}

const container = document.getElementById('root')
if (container) {
  const root = ReactDOM.createRoot(container)
  root.render(<Root />)
}
