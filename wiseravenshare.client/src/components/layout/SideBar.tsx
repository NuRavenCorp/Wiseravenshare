// src/components/layout/Sidebar.tsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    FiHome,
    FiCompass,
    FiShield,
    FiVideo,
    FiCalendar,
    FiBookmark,
    FiUsers,
    FiActivity,
    FiChevronLeft,
    FiChevronRight
} from 'react-icons/fi';

interface SidebarProps {
    isCollapsed: boolean;
    onToggle: () => void;
}

const navItems = [
    { to: '/feed', icon: FiHome, label: 'Feed' },
    { to: '/explore', icon: FiCompass, label: 'Explore' },
    { to: '/truth', icon: FiShield, label: 'Truth Seeker' },
    { to: '/ravensight', icon: FiVideo, label: 'Ravensight' },
    { to: '/planner', icon: FiCalendar, label: 'Planner' },
    { to: '/bookmarks', icon: FiBookmark, label: 'Bookmarks' },
    { to: '/evolution', icon: FiActivity, label: 'Evolution' },
    { to: '/community', icon: FiUsers, label: 'Community' },
];

export const Sidebar: React.FC<SidebarProps> = ({ isCollapsed, onToggle }) => {
    return (
        <motion.aside
            className="fixed left-0 top-16 h-[calc(100vh-4rem)] border-r border-border bg-card/80 backdrop-blur-lg z-40"
            animate={{ width: isCollapsed ? 72 : 240 }}
            transition={{ duration: 0.2 }}
        >
            <div className="flex flex-col h-full py-4">
                <button
                    onClick={onToggle}
                    className="absolute -right-3 top-6 w-6 h-6 rounded-full border border-border bg-card flex items-center justify-center hover:bg-white/5"
                >
                    {isCollapsed ?
                        <FiChevronRight className="w-3 h-3" /> :
                        <FiChevronLeft className="w-3 h-3" />
                    }
                </button>

                <nav className="flex-1 px-3 space-y-1">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={({ isActive }) => `
                                flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all
                                ${isActive
                                    ? 'bg-primary/10 text-primary'
                                    : 'hover:bg-white/5 text-gray-400 hover:text-white'
                                }
                                ${isCollapsed ? 'justify-center' : ''}
                            `}
                        >
                            <item.icon className={`w-5 h-5 ${isCollapsed ? 'm-0' : ''}`} />
                            {!isCollapsed && (
                                <span className="text-sm font-medium">
                                    {item.label}
                                </span>
                            )}
                        </NavLink>
                    ))}
                </nav>

                {/* Bottom section */}
                <div className="px-3 pt-4 border-t border-border">
                    <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} px-3 py-2`}>
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        {!isCollapsed && (
                            <span className="text-xs text-gray-400">System Active</span>
                        )}
                    </div>
                </div>
            </div>
        </motion.aside>
    );
};