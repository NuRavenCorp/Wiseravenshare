// src/components/layout/MainLayout.tsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { RightSidebar } from './RightSidebar';

interface MainLayoutProps {
    children: React.ReactNode;
    showRightSidebar?: boolean;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
    children,
    showRightSidebar = true
}) => {
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

    return (
        <div className="min-h-screen bg-background">
            <Header />
            <div className="flex">
                <Sidebar
                    isCollapsed={isSidebarCollapsed}
                    onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                />
                <motion.main
                    className="flex-1 px-4 py-6 md:px-6 lg:px-8"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                >
                    <div className="max-w-7xl mx-auto">
                        {children}
                    </div>
                </motion.main>
                {showRightSidebar && <RightSidebar />}
            </div>
        </div>
    );
};