import React, { useState, useEffect } from 'react';

const StockWidget = () => {
    const [stocks, setStocks] = useState([
        { symbol: 'WRAV', name: 'Wise Raven', price: 145.23, change: 1.2, volume: '2.4M' },
        { symbol: 'DSEEK', name: 'DeepSeek AI', price: 234.56, change: -0.8, volume: '1.8M' },
        { symbol: 'TECH', name: 'Tech Giants', price: 189.75, change: 2.5, volume: '3.2M' },
        { symbol: 'INNV', name: 'Innovation Inc', price: 76.44, change: -1.3, volume: '1.1M' }
    ]);

    useEffect(() => {
        const interval = setInterval(() => {
            setStocks(prev => prev.map(stock => ({
                ...stock,
                price: Math.max(0, stock.price + (Math.random() - 0.5) * 2),
                change: parseFloat((stock.change + (Math.random() - 0.5) * 0.3).toFixed(2))
            })));
        }, 30000);

        return () => clearInterval(interval);
    }, []);

    return (
        <div style={{
            background: 'var(--card-bg)',
            padding: '20px',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            marginBottom: '20px'
        }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '15px'
            }}>
                <h3>
                    <i className="fas fa-chart-line"></i> Market Watch
                </h3>
                <button
                    onClick={() => {
                        setStocks(prev => prev.map(stock => ({
                            ...stock,
                            price: stock.price * (1 + (Math.random() - 0.5) * 0.05)
                        })));
                    }}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--highlight-color)',
                        cursor: 'pointer'
                    }}
                >
                    <i className="fas fa-sync-alt"></i>
                </button>
            </div>

            {stocks.map(stock => (
                <div
                    key={stock.symbol}
                    style={{
                        padding: '12px 0',
                        borderBottom: '1px solid var(--border-color)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}
                >
                    <div>
                        <div style={{ fontWeight: 'bold' }}>{stock.symbol}</div>
                        <div style={{ fontSize: '11px', opacity: 0.7 }}>{stock.name}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div>${stock.price.toFixed(2)}</div>
                        <div style={{
                            color: stock.change >= 0 ? '#4caf50' : '#f44336',
                            fontSize: '12px'
                        }}>
                            {stock.change >= 0 ? '+' : ''}{stock.change}%
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default StockWidget;