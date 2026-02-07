'use client';
import React from 'react';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ToastProvider } from '@/components/ToastProvider';
import ErrorBoundary from '@/components/ErrorBoundary';
import CommandPalette from '@/components/CommandPalette';
import Sidebar from '@/components/Sidebar';
import ThemeSwitcher from '@/components/ThemeSwitcher';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
    return (
        <ThemeProvider>
            <ToastProvider>
                <div className="app-layout">
                    <Sidebar />
                    <div className="main-area">
                        <header className="header">
                            <div className="header-left">
                                <span className="header-title">🔥 Prompt Firewall</span>
                            </div>
                            <div className="header-right">
                                <ThemeSwitcher />
                            </div>
                        </header>
                        <main className="main-content">
                            <ErrorBoundary>
                                {children}
                            </ErrorBoundary>
                        </main>
                    </div>
                    <CommandPalette />
                </div>
            </ToastProvider>
        </ThemeProvider>
    );
}
