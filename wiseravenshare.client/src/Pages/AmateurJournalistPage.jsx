import React, { useMemo, useState } from 'react';
import Compartment from '../Components/Common/Compartment';
import { useAuth } from '../Contexts/AuthContext';
import { apiService } from '../Services/api';
import { getMediaKind, readFileAsDataUrl } from '../utils/mediaUtils';

const MAX_VIDEO_SECONDS = 60;
const MAX_POST_CONTENT = 1000;

const getVideoDurationSeconds = (file) => {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const video = document.createElement('video');

        const cleanup = () => {
            URL.revokeObjectURL(objectUrl);
            video.removeAttribute('src');
            video.load();
        };

        video.preload = 'metadata';
        video.onloadedmetadata = () => {
            const duration = Number.isFinite(video.duration) ? video.duration : 0;
            cleanup();
            resolve(duration);
        };
        video.onerror = () => {
            cleanup();
            reject(new Error('Unable to validate video duration.'));
        };

        video.src = objectUrl;
    });
};

const extractUploadedMediaUrl = (payload) => {
    const source = payload?.data || payload || {};
    const fileName = source.fileName
        || source.file?.fileName
        || source.file?.FileName
        || '';
    const directUrl = (
        source.mediaUrl
        || source.filePath
        || source.file?.mediaUrl
        || source.file?.MediaUrl
        || source.file?.publicUrl
        || source.file?.PublicUrl
        || source.file?.filePath
        || source.video?.videoUrl
        || source.video?.VideoUrl
        || source.video?.mediaUrl
        || source.video?.MediaUrl
        || source.video?.filePath
        || source.url
        || source.Url
        || ''
    );

    if (directUrl) {
        return directUrl;
    }

    if (fileName && typeof window !== 'undefined') {
        return `${window.location.origin}/api/videostreaming/stream?fileName=${encodeURIComponent(fileName)}`;
    }

    return (
        source.file?.relativePath
        || source.file?.RelativePath
        || ''
    );
};

