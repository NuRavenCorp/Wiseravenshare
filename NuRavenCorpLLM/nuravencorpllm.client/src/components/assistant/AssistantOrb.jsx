// src/components/assistant/AssistantOrb.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { FiMic, FiMicOff } from 'react-icons/fi';

export const AssistantOrb = ({ recording, onClick }) => (
    <button onClick={onClick} className="relative">
        <motion.div
            animate={recording ? { scale: [1, 1.15, 1] } : { scale: 1 }}
            transition={{ repeat: recording ? Infinity : 0, duration: 1.2 }}
            className={`w-24 h-24 rounded-full flex items-center justify-center relative
        ${recording ? 'bg-red-500/30' : 'bg-primary/20'}`}
        >
            <div className="absolute inset-0 rounded-full blur-2xl opacity-60
        bg-gradient-to-br from-primary to-secondary" />
            <div className="relative z-10 text-white text-4xl">
                {recording ? <FiMic /> : <FiMicOff />}
            </div>
        </motion.div>
        {recording && (
            <motion.div
                className="absolute inset-0 rounded-full border-2 border-red-500"
                animate={{ scale: [1, 1.4], opacity: [0.8, 0] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
            />
        )}
    </button>
);