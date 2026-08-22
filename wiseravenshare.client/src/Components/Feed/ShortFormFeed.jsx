import React, { useMemo, useRef, useState } from 'react';
import { resolveMediaUrl } from '../../utils/mediaUtils';

const sanitizeFeedText = (value, fallback = '') => {
    const text = String(value ?? '')
        .replace(/[\u0000-\u001F\u007F-\u009F]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!text) {
        return fallback;
    }

    if (text.length > 220 || /(?:[A-Za-z0-9+/=]{24,})/.test(text)) {
        return fallback;
    }

    return text;
};

const ShortFormFeed = ({ posts = [] }) => {
    const [activeIndex, setActiveIndex] = useState(0);
    const [likedIds, setLikedIds] = useState([]);
    const [hearts, setHearts] = useState([]);
    const touchStartY = useRef(null);

    const slides = useMemo(() => {
        return posts
            .filter((post) => post?.mediaType === 'video' && (post?.mediaUrl || post?.videoUrl))
            .slice(0, 5)
            .map((post, index) => ({
                id: post.id || `${post.userId || 'clip'}-${index}`,
                user: {
                    ...(post.user || {}),
                    name: sanitizeFeedText(post.user?.name || '', ''),
                    handle: sanitizeFeedText(post.user?.handle || '', '')
                },
                content: sanitizeFeedText(post.content || '', '').slice(0, 150),
                likes: Number(post.likes || 0),
                mediaUrl: post.mediaUrl || post.videoUrl,
                mediaType: 'video',
                caption: sanitizeFeedText(post.caption || '', ''),
                accent: ['#8b5cf6', '#22c55e', '#f59e0b', '#38bdf8', '#ec4899'][index % 5]
            }));
    }, [posts]);

    const activeSlide = slides[activeIndex] || slides[0];

    const goTo = (nextIndex) => {
        setActiveIndex((nextIndex + slides.length) % slides.length);
    };

    const handleSurpriseMe = () => {
        const next = Math.floor(Math.random() * slides.length);
        setActiveIndex(next);
    };

    const handleLike = (id) => {
        setLikedIds((prev) => prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]);
    };

    const handleDoubleTap = (event, id) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const heart = {
            id: `${id}-${Date.now()}`,
            left: event.clientX - rect.left,
            top: event.clientY - rect.top
        };

        setHearts((prev) => [...prev, heart]);
        setTimeout(() => {
            setHearts((prev) => prev.filter((item) => item.id !== heart.id));
        }, 700);

        handleLike(id);
    };

    const onWheel = (event) => {
        if (Math.abs(event.deltaY) < 24) {
            return;
        }

        event.preventDefault();
        const direction = event.deltaY > 0 ? 1 : -1;
        goTo(activeIndex + direction);
    };

    const onTouchStart = (event) => {
        touchStartY.current = event.touches[0].clientY;
    };

    const onTouchEnd = (event) => {
        if (touchStartY.current == null) {
            return;
        }

        const delta = event.changedTouches[0].clientY - touchStartY.current;
        if (Math.abs(delta) > 36) {
            goTo(activeIndex + (delta < 0 ? 1 : -1));
        }

        touchStartY.current = null;
    };

    if (!slides.length) {
        return (
            <section style={{ marginBottom: '20px' }}>
                <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#cbd5e1', fontWeight: 700 }}>Short-form feed</div>
                    <h3 style={{ margin: '6px 0 0', fontSize: '24px' }}>Swipe, heart, and keep the loop alive</h3>
                </div>
                <div style={{
                    border: '1px solid rgba(148,163,184,0.18)',
                    borderRadius: '20px',
                    background: 'rgba(15,23,42,0.46)',
                    padding: '48px 24px',
                    textAlign: 'center',
                    color: '#cbd5e1',
                    fontSize: '14px'
                }}>
                    No videos yet. Record or upload a video and it will appear here.
                </div>
            </section>
        );
    }

    return (
        <section style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                    <div style={{ fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#cbd5e1', fontWeight: 700 }}>Short-form feed</div>
                    <h3 style={{ margin: '6px 0 0', fontSize: '24px' }}>Swipe, heart, and keep the loop alive</h3>
                </div>
                <button
                    onClick={handleSurpriseMe}
                    style={{
                        border: 'none',
                        background: 'linear-gradient(135deg, #8b5cf6, #22c55e)',
                        color: '#fff',
                        borderRadius: '999px',
                        fontWeight: 800,
                        padding: '10px 14px',
                        cursor: 'pointer',
                        boxShadow: '0 12px 20px rgba(139, 92, 246, 0.28)'
                    }}
                >
                    🎲 Surprise Me
                </button>
            </div>

            <div
                style={{
                    position: 'relative',
                    borderRadius: '20px',
                    overflow: 'hidden',
                    border: '1px solid rgba(148,163,184,0.18)',
                    background: 'rgba(15,23,42,0.46)',
                    boxShadow: '0 12px 28px rgba(15,23,42,0.28)'
                }}
            >
                <div
                    style={{
                        display: 'grid',
                        gridTemplateRows: 'repeat(1, minmax(0, 1fr))',
                        height: '72vh',
                        minHeight: '500px',
                        maxHeight: '760px',
                        scrollSnapType: 'y mandatory',
                        overflowY: 'auto',
                        scrollbarWidth: 'none'
                    }}
                    onWheel={onWheel}
                    onTouchStart={onTouchStart}
                    onTouchEnd={onTouchEnd}
                >
                    {slides.map((slide, index) => {
                        const isLiked = likedIds.includes(slide.id);
                        const isActive = index === activeIndex;

                        return (
                            <article
                                key={slide.id}
                                onDoubleClick={(event) => handleDoubleTap(event, slide.id)}
                                style={{
                                    position: 'relative',
                                    scrollSnapAlign: 'start',
                                    height: '72vh',
                                    minHeight: '500px',
                                    display: 'flex',
                                    alignItems: 'flex-end',
                                    padding: '18px',
                                    background: `radial-gradient(circle at top, ${slide.accent}55, rgba(15,23,42,0.85) 38%, rgba(2,6,23,0.94) 100%)`,
                                    opacity: isActive ? 1 : 0.9,
                                    borderBottom: '1px solid rgba(148,163,184,0.12)'
                                }}
                            >
                                {slide.mediaType === 'video' ? (
                                    <video
                                        src={resolveMediaUrl(slide.mediaUrl)}
                                        muted
                                        autoPlay={isActive}
                                        playsInline
                                        loop
                                        style={{
                                            position: 'absolute',
                                            inset: 0,
                                            width: '100%',
                                            height: '100%',
                                            objectFit: 'cover',
                                            filter: 'saturate(1.2) contrast(1.08)'
                                        }}
                                    />
                                ) : (
                                    <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${slide.accent}, #111827)` }} />
                                )}

                                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 0%, rgba(2,6,23,0.12) 30%, rgba(2,6,23,0.78) 100%)' }} />

                                {hearts.filter((heart) => heart.id.startsWith(`${slide.id}-`)).map((heart) => (
                                    <div key={heart.id} style={{ position: 'absolute', left: heart.left, top: heart.top, fontSize: '30px', animation: 'heart-pop 0.7s ease-out forwards' }}>
                                        ❤️
                                    </div>
                                ))}

                                <div style={{ position: 'absolute', left: '18px', top: '18px', zIndex: 2, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {slide.user?.handle && (
                                        <div style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(148,163,184,0.26)', borderRadius: '999px', padding: '8px 10px', fontSize: '11px', color: '#e2e8f0' }}>
                                            {slide.user.handle}
                                        </div>
                                    )}
                                    {slide.caption && (
                                        <div style={{ background: 'rgba(15,23,42,0.72)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: '12px', padding: '8px 10px', fontSize: '11px', color: '#e2e8f0', maxWidth: '240px' }}>
                                            {slide.caption}
                                        </div>
                                    )}
                                </div>

                                <div style={{ position: 'absolute', right: '14px', bottom: '18px', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                                    <button onClick={() => handleLike(slide.id)} style={{ border: 'none', width: '52px', height: '52px', borderRadius: '50%', background: isLiked ? 'rgba(239,68,68,0.92)' : 'rgba(15,23,42,0.7)', color: '#fff', fontSize: '22px', cursor: 'pointer', boxShadow: '0 12px 18px rgba(0,0,0,0.2)' }}>
                                        {isLiked ? '♥' : '♡'}
                                    </button>
                                    <div style={{ background: 'rgba(15,23,42,0.72)', borderRadius: '999px', padding: '6px 10px', fontSize: '12px', color: '#fff' }}>{slide.likes.toLocaleString()}</div>
                                    <button style={{ border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(15,23,42,0.62)', color: '#fff', borderRadius: '999px', padding: '8px 10px', fontSize: '11px', cursor: 'pointer' }}>💬 Comment</button>
                                </div>

                                <div style={{ position: 'relative', zIndex: 2, width: 'min(68%, 500px)', paddingBottom: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                        {slide.user?.name && (
                                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', display: 'grid', placeItems: 'center', background: slide.accent, fontWeight: 800, color: '#fff', fontSize: '12px' }}>
                                                {slide.user.name.charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                        <div>
                                            {slide.user?.name && (
                                                <div style={{ fontWeight: 700, color: '#fff' }}>{slide.user.name}</div>
                                            )}
                                            {slide.user?.handle && (
                                                <div style={{ fontSize: '11px', color: '#dbeafe' }}>{slide.user.handle}</div>
                                            )}
                                        </div>
                                    </div>

                                    {slide.content && (
                                        <p style={{ margin: 0, fontSize: '18px', lineHeight: 1.4, color: '#fff', maxWidth: '520px' }}>
                                            {slide.content}
                                        </p>
                                    )}
                                </div>
                            </article>
                        );
                    })}
                </div>

                <div style={{ position: 'absolute', right: '16px', bottom: '18px', zIndex: 5, width: '160px', pointerEvents: 'none' }}>
                    <div style={{ background: 'rgba(15,23,42,0.74)', border: '1px solid rgba(148,163,184,0.18)', borderRadius: '14px', padding: '8px', backdropFilter: 'blur(8px)', pointerEvents: 'auto' }}>
                        <div style={{ fontSize: '10px', opacity: 0.8, marginBottom: '6px', color: '#dbeafe' }}>PIP • Active clip</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '46px', height: '46px', borderRadius: '12px', background: `linear-gradient(135deg, ${activeSlide.accent}, #111827)`, position: 'relative', overflow: 'hidden' }}>
                                <div style={{ position: 'absolute', inset: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.1)' }} />
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: '12px', color: '#fff', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{activeSlide.user?.name}</div>
                                <div style={{ fontSize: '10px', color: '#cbd5e1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{activeSlide.caption}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default ShortFormFeed;
