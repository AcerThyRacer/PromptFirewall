'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
    { href: '/', icon: '📊', label: 'Dashboard', section: 'overview' },
    { href: '/traffic', icon: '🔄', label: 'Traffic Log', section: 'overview' },
    { href: '/analytics', icon: '📈', label: 'Analytics', section: 'overview' },
    { href: '/rules', icon: '🛡️', label: 'Security Rules', section: 'security' },
    { href: '/test', icon: '🧪', label: 'Test Lab', section: 'security' },
];

export default function Sidebar() {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    const overviewItems = NAV_ITEMS.filter((i) => i.section === 'overview');
    const securityItems = NAV_ITEMS.filter((i) => i.section === 'security');

    // Auto-collapse on narrow screens
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 768px)');
        setCollapsed(mq.matches);
        const handler = (e: MediaQueryListEvent) => setCollapsed(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    // Close mobile menu on navigation
    useEffect(() => {
        setMobileOpen(false);
    }, [pathname]);

    return (
        <>
            {/* Mobile hamburger */}
            <button
                className="sidebar-hamburger"
                onClick={() => setMobileOpen(!mobileOpen)}
                aria-label="Toggle menu"
            >
                <span className="hamburger-bar" />
                <span className="hamburger-bar" />
                <span className="hamburger-bar" />
            </button>

            {/* Mobile overlay */}
            {mobileOpen && (
                <div
                    className="sidebar-mobile-overlay"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            <aside
                className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''} ${mobileOpen ? 'sidebar-mobile-open' : ''}`}
            >
                <div className="sidebar-logo">
                    <div className="logo-icon">🔥</div>
                    {!collapsed && (
                        <div className="logo-text">
                            <span className="logo-title">Prompt Firewall</span>
                            <span className="logo-subtitle">AI Security Proxy</span>
                        </div>
                    )}
                    <button
                        className="sidebar-collapse-btn"
                        onClick={() => setCollapsed(!collapsed)}
                        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        {collapsed ? '»' : '«'}
                    </button>
                </div>

                <nav className="sidebar-nav">
                    {!collapsed && <div className="nav-section-label">Overview</div>}
                    {overviewItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`nav-item ${pathname === item.href ? 'active' : ''}`}
                            title={collapsed ? item.label : undefined}
                        >
                            <span className="nav-icon">{item.icon}</span>
                            {!collapsed && <span className="nav-label">{item.label}</span>}
                        </Link>
                    ))}

                    {!collapsed && <div className="nav-section-label">Security</div>}
                    {securityItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`nav-item ${pathname === item.href ? 'active' : ''}`}
                            title={collapsed ? item.label : undefined}
                        >
                            <span className="nav-icon">{item.icon}</span>
                            {!collapsed && <span className="nav-label">{item.label}</span>}
                        </Link>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <div className="sidebar-status">
                        <span className="status-dot" />
                        {!collapsed && <span>Proxy Active • Port 8080</span>}
                    </div>
                    {!collapsed && (
                        <div className="sidebar-shortcut-hint">
                            <kbd>Ctrl</kbd>+<kbd>K</kbd> Command Palette
                        </div>
                    )}
                </div>
            </aside>
        </>
    );
}
