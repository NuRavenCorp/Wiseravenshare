// src/pages/RavensightPage.tsx
import React, { useState } from 'react';
import { MainLayout } from '../components/layout/MainLayout';
import { VideoStudio } from '../components/Ravensight/VideoStudio';
import { VideoFeed } from '../components/Ravensight/VideoFeed';
import { VideoLibrary } from '../components/Ravensight/VideoLibrary';
import { SocialBridge } from '../components/Ravensight/SocialBridge';
import { Tabs } from '../components/ui/Tabs';

const RavenSightPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState('studio');

    const tabs = [
        { id: 'studio', label: '🎥 Studio' },
        { id: 'feed', label: '📺 Feed' },
        { id: 'library', label: '📚 Library' },
        { id: 'social', label: '🌐 Social' },
    ];

    return (
        <MainLayout>
            <div className="max-w-6xl mx-auto">
                <div className="mb-6">
                    <h1 className="text-3xl font-bold gradient-text">Ravensight Studio</h1>
                    <p className="text-gray-400 mt-1">
                        Record, upload, and share videos with YouTube integration
                    </p>
                </div>

                <Tabs
                    tabs={tabs}
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                />

                <div className="mt-6">
                    {activeTab === 'studio' && <VideoStudio />}
                    {activeTab === 'feed' && <VideoFeed />}
                    {activeTab === 'library' && <VideoLibrary />}
                    {activeTab === 'social' && <SocialBridge />}
                </div>
            </div>
        </MainLayout>
    );
};

export default RavenSightPage;