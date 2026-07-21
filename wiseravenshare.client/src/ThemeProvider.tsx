// src/styles/ThemeProvider.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { ThemeProvider as MuiThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { useLocalStorage } from '../hooks/useLocalStorage';

type ThemeMode = 'dark' | 'light' | 'system';

interface ThemeContextType {
    mode: ThemeMode;
    toggleTheme: () => void;
    setMode: (mode: ThemeMode) => void;
    isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = (): ThemeContextType => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};

interface ThemeProviderProps {
    children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
    const [mode, setMode] = useLocalStorage<ThemeMode>('theme-mode', 'system');
    const [isDark, setIsDark] = useState(true);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = () => {
            if (mode === 'system') {
                setIsDark(mediaQuery.matches);
            }
        };

        if (mode === 'system') {
            setIsDark(mediaQuery.matches);
            mediaQuery.addEventListener('change', handleChange);
        } else {
            setIsDark(mode === 'dark');
        }

        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [mode]);

    const toggleTheme = () => {
        setMode(prev => {
            if (prev === 'dark') return 'light';
            if (prev === 'light') return 'dark';
            return 'dark';
        });
    };

    const theme = createTheme({
        palette: {
            mode: isDark ? 'dark' : 'light',
            primary: {
                main: isDark ? '#667eea' : '#5a6fd1',
                light: isDark ? '#8ba1f5' : '#7a8fe8',
                dark: isDark ? '#4a5fc9' : '#4a5fc9',
            },
            secondary: {
                main: isDark ? '#764ba2' : '#6b3fa0',
                light: isDark ? '#9a6fc9' : '#8a5fb8',
                dark: isDark ? '#5a3a8a' : '#5a3a8a',
            },
            background: {
                default: isDark ? '#0f1419' : '#f8fafc',
                paper: isDark ? '#1e293b' : '#ffffff',
            },
            text: {
                primary: isDark ? '#f8fafc' : '#1a202c',
                secondary: isDark ? '#94a3b8' : '#4a5568',
            },
            error: {
                main: '#ef4444',
            },
            warning: {
                main: '#f59e0b',
            },
            info: {
                main: '#3b82f6',
            },
            success: {
                main: '#10b981',
            },
            divider: isDark ? '#334155' : '#e2e8f0',
        },
        typography: {
            fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            h1: {
                fontSize: '2.5rem',
                fontWeight: 700,
                lineHeight: 1.2,
            },
            h2: {
                fontSize: '2rem',
                fontWeight: 700,
                lineHeight: 1.3,
            },
            h3: {
                fontSize: '1.75rem',
                fontWeight: 600,
                lineHeight: 1.3,
            },
            h4: {
                fontSize: '1.5rem',
                fontWeight: 600,
                lineHeight: 1.4,
            },
            h5: {
                fontSize: '1.25rem',
                fontWeight: 600,
                lineHeight: 1.4,
            },
            h6: {
                fontSize: '1rem',
                fontWeight: 600,
                lineHeight: 1.5,
            },
            body1: {
                fontSize: '1rem',
                lineHeight: 1.6,
            },
            body2: {
                fontSize: '0.875rem',
                lineHeight: 1.6,
            },
            caption: {
                fontSize: '0.75rem',
                lineHeight: 1.5,
            },
            overline: {
                fontSize: '0.75rem',
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
            },
        },
        shape: {
            borderRadius: 12,
        },
        shadows: isDark ? [
            'none',
            '0 1px 3px rgba(0,0,0,0.3)',
            '0 4px 12px rgba(0,0,0,0.3)',
            '0 8px 24px rgba(0,0,0,0.3)',
            '0 12px 36px rgba(0,0,0,0.4)',
        ] : [
            'none',
            '0 1px 3px rgba(0,0,0,0.08)',
            '0 4px 12px rgba(0,0,0,0.1)',
            '0 8px 24px rgba(0,0,0,0.12)',
            '0 12px 36px rgba(0,0,0,0.15)',
        ],
        components: {
            MuiButton: {
                styleOverrides: {
                    root: {
                        borderRadius: '30px',
                        textTransform: 'none',
                        fontWeight: 600,
                        padding: '8px 24px',
                    },
                    contained: {
                        boxShadow: 'none',
                        '&:hover': {
                            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                        },
                    },
                },
            },
            MuiCard: {
                styleOverrides: {
                    root: {
                        borderRadius: '16px',
                        background: isDark ? 'var(--card-bg)' : '#ffffff',
                        border: `1px solid ${isDark ? 'var(--border-color)' : '#e2e8f0'}`,
                        boxShadow: isDark ? '0 4px 12px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.08)',
                    },
                },
            },
            MuiTextField: {
                styleOverrides: {
                    root: {
                        '& .MuiOutlinedInput-root': {
                            borderRadius: '12px',
                            background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                            '& fieldset': {
                                borderColor: isDark ? 'var(--border-color)' : '#e2e8f0',
                            },
                            '&:hover fieldset': {
                                borderColor: isDark ? 'var(--highlight-color)' : '#94a3b8',
                            },
                            '&.Mui-focused fieldset': {
                                borderColor: '#667eea',
                            },
                        },
                    },
                },
            },
            MuiChip: {
                styleOverrides: {
                    root: {
                        borderRadius: '20px',
                    },
                },
            },
            MuiAvatar: {
                styleOverrides: {
                    root: {
                        borderRadius: '50%',
                    },
                },
            },
        },
    });

    return (
        <ThemeContext.Provider value={{ mode, toggleTheme, setMode, isDark }}>
            <MuiThemeProvider theme={theme}>
                <CssBaseline />
                {children}
            </MuiThemeProvider>
        </ThemeContext.Provider>
    );
};