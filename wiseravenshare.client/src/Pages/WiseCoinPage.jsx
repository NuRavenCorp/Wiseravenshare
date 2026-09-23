// wiseravenshare.client/src/Pages/WiseCoinPage.jsx
import React, { useState, useEffect } from 'react';
import { wisecoinService } from '../Services/wisecoinService';
import '../Styles/WiseCoinPage.css';

export default function WiseCoinPage() {
  const [balance, setBalance] = useState(null);
  const [valuation, setValuation] = useState(null);
  const [rolloutStatus, setRolloutStatus] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [badges, setBadges] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Run all fetches independently so one failure doesn't kill the whole page.
      const settle = (promise, fallback = null) =>
        promise.catch(() => fallback);

      const [bal, val, status, txs, bdgs] = await Promise.all([
        settle(wisecoinService.getBalance()),
        settle(wisecoinService.getValuation()),
        settle(wisecoinService.getRolloutStatus()),
        settle(wisecoinService.getTransactionHistory(1, 10), []),
        settle(wisecoinService.getBadges(), []),
      ]);

      setBalance(bal);
      setValuation(val);
      setRolloutStatus(status);
      setTransactions(Array.isArray(txs) ? txs : []);
      setBadges(Array.isArray(bdgs) ? bdgs : []);

      // Only surface an error if the two most critical calls both failed.
      if (!bal && !val) {
        setError('Unable to load WiseCoin data. Please sign in or try again.');
      }
    } catch (err) {
      setError('Unable to load WiseCoin data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClaimAllocation = async () => {
    if (balance?.hasReceivedInitialAllocation) {
      alert('You have already claimed your initial allocation.');
      return;
    }
    try {
      setClaiming(true);
      const result = await wisecoinService.claimInitialAllocation();
      alert(`Claimed ${result.allocated} WSC successfully!`);
      await loadData();
    } catch (err) {
      alert(`Failed to claim allocation: ${err.message}`);
    } finally {
      setClaiming(false);
    }
  };

  if (loading) return <div className="wisecoin-container"><div className="loading">Loading...</div></div>;
  if (error) return (
    <div className="wisecoin-container">
      <div className="wisecoin-hero">
        <div className="hero-content">
          <h1>💎 WiseCoin Ecosystem</h1>
          <p>Earn, stake, and trade your way to influence on WiseRavenShare</p>
        </div>
      </div>
      <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', fontSize: '14px' }}>
        {error}
      </div>
    </div>
  );

  return (
    <div className="wisecoin-container">
      {/* Hero Section */}
      <div className="wisecoin-hero">
        <div className="hero-content">
          <h1>💎 WiseCoin Ecosystem</h1>
          <p>Earn, stake, and trade your way to influence on WiseRavenShare</p>
        </div>
      </div>

      {/* Stats Grid */}
      {balance ? (
        <div className="wisecoin-stats">
          <div className="stat-card">
            <div className="stat-label">Your Balance</div>
            <div className="stat-value">{Number(balance.balance ?? 0).toFixed(2)}</div>
            <div className="stat-sublabel">WSC</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Effective Balance</div>
            <div className="stat-value">{Number(balance.effectiveBalance ?? 0).toFixed(2)}</div>
            <div className="stat-sublabel">incl. staked</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">USD Value</div>
            <div className="stat-value">${Number(balance.currentValueUSD ?? 0).toFixed(2)}</div>
            <div className="stat-sublabel">at current rate</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Earning Boost</div>
            <div className="stat-value positive">{Number(balance.totalMultiplier ?? balance.badgeMultiplier ?? 1).toFixed(2)}×</div>
            <div className="stat-sublabel">total multiplier</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Badges Earned</div>
            <div className="stat-value">{badges.length}</div>
            <div className="stat-sublabel">lifetime</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">All Time Earned</div>
            <div className="stat-value positive">{Number(balance.workHoursContributed ?? 0).toFixed(1)}</div>
            <div className="stat-sublabel">work hours</div>
          </div>
        </div>
      ) : (
        <div style={{
          textAlign: 'center', padding: '24px', margin: '16px 0',
          background: 'rgba(99,102,241,0.07)', borderRadius: '14px',
          border: '1px solid rgba(99,102,241,0.2)', color: 'var(--text-muted)',
          fontSize: '14px'
        }}>
          🔐 Sign in to view your WiseCoin wallet and balance.
        </div>
      )}

      {/* Initial Allocation CTA */}
      {balance && !balance.hasReceivedInitialAllocation && (
        <div className="allocation-banner">
          <h3>🎉 Claim Your Initial Allocation</h3>
          <p>All members receive 100 WSC to get started. Claim yours now!</p>
          <button
            className="claim-btn"
            onClick={handleClaimAllocation}
            disabled={claiming}
          >
            {claiming ? 'Claiming...' : 'Claim 100 WSC'}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="wisecoin-tabs">
        <button
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`tab ${activeTab === 'earning' ? 'active' : ''}`}
          onClick={() => setActiveTab('earning')}
        >
          How to Earn
        </button>
        <button
          className={`tab ${activeTab === 'transactions' ? 'active' : ''}`}
          onClick={() => setActiveTab('transactions')}
        >
          Transactions
        </button>
        <button
          className={`tab ${activeTab === 'badges' ? 'active' : ''}`}
          onClick={() => setActiveTab('badges')}
        >
          Badges
        </button>
      </div>

      {/* Tab Content */}
      <div className="wisecoin-content">
        {activeTab === 'overview' && (
          <div className="tab-panel">
            <h2>WSC Ecosystem Overview</h2>
            <div className="info-cards">
              <div className="info-card">
                <h3>What is WiseCoin?</h3>
                <p>WiseCoin (WSC) is the native currency of WiseRavenShare. Earn it by contributing quality content, engaging with the community, and building your reputation.</p>
              </div>
              <div className="info-card">
                <h3>Rollout Progress</h3>
                {rolloutStatus && (
                  <div className="progress-info">
                    <p><strong>{rolloutStatus.allocatedUsers} / {rolloutStatus.totalUsers}</strong> users allocated</p>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${rolloutStatus.allocationPercentage}%` }}
                      />
                    </div>
                    <p>{rolloutStatus.allocationPercentage.toFixed(1)}% complete</p>
                    <p>Total distributed: <strong>{rolloutStatus.totalDistributedWSC.toFixed(0)}</strong> WSC</p>
                  </div>
                )}
              </div>
              <div className="info-card">
                <h3>Current Valuation</h3>
                {valuation && (
                  <div className="valuation-info">
                    <p><strong>{valuation.wscPerHour.toFixed(2)}</strong> WSC per work hour</p>
                    <p>Active users: <strong>{valuation.activeUsers}</strong></p>
                    <p>In circulation: <strong>{valuation.totalWSCInCirculation.toFixed(0)}</strong> WSC</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'earning' && (
          <div className="tab-panel">
            <h2>How to Earn WiseCoin</h2>
            <div className="earning-guide">
              <div className="earning-item">
                <div className="earning-icon">📝</div>
                <h3>Create Posts</h3>
                <p>Post engaging content and earn 1-2 WSC per post. Higher engagement = higher rewards.</p>
                <div className="reward-badge">+1-2 WSC</div>
              </div>
              <div className="earning-item">
                <div className="earning-icon">🧠</div>
                <h3>Complete Quizzes</h3>
                <p>Test your knowledge on civic topics. Perfect scores earn bonus WSC.</p>
                <div className="reward-badge">+5-25 WSC</div>
              </div>
              <div className="earning-item">
                <div className="earning-icon">🏆</div>
                <h3>Well Done Badges</h3>
                <p>Unlock badges for logging in, completing your profile, posting, and helping the community.</p>
                <div className="reward-badge">+5-50 WSC</div>
              </div>
              <div className="earning-item">
                <div className="earning-icon">🔥</div>
                <h3>Activity Streaks</h3>
                <p>Maintain consistent activity for streak bonuses.</p>
                <div className="reward-badge">+10-30 WSC</div>
              </div>
              <div className="earning-item">
                <div className="earning-icon">⭐</div>
                <h3>Engagement</h3>
                <p>Get likes, comments, and shares on your content for engagement multipliers.</p>
                <div className="reward-badge">0.5x - 2.0x multiplier</div>
              </div>
              <div className="earning-item">
                <div className="earning-icon">🎯</div>
                <h3>Reputation</h3>
                <p>Build your reputation with quality contributions for skill and reputation bonuses.</p>
                <div className="reward-badge">+10-50% bonus</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="tab-panel">
            <h2>Recent Transactions</h2>
            <div className="transactions-list">
              {transactions && transactions.length > 0 ? (
                <table className="transactions-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Description</th>
                      <th>Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map(tx => (
                      <tr key={tx.id}>
                        <td><span className="tx-type">{tx.type}</span></td>
                        <td className={tx.netAmount > 0 ? 'positive' : 'negative'}>
                          {tx.netAmount > 0 ? '+' : ''}{tx.netAmount.toFixed(2)}
                        </td>
                        <td>{tx.description}</td>
                        <td>{new Date(tx.createdAt).toLocaleDateString()}</td>
                        <td><span className={`status ${tx.status.toLowerCase()}`}>{tx.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="empty-state">No transactions yet</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'badges' && (
          <div className="tab-panel">
            <h2>Your Badges</h2>
            <div className="badges-grid">
              {badges && badges.length > 0 ? (
                badges.map(badge => (
                  <div key={badge.id} className={`badge-card rarity-${badge.rarity?.toLowerCase() || 'common'}`}>
                    {badge.iconUrl && <img src={badge.iconUrl} alt={badge.name} className="badge-icon" />}
                    <h4>{badge.name}</h4>
                    <p>{badge.description}</p>
                    <div className="badge-meta">
                      <span className="badge-type">{badge.type}</span>
                      <span className="badge-multiplier">×{badge.valueMultiplier}</span>
                    </div>
                    <p className="earned-date">Earned {new Date(badge.earnedAt).toLocaleDateString()}</p>
                  </div>
                ))
              ) : (
                <p className="empty-state">No badges earned yet. Start engaging to earn badges!</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
