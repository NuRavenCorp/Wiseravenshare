import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
// Add page imports here
import Home from '@/pages/Home';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import AdminAccess from '@/pages/AdminAccess';
import AdminDashboard from '@/pages/admin/AdminDashboard';
import AiNews from '@/pages/AiNews';
import SocialHub from '@/pages/SocialHub';
import Messages from '@/pages/Messages';
import Dashboard from '@/pages/Dashboard';
import TruthSeeker from '@/pages/TruthSeeker';
import JournalismDashboard from '@/pages/JournalismDashboard';
import Ravensight from '@/pages/Ravensight';
import Podcasts from '@/pages/Podcasts';
import Performance from '@/pages/Performance';
import Library from '@/pages/Library';
import Media from '@/pages/Media';
import FMRadioPage from '@/pages/FMRadioPage';
import JoinFeed from '@/pages/JoinFeed';
import Privacy from '@/pages/Privacy';
import Terms from '@/pages/Terms';
import CookiePolicy from '@/pages/CookiePolicy';
import AdminRoute from '@/components/AdminRoute';
import CreatePostButton from '@/components/feed/CreatePostButton';
import { MediaExperienceProvider } from '@/components/media/MediaExperience';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <MediaExperienceProvider>
    <Routes>
      {/* Add your page Route elements here */}
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/admin-access" element={<AdminAccess />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/cookies" element={<CookiePolicy />} />
      <Route path="/join-feed" element={<JoinFeed />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route path="/social" element={<SocialHub />} />
        <Route path="/ai-news" element={<AiNews />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/media" element={<Media />} />
        <Route path="/fm-radio" element={<FMRadioPage />} />
        <Route path="/truthseeker" element={<TruthSeeker />} />
        <Route path="/journalism" element={<JournalismDashboard />} />
        <Route path="/ravensight" element={<Ravensight />} />
        <Route path="/podcasts" element={<Podcasts />} />
        <Route path="/performance" element={<Performance />} />
        <Route path="/library" element={<Library />} />
        <Route path="/python-features" element={<Navigate to="/" replace />} />
        <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
    <CreatePostButton />
    </MediaExperienceProvider>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
