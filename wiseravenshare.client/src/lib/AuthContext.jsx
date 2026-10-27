import React, { createContext, useState, useContext, useEffect } from 'react';
import { apiClient } from '@/api/client';
import { appParams } from '@/lib/app-params';

const AuthContext = createContext();

/**
 * Derives a normalised roles array from the user object returned by /api/auth/verify.
 * Sources checked in priority order:
 *   1. user.roles  (explicit array — future-proof)
 *   2. user.teamRole (string from JWT ClaimTypes.Role)
 *   3. user.accessScope / user.isAdmin — mapped to "Admin"
 *   4. Fallback: ["User"]
 */
function deriveRoles(user) {
  if (!user) return [];

  if (Array.isArray(user.roles) && user.roles.length > 0) {
    return user.roles.map(r => String(r));
  }

  const roles = [];

  if (user.isAdmin || String(user.accessScope || '').toLowerCase() === 'admin') {
    roles.push('Admin');
  }

  const teamRole = String(user.teamRole || '').toLowerCase();
  if (teamRole === 'moderator') roles.push('Moderator');

  if (roles.length === 0) roles.push('User');
  return roles;
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userRoles, setUserRoles] = useState([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null); // Contains only { id, public_settings }

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);
      
      try {
        const publicSettings = await apiClient.app.getPublicSettings();
        setAppPublicSettings(publicSettings);
        
        // If we got the app public settings successfully, check if user is authenticated
        if (appParams.token) {
          await checkUserAuth();
        } else {
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
          setAuthChecked(true);
        }
        setIsLoadingPublicSettings(false);
      } catch (appError) {
        console.error('App state check failed:', appError);
        
        // Handle app-level errors
        if (appError.status === 403 && appError.data?.extra_data?.reason) {
          const reason = appError.data.extra_data.reason;
          if (reason === 'auth_required') {
            setAuthError({
              type: 'auth_required',
              message: 'Authentication required'
            });
          } else if (reason === 'user_not_registered') {
            setAuthError({
              type: 'user_not_registered',
              message: 'User not registered for this app'
            });
          } else {
            setAuthError({
              type: reason,
              message: appError.message
            });
          }
        } else {
          setAuthError({
            type: 'unknown',
            message: appError.message || 'Failed to load app'
          });
        }
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setAuthError({
        type: 'unknown',
        message: error.message || 'An unexpected error occurred'
      });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async () => {
    try {
      // Now check if the user is authenticated
      setIsLoadingAuth(true);
      const currentUser = await apiClient.auth.me();
      setUser(currentUser);
      setUserRoles(deriveRoles(currentUser));
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setUserRoles([]);
      setAuthChecked(true);
      
      // An expired saved token should not prevent access to public pages.
      if (error.status === 401 || error.status === 403) {
        apiClient.auth.clearToken();
        setAuthError(null);
      }
    }
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setUserRoles([]);
    setIsAuthenticated(false);
    
    if (shouldRedirect) {
      // Use the SDK's logout method which handles token cleanup and redirect
      apiClient.auth.logout(window.location.href);
    } else {
      // Just remove the token without redirect
      apiClient.auth.logout();
    }
  };

  const navigateToLogin = () => {
    // Use the SDK's redirectToLogin method
    apiClient.auth.redirectToLogin(window.location.href);
  };

  /** Returns true when the authenticated user has the given role (case-insensitive). */
  const hasRole = (role) => {
    if (!role || !isAuthenticated) return false;
    const target = String(role).toLowerCase();
    return userRoles.some(r => r.toLowerCase() === target);
  };

  /** Returns true when the authenticated user has ALL of the given roles. */
  const hasAllRoles = (roles = []) =>
    Array.isArray(roles) && roles.every(r => hasRole(r));

  /** Returns true when the authenticated user has ANY of the given roles. */
  const hasAnyRole = (roles = []) =>
    Array.isArray(roles) && roles.some(r => hasRole(r));

  return (
    <AuthContext.Provider value={{ 
      user, 
      userRoles,
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState,
      hasRole,
      hasAllRoles,
      hasAnyRole,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
