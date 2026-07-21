import React, { createContext, useState, useContext, useEffect } from 'react';

const ThemeContext = createContext();

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within ThemeProvider');
    }
    return context;
};

export const ThemeProvider = ({ children }) => {
    const [theme, setTheme] = useState(() => {
        const savedTheme = localStorage.getItem('theme');
        return savedTheme || 'dark';
    });

    useEffect(() => {
        document.body.className = `theme-${theme}`;
        localStorage.setItem('theme', theme);

        // Update CSS variables
        const root = document.documentElement;
        if (theme === 'light') {
            root.style.setProperty('--primary-color', '#ffffff');
            root.style.setProperty('--secondary-color', '#f7fafc');
            root.style.setProperty('--text-color', '#1a202c');
            root.style.setProperty('--bg-color', '#f7fafc');
            root.style.setProperty('--card-bg', '#ffffff');
            root.style.setProperty('--border-color', '#e2e8f0');
        } else {
            root.style.setProperty('--primary-color', '#131a2f');
            root.style.setProperty('--secondary-color', '#1e2a4a');
            root.style.setProperty('--text-color', '#f8fafc');
            root.style.setProperty('--bg-color', '#090f1f');
            root.style.setProperty('--card-bg', '#151f3a');
            root.style.setProperty('--border-color', '#2b3a66');
        }
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};