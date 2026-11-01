// src/pages/AssistantPage.jsx
import React, { useEffect, useState } from 'react';
import { MainLayout } from '../components/common/Layout/MainLayout';
import { AssistantChatPanel } from '../components/assistant/AssistantChatPanel';
import { assistantService } from '../services/assistantservice';
import { FiPlus, FiMessageSquare } from 'react-icons/fi';

export default function AssistantPage() {
    const [conversations, setConversations] = useState([]);
    const [activeId, setActiveId] = useState(null);
    const [isCommencingTraining, setIsCommencingTraining] = useState(false);
    const [trainingResult, setTrainingResult] = useState(null);
    const [trainingError, setTrainingError] = useState('');

    useEffect(() => { load(); }, []);

    const load = async () => {
        const list = await assistantService.listConversations();
        setConversations(list);
        if (list.length && !activeId) setActiveId(list[0].id);
    };

    const createNew = async () => {
        const conv = await assistantService.createConversation({ title: 'New conversation' });
        setConversations(prev => [conv, ...prev]);
        setActiveId(conv.id);
    };

    const commenceTraining = async () => {
        setIsCommencingTraining(true);
        setTrainingError('');
        try {
            const result = await assistantService.commenceTraining({
                lookbackDays: 30,
                curateBatchSize: 100
            });
            setTrainingResult(result);
        } catch (error) {
            setTrainingError(error?.message || 'Training commencement failed.');
        } finally {
            setIsCommencingTraining(false);
        }
    };

    return (
        <MainLayout>
            <div className="max-w-6xl mx-auto p-6 grid grid-cols-12 gap-6">
                <aside className="col-span-3 space-y-2">
                    <button onClick={createNew}
                        className="w-full flex items-center gap-2 px-4 py-3 rounded-xl bg-primary hover:bg-primary/90">
                        <FiPlus /> New conversation
                    </button>
                    <button onClick={commenceTraining}
                        disabled={isCommencingTraining}
                        className="w-full px-4 py-2 rounded-lg border border-border hover:bg-white/5 disabled:opacity-60 disabled:cursor-not-allowed">
                        {isCommencingTraining ? 'Preparing training data…' : 'Commence training data prep'}
                    </button>
                    {trainingResult && (
                        <p className="text-xs text-emerald-300 px-1">
                            Ready: {trainingResult.records} records ({trainingResult.bytes} bytes)
                        </p>
                    )}
                    {trainingError && (
                        <p className="text-xs text-red-300 px-1">{trainingError}</p>
                    )}
                    {conversations.map(c => (
                        <button key={c.id} onClick={() => setActiveId(c.id)}
                            className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg transition ${activeId === c.id ? 'bg-white/10' : 'hover:bg-white/5'
                                }`}>
                            <FiMessageSquare />
                            <span className="truncate">{c.title || 'Untitled'}</span>
                        </button>
                    ))}
                </aside>

                <main className="col-span-9">
                    {activeId
                        ? <AssistantChatPanel conversationId={activeId} />
                        : <p className="text-gray-400">Start a new conversation.</p>}
                </main>
            </div>
        </MainLayout>
    );
}