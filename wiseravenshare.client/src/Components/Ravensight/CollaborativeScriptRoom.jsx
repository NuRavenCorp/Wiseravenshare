import React, { useEffect, useMemo, useState } from 'react';
import { ravensightAPI } from '../../Services/RavensightAPI';
import { useAuth } from '../../Contexts/AuthContext';

const getFeedIdentity = (video) => String(video?.id || video?.videoUrl || video?.mediaUrl || 'default-feed').trim();

const modalBackdropStyle = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '18px'
};

const modalCardStyle = {
    width: 'min(980px, 100%)',
    maxHeight: '88vh',
    overflow: 'auto',
    borderRadius: '14px',
    border: '1px solid var(--border-color)',
    background: 'var(--card-bg)',
    boxShadow: '0 20px 50px rgba(0,0,0,0.45)',
    padding: '16px'
};

const buttonStyle = {
    border: '1px solid var(--highlight-color)',
    background: 'var(--highlight-color)',
    color: 'white',
    borderRadius: '999px',
    padding: '8px 12px',
    cursor: 'pointer'
};

const inputStyle = {
    width: '100%',
    padding: '10px',
    borderRadius: '8px',
    border: '1px solid var(--border-color)',
    background: 'rgba(255,255,255,0.05)',
    color: 'var(--text-color)'
};

