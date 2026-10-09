import React from 'react';
import { resolveMediaUrl } from '../../utils/mediaUtils';
import './VideoFeed.css';

const SLOT_COUNT = 3;

/**
 * A single monitor tile: source picker, mirror toggle, and a live preview.
 *
 * The preview is muted and looping by design — it is an operator monitor, not
 * a playback surface. Audio and transport controls live on the feed card.
 */
const MonitorSlot = ({
    slotIndex,
    video,
    candidates,
    isMirrored,
    onSelectSource,
    onToggleMirror,
}) => {
    const videoSrc = resolveMediaUrl(video?.videoUrl || video?.mediaUrl || '');
    const selectedId = String(video?.id || '');

    return (
        <div className="wr-monitor">
            <div className="wr-monitor__head">
                <div className="wr-monitor__label">Source {slotIndex + 1}</div>

                <select
                    className="wr-monitor__select"
                    value={selectedId}
                    onChange={(event) => onSelectSource(event.target.value)}
                    aria-label={`Source for monitor ${slotIndex + 1}`}
                >
                    {candidates.map((candidate) => (
                        <option key={candidate.id} value={String(candidate.id || '')}>
                            {candidate.title || `Source ${candidate.id}`}
                        </option>
                    ))}
                </select>

                <button
                    type="button"
                    className={`wr-monitor__mirror${isMirrored ? ' wr-monitor__mirror--on' : ''}`}
                    onClick={onToggleMirror}
                    aria-pressed={isMirrored}
                >
                    {isMirrored ? 'Mirroring On' : 'Mirroring Off'}
                </button>
            </div>

            <div className="wr-monitor__stage">
                <video
                    className="wr-monitor__video"
                    src={videoSrc}
                    muted
                    loop
                    playsInline
                    controls
                    style={{ transform: isMirrored ? 'scaleX(-1)' : 'none' }}
                />
            </div>
        </div>
    );
};

/**
 * Ravensight source monitor array — up to three feed sources, side by side.
 *
 * Renders nothing when there are no playable candidates, so the feed does not
 * reserve empty chrome on a fresh account.
 */
const MonitorArray = ({
    candidates = [],
    slots = [],
    mirrors = [],
    onSelectSource,
    onToggleMirror,
}) => {
    if (!candidates.length) {
        return (
            <div className="wr-monitors">
                <div className="wr-monitors__frame">
                    <div className="wr-monitors__head">
                        <h3 className="wr-monitors__title">Video Monitor Array</h3>
                        <span className="wr-monitors__hint">Mirror and monitor up to 3 feed sources</span>
                    </div>
                    <div className="wr-monitors__empty">
                        No feed sources available yet. Upload or refresh to populate monitor slots.
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="wr-monitors">
            <div className="wr-monitors__frame">
                <div className="wr-monitors__head">
                    <h3 className="wr-monitors__title">Video Monitor Array</h3>
                    <span className="wr-monitors__hint">Mirror and monitor up to 3 feed sources</span>
                </div>

                <div className="wr-monitors__grid">
                    {Array.from({ length: SLOT_COUNT }, (_, slotIndex) => {
                        const selectedId = slots[slotIndex];
                        const video = candidates.find(
                            (candidate) => String(candidate.id || '') === selectedId
                        ) || candidates[slotIndex] || candidates[0];

                        return (
                            <MonitorSlot
                                key={`monitor-slot-${slotIndex}`}
                                slotIndex={slotIndex}
                                video={video}
                                candidates={candidates}
                                isMirrored={Boolean(mirrors[slotIndex])}
                                onSelectSource={(nextId) => onSelectSource(slotIndex, nextId)}
                                onToggleMirror={() => onToggleMirror(slotIndex)}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default MonitorArray;
