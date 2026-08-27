// wiseravenshare.client/src/Components/Collaboration/FileTransfer.jsx
// Chunked file transfer progress list for the collaboration room.

import React from 'react';
import {
    FiFile, FiImage, FiVideo, FiMusic, FiArchive,
    FiX, FiCheckCircle, FiAlertCircle, FiUpload, FiDownload
} from 'react-icons/fi';

const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const getFileIcon = (type = '') => {
    if (type.startsWith('image/')) return <FiImage size={18} />;
    if (type.startsWith('video/')) return <FiVideo size={18} />;
    if (type.startsWith('audio/')) return <FiMusic size={18} />;
    if (type.includes('zip') || type.includes('rar')) return <FiArchive size={18} />;
    return <FiFile size={18} />;
};

const STATUS_COLORS = {
    complete: 'var(--success-color, #22c55e)',
    failed: 'var(--danger-color, #ef4444)',
    uploading: 'var(--highlight-color)'
};

export const FileTransfer = ({ files = [], onCancel, onRetry, onDownload }) => {
    if (!files.length) return null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {files.map((file) => {
                const color = STATUS_COLORS[file.status] || STATUS_COLORS.uploading;
                return (
                    <div
                        key={file.id}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            padding: '10px', borderRadius: '10px',
                            background: 'var(--card-bg)', border: '1px solid var(--border-color)'
                        }}
                    >
                        <div style={{
                            padding: '8px', borderRadius: '8px',
                            background: 'var(--background-color, rgba(255,255,255,0.06))', color
                        }}>
                            {getFileIcon(file.type)}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {file.name}
                                </span>
                                <span style={{ fontSize: '11px', color: 'var(--light-color)' }}>
                                    {formatFileSize(file.size)}
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                <div style={{ flex: 1, height: 4, borderRadius: 999, background: 'var(--border-color)', overflow: 'hidden' }}>
                                    <div style={{
                                        height: '100%', width: `${file.progress || 0}%`,
                                        background: color, transition: 'width .3s'
                                    }} />
                                </div>
                                <span style={{ fontSize: '11px', color: 'var(--light-color)' }}>
                                    {file.status === 'complete' ? 'Done'
                                        : file.status === 'failed' ? 'Failed'
                                        : `${Math.round(file.progress || 0)}%`}
                                </span>
                            </div>
                            {file.sender && (
                                <div style={{ fontSize: '10px', color: 'var(--light-color)', marginTop: '4px' }}>
                                    From: {file.sender}
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {file.status === 'complete' && onDownload && (
                                <button onClick={() => onDownload(file.id)} style={iconBtn}>
                                    <FiDownload size={14} color={STATUS_COLORS.complete} />
                                </button>
                            )}
                            {file.status === 'failed' && onRetry && (
                                <button onClick={() => onRetry(file.id)} style={iconBtn}>
                                    <FiUpload size={14} color="var(--highlight-color)" />
                                </button>
                            )}
                            {file.status !== 'complete' && onCancel && (
                                <button onClick={() => onCancel(file.id)} style={iconBtn}>
                                    <FiX size={14} color="var(--light-color)" />
                                </button>
                            )}
                            {file.status === 'complete'
                                ? <FiCheckCircle size={14} color={STATUS_COLORS.complete} />
                                : file.status === 'failed'
                                    ? <FiAlertCircle size={14} color={STATUS_COLORS.failed} />
                                    : <FiUpload size={14} color={STATUS_COLORS.uploading} />}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

const iconBtn = {
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '4px', borderRadius: '6px', display: 'flex'
};

export default FileTransfer;
