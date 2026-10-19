// src/components/assistant/AssistantMessage.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { FiThumbsUp, FiThumbsDown, FiExternalLink } from 'react-icons/fi';
import { assistantService } from '../../services/assistantService';

export const AssistantMessage = ({ message }) => {
    const isUser = message.role === 'User' || message.role === 'user';
    const [voted, setVoted] = useState(null);
    const [showCitations, setShowCitations] = useState(false);

    const citations = message.citations ? safeParse(message.citations) : null;

    const vote = async (v) => {
        setVoted(v);
        try {
            await assistantService.submitFeedback(message.id, { vote: v });
        } catch { /* ignore */ }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
        >
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${isUser ? 'bg-primary/20' : 'bg-white/5'
                }`}>
                <div className="whitespace-pre-wrap text-sm">{message.content}</div>

                {citations && (
                    <div className="mt-2">
                        <button onClick={() => setShowCitations(s => !s)}
                            className="text-xs text-primary hover:underline">
                            Sources ({citations.rag?.length + (citations.web?.length || 0)})
                        </button>
                        {showCitations && (
                            <div className="mt-2 space-y-1">
                                {citations.rag?.map((r, i) => (
                                    <div key={`rag-${i}`} className="text-xs">
                                        <span className="text-gray-400">[RAG]</span> {r.title}
                                    </div>
                                ))}
                                {citations.web?.map((w, i) => (
                                    <a key={`web-${i}`} href={w.url} target="_blank" rel="noreferrer"
                                        className="text-xs flex items-center gap-1 hover:underline">
                                        <FiExternalLink /> {w.title}
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {!isUser && message.status !== 'streaming' && (
                    <div className="flex gap-2 mt-2 opacity-60 hover:opacity-100 transition">
                        <button onClick={() => vote('ThumbUp')}
                            className={voted === 'ThumbUp' ? 'text-green-400' : ''}>
                            <FiThumbsUp />
                        </button>
                        <button onClick={() => vote('ThumbDown')}
                            className={voted === 'ThumbDown' ? 'text-red-400' : ''}>
                            <FiThumbsDown />
                        </button>
                    </div>
                )}
            </div>
        </motion.div>
    );
};

function safeParse(v) {
    try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; }
}