const AmateurJournalistPage = ({ onNavigate }) => {
    const { user } = useAuth();
    const [headline, setHeadline] = useState('');
    const [story, setStory] = useState('');
    const [coverageScope, setCoverageScope] = useState('local');
    const [localTarget, setLocalTarget] = useState('');
    const [truthAcknowledged, setTruthAcknowledged] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [uploadStatus, setUploadStatus] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const profileLocation = String(user?.location || '').trim();
    const defaultLocalTarget = profileLocation || 'your city or zipcode';

    const remaining = useMemo(() => {
        const content = `[Field Report] ${headline}\n\n${story}`.trim();
        return MAX_POST_CONTENT - content.length;
    }, [headline, story]);

    const resetForm = () => {
        setHeadline('');
        setStory('');
        setCoverageScope('local');
        setLocalTarget(profileLocation);
        setTruthAcknowledged(false);
        setSelectedFile(null);
    };

    const handleFileSelection = async (event) => {
        const file = event.target.files?.[0] || null;
        setErrorMessage('');
        setUploadStatus('');

        if (!file) {
            setSelectedFile(null);
            return;
        }

        const kind = getMediaKind(file);
        if (!kind) {
            setErrorMessage('Only image or video files are allowed.');
            setSelectedFile(null);
            return;
        }

        if (kind === 'video') {
            try {
                const duration = await getVideoDurationSeconds(file);
                if (duration > MAX_VIDEO_SECONDS) {
                    setErrorMessage(`Video must be ${MAX_VIDEO_SECONDS} seconds or shorter.`);
                    setSelectedFile(null);
                    event.target.value = '';
                    return;
                }
            } catch (error) {
                setErrorMessage(error.message || 'Video validation failed.');
                setSelectedFile(null);
                event.target.value = '';
                return;
            }
        }

        setSelectedFile(file);
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setErrorMessage('');
        setUploadStatus('');

        const safeHeadline = headline.trim();
        const safeStory = story.trim();
        const safeLocalTarget = localTarget.trim();

        if (!safeHeadline || !safeStory) {
            setErrorMessage('Headline and story are required.');
            return;
        }

        if (coverageScope === 'local' && !safeLocalTarget) {
            setErrorMessage('Please enter the city or zipcode this local story should cover.');
            return;
        }

        if (!truthAcknowledged) {
            setErrorMessage('You must affirm the truth declaration before publishing.');
            return;
        }

        const audienceLabel = coverageScope === 'local'
            ? `Local report for ${safeLocalTarget}`
            : 'National report';
        const content = `[${audienceLabel}] ${safeHeadline}\n\n${safeStory}`.trim();
        if (content.length > MAX_POST_CONTENT) {
            setErrorMessage(`Story is too long. Please remove ${content.length - MAX_POST_CONTENT} characters.`);
            return;
        }

        setIsSubmitting(true);
        try {
            let mediaUrl = '';
            let postType = 'Text';

            if (selectedFile) {
                const mediaType = getMediaKind(selectedFile);
                postType = mediaType === 'video' ? 'Video' : mediaType === 'photo' ? 'Image' : 'Document';
                setUploadStatus('Uploading story file...');

                try {
                    const uploadResponse = await apiService.uploadMedia(selectedFile, mediaType, {
                        title: safeHeadline,
                        description: safeStory,
                        destinationFolder: 'journalist_dispatches'
                    });

                    mediaUrl = extractUploadedMediaUrl(uploadResponse);
                } catch (uploadErr) {
                    console.warn('Server uploadMedia endpoint call failed, applying local fallback:', uploadErr);
                }

                if (!mediaUrl) {
                    try {
                        mediaUrl = await readFileAsDataUrl(selectedFile);
                    } catch {
                        mediaUrl = URL.createObjectURL(selectedFile);
                    }
                }
            }

            setUploadStatus('Publishing your field report...');
            await apiService.createPost({
                content,
                type: postType,
                mediaUrl: mediaUrl || null,
                locationName: coverageScope === 'local' ? safeLocalTarget : 'National',
                truthDispatch: true,
                truthDeclarationAccepted: true
            });

            setUploadStatus('Report published. It is now live in the feed.');
            resetForm();
            if (typeof onNavigate === 'function') {
                onNavigate('feed');
            }
        } catch (error) {
            setErrorMessage(error?.message || 'Unable to publish this report right now.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Compartment badge="Video Journalism" title="Amateur Journalist Dispatch">
        <section
            style={{
                border: '1px solid var(--border-color)',
                borderRadius: '16px',
                background: 'linear-gradient(130deg, rgba(14,24,39,0.96), rgba(25,34,53,0.88), rgba(44,30,18,0.82))',
                padding: '18px',
                display: 'grid',
                gap: '14px'
            }}
        >
            <div>
                <div style={{ fontSize: '12px', letterSpacing: '0.11em', textTransform: 'uppercase', color: 'var(--light-color)' }}>
                    Citizen Newswire
                </div>
                <h2 style={{ margin: '8px 0 10px' }}>Amateur Journalist Dispatch</h2>
                <p style={{ margin: 0, color: 'var(--light-color)', lineHeight: 1.6 }}>
                    Publish local or national reports fast. Add one photo or one short video clip up to 15 seconds.
                </p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '10px' }}>
                <div style={{ display: 'grid', gap: '8px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--light-color)' }}>
                        Where should this story travel?
                    </div>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        {[
                            { id: 'local', label: 'Local' },
                            { id: 'national', label: 'National' }
                        ].map((option) => (
                            <button
                                key={option.id}
                                type="button"
                                onClick={() => {
                                    setCoverageScope(option.id);
                                    if (option.id === 'local' && !localTarget.trim()) {
                                        setLocalTarget(profileLocation);
                                    }
                                }}
                                style={{
                                    border: coverageScope === option.id ? '1px solid var(--highlight-color)' : '1px solid var(--border-color)',
                                    background: coverageScope === option.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                                    color: 'var(--text-color)',
                                    borderRadius: '999px',
                                    padding: '8px 12px',
                                    cursor: 'pointer'
                                }}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>

                {coverageScope === 'local' && (
                    <label style={{ display: 'grid', gap: '6px', color: 'var(--text-color)', fontSize: '14px' }}>
                        Which city or zipcode should this local story cover?
                        <input
                            value={localTarget}
                            onChange={(event) => setLocalTarget(event.target.value)}
                            placeholder={profileLocation || 'City or zipcode'}
                            maxLength={80}
                            required
                            style={{
                                padding: '10px 12px',
                                borderRadius: '10px',
                                border: '1px solid var(--border-color)',
                                background: 'rgba(255,255,255,0.03)',
                                color: 'var(--text-color)'
                            }}
                        />
                        <span style={{ fontSize: '12px', color: 'var(--light-color)' }}>
                            Your signup location will be used as the default if available.
                        </span>
                    </label>
                )}

                <input
                    value={headline}
                    onChange={(event) => setHeadline(event.target.value)}
                    placeholder="Headline"
                    maxLength={180}
                    required
                    style={{
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid var(--border-color)',
                        background: 'rgba(255,255,255,0.03)',
                        color: 'var(--text-color)'
                    }}
                />
                <textarea
                    value={story}
                    onChange={(event) => setStory(event.target.value)}
                    placeholder="Write your report"
                    rows={7}
                    required
                    style={{
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid var(--border-color)',
                        background: 'rgba(255,255,255,0.03)',
                        color: 'var(--text-color)',
                        resize: 'vertical'
                    }}
                />
                <div style={{ fontSize: '12px', color: remaining < 0 ? '#fda4af' : 'var(--light-color)' }}>
                    Remaining characters: {remaining}
                </div>

                <label
                    style={{
                        display: 'grid',
                        gap: '8px',
                        padding: '12px',
                        borderRadius: '12px',
                        border: '1px solid rgba(251,191,36,0.45)',
                        background: 'rgba(251,191,36,0.08)',
                        color: 'var(--text-color)'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                        <input
                            type="checkbox"
                            checked={truthAcknowledged}
                            onChange={(event) => setTruthAcknowledged(event.target.checked)}
                            style={{ marginTop: '3px' }}
                        />
                        <div style={{ display: 'grid', gap: '4px' }}>
                            <strong>Truth Dispatch Declaration</strong>
                            <span style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--light-color)' }}>
                                I affirm this dispatch is true to the best of my knowledge. I understand that knowingly publishing false information may result in permanent suspension.
                            </span>
                        </div>
                    </div>
                </label>

                <label style={{ display: 'grid', gap: '6px', color: 'var(--text-color)', fontSize: '14px' }}>
                    Optional story media or dispatch file (image, video, or document)
                    <input
                        type="file"
                        accept="image/*,video/mp4,video/webm,video/quicktime,video/x-msvideo,.pdf,.txt,.doc,.docx,.md"
                        onChange={handleFileSelection}
                        style={{ color: 'var(--light-color)' }}
                    />
                </label>

                {selectedFile && (
                    <div style={{ fontSize: '12px', color: 'var(--light-color)' }}>
                        Selected: {selectedFile.name}
                    </div>
                )}

                <div style={{ fontSize: '12px', color: 'var(--light-color)', lineHeight: 1.5 }}>
                    {coverageScope === 'local'
                        ? `Local coverage will prioritize ${localTarget.trim() || defaultLocalTarget}.`
                        : 'National coverage will be shown without a location filter.'}
                </div>

                {errorMessage && (
                    <div
                        style={{
                            border: '1px solid rgba(248,113,113,0.4)',
                            background: 'rgba(248,113,113,0.12)',
                            borderRadius: '10px',
                            padding: '10px 12px',
                            color: 'var(--text-color)'
                        }}
                    >
                        {errorMessage}
                    </div>
                )}

                {uploadStatus && !errorMessage && (
                    <div
                        style={{
                            border: '1px solid var(--border-color)',
                            background: 'rgba(255,255,255,0.05)',
                            borderRadius: '10px',
                            padding: '10px 12px',
                            color: 'var(--text-color)'
                        }}
                    >
                        {uploadStatus}
                    </div>
                )}

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                        type="submit"
                        disabled={isSubmitting || !truthAcknowledged}
                        style={{
                            border: 'none',
                            background: 'linear-gradient(135deg, var(--highlight-color), var(--accent-color))',
                            color: '#fff',
                            borderRadius: '10px',
                            padding: '11px 16px',
                            cursor: isSubmitting || !truthAcknowledged ? 'not-allowed' : 'pointer',
                            fontWeight: 700,
                            opacity: isSubmitting || !truthAcknowledged ? 0.65 : 1
                        }}
                    >
                        {isSubmitting ? 'Publishing...' : 'Publish Dispatch'}
                    </button>
                    <button
                        type="button"
                        onClick={resetForm}
                        disabled={isSubmitting}
                        style={{
                            border: '1px solid var(--border-color)',
                            background: 'transparent',
                            color: 'var(--text-color)',
                            borderRadius: '10px',
                            padding: '11px 14px',
                            cursor: isSubmitting ? 'not-allowed' : 'pointer'
                        }}
                    >
                        Reset
                    </button>
                </div>
            </form>
        </section>
        </Compartment>
    );
};

export default AmateurJournalistPage;
