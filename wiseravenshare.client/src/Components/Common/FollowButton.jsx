import React, { useState, useEffect } from 'react';
import api from '../../Services/api';
import { useAuth } from '../../Contexts/AuthContext';

const FollowButton = ({ targetUserId, className = '' }) => {
  const { user } = useAuth();
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user || !targetUserId || user.id === targetUserId) return;
    api.get(`/api/follow/status/${targetUserId}`)
      .then(({ data }) => { setIsFollowing(data.isFollowing ?? false); setReady(true); })
      .catch(() => setReady(true));
  }, [user, targetUserId]);

  const handleToggle = async () => {
    if (!user || loading) return;
    setLoading(true);
    try { const { data } = await api.post('/api/follow/toggle', { targetUserId }); setIsFollowing(data.nowFollowing ?? !isFollowing); }
    catch { /* keep state */ }
    finally { setLoading(false); }
  };

  if (!user || user.id === targetUserId || !ready) return null;

  return (
    <button
      className={`follow-button ${isFollowing ? 'follow-button--following' : ''} ${className}`}
      onClick={handleToggle}
      disabled={loading}
      aria-pressed={isFollowing}
    >
      {loading ? '…' : isFollowing ? 'Following' : 'Follow'}
    </button>
  );
};

export default FollowButton;