const CollaborativeScriptRoom = ({ video, onClose, onNotification }) => {
    const { user } = useAuth();
    const feedId = getFeedIdentity(video);
    const feedTitle = String(video?.title || 'Untitled Video').trim();

    const [workspace, setWorkspace] = useState(null);
    const [speaker, setSpeaker] = useState('Host');
    const [lineText, setLineText] = useState('');
    const [lineStatus, setLineStatus] = useState('draft');
    const [aiTopic, setAiTopic] = useState(feedTitle || 'Video segment');
    const [aiTone, setAiTone] = useState('energetic and clear');
    const [aiAudience, setAiAudience] = useState('creator teams');
    const [loading, setLoading] = useState(false);

    const contributors = useMemo(() => {
        const emails = (workspace?.lines || [])
            .map((line) => String(line?.contributorEmail || '').trim().toLowerCase())
            .filter(Boolean);
        return [...new Set(emails)];
    }, [workspace?.lines]);

    const loadWorkspace = async () => {
        setLoading(true);
        try {
            const response = await ravensightAPI.getScriptWorkspace(feedId, feedTitle);
            setWorkspace(response || null);
        } catch (error) {
            onNotification?.(error?.message || 'Unable to load script room.', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadWorkspace();
    }, [feedId]);

    const addLine = async () => {
        if (!lineText.trim()) {
            onNotification?.('Line text is required.', 'warning');
            return;
        }

        const nextSequence = Array.isArray(workspace?.lines) && workspace.lines.length > 0
            ? Math.max(...workspace.lines.map((line) => Number(line.sequence || 0))) + 1
            : 1;

        setLoading(true);
        try {
            const response = await ravensightAPI.upsertScriptLine(feedId, feedTitle, {
                sequence: nextSequence,
                speaker,
                text: lineText.trim(),
                status: lineStatus,
                contributorName: String(user?.name || '').trim()
            });

            setWorkspace(response || null);
            setLineText('');
            onNotification?.('Line added to shared script.', 'success');
        } catch (error) {
            onNotification?.(error?.message || 'Unable to add script line.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const removeLine = async (lineId) => {
        setLoading(true);
        try {
            const response = await ravensightAPI.deleteScriptLine(feedId, lineId);
            setWorkspace(response || null);
            onNotification?.('Line removed.', 'info');
        } catch (error) {
            onNotification?.(error?.message || 'Unable to remove line.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const suggestLineWithAi = async () => {
        setLoading(true);
        try {
            const response = await ravensightAPI.suggestScriptLine(feedId, {
                feedTitle,
                topic: aiTopic.trim(),
                tone: aiTone.trim(),
                audience: aiAudience.trim(),
                speakerHint: 'AI Writer'
            });

            setWorkspace(response?.workspace || workspace);
            onNotification?.('AI line suggestion added to script.', 'success');
        } catch (error) {
            onNotification?.(error?.message || 'AI assistant is unavailable right now.', 'warning');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={modalBackdropStyle}>
            <div style={modalCardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                    <div>
                        <h3 style={{ margin: 0 }}>Collaborative Script Room</h3>
                        <div style={{ color: 'var(--light-color)', fontSize: '13px', marginTop: '4px' }}>
                            Feed: {feedTitle} · Contributors: {contributors.length}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ ...buttonStyle, background: 'transparent', color: 'var(--text-color)' }}
                    >
                        Close
                    </button>
                </div>

                <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '14px' }}>
                    <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px' }}>
                        <div style={{ fontWeight: 700, marginBottom: '8px' }}>Line-by-line script feed</div>
                        {loading && <div style={{ color: 'var(--light-color)', fontSize: '12px', marginBottom: '8px' }}>Syncing...</div>}
                        {Array.isArray(workspace?.lines) && workspace.lines.length > 0 ? (
                            <div style={{ display: 'grid', gap: '8px' }}>
                                {workspace.lines
                                    .slice()
                                    .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0))
                                    .map((line) => (
                                        <div key={line.lineId} style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '12px', color: 'var(--light-color)' }}>
                                                <span>#{line.sequence} · {line.speaker || 'Speaker'}</span>
                                                <span>{line.status || 'draft'}</span>
                                            </div>
                                            <div style={{ marginTop: '6px', fontSize: '14px' }}>{line.text}</div>
                                            <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--light-color)' }}>
                                                {line.contributorName || line.contributorEmail || 'Unknown writer'}
                                            </div>
                                            <div style={{ marginTop: '8px' }}>
                                                <button
                                                    onClick={() => removeLine(line.lineId)}
                                                    style={{ ...buttonStyle, background: 'transparent', color: 'var(--text-color)' }}
                                                    disabled={loading}
                                                >
                                                    Remove line
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        ) : (
                            <div style={{ color: 'var(--light-color)', fontSize: '13px' }}>
                                No lines yet. Add your first line below.
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'grid', gap: '12px' }}>
                        <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px' }}>
                            <div style={{ fontWeight: 700, marginBottom: '8px' }}>Add script line</div>
                            <div style={{ display: 'grid', gap: '8px' }}>
                                <input
                                    placeholder="Speaker"
                                    value={speaker}
                                    onChange={(event) => setSpeaker(event.target.value)}
                                    style={inputStyle}
                                />
                                <select
                                    value={lineStatus}
                                    onChange={(event) => setLineStatus(event.target.value)}
                                    style={inputStyle}
                                >
                                    <option value="draft">Draft</option>
                                    <option value="review">Review</option>
                                    <option value="approved">Approved</option>
                                </select>
                                <textarea
                                    placeholder="Write one script line"
                                    value={lineText}
                                    onChange={(event) => setLineText(event.target.value)}
                                    rows={4}
                                    style={{ ...inputStyle, resize: 'vertical' }}
                                />
                                <button onClick={addLine} style={buttonStyle} disabled={loading}>
                                    Add Line
                                </button>
                            </div>
                        </div>

                        <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px' }}>
                            <div style={{ fontWeight: 700, marginBottom: '8px' }}>AI-aided script writer</div>
                            <div style={{ display: 'grid', gap: '8px' }}>
                                <input
                                    placeholder="Topic"
                                    value={aiTopic}
                                    onChange={(event) => setAiTopic(event.target.value)}
                                    style={inputStyle}
                                />
                                <input
                                    placeholder="Tone"
                                    value={aiTone}
                                    onChange={(event) => setAiTone(event.target.value)}
                                    style={inputStyle}
                                />
                                <input
                                    placeholder="Audience"
                                    value={aiAudience}
                                    onChange={(event) => setAiAudience(event.target.value)}
                                    style={inputStyle}
                                />
                                <button onClick={suggestLineWithAi} style={buttonStyle} disabled={loading}>
                                    Suggest Next Line
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CollaborativeScriptRoom;
