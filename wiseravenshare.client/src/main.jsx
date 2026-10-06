import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './Contexts/AuthContext'
import { NotificationProvider } from './Contexts/NotificationContext'
import { ErrorBoundary } from './Components/Common/ErrorBoundary'
import { runMigrations } from './utils/migrations'

runMigrations()

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <AuthProvider>
      <NotificationProvider>
        <App />
      </NotificationProvider>
    </AuthProvider>
  </ErrorBoundary>,
)
