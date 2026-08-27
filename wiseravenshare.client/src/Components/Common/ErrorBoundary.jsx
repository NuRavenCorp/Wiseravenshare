// wiseravenshare.client/src/Components/Common/ErrorBoundary.jsx
// Catches render errors in a subtree and shows a friendly recovery screen.
// Adapted from the reference design to this project's inline-style conventions.

import React, { Component } from 'react';

export class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('Error caught by boundary:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    padding: '40px', textAlign: 'center',
                    background: 'var(--card-bg)', border: '1px solid var(--border-color)',
                    borderRadius: '14px', maxWidth: 480, margin: '40px auto'
                }}>
                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>⚠️</div>
                    <h2 style={{ margin: '0 0 8px', fontSize: '20px' }}>Something went wrong</h2>
                    <p style={{ margin: '0 0 20px', fontSize: '13px', color: 'var(--light-color)' }}>
                        {this.state.error?.message || 'An unexpected error occurred'}
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            border: 'none', cursor: 'pointer', padding: '10px 24px',
                            borderRadius: '10px', fontWeight: 600, color: '#fff',
                            background: 'linear-gradient(135deg, var(--highlight-color), var(--accent-color))'
                        }}
                    >
                        Refresh Page
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
