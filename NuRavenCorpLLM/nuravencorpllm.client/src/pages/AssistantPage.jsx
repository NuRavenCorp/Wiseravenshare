// src/pages/AssistantPage.jsx
import React, { useEffect, useState } from 'react';
import { MainLayout } from '../components/common/Layout/MainLayout';
import { AssistantChatPanel } from '../components/assistant/AssistantChatPanel';
import { assistantService } from '../services/assistantService';
import { FiPlus, FiMessageSquare } from 'react-icons/fi';

export default function AssistantPage() {
    const [conversations, setConversations] = useState([]);
    const [activeId, setActiveId] = useState(null);

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

    return (
        <MainLayout>
            <div className="max-w-6xl mx-auto p-6 grid grid-cols-12 gap-6">
                <aside className="col-span-3 space-y-2">
                    <button onClick={createNew}
                        className="w-full flex items-center gap-2 px-4 py-3 rounded-xl bg-primary hover:bg-primary/90">
                        <FiPlus /> New conversation
                    </button>
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