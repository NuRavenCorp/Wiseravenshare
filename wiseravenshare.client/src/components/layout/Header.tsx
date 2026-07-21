// src/components/layout/Header.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { SearchBar } from '../ui/SearchBar';
import { NotificationBell } from '../notifications/NotificationBell';
import {
    FiMenu,
    FiBell,
    FiMessageCircle,
    FiUser,
    FiSettings,
    FiLogOut,
    FiMoon,
    FiSun,
    FiSearch
} from 'react-icons/fi';

export const Header: React.FC = () => {
    const { user, logout } = useAuth();
    const { unreadCount } = useNotifications();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    return (
        <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-lg">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    {/* Left section */}
                    <div className="flex items-center gap-4">
                        <button
                            className="lg:hidden p-2 rounded-lg hover:bg-white/5"
                            aria-label="Toggle menu"
                        >
                            <FiMenu className="w-5 h-5" />
                        </button>
                        <Link to="/" className="flex items-center gap-2">
                            <span className="text-2xl">🦅</span>
                            <span className="text-xl font-bold gradient-text hidden sm:inline">
                                Wiseravenshare
                            </span>
                        </Link>
                    </div>

                    {/* Center section - Search */}
                    <div className="flex-1 max-w-xl mx-4 hidden md:block">
                        <SearchBar />
                    </div>

                    {/* Right section */}
                    <div className="flex items-center gap-2">
                        <button
                            className="md:hidden p-2 rounded-lg hover:bg-white/5"
                            onClick={() => setIsSearchOpen(!isSearchOpen)}
                        >
                            <FiSearch className="w-5 h-5" />
                        </button>

                        <Link to="/messages" className="p-2 rounded-lg hover:bg-white/5 relative">
                            <FiMessageCircle className="w-5 h-5" />
                        </Link>

                        <NotificationBell count={unreadCount} />

                        <div className="relative" ref={dropdownRef}>
                            <button
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5"
                            >
                                <Avatar
                                    src={user?.avatarUrl}
                                    alt={user?.displayName || 'User'}
                                    size="sm"
                                />
                                <span className="hidden sm:inline text-sm font-medium">
                                    {user?.displayName}
                                </span>
                            </button>

                            {isDropdownOpen && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="absolute right-0 mt-2 w-64 rounded-xl border border-border bg-card shadow-xl py-2"
                                >
                                    <div className="px-4 py-3 border-b border-border">
                                        <p className="font-medium">{user?.displayName}</p>
                                        <p className="text-sm text-gray-400">@{user?.username}</p>
                                    </div>
                                    <div className="py-1">
                                        <Link
                                            to={`/profile/${user?.id}`}
                                            className="flex items-center gap-3 px-4 py-2 hover:bg-white/5"
                                        >
                                            <FiUser className="w-4 h-4" />
                                            Profile
                                        </Link>
                                        <Link
                                            to="/settings"
                                            className="flex items-center gap-3 px-4 py-2 hover:bg-white/5"
                                        >
                                            <FiSettings className="w-4 h-4" />
                                            Settings
                                        </Link>
                                        <button
                                            onClick={handleLogout}
                                            className="flex items-center gap-3 px-4 py-2 hover:bg-white/5 w-full text-red-400"
                                        >
                                            <FiLogOut className="w-4 h-4" />
                                            Logout
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Mobile search */}
                {isSearchOpen && (
                    <div className="md:hidden py-2">
                        <SearchBar />
                    </div>
                )}
            </div>
        </header>
    );
};