import React, { useState } from 'react';
import VideoRecorder from '../Components/Ravensight/VideoRecorder';
import { queueRavensightTab, savePodcastHandoffDraft } from '../Services/podcastStudioBridge';

const NewsroomRecorderPage = ({ onSendToPodcastControlRoom }) => {
    const [notifications, setNotifications] = useState([]);
    const [dispatchTitle, setDispatchTitle] = useState('');
    const [dispatchAngle, setDispatchAngle] = useState('');
    const [producerNotes, setProducerNotes] = useState('');
    const [urgency, setUrgency] = useState('Standard');

    const addNotification = (message, type = 'info') => {
        const id = Date.now();
        setNotifications((prev) => [...prev, { id, message, type }]);
        setTimeout(() => {
            setNotifications((prev) => prev.filter((item) => item.id !== id));
        }, 4500);
    };

    const noticeStyle = (type) => {
        if (type === 'success') {
            return {
                border: '1px solid rgba(34,197,94,0.35)',
                background: 'rgba(34,197,94,0.12)'
            };
        }

        if (type === 'error') {
            return {
                border: '1px solid rgba(248,113,113,0.4)',
                background: 'rgba(248,113,113,0.12)'
            };
        }

        if (type === 'warning') {
            return {
                border: '1px solid rgba(251,191,36,0.4)',
                background: 'rgba(251,191,36,0.12)'
            };
        }

        return {
            border: '1px solid var(--border-color)',
            background: 'rgba(255,255,255,0.04)'
        };
    };

    const handoffToPodcast = () => {
        if (!dispatchTitle.trim()) {
            addNotification('Dispatch title is required before handoff.', 'warning');
            return;
        }

        savePodcastHandoffDraft({
            title: dispatchTitle,
            angle: dispatchAngle,
            urgency,
            notes: producerNotes
        });
        queueRavensightTab('podcast');
        addNotification('Dispatch handed to Podcast Control Room.', 'success');

        if (typeof onSendToPodcastControlRoom === 'function') {
            onSendToPodcastControlRoom();
        }
    };

    return (
        <div style={{ display: 'grid', gap: '16px' }}>
            <section
                style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: '16px',
                    background: 'linear-gradient(120deg, rgba(12,20,38,0.88), rgba(23,36,62,0.82), rgba(40,22,12,0.8))',
                    padding: '18px'
                }}
            >
                <div style={{ fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--light-color)' }}>
                    Newscaster Capture Deck
                </div>
                <h2 style={{ margin: '8px 0 10px' }}>Record social dispatches without leaving the social app</h2>
                <p style={{ margin: 0, color: 'var(--light-color)', lineHeight: 1.6 }}>
                    This recorder is for rapid field reports, creator updates, and short-form journalism. Record, review, and publish directly into your social workflow.
                </p>
            </section>

            <section
                style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: '16px',
                    background: 'var(--card-bg)',
                    padding: '16px',
                    display: 'grid',
                    gap: '10px'
                }}
            >
                <div style={{ fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--light-color)' }}>
                    One-Click Podcast Handoff
                </div>
                <input
                    value={dispatchTitle}
                    onChange={(event) => setDispatchTitle(event.target.value)}
                    placeholder="Dispatch title"
                    style={{
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid var(--border-color)',
                        background: 'rgba(255,255,255,0.03)',
                        color: 'var(--text-color)'
                    }}
                />
                <input
                    value={dispatchAngle}
                    onChange={(event) => setDispatchAngle(event.target.value)}
                    placeholder="Coverage angle"
                    style={{
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid var(--border-color)',
                        background: 'rgba(255,255,255,0.03)',
                        color: 'var(--text-color)'
                    }}
                />
                <textarea
                    value={producerNotes}
                    onChange={(event) => setProducerNotes(event.target.value)}
                    rows={3}
                    placeholder="Producer notes for host/editor"
                    style={{
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid var(--border-color)',
                        background: 'rgba(255,255,255,0.03)',
                        color: 'var(--text-color)',
                        resize: 'vertical'
                    }}
                />
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {['Breaking', 'Standard', 'Feature'].map((value) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => setUrgency(value)}
                            style={{
                                border: urgency === value ? '1px solid var(--highlight-color)' : '1px solid var(--border-color)',
                                background: urgency === value ? 'rgba(255,255,255,0.08)' : 'transparent',
                                color: 'var(--text-color)',
                                borderRadius: '999px',
                                padding: '8px 12px',
                                cursor: 'pointer'
                            }}
                        >
                            {value}
                        </button>
                    ))}
                </div>
                <button
                    type="button"
                    onClick={handoffToPodcast}
                    style={{
                        border: 'none',
                        background: 'linear-gradient(135deg, var(--highlight-color), var(--accent-color))',
                        color: '#fff',
                        borderRadius: '10px',
                        padding: '11px 14px',
                        cursor: 'pointer',
                        fontWeight: 700
                    }}
                >
                    Send to Podcast Control Room
                </button>
            </section>

            {notifications.length > 0 && (
                <section style={{ display: 'grid', gap: '8px' }}>
                    {notifications.slice(-4).map((item) => (
                        <div
                            key={item.id}
                            style={{
                                borderRadius: '10px',
                                padding: '10px 12px',
                                color: 'var(--text-color)',
                                ...noticeStyle(item.type)
                            }}
                        >
                            {item.message}
                        </div>
                    ))}
                </section>
            )}

            <VideoRecorder
                onNotification={addNotification}
                canDirectUpload={true}
                subscriptionPriceMonthly={19}
            />
        </div>
    );
};

export default NewsroomRecorderPage;
