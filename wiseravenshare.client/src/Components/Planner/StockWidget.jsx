import React, { useState, useEffect } from 'react';
import { apiService } from '../../Services/api';

const MARKET_SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'TSLA'];

const formatCurrency = (value, currency = 'USD') => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) {
        return '--';
    }

    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency || 'USD',
            maximumFractionDigits: 2
        }).format(amount);
    } catch {
        return `$${amount.toFixed(2)}`;
    }
};

const formatVolume = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return null;
    }

    if (numeric >= 1000000000) return `${(numeric / 1000000000).toFixed(1)}B`;
    if (numeric >= 1000000) return `${(numeric / 1000000).toFixed(1)}M`;
    if (numeric >= 1000) return `${(numeric / 1000).toFixed(1)}K`;
    return `${Math.round(numeric)}`;
};

const normalizeMarketState = (value) => String(value || '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const normalizeQuote = (quote = {}) => ({
    symbol: String(quote.symbol || '').trim(),
    name: String(quote.name || quote.symbol || 'Market quote').trim(),
    price: Number(quote.price),
    changePercent: Number(quote.changePercent),
    volume: Number(quote.volume),
    currency: String(quote.currency || 'USD').trim() || 'USD',
    marketState: normalizeMarketState(quote.marketState)
});

const StockWidget = () => {
    const [stocks, setStocks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let isMounted = true;

        const refreshQuotes = async ({ silent = false } = {}) => {
            if (!silent && isMounted) {
                setLoading(true);
            }

            try {
                const response = await apiService.getMarketQuotes(MARKET_SYMBOLS);
                const quotes = Array.isArray(response?.data?.quotes) ? response.data.quotes : [];
                const normalized = quotes
                    .map(normalizeQuote)
                    .filter((quote) => quote.symbol && Number.isFinite(quote.price));

                if (!isMounted) {
                    return;
                }

                setStocks(normalized);
                setError(normalized.length === 0 ? 'Live market data is temporarily unavailable.' : '');
            } catch {
                if (!isMounted) {
                    return;
                }

                setStocks([]);
                setError('Live market data is temporarily unavailable.');
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        refreshQuotes();
        const interval = setInterval(() => {
            refreshQuotes({ silent: true });
        }, 60000);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, []);

    const handleRefresh = async () => {
        setLoading(true);
        try {
            const response = await apiService.getMarketQuotes(MARKET_SYMBOLS);
            const quotes = Array.isArray(response?.data?.quotes) ? response.data.quotes : [];
            const normalized = quotes
                .map(normalizeQuote)
                .filter((quote) => quote.symbol && Number.isFinite(quote.price));
            setStocks(normalized);
            setError(normalized.length === 0 ? 'Live market data is temporarily unavailable.' : '');
        } catch {
            setStocks([]);
            setError('Live market data is temporarily unavailable.');
        } finally {
            setLoading(false);
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

            {loading && stocks.length === 0 && (
                <div style={{ fontSize: '12px', color: 'var(--light-color)' }}>Loading live market data...</div>
            )}

            {!loading && error && stocks.length === 0 && (
                <div style={{ fontSize: '12px', color: 'var(--light-color)', lineHeight: 1.5 }}>{error}</div>
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
                            {stock.marketState && (
                                <div style={{ fontSize: '10px', opacity: 0.7, marginTop: '4px' }}>{stock.marketState}</div>
                            )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                            <div>{formatCurrency(stock.price, stock.currency)}</div>
                        <div style={{
                            color: stock.changePercent >= 0 ? '#4caf50' : '#f44336',
                            fontSize: '12px'
                        }}>
                            {Number.isFinite(stock.changePercent)
                                ? `${stock.changePercent >= 0 ? '+' : ''}${stock.changePercent.toFixed(2)}%`
                                : '--%'}
                        </div>
                        {formatVolume(stock.volume) && (
                            <div style={{ fontSize: '10px', opacity: 0.7, marginTop: '4px' }}>Vol {formatVolume(stock.volume)}</div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default StockWidget;