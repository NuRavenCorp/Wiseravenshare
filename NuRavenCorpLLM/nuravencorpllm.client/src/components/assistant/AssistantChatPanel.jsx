// src/components/assistant/AssistantChatPanel.jsx
import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSend, FiPaperclip } from 'react-icons/fi';
import { useAssistant } from '../../hooks/useAssistant';
import { useRecorder } from '../../hooks/useRecorder';
import { AssistantOrb } from './AssistantOrb';
import { AssistantMessage } from './AssistantMessage';
import { VoiceSelector } from './VoiceSelector';
import { PersonaSelector } from './PersonaSelector';

export const AssistantChatPanel = ({ conversationId }) => {
    const { messages, streamingText, isThinking, send, sendAudio } = useAssistant(conversationId);
    const [text, setText] = useState('');
    const [voiceReply, setVoiceReply] = useState(false);
    const [persona, setPersona] = useState('Default');
    const [voiceId, setVoiceId] = useState('alloy');
    const bottomRef = useRef(null);

    const recorder = useRecorder({
        onStop: async (blob) => {
            if (blob.size < 1500) return;
            await sendAudio(blob);
        }
    });

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages.length, streamingText]);

    const handleSend = () => {
        if (!text.trim()) return;
        send(text, voiceReply);
        setText('');
    };

    return (
        <div className="flex flex-col h-[80vh] bg-card rounded-2xl border border-border overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
                <div>
                    <h2 className="text-lg font-semibold">WiseRaven Assistant</h2>
                    <p className="text-xs text-gray-400">Learns from WiseRavenShare + the web</p>
                </div>
                <div className="flex gap-2">
                    <PersonaSelector value={persona} onChange={setPersona} />
                    <VoiceSelector value={voiceId} onChange={setVoiceId} />
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map(m => (
                    <AssistantMessage key={m.id} message={m} />
                ))}
                {streamingText && (
                    <AssistantMessage
                        message={{ role: 'Assistant', content: streamingText, status: 'streaming' }}
                    />
                )}
                {isThinking && !streamingText && (
                    <div className="text-sm text-gray-400">WiseRaven is thinking…</div>
                )}
                <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-border">
                <div className="flex items-center gap-3">
                    <button onClick={recorder.recording ? recorder.stop : recorder.start}
                        className="shrink-0">
                        <AssistantOrb
                            recording={recorder.recording}
                            onClick={recorder.recording ? recorder.stop : recorder.start}
                        />
                    </button>

                    <input
                        value={text}
                        onChange={e => setText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSend()}
                        placeholder="Ask WiseRaven anything…"
                        className="flex-1 bg-white/5 border border-border rounded-xl px-4 py-3"
                    />

                    <label className="flex items-center gap-1 text-xs text-gray-400">
                        <input type="checkbox" checked={voiceReply}
                            onChange={e => setVoiceReply(e.target.checked)} />
                        Speak reply
                    </label>

                    <button onClick={handleSend}
                        className="p-3 rounded-xl bg-primary hover:bg-primary/90">
                        <FiSend />
                    </button>
                </div>

                {recorder.recording && (
                    <div className="text-xs text-red-400 mt-2">
                        Recording… {recorder.elapsed}s — tap the orb to send
                    </div>
                )}
            </div>
        </div>
    );
};