import React from 'react';
import AINews from '../Components/News/AINews';

const BreakingNewsPage = ({ onOpenArticle }) => {
    return (
        <div>
            <div
                style={{
                    background: 'var(--card-bg)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    marginBottom: '12px'
                }}
            >
                <strong>BREAKINGNEWS</strong>
                <div style={{ fontSize: '13px', color: 'var(--highlight-color)', marginTop: '4px' }}>
                    Live critical updates and high-confidence AI summaries.
                </div>
            </div>
            <AINews onOpenArticle={onOpenArticle} />
        </div>
    );
};

export default BreakingNewsPage;
