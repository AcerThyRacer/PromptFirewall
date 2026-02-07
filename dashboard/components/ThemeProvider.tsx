'use client';
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

const THEMES = [
    { id: 'dark', name: 'Dark', icon: '🌙', color: '#6c5ce7' },
    { id: 'hacker', name: 'Hacker', icon: '👾', color: '#00ff41' },
    { id: 'retro', name: 'Retro', icon: '📺', color: '#ffb000' },
    { id: 'cyberpunk', name: 'Cyberpunk', icon: '🌆', color: '#ff00aa' },
    { id: 'ocean', name: 'Ocean', icon: '🌊', color: '#0096ff' },
    { id: 'sunset', name: 'Sunset', icon: '🌅', color: '#ff6432' },
    { id: 'nord', name: 'Nord', icon: '❄️', color: '#88c0d0' },
    { id: 'solarized', name: 'Solarized', icon: '☀️', color: '#268bd2' },
    { id: 'dracula', name: 'Dracula', icon: '🧛', color: '#bd93f9' },
    { id: 'synthwave', name: 'Synthwave', icon: '🎸', color: '#ff6ec7' },
];

interface ThemeContextType {
    theme: string;
    setTheme: (theme: string) => void;
    themes: typeof THEMES;
}

const ThemeContext = createContext<ThemeContextType>({
    theme: 'dark',
    setTheme: () => { },
    themes: THEMES,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState('dark');

    useEffect(() => {
        const saved = localStorage.getItem('pf-theme');
        if (saved) {
            // Use saved preference
            setThemeState(saved);
            document.documentElement.setAttribute('data-theme', saved);
        } else {
            // Auto-detect OS preference on first visit
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            const autoTheme = prefersDark ? 'dark' : 'solarized';
            setThemeState(autoTheme);
            document.documentElement.setAttribute('data-theme', autoTheme);
        }
    }, []);

    const setTheme = (newTheme: string) => {
        setThemeState(newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('pf-theme', newTheme);
    };

    return (
        <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}
