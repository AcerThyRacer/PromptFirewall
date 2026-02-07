'use client';
import React, { Component, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/**
 * Catches JavaScript errors in child components and displays
 * a fallback UI instead of crashing the entire page.
 */
export default class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('[ErrorBoundary] Caught error:', error, info.componentStack);
    }

    render() {
        if (this.state.hasError) {
            return (
                this.props.fallback ?? (
                    <div className="error-boundary">
                        <div className="error-boundary-icon">💥</div>
                        <h3 className="error-boundary-title">Something went wrong</h3>
                        <p className="error-boundary-message">
                            {this.state.error?.message || 'An unexpected error occurred'}
                        </p>
                        <button
                            className="btn"
                            onClick={() => this.setState({ hasError: false, error: null })}
                        >
                            🔄 Try Again
                        </button>
                    </div>
                )
            );
        }

        return this.props.children;
    }
}
