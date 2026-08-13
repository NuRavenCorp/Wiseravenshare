import React, { useState, useEffect } from 'react';
import { apiService } from '../../Services/api';

const MARKET_SYMBOLS = ['MSFT', 'IBM'];
const FALLBACK_QUOTES = {
    MSFT: { name: 'Microsoft', price: 487.65, changePercent: 4.93, volume: 66663409, currency: 'USD', marketState: 'Fallback Snapshot' },
    IBM: { name: 'IBM', price: 226.13, changePercent: 0.65, volume: 4288300, currency: 'USD', marketState: 'Fallback Snapshot' },
    AAPL: { name: 'Apple', price: 219.44, changePercent: -0.33, volume: 51200438, currency: 'USD', marketState: 'Fallback Snapshot' },
    NVDA: { name: 'NVIDIA', price: 126.19, changePercent: 1.63, volume: 453991124, currency: 'USD', marketState: 'Fallback Snapshot' },
    TSLA: { name: 'Tesla', price: 251.8, changePercent: -1.23, volume: 97212581, currency: 'USD', marketState: 'Fallback Snapshot' }
};

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

const extractQuotes = (response) => {
    const body = response?.data;
    if (Array.isArray(body?.quotes)) {
        return body.quotes;
    }

    // Backward compatibility with older market endpoint payload shape.
    if (Array.isArray(body?.data)) {
        return body.data;
    }

    return [];
};

const buildFallbackQuotes = (symbols = MARKET_SYMBOLS) => symbols
    .map((symbol) => {
        const key = String(symbol || '').toUpperCase().trim();
        const sample = FALLBACK_QUOTES[key] || {
            name: key || 'Market quote',
            price: 100,
            changePercent: 0,
            volume: 0,
            currency: 'USD',
            marketState: 'Fallback Snapshot'
        };

        return normalizeQuote({
            symbol: key,
            name: sample.name,
            price: sample.price,
            changePercent: sample.changePercent,
            volume: sample.volume,
            currency: sample.currency,
            marketState: sample.marketState
        });
    })
    .filter((quote) => quote.symbol && Number.isFinite(quote.price));

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
                const quotes = extractQuotes(response);
                const normalized = quotes
                    .map(normalizeQuote)
                    .filter((quote) => quote.symbol && Number.isFinite(quote.price));

                if (!isMounted) {
                    return;
                }

                const safeQuotes = normalized.length > 0 ? normalized : buildFallbackQuotes(MARKET_SYMBOLS);
                setStocks(safeQuotes);
                setError(normalized.length === 0 ? 'Showing snapshot quotes while live market data reconnects.' : '');
            } catch {
                if (!isMounted) {
                    return;
                }

                setStocks(buildFallbackQuotes(MARKET_SYMBOLS));
                setError('Showing snapshot quotes while live market data reconnects.');
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
            const quotes = extractQuotes(response);
            const normalized = quotes
                .map(normalizeQuote)
                .filter((quote) => quote.symbol && Number.isFinite(quote.price));

            const safeQuotes = normalized.length > 0 ? normalized : buildFallbackQuotes(MARKET_SYMBOLS);
            setStocks(safeQuotes);
            setError(normalized.length === 0 ? 'Showing snapshot quotes while live market data reconnects.' : '');
        } catch {
            setStocks(buildFallbackQuotes(MARKET_SYMBOLS));
            setError('Showing snapshot quotes while live market data reconnects.');
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