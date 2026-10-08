import React, { useState, useEffect, useRef } from 'react';
import { createHubConnection } from '../../Services/realtimeHub';
import api from '../../Services/api';

const ActivityFeed = ({ userId }) => {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const hubRef = useRef(null);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    api.get(`/api/analytics/feed/${userId}`, { params: { page: 1, pageSize: 50 } })
      .then(({ data }) => { setActivities(data.activities ?? []); setHasMore((data.activities?.length ?? 0) === 50); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const hub = createHubConnection('/api/hubs/social');
    hubRef.current = hub;
    hub.on('NewFollower', (p) => {
      if (p.followerId === userId || p.targetUserId === userId)
        setActivities((prev) => [{ id: `follow-${Date.now()}`, actorUserId: p.followerId, activityType: 'Followed', targetId: p.targetUserId, targetType: 'User', summary: 'Started following someone', occurredAt: p.occurredAt }, ...prev]);
    });
    hub.on('NewComment', (p) => {
      setActivities((prev) => [{ id: `comment-${p.commentId}`, actorUserId: p.userId, activityType: 'CommentPosted', targetId: p.mediaContentId, targetType: 'MediaItem', summary: `Commented: "${(p.content ?? '').slice(0, 60)}"`, occurredAt: p.createdAt }, ...prev]);
    });
    hub.start().catch((e) => console.warn('ActivityFeed hub:', e));
    return () => hub.stop().catch(() => {});
  }, [userId]);

  const loadMore = () => {
    const next = page + 1;
    api.get(`/api/analytics/feed/${userId}`, { params: { page: next, pageSize: 50 } })
      .then(({ data }) => { setActivities((prev) => [...prev, ...(data.activities ?? [])]); setPage(next); setHasMore((data.activities?.length ?? 0) === 50); });
  };

  if (loading) return <div className="activity-feed__loading">Loading feed…</div>;

  return (
    <div className="activity-feed">
      {activities.length === 0 && <p className="activity-feed__empty">No activity yet. Follow some users to build your feed!</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {activities.map((a) => (
          <li key={a.id} style={{ padding: '8px 0', borderBottom: '1px solid #2a2a3a' }}>
            <span style={{ fontWeight: 700, marginRight: 8 }}>{a.activityType}</span>
            <span style={{ color: '#aaa' }}>{a.summary}</span>
            <time style={{ display: 'block', fontSize: 11, color: '#666', marginTop: 2 }}>{new Date(a.occurredAt).toLocaleString()}</time>
          </li>
        ))}
      </ul>
      {hasMore && <button onClick={loadMore} style={{ marginTop: 12 }}>Load more</button>}
    </div>
  );
};

export default ActivityFeed;
