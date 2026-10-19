import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MainLayout } from '../../components/common/Layout/MainLayout';
import { PromptStudio } from '../../components/ai/PromptStudio';
import { PromptSuggestions } from '../../components/ai/PromptSuggestions';
import { SourceChipBar } from '../../components/ai/SourceChipBar';
import { StreamingAnswer } from '../../components/ai/StreamingAnswer';
import { OutputRenderer } from '../../components/ai/OutputRenderer';
import { HistoryDrawer } from '../../components/ai/HistoryDrawer';
import { useAiData } from '../../hooks/useAiData';
import { aiDataService } from '../../services/aiDataService';

export default function AiCommandCenter() {
  const { events, activeSources, finalResponse, isStreaming, error, ask } = useAiData();
  const [templates, setTemplates] = useState([]);
  const [sources, setSources] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    Promise.all([aiDataService.templates(), aiDataService.sources()])
      .then(([t, s]) => {
        setTemplates(t || []);
        setSources(s || []);
      })
      .catch(() => {
        setTemplates([]);
        setSources([]);
      });
  }, []);

  return (
    <MainLayout>
      <div className="ai-grid">
        <aside className="ai-left">
          <PromptStudio
            onSubmit={ask}
            isStreaming={isStreaming}
            onOpenHistory={() => setShowHistory(true)}
          />
          <PromptSuggestions templates={templates} onPick={ask} />
        </aside>

        <main className="ai-right">
          <SourceChipBar sources={sources} active={activeSources} />
          <StreamingAnswer
            events={events}
            isStreaming={isStreaming}
            finalResponse={finalResponse}
            error={error}
          />

          <AnimatePresence>
            {finalResponse && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <OutputRenderer blocks={finalResponse.blocks || []} />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      <HistoryDrawer open={showHistory} onClose={() => setShowHistory(false)} onPick={ask} />
    </MainLayout>
  );
}
