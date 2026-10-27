import { useEffect } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

/**
 * ProtectedRoute – guards a route tree against unauthenticated access.
 *
 * Props:
 *   fallback             – element shown while the auth check is in progress
 *   unauthenticatedElement – element (or redirect) rendered when not signed in
 *   allowedRoles         – optional string[] of role names; when supplied the user
 *                          must have at least one of them, otherwise they see
 *                          `unauthorizedElement` (default: <Navigate to="/unauthorized" />)
 *   unauthorizedElement  – element shown when role check fails
 */
export default function ProtectedRoute({
  fallback = <DefaultFallback />,
  unauthenticatedElement,
  allowedRoles,
  unauthorizedElement = <Navigate to="/unauthorized" replace />,
}) {
  const { isAuthenticated, isLoadingAuth, authChecked, authError, checkUserAuth, hasAnyRole } = useAuth();

  useEffect(() => {
    if (!authChecked && !isLoadingAuth) {
      checkUserAuth();
    }
  }, [authChecked, isLoadingAuth, checkUserAuth]);

  if (isLoadingAuth || !authChecked) {
    return fallback;
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
    return unauthenticatedElement;
  }

  if (!isAuthenticated) {
    return unauthenticatedElement;
  }

  // Role guard: only applied when allowedRoles is a non-empty array.
  if (Array.isArray(allowedRoles) && allowedRoles.length > 0 && !hasAnyRole(allowedRoles)) {
    return unauthorizedElement;
  }

  return <Outlet />;
}
