import React, { useState, useCallback } from 'react';
import { featureReleaseAdminService } from '../Services/featureReleaseAdminService';
import { useNotification } from '../Contexts/NotificationContext';

/**
 * PodcastGatewayTab
 *
 * Admin interface for releasing/gating all podcast control room features at once.
 * This is the primary admin flow for managing podcast capability across the platform.
 *
 * Features managed:
 * - Guided Studio Flow
 * - Podcast Pro Bundle
 * - Podcast Analytics
 * - Team Workflows
 *
 * Admins:
 * - Don't need to pay for any feature releases
 * - Can release all podcast features to eligible users at once
 * - Can gate all podcast features for maintenance/rollback
 */

const PodcastGatewayTab = ({ loadCatalog }) => {
  const { addToast } = useNotification();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  const podcastFeatures = [
    {
      key: 'guided-studio-flow',
      name: 'Guided Studio Flow',
      desc: 'Podcast workflow navigator: Plan → Script → Record → Ship.',
      tier: 'podcast-pro'
    },
    {
      key: 'podcast-pro-bundle',
      name: 'Podcast Pro Bundle',
      desc: 'Full access to all podcast studio capabilities.',
      tier: 'podcast-pro'
    },
    {
      key: 'podcast-analytics',
      name: 'Podcast Analytics',
      desc: 'Audience insights and trending content signals for podcasters.',
      tier: 'growth-suite'
    },
    {
      key: 'team-workflows',
      name: 'Team Workflows',
      desc: 'Multi-role approval chains, review lanes, and editor handoffs.',
      tier: 'studio-plus'
    },
  ];

  const enableAllPodcastFeatures = useCallback(async () => {
    if (!window.confirm(
      'Enable ALL podcast control room features for eligible users?\n\n' +
      'This releases:\n' +
      '- Guided Studio Flow\n' +
      '- Podcast Pro Bundle\n' +
      '- Podcast Analytics\n' +
      '- Team Workflows\n\n' +
      'Users will need appropriate subscription tier or admin privileges.'
    )) {
      return;
    }

    setLoading(true);
    try {
      const result = await featureReleaseAdminService.enablePodcastGateway(
        'Podcast control room enabled by administrator'
      );
      setStatus(result);
      addToast('✅ Podcast gateway enabled! All podcast features released.', 'success');
      if (loadCatalog) {
        await new Promise(resolve => setTimeout(resolve, 500));
        loadCatalog();
      }
    } catch (err) {
      addToast(err?.message || 'Failed to enable podcast gateway', 'error');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [addToast, loadCatalog]);

  const disableAllPodcastFeatures = useCallback(async () => {
    if (!window.confirm(
      'Disable ALL podcast control room features?\n\n' +
      'This gates all podcast features behind the "podcast-pro" tier.\n' +
      'Users will need a paid subscription or admin privileges to access.\n\n' +
      'Use this for maintenance or rollback.'
    )) {
      return;
    }

    setLoading(true);
    try {
      const result = await featureReleaseAdminService.disablePodcastGateway(
        'Podcast control room disabled by administrator for maintenance'
      );
      setStatus(result);
      addToast('🔒 Podcast gateway gated behind "podcast-pro" tier.', 'info');
      if (loadCatalog) {
        await new Promise(resolve => setTimeout(resolve, 500));
        loadCatalog();
      }
    } catch (err) {
      addToast(err?.message || 'Failed to disable podcast gateway', 'error');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [addToast, loadCatalog]);

  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      {/* Hero section */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.15), rgba(236, 72, 153, 0.08))',
        border: '1px solid rgba(168, 85, 247, 0.3)',
        borderRadius: '18px',
        padding: '32px 28px',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎙️</div>
        <div style={{
          fontSize: '22px',
          fontWeight: 800,
          color: '#e2e8f0',
          marginBottom: '8px'
        }}>
          Podcast Control Room Admin Gateway
        </div>
        <div style={{
          fontSize: '14px',
          color: '#cbd5e1',
          marginBottom: '20px',
          maxWidth: '600px',
          margin: '8px auto 20px'
        }}>
          Admins have automatic full access to all podcast studio capabilities without paying.
          Use this panel to release or gate podcast features for all eligible users across the platform.
        </div>
        <div style={{
          display: 'inline-flex',
          gap: '12px',
          flexWrap: 'wrap',
          justifyContent: 'center'
        }}>
          <button
            type="button"
            onClick={enableAllPodcastFeatures}
            disabled={loading}
            style={{
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: 700,
              borderRadius: '10px',
              border: '1px solid rgba(34, 197, 94, 0.5)',
              background: 'rgba(34, 197, 94, 0.15)',
              color: '#4ade80',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              transition: 'all 0.2s'
            }}
          >
            {loading ? '⏳ Processing…' : '🚀 Enable All Podcast Features'}
          </button>
          <button
            type="button"
            onClick={disableAllPodcastFeatures}
            disabled={loading}
            style={{
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: 700,
              borderRadius: '10px',
              border: '1px solid rgba(248, 113, 113, 0.5)',
              background: 'rgba(248, 113, 113, 0.15)',
              color: '#f87171',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              transition: 'all 0.2s'
            }}
          >
            {loading ? '⏳ Processing…' : '🔒 Gate All Podcast Features'}
          </button>
        </div>
      </div>

      {/* Status message */}
      {status && (
        <div style={{
          background: status.message?.includes('enabled')
            ? 'rgba(34, 197, 94, 0.08)'
            : 'rgba(248, 113, 113, 0.08)',
          border: status.message?.includes('enabled')
            ? '1px solid rgba(34, 197, 94, 0.3)'
            : '1px solid rgba(248, 113, 113, 0.3)',
          borderRadius: '12px',
          padding: '16px',
          color: status.message?.includes('enabled') ? '#4ade80' : '#f87171'
        }}>
          <div style={{ fontWeight: 700, marginBottom: '8px' }}>
            {status.message?.includes('enabled') ? '✅ Success' : '🔒 Updated'}
          </div>
          <div style={{ fontSize: '14px', lineHeight: 1.5 }}>
            {status.message}
          </div>
          <div style={{
            fontSize: '12px',
            color: '#cbd5e1',
            marginTop: '10px',
            paddingTop: '10px',
            borderTop: '1px solid currentColor',
            opacity: 0.7
          }}>
            Admin: {status.adminEmail} · {new Date().toLocaleString()}
          </div>
        </div>
      )}

      {/* Features list */}
      <div style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--border-color)',
        borderRadius: '16px',
        overflow: 'hidden'
      }}>
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#e2e8f0' }}>
              📋 Managed Features
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
              These {podcastFeatures.length} features are released/gated together as the podcast control room
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'transparent',
              color: '#94a3b8',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            {showDetails ? '▼ Hide' : '▶ Show'}
          </button>
        </div>

        {showDetails && (
          <div style={{ padding: '16px 20px', display: 'grid', gap: '12px' }}>
            {podcastFeatures.map((feature) => (
              <div key={feature.key} style={{
                borderRadius: '10px',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                padding: '12px',
                background: 'rgba(15, 23, 42, 0.4)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: '#e2e8f0', marginBottom: '4px' }}>
                      {feature.name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}>
                      {feature.desc}
                    </div>
                    <div style={{
                      fontSize: '11px',
                      color: '#64748b',
                      fontFamily: 'monospace',
                      display: 'inline-block',
                      background: 'rgba(15, 23, 42, 0.6)',
                      padding: '4px 8px',
                      borderRadius: '6px'
                    }}>
                      {feature.key} · requires: {feature.tier}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Admin privileges note */}
      <div style={{
        background: 'rgba(99, 102, 241, 0.08)',
        border: '1px solid rgba(99, 102, 241, 0.25)',
        borderRadius: '12px',
        padding: '16px 20px'
      }}>
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ fontSize: '18px', flexShrink: 0 }}>👑</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '13px', color: '#a5b4fc', marginBottom: '4px' }}>
              Admin Privileges
            </div>
            <ul style={{
              fontSize: '12px',
              color: '#cbd5e1',
              margin: '6px 0 0 0',
              paddingLeft: '20px'
            }}>
              <li>Admins automatically have full access to all podcast features</li>
              <li>No payment required for any feature releases</li>
              <li>Admin accounts bypass subscription tier gates</li>
              <li>You can release features for eligible users (non-admin) based on their tier</li>
              <li>All actions are logged with your email and timestamp</li>
            </ul>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--border-color)',
        borderRadius: '16px',
        padding: '20px'
      }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#e2e8f0', marginBottom: '16px' }}>
          ℹ️ How the Podcast Gateway Works
        </div>
        <div style={{ display: 'grid', gap: '12px' }}>
          <div style={{
            background: 'rgba(15, 23, 42, 0.4)',
            padding: '12px',
            borderRadius: '10px',
            fontSize: '13px',
            color: '#cbd5e1'
          }}>
            <div style={{ fontWeight: 700, marginBottom: '4px', color: '#60a5fa' }}>
              🟢 Enable All Podcast Features
            </div>
            <div>
              Releases all podcast features to users who have a valid podcast subscription tier
              (podcast-pro, studio-plus, growth-suite) or admin privileges. Free users won't see
              these features until they upgrade.
            </div>
          </div>

          <div style={{
            background: 'rgba(15, 23, 42, 0.4)',
            padding: '12px',
            borderRadius: '10px',
            fontSize: '13px',
            color: '#cbd5e1'
          }}>
            <div style={{ fontWeight: 700, marginBottom: '4px', color: '#f87171' }}>
              🔴 Gate All Podcast Features
            </div>
            <div>
              Locks all podcast features behind the "podcast-pro" tier. This is useful for:
              <ul style={{ marginTop: '6px', paddingLeft: '20px' }}>
                <li>Maintenance or updates</li>
                <li>Rolling back broken features</li>
                <li>Temporarily disabling podcasting across the platform</li>
              </ul>
            </div>
          </div>

          <div style={{
            background: 'rgba(15, 23, 42, 0.4)',
            padding: '12px',
            borderRadius: '10px',
            fontSize: '13px',
            color: '#cbd5e1'
          }}>
            <div style={{ fontWeight: 700, marginBottom: '4px', color: '#a78bfa' }}>
              🔐 Admin Auto-Access
            </div>
            <div>
              Your admin account automatically bypasses all feature gates. You can always access
              and test podcast features regardless of gate status. This applies to all admins
              configured in the system.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PodcastGatewayTab;
