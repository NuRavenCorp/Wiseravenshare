import React from 'react';

const TruthAlert = ({ alerts, onDismiss }) => {
    if (!alerts || alerts.length === 0) return null;

    return (
        <div style={{
            position: 'fixed',
            top: '80px',
            right: '20px',
            zIndex: 1000,
            maxWidth: '400px',
            width: 'calc(100% - 40px)'
        }}>
            {alerts.map(alert => (
                <div
                    key={alert.id}
                    className={`truth-alert ${alert.type}`}
                    style={{
                        background: alert.type === 'correction' ? '#e8f5e9' :
                            alert.type === 'dispute' ? '#ffebee' :
                                alert.type === 'warning' ? '#fff3e0' : '#e3f2fd',
                        borderLeft: `4px solid ${alert.type === 'correction' ? '#4caf50' :
                            alert.type === 'dispute' ? '#f44336' :
                                alert.type === 'warning' ? '#ff9800' : '#2196f3'
                            }`,
                        padding: '15px',
                        marginBottom: '10px',
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        position: 'relative',
                        color: '#1a202c'
                    }}
                >
                    <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
                        {alert.type === 'correction' && '📢 Truth Correction'}
                        {alert.type === 'dispute' && '⚠️ Dispute Filed'}
                        {alert.type === 'warning' && '⚠️ Warning'}
                        {alert.type === 'success' && '✅ Success'}
                    </div>
                    <div style={{ fontSize: '14px' }}>{alert.message}</div>
                    {alert.correction && (
                        <div style={{
                            marginTop: '8px',
                            padding: '8px',
                            background: 'rgba(0,0,0,0.05)',
                            borderRadius: '4px',
                            fontSize: '13px'
                        }}>
                            <strong>Correction:</strong> {alert.correction}
                        </div>
                    )}
                    <button
                        onClick={() => onDismiss(alert.id)}
                        style={{
                            position: 'absolute',
                            top: '10px',
                            right: '10px',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '16px',
                            color: '#666'
                        }}
                    >
                        ×
                    </button>
                </div>
            ))}
        </div>
    );
};

export default TruthAlert;
