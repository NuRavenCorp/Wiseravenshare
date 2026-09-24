// src/pages/PlannerPage.tsx
import React, { useState } from 'react';
import { MainLayout } from '../components/layout/MainLayout';
import { PlannerDashboard } from '../components/planner/PlannerDashboard';
import { GoalSection } from '../components/planner/GoalSection';
import { TaskBoard } from '../components/planner/TaskBoard';
import { CalendarWidget } from '../components/planner/CalendarWidget';
import { Tabs } from '../components/ui/Tabs';

const PlannerPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState('dashboard');

    const tabs = [
        { id: 'dashboard', label: '📊 Dashboard' },
        { id: 'goals', label: '🎯 Goals' },
        { id: 'tasks', label: '📋 Tasks' },
        { id: 'calendar', label: '📅 Calendar' },
    ];

    return (
        <MainLayout>
            <div className="max-w-6xl mx-auto">
                <div className="mb-6">
                    <h1 className="text-3xl font-bold gradient-text">Wise Planner</h1>
                    <p className="text-gray-400 mt-1">
                        Organize your goals, tasks, and projects
                    </p>
                </div>

                <Tabs
                    tabs={tabs}
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                />

                <div className="mt-6">
                    {activeTab === 'dashboard' && <PlannerDashboard />}
                    {activeTab === 'goals' && <GoalSection />}
                    {activeTab === 'tasks' && <TaskBoard />}
                    {activeTab === 'calendar' && <CalendarWidget />}
                </div>
            </div>
        </MainLayout>
    );
};

export default PlannerPage;