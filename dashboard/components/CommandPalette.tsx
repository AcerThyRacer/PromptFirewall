'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface Command {
    id: string;
    icon: string;
    label: string;
    shortcut?: string;
    action: () => void;
    section: string;
}

export default function CommandPalette() {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();

    const commands: Command[] = [
        { id: 'dash', icon: '📊', label: 'Go to Dashboard', shortcut: '1', section: 'Navigation', action: () => router.push('/') },
        { id: 'traffic', icon: '🔄', label: 'Go to Traffic Log', shortcut: '2', section: 'Navigation', action: () => router.push('/traffic') },
        { id: 'analytics', icon: '📈', label: 'Go to Analytics', shortcut: '3', section: 'Navigation', action: () => router.push('/analytics') },
        { id: 'rules', icon: '🛡️', label: 'Go to Security Rules', shortcut: '4', section: 'Navigation', action: () => router.push('/rules') },
        { id: 'test', icon: '🧪', label: 'Go to Test Lab', shortcut: '5', section: 'Navigation', action: () => router.push('/test') },
        { id: 'theme-dark', icon: '🌙', label: 'Switch to Dark theme', section: 'Themes', action: () => applyTheme('dark') },
        { id: 'theme-hacker', icon: '👾', label: 'Switch to Hacker theme', section: 'Themes', action: () => applyTheme('hacker') },
        { id: 'theme-retro', icon: '📺', label: 'Switch to Retro theme', section: 'Themes', action: () => applyTheme('retro') },
        { id: 'theme-cyberpunk', icon: '🌆', label: 'Switch to Cyberpunk theme', section: 'Themes', action: () => applyTheme('cyberpunk') },
        { id: 'theme-ocean', icon: '🌊', label: 'Switch to Ocean theme', section: 'Themes', action: () => applyTheme('ocean') },
        { id: 'theme-sunset', icon: '🌅', label: 'Switch to Sunset theme', section: 'Themes', action: () => applyTheme('sunset') },
        { id: 'theme-nord', icon: '❄️', label: 'Switch to Nord theme', section: 'Themes', action: () => applyTheme('nord') },
        { id: 'theme-solarized', icon: '☀️', label: 'Switch to Solarized theme', section: 'Themes', action: () => applyTheme('solarized') },
        { id: 'theme-dracula', icon: '🧛', label: 'Switch to Dracula theme', section: 'Themes', action: () => applyTheme('dracula') },
        { id: 'theme-synthwave', icon: '🎸', label: 'Switch to Synthwave theme', section: 'Themes', action: () => applyTheme('synthwave') },
    ];

    const applyTheme = (t: string) => {
        document.documentElement.setAttribute('data-theme', t);
        localStorage.setItem('pf-theme', t);
    };

    const filtered = commands.filter((c) =>
        c.label.toLowerCase().includes(query.toLowerCase())
    );

    const handleKey = useCallback(
        (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                setOpen((prev) => !prev);
                setQuery('');
                setSelected(0);
            }
            if (e.key === 'Escape') {
                setOpen(false);
            }
        },
        []
    );

    useEffect(() => {
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [handleKey]);

    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [open]);

    const execute = (cmd: Command) => {
        cmd.action();
        setOpen(false);
        setQuery('');
    };

    const onInputKey = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelected((prev) => Math.min(prev + 1, filtered.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelected((prev) => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter' && filtered[selected]) {
            execute(filtered[selected]);
        }
    };

    if (!open) return null;

    const sections = [...new Set(filtered.map((c) => c.section))];

    return (
        <div className="palette-overlay" onClick={() => setOpen(false)}>
            <div className="palette-panel" onClick={(e) => e.stopPropagation()}>
                <div className="palette-input-row">
                    <span className="palette-search-icon">🔍</span>
                    <input
                        ref={inputRef}
                        className="palette-input"
                        placeholder="Type a command..."
                        value={query}
                        onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
                        onKeyDown={onInputKey}
                    />
                    <kbd className="palette-kbd">ESC</kbd>
                </div>
                <div className="palette-results">
                    {filtered.length === 0 ? (
                        <div className="palette-empty">No matching commands</div>
                    ) : (
                        sections.map((section) => (
                            <div key={section}>
                                <div className="palette-section">{section}</div>
                                {filtered
                                    .filter((c) => c.section === section)
                                    .map((cmd) => {
                                        const idx = filtered.indexOf(cmd);
                                        return (
                                            <button
                                                key={cmd.id}
                                                className={`palette-item ${idx === selected ? 'selected' : ''}`}
                                                onClick={() => execute(cmd)}
                                                onMouseEnter={() => setSelected(idx)}
                                            >
                                                <span className="palette-item-icon">{cmd.icon}</span>
                                                <span className="palette-item-label">{cmd.label}</span>
                                                {cmd.shortcut && (
                                                    <kbd className="palette-item-shortcut">{cmd.shortcut}</kbd>
                                                )}
                                            </button>
                                        );
                                    })}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
