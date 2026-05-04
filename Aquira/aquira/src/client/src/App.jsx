import React, { Component } from 'react';
import AquiraMainDashboard from './AquiraMainDashboard.jsx';

// 1. Creiamo la Barriera di Errore (Error Boundary)
class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    // Questo metodo scatta automaticamente se un componente figlio va in crash
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('Error rendering Aquira Dashboard:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            // 2. Inseriamo qui la tua UI di errore personalizzata
            return (
                <div style={{
                    minHeight: '100vh',
                    background: 'linear-gradient(135deg, #0a0e27 0%, #1a1a2e 100%)',
                    padding: '24px',
                    color: '#e0e0e0',
                    fontFamily: '"JetBrains Mono", monospace',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <div style={{
                        maxWidth: '600px',
                        borderRadius: '12px',
                        border: '1px solid rgba(255, 71, 87, 0.3)',
                        background: 'rgba(255, 71, 87, 0.1)',
                        padding: '32px'
                    }}>
                        <h1 style={{
                            fontSize: '28px',
                            fontWeight: 'bold',
                            color: '#fff',
                            marginBottom: '16px',
                            margin: '0 0 16px 0'
                        }}>
                            ❌ Error Loading Dashboard
                        </h1>
                        <p style={{
                            fontSize: '14px',
                            color: '#aaa',
                            marginBottom: '16px'
                        }}>
                            Check console for details
                        </p>
                        <pre style={{
                            whiteSpace: 'pre-wrap',
                            borderRadius: '8px',
                            background: '#0a0e27',
                            padding: '16px',
                            fontSize: '12px',
                            color: '#ff7a8c',
                            overflow: 'auto'
                        }}>
                            {this.state.error && this.state.error.message}
                        </pre>
                    </div>
                </div>
            );
        }

        // Se non ci sono errori, renderizza normalmente il contenuto
        return this.props.children;
    }
}

// 3. Il tuo componente App ora avvolge la Dashboard nella barriera
function App() {
    return (
        <ErrorBoundary>
            <AquiraMainDashboard />
        </ErrorBoundary>
    );
}

export default App;