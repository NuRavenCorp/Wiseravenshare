import React, { useState, useEffect } from 'react';

const StockWidget = () => {
    const marketSymbols = ['AAPL', 'MSFT', 'NVDA', 'TSLA'];
    const [stocks, setStocks] = useState([
        { symbol: 'AAPL', name: 'Apple', price: 0, changePercent: 0, volume: 0 },
        { symbol: 'MSFT', name: 'Microsoft', price: 0, changePercent: 0, volume: 0 },
        { symbol: 'NVDA', name: 'NVIDIA', price: 0, changePercent: 0, volume: 0 },
        { symbol: 'TSLA', name: 'Tesla', price: 0, changePercent: 0, volume: 0 }
    ]);
    const [marketError, setMarketError] = useState('');

    useEffect(() => {
        const refreshMarketData = async () => {
            try {
                const response = await fetch(`/api/market/quotes?symbols=${marketSymbols.join(',')}`);
                if (!response.ok) {
                    throw new Error('Unable to load market data.');
                }

                const payload = await response.json();
                const quotes = Array.isArray(payload?.quotes) ? payload.quotes : [];
                if (quotes.length > 0) {
                    setStocks(quotes);
                    setMarketError('');
                }
            } catch {
                setMarketError('Live market feed unavailable.');
            }
        };

        refreshMarketData();
        const interval = setInterval(refreshMarketData, 15000);

        return () => clearInterval(interval);
    }, []);

    const handleRefresh = async () => {
        try {
            const response = await fetch(`/api/market/quotes?symbols=${marketSymbols.join(',')}`);
            if (!response.ok) {
                throw new Error('Unable to load market data.');
            }
            const payload = await response.json();
            const quotes = Array.isArray(payload?.quotes) ? payload.quotes : [];
            if (quotes.length > 0) {
                setStocks(quotes);
                setMarketError('');
            }
        } catch {
            setMarketError('Live market feed unavailable.');
        }
    };

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
                    onClick={handleRefresh}
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
            {marketError && (
                <div style={{ fontSize: '11px', color: '#f44336', marginBottom: '8px' }}>{marketError}</div>
            )}

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
                        <div>${Number(stock.price || 0).toFixed(2)}</div>
                        <div style={{
                            color: Number(stock.changePercent || 0) >= 0 ? '#4caf50' : '#f44336',
                            fontSize: '12px'
                        }}>
                            {Number(stock.changePercent || 0) >= 0 ? '+' : ''}{Number(stock.changePercent || 0).toFixed(2)}%
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default StockWidget;