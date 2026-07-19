// src/pages/TruthSeekerPage.tsx
import React, { useState } from 'react';
import { MainLayout } from '../components/layout/MainLayout';
import { TruthDashboard } from '../components/truth/TruthDashboard';
import { ClaimChecker } from '../components/truth/ClaimChecker';
import { TruthLeaderboard } from '../components/truth/TruthLeaderboard';
import { TruthAnalytics } from '../components/truth/TruthAnalytics';
import { Tabs } from '../components/ui/Tabs';

const TruthSeekerPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState('dashboard');

    const tabs = [
        { id: 'dashboard', label: '📊 Dashboard' },
        { id: 'checker', label: '🔍 Claim Checker' },
        { id: 'leaderboard', label: '🏆 Leaderboard' },
        { id: 'analytics', label: '📈 Analytics' },
    ];

    return (
        <MainLayout>
            <div className="max-w-6xl mx-auto">
                <div className="mb-6">
                    <h1 className="text-3xl font-bold gradient-text">Truth Seeker</h1>
                    <p className="text-gray-400 mt-1">
                        Verify claims, fact-check content, and track truth scores
                    </p>
                </div>

                <Tabs
                    tabs={tabs}
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                />

                <div className="mt-6">
                    {activeTab === 'dashboard' && <TruthDashboard />}
                    {activeTab === 'checker' && <ClaimChecker />}
                    {activeTab === 'leaderboard' && <TruthLeaderboard />}
                    {activeTab === 'analytics' && <TruthAnalytics />}
                </div>
            </div>
        </MainLayout>
    );
};

export default TruthSeekerPage;