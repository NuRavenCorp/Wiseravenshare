import React from 'react';
import { resolveMediaUrl } from '../../utils/mediaUtils';

const VideoFeedMini = ({ posts = [] }) => {
    const videoPosts = posts.filter((post) => {
        const isVid = post.type === 'Video' || post.mediaType === 'video' || (post.mediaUrl && /\.(mp4|webm|mov|avi|mkv)$/i.test(post.mediaUrl));
        return isVid && (post.mediaUrl || post.youtubeUrl || post.tiktokUrl || post.facebookUrl);
    });

    return (
        <section
            style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '12px',
                marginBottom: '16px'
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <strong>Video Feed</strong>
                <span style={{ fontSize: '12px', color: 'var(--light-color)' }}>{videoPosts.length}</span>
            </div>

            {videoPosts.length === 0 && (
                <div style={{ fontSize: '13px', color: 'var(--light-color)' }}>
                    No videos yet. Upload a video and toggle YouTube to feature it here.
                </div>
            )}

            {videoPosts.slice(0, 3).map((post) => (
                <article
                    key={post.id}
                    style={{
                        border: '1px solid var(--border-color)',
                        borderRadius: '10px',
                        padding: '10px',
                        marginBottom: '10px',
                        background: 'rgba(255,255,255,0.03)'
                    }}
                >
                    <div style={{ fontSize: '12px', color: 'var(--light-color)', marginBottom: '6px' }}>
                        {post.user?.name || 'Unknown'}
                    </div>
                    {post.mediaUrl && (
                        <video
                            src={resolveMediaUrl(post.mediaUrl)}
                            controls
                            playsInline
                            style={{ width: '100%', maxHeight: '180px', borderRadius: '8px', background: '#000' }}
                        />
                    )}
                    {!post.mediaUrl && (
                        <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', fontSize: '12px', color: 'var(--light-color)' }}>
                            Video published through Ravensight.
                        </div>
                    )}
                    {post.youtubeUrl && (
                        <a
                            href={post.youtubeUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{ display: 'inline-block', marginTop: '8px', fontSize: '12px', color: '#93c5fd' }}
                        >
                            Open on YouTube
                        </a>
                    )}
                    {post.tiktokUrl && (
                        <a
                            href={post.tiktokUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{ display: 'inline-block', marginTop: '8px', marginLeft: '10px', fontSize: '12px', color: '#93c5fd' }}
                        >
                            Open on TikTok
                        </a>
                    )}
                    {post.facebookUrl && (
                        <a
                            href={post.facebookUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{ display: 'inline-block', marginTop: '8px', marginLeft: '10px', fontSize: '12px', color: '#93c5fd' }}
                        >
                            Open on Facebook
                        </a>
                    )}
                </article>
            ))}
        </section>
    );
};

export default VideoFeedMini;