import React from 'react';
import { motion } from 'framer-motion';

export const PromptSuggestions = ({ templates, onPick }) => {
    const normalizedTemplates = Array.isArray(templates)
        ? templates
        : Array.isArray(templates?.items)
            ? templates.items
            : Array.isArray(templates?.suggestions)
                ? templates.suggestions
                : [];

    if (normalizedTemplates.length === 0) {
        return null;
    }

    return (
        <div className="glass-card">
            <h3 className="subtle-title">Quick prompts</h3>
            <div className="suggestion-list">
                {normalizedTemplates.map((template, i) => (
                    <motion.button
                        type="button"
                        key={template.id || `${template.title}-${i}`}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="suggestion-btn"
                        onClick={() => onPick?.(template.prompt)}
                    >
                        <div className="suggestion-title">{template.title}</div>
                        <div className="suggestion-prompt">{template.prompt}</div>
                    </motion.button>
                ))}
            </div>
        </div>
    );
};

export default PromptSuggestions;
