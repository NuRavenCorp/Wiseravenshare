import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactPlayer from 'react-player/lazy';
import { createHubConnection } from '../../Services/realtimeHub';
import { useAuth } from '../../Contexts/AuthContext';
import api from '../../Services/api';

/**
 * Adaptive multimedia player (YouTube embed, audio, video) with real-time
 * comments and likes via SocialHub (/api/hubs/social).
 */
const MultimediaPlayer = ({ mediaContentId, src, mediaType, title = '', thumbnailUrl = '', onEnded }) => {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [likesCount, setLikesCount] = useState(0);
  const [userHasLiked, setUserHasLiked] = useState(false);
  const [error, setError] = useState('');
  const hubRef = useRef(null);

  const isYouTube = mediaType === 'youtube'
    || (typeof src === 'string' && (src.includes('youtube.com') || src.includes('youtu.be')));
  const isAudio = !isYouTube && (mediaType === 'audio' || /\.(mp3|m4a|wav|ogg|aac|flac)$/i.test(src ?? ''));

  useEffect(() => {
    if (!mediaContentId) return;
    const hub = createHubConnection('/api/hubs/social');
    hubRef.current = hub;
    hub.on('NewComment', (p) => { if (p.mediaContentId === mediaContentId) setComments((prev) => [...prev, p]); });
    hub.on('LikeToggled', (p) => { if (p.mediaContentId === mediaContentId) { setLikesCount(p.likesCount); if (user && p.userId === user.id) setUserHasLiked(p.liked); } });
    hub.start().then(() => hub.invoke('JoinMediaGroup', mediaContentId)).catch((e) => console.warn('SocialHub:', e));
    return () => { hub.invoke('LeaveMediaGroup', mediaContentId).catch(() => {}); hub.stop().catch(() => {}); };
  }, [mediaContentId, user]);

  const handlePostComment = useCallback(async () => {
    const trimmed = commentText.trim();
    if (!trimmed || !mediaContentId) return;
    try { await api.post('/api/mediainteraction/comment', { mediaContentId, content: trimmed }); setCommentText(''); }
    catch { setError('Failed to post comment.'); }
  }, [commentText, mediaContentId]);

  const handleToggleLike = useCallback(async () => {
    if (!mediaContentId) return;
    try { await api.post('/api/mediainteraction/like', { mediaContentId }); }
    catch { setError('Failed to toggle like.'); }
  }, [mediaContentId]);

  return (
    <div className="multimedia-player">
      {isYouTube && (
        <div style={{ position: 'relative', paddingTop: '56.25%' }}>
          <ReactPlayer url={src} controls width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }} onEnded={onEnded} config={{ youtube: { playerVars: { modestbranding: 1 } } }} />
        </div>
      )}
      {!isYouTube && isAudio && (
        <div className="multimedia-player__audio">
          {thumbnailUrl && <img src={thumbnailUrl} alt={title} style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8 }} />}
          <audio controls src={src} onEnded={onEnded} style={{ width: '100%', marginTop: 8 }} />
        </div>
      )}
      {!isYouTube && !isAudio && (
        <video controls src={src} onEnded={onEnded} style={{ width: '100%' }} poster={thumbnailUrl} />
      )}

      {mediaContentId && (
        <div className="multimedia-player__social" style={{ marginTop: 12 }}>
          <button onClick={handleToggleLike} style={{ cursor: 'pointer', background: 'none', border: 'none', fontSize: 16 }}>
            {userHasLiked ? '❤️' : '🤍'} {likesCount}
          </button>
          <div style={{ marginTop: 8 }}>
            {comments.map((c) => (
              <div key={c.commentId} style={{ borderBottom: '1px solid #333', padding: '4px 0' }}>
                <strong>{c.userId}</strong>: {c.content}
              </div>
            ))}
          </div>
          {user && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input value={commentText} onChange={(e) => setCommentText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handlePostComment()} placeholder="Add a comment…" style={{ flex: 1 }} />
              <button onClick={handlePostComment}>Post</button>
            </div>
          )}
          {error && <p style={{ color: 'red', fontSize: 12 }}>{error}</p>}
        </div>
      )}
    </div>
  );
};

export default MultimediaPlayer;
