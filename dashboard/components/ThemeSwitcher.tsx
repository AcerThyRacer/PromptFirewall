'use client';
import React, { useState, useRef, useEffect } from 'react';
import { useTheme } from './ThemeProvider';

export default function ThemeSwitcher() {
    const { theme, setTheme, themes } = useTheme();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const currentTheme = themes.find(t => t.id === theme);

    return (
        <div className="theme-switcher" ref={ref}>
            <button className="theme-btn" onClick={() => setOpen(!open)}>
                <span>{currentTheme?.icon}</span>
                <span>{currentTheme?.name}</span>
                <span style={{ opacity: 0.5, fontSize: '10px' }}>▼</span>
            </button>
            <div className={`theme-dropdown ${open ? 'open' : ''}`}>
                {themes.map((t) => (
                    <button
                        key={t.id}
                        className={`theme-option ${theme === t.id ? 'active' : ''}`}
                        onClick={() => { setTheme(t.id); setOpen(false); }}
                    >
                        <div
                            className="theme-preview"
                            style={{ backgroundColor: t.color }}
                        />
                        <span>{t.icon}</span>
                        <span>{t.name}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
