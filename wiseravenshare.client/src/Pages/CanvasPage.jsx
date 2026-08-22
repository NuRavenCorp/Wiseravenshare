import React, { useEffect, useRef, useState } from 'react';
import Compartment from '../Components/Common/Compartment';
import { useAuth } from '../Contexts/AuthContext';
import { upsertLocalVideo } from '../Services/ravensightVideoStore';
import { readStoredFeedPosts, writeStoredFeedPosts, normalizeFeedPost } from '../Services/postFeedPayload';

const COLORS = [
    '#ffffff', '#000000', '#38bdf8', '#ef4444',
    '#22c55e', '#eab308', '#a855f7', '#ec4899',
    '#f97316', '#64748b'
];

const STICKERS = [
    { label: 'WiseRaven 🦅', text: '🦅 WiseRaven' },
    { label: 'Facebook 📘', text: '📘 Facebook' },
    { label: 'TikTok 🎵', text: '🎵 TikTok' },
    { label: 'YouTube ▶️', text: '▶️ YouTube' },
    { label: 'Verified ✔️', text: '✔️ VERIFIED' },
    { label: 'Breaking 🚨', text: '🚨 BREAKING NEWS' }
];

const CanvasPage = ({ onNavigate }) => {
    const { user } = useAuth();
    const currentUser = user || { id: 'user1', name: 'Alex Raven', handle: '@alexraven', avatar: 'AR' };

    const canvasRef = useRef(null);
    const [tool, setTool] = useState('brush'); // brush, eraser, rectangle, circle, line, arrow, text, sticker
    const [color, setColor] = useState('#38bdf8');
    const [lineWidth, setLineWidth] = useState(5);
    const [fillShape, setFillShape] = useState(false);
    const [bgStyle, setBgStyle] = useState('#0f172a');
    const [textInput, setTextInput] = useState('WiseRaven Creator');
    const [selectedSticker, setSelectedSticker] = useState('🦅 WiseRaven');
    const [statusMsg, setStatusMsg] = useState('');

    const isDrawingRef = useRef(false);
    const startPosRef = useRef({ x: 0, y: 0 });
    const snapshotRef = useRef(null);

    // Undo / Redo history
    const historyRef = useRef([]);
    const historyStepRef = useRef(-1);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = 900;
        canvas.height = 550;

        const ctx = canvas.getContext('2d');
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        drawBackground(ctx, bgStyle, canvas.width, canvas.height);
        saveHistory();
    }, []);

    const drawBackground = (ctx, style, width, height) => {
        if (style === 'grid') {
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(0, 0, width, height);

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.lineWidth = 1;
            const gridSize = 30;
            for (let x = 0; x < width; x += gridSize) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.stroke();
            }
            for (let y = 0; y < height; y += gridSize) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                ctx.stroke();
            }
        } else {
            ctx.fillStyle = style;
            ctx.fillRect(0, 0, width, height);
        }
    };

    const changeBackground = (newStyle) => {
        setBgStyle(newStyle);
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        const prevImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
        drawBackground(ctx, newStyle, canvas.width, canvas.height);
        ctx.putImageData(prevImage, 0, 0);
        saveHistory();
    };

    const saveHistory = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);

        historyRef.current = historyRef.current.slice(0, historyStepRef.current + 1);
        historyRef.current.push(snapshot);
        historyStepRef.current = historyRef.current.length - 1;
    };

    const undo = () => {
        if (historyStepRef.current > 0) {
            historyStepRef.current--;
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            ctx.putImageData(historyRef.current[historyStepRef.current], 0, 0);
            setStatusMsg('Undo applied');
            setTimeout(() => setStatusMsg(''), 2000);
        }
    };

    const redo = () => {
        if (historyStepRef.current < historyRef.current.length - 1) {
            historyStepRef.current++;
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            ctx.putImageData(historyRef.current[historyStepRef.current], 0, 0);
            setStatusMsg('Redo applied');
            setTimeout(() => setStatusMsg(''), 2000);
        }
    };

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        drawBackground(ctx, bgStyle, canvas.width, canvas.height);
        saveHistory();
        setStatusMsg('Canvas cleared');
        setTimeout(() => setStatusMsg(''), 2000);
    };

    const getCanvasCoords = (e) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    };

    const startDraw = (e) => {
        e.preventDefault();
        const coords = getCanvasCoords(e);
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        isDrawingRef.current = true;
        startPosRef.current = coords;
        snapshotRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);

        if (tool === 'brush' || tool === 'eraser') {
            ctx.beginPath();
            ctx.moveTo(coords.x, coords.y);
        } else if (tool === 'text') {
            ctx.fillStyle = color;
            ctx.font = `${lineWidth * 5 + 12}px sans-serif`;
            ctx.fillText(textInput, coords.x, coords.y);
            isDrawingRef.current = false;
            saveHistory();
        } else if (tool === 'sticker') {
            ctx.fillStyle = color;
            ctx.font = `bold ${lineWidth * 4 + 18}px sans-serif`;
            ctx.fillText(selectedSticker, coords.x, coords.y);
            isDrawingRef.current = false;
            saveHistory();
        }
    };

    const draw = (e) => {
        if (!isDrawingRef.current) return;
        e.preventDefault();
        const coords = getCanvasCoords(e);
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        if (tool === 'brush') {
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;
            ctx.lineTo(coords.x, coords.y);
            ctx.stroke();
        } else if (tool === 'eraser') {
            ctx.strokeStyle = bgStyle === 'grid' ? '#0f172a' : bgStyle;
            ctx.lineWidth = lineWidth * 3;
            ctx.lineTo(coords.x, coords.y);
            ctx.stroke();
        } else if (['rectangle', 'circle', 'line', 'arrow'].includes(tool)) {
            ctx.putImageData(snapshotRef.current, 0, 0);
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.lineWidth = lineWidth;

            const startX = startPosRef.current.x;
            const startY = startPosRef.current.y;
            const width = coords.x - startX;
            const height = coords.y - startY;

            if (tool === 'rectangle') {
                if (fillShape) {
                    ctx.fillRect(startX, startY, width, height);
                } else {
                    ctx.strokeRect(startX, startY, width, height);
                }
            } else if (tool === 'circle') {
                const radius = Math.sqrt(width * width + height * height);
                ctx.beginPath();
                ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
                if (fillShape) {
                    ctx.fill();
                } else {
                    ctx.stroke();
                }
            } else if (tool === 'line') {
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(coords.x, coords.y);
                ctx.stroke();
            } else if (tool === 'arrow') {
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(coords.x, coords.y);
                ctx.stroke();

                const angle = Math.atan2(coords.y - startY, coords.x - startX);
                const headLen = 15;
                ctx.beginPath();
                ctx.moveTo(coords.x, coords.y);
                ctx.lineTo(
                    coords.x - headLen * Math.cos(angle - Math.PI / 6),
                    coords.y - headLen * Math.sin(angle - Math.PI / 6)
                );
                ctx.lineTo(
                    coords.x - headLen * Math.cos(angle + Math.PI / 6),
                    coords.y - headLen * Math.sin(angle + Math.PI / 6)
                );
                ctx.lineTo(coords.x, coords.y);
                ctx.fill();
            }
        }
    };

    const stopDraw = () => {
        if (isDrawingRef.current) {
            isDrawingRef.current = false;
            saveHistory();
        }
    };

    const handleImageUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = canvasRef.current;
                const ctx = canvas.getContext('2d');
                const maxDim = 300;
                let w = img.width;
                let h = img.height;

                if (w > maxDim || h > maxDim) {
                    if (w > h) {
                        h = (maxDim / w) * h;
                        w = maxDim;
                    } else {
                        w = (maxDim / h) * w;
                        h = maxDim;
                    }
                }

                ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
                saveHistory();
                setStatusMsg('Image added to canvas');
                setTimeout(() => setStatusMsg(''), 2500);
            };
            img.src = String(event.target?.result || '');
        };
        reader.readAsDataURL(file);
    };

    const exportPNG = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `wiseraven_design_${Date.now()}.png`;
        link.href = dataUrl;
        link.click();
        setStatusMsg('Design downloaded as PNG');
        setTimeout(() => setStatusMsg(''), 2500);
    };

    const saveToLibrary = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dataUrl = canvas.toDataURL('image/png');

        upsertLocalVideo({
            id: `canvas-design-${Date.now()}`,
            title: textInput || 'Canvas Design Artwork',
            description: 'Created in WiseRaven Canvas Studio',
            mediaUrl: dataUrl,
            videoUrl: dataUrl,
            thumbnailUrl: dataUrl,
            userId: currentUser.id,
            channelName: currentUser.name || 'WiseRaven Creator',
            createdAt: new Date().toISOString()
        });

        setStatusMsg('Artwork saved to Ravensight Library!');
        setTimeout(() => setStatusMsg(''), 3000);
    };

    const postToFeed = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dataUrl = canvas.toDataURL('image/png');

        const newPost = normalizeFeedPost({
            id: `post-canvas-${Date.now()}`,
            userId: currentUser.id,
            user: currentUser,
            content: textInput ? `🎨 Canvas Design: "${textInput}"` : '🎨 Shared artwork created in Canvas Studio',
            mediaUrl: dataUrl,
            mediaType: 'photo',
            likes: 0,
            reposts: 0,
            comments: [],
            createdAt: new Date().toISOString()
        }, currentUser);

        const currentPosts = readStoredFeedPosts();
        writeStoredFeedPosts([newPost, ...currentPosts]);

        setStatusMsg('Design published to WiseRaven feed!');
        setTimeout(() => {
            if (typeof onNavigate === 'function') {
                onNavigate('feed');
            }
        }, 1200);
    };

    return (
        <Compartment badge="Creative Studio" title="Interactive Canvas Studio">
            <div style={{ display: 'grid', gap: '18px' }}>
                {/* Status Bar */}
                {statusMsg && (
                    <div style={{
                        padding: '10px 16px',
                        borderRadius: '10px',
                        background: 'rgba(34, 197, 94, 0.15)',
                        border: '1px solid rgba(34, 197, 94, 0.4)',
                        color: '#4ade80',
                        fontSize: '13px',
                        fontWeight: 600
                    }}>
                        {statusMsg}
                    </div>
                )}

                {/* Toolbar */}
                <div style={{
                    background: 'var(--card-bg)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '16px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px'
                }}>
                    {/* Tool Buttons */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                        {[
                            { id: 'brush', label: '✏️ Brush' },
                            { id: 'eraser', label: '🧹 Eraser' },
                            { id: 'rectangle', label: '🔲 Rectangle' },
                            { id: 'circle', label: '⭕ Circle' },
                            { id: 'line', label: '📏 Line' },
                            { id: 'arrow', label: '🏹 Arrow' },
                            { id: 'text', label: '🔤 Text' },
                            { id: 'sticker', label: '🏷️ Sticker' }
                        ].map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setTool(t.id)}
                                style={{
                                    border: tool === t.id ? '1px solid var(--highlight-color)' : '1px solid var(--border-color)',
                                    background: tool === t.id ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.03)',
                                    color: 'var(--text-color)',
                                    borderRadius: '8px',
                                    padding: '8px 14px',
                                    fontSize: '12px',
                                    fontWeight: tool === t.id ? 700 : 400,
                                    cursor: 'pointer'
                                }}
                            >
                                {t.label}
                            </button>
                        ))}

                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                            <button
                                type="button"
                                onClick={undo}
                                style={{ border: '1px solid var(--border-color)', background: 'transparent', color: '#fff', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                            >
                                ↩ Undo
                            </button>
                            <button
                                type="button"
                                onClick={redo}
                                style={{ border: '1px solid var(--border-color)', background: 'transparent', color: '#fff', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                            >
                                ↪ Redo
                            </button>
                            <button
                                type="button"
                                onClick={clearCanvas}
                                style={{ border: '1px solid #ef4444', background: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                            >
                                🗑️ Clear
                            </button>
                        </div>
                    </div>

                    {/* Secondary Tool Adjustments */}
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', fontSize: '12px' }}>
                        {/* Color Swatches */}
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <span style={{ color: 'var(--light-color)' }}>Color:</span>
                            {COLORS.map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setColor(c)}
                                    style={{
                                        width: '22px',
                                        height: '22px',
                                        borderRadius: '50%',
                                        background: c,
                                        border: color === c ? '2px solid #38bdf8' : '1px solid rgba(255,255,255,0.3)',
                                        cursor: 'pointer'
                                    }}
                                />
                            ))}
                            <input
                                type="color"
                                value={color}
                                onChange={(e) => setColor(e.target.value)}
                                style={{ width: '28px', height: '28px', border: 'none', background: 'transparent', cursor: 'pointer' }}
                            />
                        </div>

                        {/* Stroke Size */}
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <span style={{ color: 'var(--light-color)' }}>Stroke Size:</span>
                            {[2, 5, 10, 20].map((size) => (
                                <button
                                    key={size}
                                    type="button"
                                    onClick={() => setLineWidth(size)}
                                    style={{
                                        border: lineWidth === size ? '1px solid #38bdf8' : '1px solid var(--border-color)',
                                        background: lineWidth === size ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                                        color: '#fff',
                                        borderRadius: '6px',
                                        padding: '4px 8px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {size}px
                                </button>
                            ))}
                        </div>

                        {/* Fill Shape Toggle */}
                        {['rectangle', 'circle'].includes(tool) && (
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={fillShape}
                                    onChange={(e) => setFillShape(e.target.checked)}
                                />
                                Fill Shape
                            </label>
                        )}

                        {/* Text Tool Input */}
                        {tool === 'text' && (
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <span style={{ color: 'var(--light-color)' }}>Text:</span>
                                <input
                                    type="text"
                                    value={textInput}
                                    onChange={(e) => setTextInput(e.target.value)}
                                    style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#0b0f14', color: '#fff' }}
                                />
                            </div>
                        )}

                        {/* Sticker Selector */}
                        {tool === 'sticker' && (
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <span style={{ color: 'var(--light-color)' }}>Sticker:</span>
                                <select
                                    value={selectedSticker}
                                    onChange={(e) => setSelectedSticker(e.target.value)}
                                    style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#0b0f14', color: '#fff' }}
                                >
                                    {STICKERS.map((s) => (
                                        <option key={s.label} value={s.text}>{s.label}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Background Theme */}
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginLeft: 'auto' }}>
                            <span style={{ color: 'var(--light-color)' }}>Background:</span>
                            {[
                                { id: '#0f172a', label: 'Dark' },
                                { id: '#000000', label: 'Black' },
                                { id: '#f8fafc', label: 'White' },
                                { id: 'grid', label: 'Grid' }
                            ].map((bg) => (
                                <button
                                    key={bg.id}
                                    type="button"
                                    onClick={() => changeBackground(bg.id)}
                                    style={{
                                        border: bgStyle === bg.id ? '1px solid #38bdf8' : '1px solid var(--border-color)',
                                        background: bgStyle === bg.id ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                                        color: '#fff',
                                        borderRadius: '6px',
                                        padding: '4px 8px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {bg.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Main Canvas Workspace */}
                <div style={{
                    background: '#020617',
                    border: '1px solid var(--border-color)',
                    borderRadius: '16px',
                    padding: '16px',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    overflow: 'auto',
                    boxShadow: 'inset 0 0 30px rgba(0,0,0,0.8)'
                }}>
                    <canvas
                        ref={canvasRef}
                        onMouseDown={startDraw}
                        onMouseMove={draw}
                        onMouseUp={stopDraw}
                        onMouseLeave={stopDraw}
                        onTouchStart={startDraw}
                        onTouchMove={draw}
                        onTouchEnd={stopDraw}
                        style={{
                            borderRadius: '12px',
                            cursor: tool === 'eraser' ? 'cell' : tool === 'text' || tool === 'sticker' ? 'crosshair' : 'crosshair',
                            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                            maxWidth: '100%',
                            height: 'auto'
                        }}
                    />
                </div>

                {/* Footer Action Controls */}
                <div style={{
                    background: 'var(--card-bg)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '16px',
                    padding: '16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '12px'
                }}>
                    <label style={{
                        border: '1px solid var(--border-color)',
                        background: 'rgba(255,255,255,0.04)',
                        color: 'var(--text-color)',
                        borderRadius: '10px',
                        padding: '10px 16px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}>
                        🖼️ Add Image / Graphic
                        <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload}
                            style={{ display: 'none' }}
                        />
                    </label>

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            onClick={exportPNG}
                            style={{
                                border: '1px solid var(--border-color)',
                                background: 'rgba(255,255,255,0.05)',
                                color: '#fff',
                                borderRadius: '10px',
                                padding: '10px 18px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                fontSize: '13px'
                            }}
                        >
                            ⬇ Export PNG
                        </button>
                        <button
                            type="button"
                            onClick={saveToLibrary}
                            style={{
                                border: '1px solid var(--highlight-color)',
                                background: 'rgba(56, 189, 248, 0.1)',
                                color: '#38bdf8',
                                borderRadius: '10px',
                                padding: '10px 18px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                fontSize: '13px'
                            }}
                        >
                            💾 Save to Library
                        </button>
                        <button
                            type="button"
                            onClick={postToFeed}
                            style={{
                                border: 'none',
                                background: 'linear-gradient(135deg, var(--highlight-color), var(--accent-color))',
                                color: '#fff',
                                borderRadius: '10px',
                                padding: '10px 20px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                fontSize: '13px'
                            }}
                        >
                            📰 Publish Artwork to Feed
                        </button>
                    </div>
                </div>
            </div>
        </Compartment>
    );
};

export default CanvasPage;

