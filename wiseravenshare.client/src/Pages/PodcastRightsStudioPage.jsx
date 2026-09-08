import React, { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'wisePodcastRightsLibrary';

const licenseOptions = [
    { id: 'Owner-controlled', label: 'Owner-controlled', description: 'Creator retains all episode and transcript rights.' },
    { id: 'Creative Commons', label: 'Creative Commons', description: 'Licensed for attribution, non-commercial use.' },
    { id: 'Commercial licensing', label: 'Commercial licensing', description: 'Licensed for syndication, sponsorships, and paid distribution.' },
    { id: 'Custom agreement', label: 'Custom agreement', description: 'Tailored licensing for guest appearances and partnerships.' }
];

const seedLibrary = [
    {
        id: 'ep-001',
        title: 'The Future of Truth in Media',
        status: 'Protected',
        owner: 'You',
        episodeNumber: '001',
        duration: '45:32',
        format: 'Interview',
        rights: 'Full ownership retained',
        usage: 'Commercial distribution approved',
        fingerprint: 'SHA-256 hash saved locally',
        licenseType: 'Owner-controlled',
        category: 'Featured episode',
        cover: '🎙️',
        guests: ['Expert Guest'],
        transcriptHash: null
    },
    {
        id: 'ep-002',
        title: 'Creator Economy Roundtable',
        status: 'Protected',
        owner: 'You',
        episodeNumber: '002',
        duration: '38:15',
        format: 'Roundtable',
        rights: 'Exclusive episode rights reserved',
        usage: 'Licensed for partner platforms',
        fingerprint: 'SHA-256 hash saved locally',
        licenseType: 'Commercial licensing',
        category: 'Panel discussion',
        cover: '👥',
        guests: ['Guest 1', 'Guest 2', 'Guest 3'],
        transcriptHash: null
    }
];

const protectionTools = [
    'Private episode vault with owner metadata',
    'Audio fingerprint and transcript hash storage for provenance',
    'Guest appearance and credit tracking',
    'Custom licensing by episode or season',
    'Transcription rights and subtitle controls',
    'Guest release form and appearance agreement templates',
    'DMCA/Copyright takedown evidence package export'
];

const rightsChecklist = [
    'Creator retains ownership of all podcast content and intellectual property',
    'Guest appearances and guest rights are documented and tracked',
    'Transcript ownership is controlled and protected',
    'Distribution rights remain attached to each episode',
    'No centralized platform controls your show or archive',
    'Full audit trail and proof of authorship for all episodes'
];

const contractBundles = [
    {
        id: 'guest-release',
        name: 'Guest Release Bundle',
        price: '$29',
        cadence: 'Per Guest',
        description: 'Professional guest appearance release forms and consent agreements.',
        included: ['Standard guest release form', 'Appearance consent document', 'Recording rights confirmation', 'Credit/attribution terms']
    },
    {
        id: 'licensing-kit',
        name: 'Episode Licensing Kit',
        price: '$99',
        cadence: 'Per Season',
        description: 'Complete licensing templates for commercial distribution and syndication.',
        included: ['Commercial licensing agreement', 'Syndication rights templates', 'Sponsorship disclosure guide', 'Episode audit trail']
    },
    {
        id: 'full-protection',
        name: 'Full Protection Suite',
        price: '$249',
        cadence: 'Annual',
        description: 'Everything needed to protect your show: guests, licensing, transcripts, and legal support.',
        included: ['Unlimited guest releases', 'Full licensing suite', 'Transcript protection agreements', 'Priority Rocket Lawyer support', 'Annual rights audit']
    }
];

const MusicRightsStudioPage = ({ user, onNavigate }) => {
    const [library, setLibrary] = useState(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return seedLibrary;
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) && parsed.length ? parsed : seedLibrary;
        } catch {
            return seedLibrary;
        }
    });
    const [selectedId, setSelectedId] = useState('ep-001');
    const [selectedContract, setSelectedContract] = useState(contractBundles[1].id);
    const [isUploading, setIsUploading] = useState(false);
    const [userHasContent, setUserHasContent] = useState(false);
    const [showUploadPrompt, setShowUploadPrompt] = useState(false);

    useEffect(() => {
        const active = library.some((entry) => entry.id === selectedId);
        if (!active && library[0]) {
            setSelectedId(library[0].id);
        }
    }, [library, selectedId]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
    }, [library]);

    // Check if user has any user-created content (non-seed library)
    useEffect(() => {
        const hasUserCreated = library.some((entry) => entry.isUserCreated || !seedLibrary.some((seed) => seed.id === entry.id));
        setUserHasContent(hasUserCreated);
    }, [library]);

    const selectedAsset = useMemo(
        () => library.find((entry) => entry.id === selectedId) || library[0] || seedLibrary[0],
        [library, selectedId]
    );

    const updateSelectedAsset = (changes) => {
        setLibrary((prev) => prev.map((entry) => entry.id === selectedAsset?.id ? { ...entry, ...changes } : entry));
    };

    const addNewEpisode = () => {
        const nextEntry = {
            id: `ep-${Date.now()}`,
            title: `Episode ${library.length + 1}`,
            status: 'Protected',
            owner: user?.name || 'You',
            episodeNumber: String(library.length + 1).padStart(3, '0'),
            duration: '00:00',
            format: 'Solo',
            rights: 'Master retained by creator',
            usage: 'Creator-controlled distribution',
            fingerprint: 'Hash generated on upload',
            licenseType: 'Owner-controlled',
            category: 'New episode',
            cover: '🎙️',
            guests: [],
            transcriptHash: null,
            isUserCreated: true
        };

        setLibrary((prev) => [nextEntry, ...prev]);
        setSelectedId(nextEntry.id);
        setUserHasContent(true);
        setShowUploadPrompt(true);
    };

    const handleEpisodeUpload = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            setIsUploading(true);
            const buffer = await file.arrayBuffer();
            const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
            const hashHex = Array.from(new Uint8Array(hashBuffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');

            const nextEntry = {
                id: `ep-${Date.now()}`,
                title: file.name.replace(/\.[^/.]+$/, '') || 'Uploaded episode',
                status: 'Protected',
                owner: user?.name || 'You',
                episodeNumber: String(library.filter((e) => e.isUserCreated).length + 1).padStart(3, '0'),
                duration: '00:00',
                format: 'Solo',
                rights: 'Master retained by creator',
                usage: 'Creator-controlled distribution',
                fingerprint: `SHA-256: ${hashHex}`,
                licenseType: 'Owner-controlled',
                category: 'Uploaded episode',
                cover: '🎧',
                guests: [],
                transcriptHash: null,
                isUserCreated: true
            };

            setLibrary((prev) => [nextEntry, ...prev]);
            setSelectedId(nextEntry.id);
            setShowUploadPrompt(true);
        } catch (error) {
            console.error('Upload failed', error);
        } finally {
            setIsUploading(false);
            event.target.value = '';
        }
    };

    const handleExportRightsPacket = () => {
        if (!selectedAsset) return;

        const packet = {
            title: selectedAsset.title,
            episodeNumber: selectedAsset.episodeNumber,
            owner: selectedAsset.owner,
            format: selectedAsset.format,
            duration: selectedAsset.duration,
            guests: selectedAsset.guests || [],
            status: selectedAsset.status,
            rights: selectedAsset.rights,
            usage: selectedAsset.usage,
            licenseType: selectedAsset.licenseType,
            audioFingerprint: selectedAsset.fingerprint,
            transcriptHash: selectedAsset.transcriptHash,
            exportedAt: new Date().toISOString(),
            notice: 'Creator retains ownership of the original podcast content. This packet is evidence and a local licensing summary including guest credits and distribution rights.'
        };

        const blob = new Blob([JSON.stringify(packet, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${selectedAsset.episodeNumber}-${String(selectedAsset.title).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-rights-packet.json`;
        anchor.click();
        URL.revokeObjectURL(url);
    };

    const handleStripeCheckout = (contract) => {
        setSelectedContract(contract.id);
        const rocketLawyerUrl = 'https://www.rocketlawyer.com/podcaster-contracts';
        if (typeof window !== 'undefined') {
            window.open(rocketLawyerUrl, '_blank', 'noopener,noreferrer');
        }
    };

    const slugify = (value) => String(value || 'ep-packet').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'ep-packet';

    return (
        <section style={{ display: 'grid', gap: '18px' }}>
            <div
                style={{
                    background: 'linear-gradient(140deg, rgba(21, 31, 53, 0.9), rgba(29, 48, 76, 0.88))',
                    border: '1px solid var(--border-color)',
                    borderRadius: '18px',
                    padding: '20px',
                    boxShadow: '0 16px 36px rgba(0, 0, 0, 0.2)'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                    <div>
                        <div style={{ fontSize: '12px', color: '#67e8f9', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '8px' }}>
                            Local-first podcast rights
                        </div>
                        <h2 style={{ margin: 0, fontSize: '30px' }}>Podcast Rights Studio</h2>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <button
                            type="button"
                            onClick={addNewEpisode}
                            style={{
                                background: 'linear-gradient(135deg, var(--highlight-color), var(--accent-color))',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '999px',
                                padding: '10px 18px',
                                fontWeight: 700,
                                cursor: 'pointer'
                            }}
                        >
                            Add episode
                        </button>
                        <label
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '1px solid var(--border-color)',
                                borderRadius: '999px',
                                padding: '9px 16px',
                                color: 'var(--text-color)',
                                background: 'rgba(15, 23, 42, 0.42)',
                                cursor: 'pointer',
                                fontWeight: 600
                            }}
                        >
                            {isUploading ? 'Uploading...' : 'Upload episode'}
                            <input type="file" accept="audio/*" onChange={handleEpisodeUpload} style={{ display: 'none' }} />
                        </label>
                    </div>
                </div>
                <p style={{ margin: '12px 0 0', color: 'var(--light-color)', lineHeight: 1.6, maxWidth: '900px' }}>
                    Keep your podcast episodes, transcripts, guest credits, and distribution rights secure and under your complete control. No platform can claim ownership of your show.
                </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 320px) minmax(0, 1fr)', gap: '18px' }}>
                <div
                    style={{
                        background: 'var(--card-bg)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '16px',
                        padding: '16px'
                    }}
                >
                    <div style={{ fontSize: '12px', color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '12px' }}>
                        Episode vault
                    </div>
                    {library.map((entry) => (
                        <button
                            key={entry.id}
                            type="button"
                            onClick={() => setSelectedId(entry.id)}
                            style={{
                                width: '100%',
                                textAlign: 'left',
                                border: selectedAsset?.id === entry.id ? '1px solid var(--highlight-color)' : '1px solid var(--border-color)',
                                background: selectedAsset?.id === entry.id ? 'rgba(59, 130, 246, 0.08)' : 'rgba(15, 23, 42, 0.42)',
                                borderRadius: '12px',
                                color: 'var(--text-color)',
                                padding: '12px',
                                marginBottom: '10px',
                                cursor: 'pointer'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ fontSize: '22px' }}>{entry.cover}</div>
                                    <div>
                                        <div style={{ fontWeight: 700 }}>{entry.episodeNumber} — {entry.title}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--light-color)' }}>{entry.format} • {entry.duration}</div>
                                    </div>
                                </div>
                                <span
                                    style={{
                                        borderRadius: '999px',
                                        padding: '5px 8px',
                                        fontSize: '11px',
                                        background: entry.status === 'Protected' ? 'rgba(34, 197, 94, 0.12)' : entry.status === 'Review' ? 'rgba(251, 191, 36, 0.12)' : 'rgba(148, 163, 184, 0.12)',
                                        color: entry.status === 'Protected' ? '#86efac' : entry.status === 'Review' ? '#fbbf24' : '#cbd5e1'
                                    }}
                                >
                                    {entry.status}
                                </span>
                            </div>
                        </button>
                    ))}
                </div>

                <div style={{ display: 'grid', gap: '18px' }}>
                    <div
                        style={{
                            background: 'var(--card-bg)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '16px',
                            padding: '18px'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                            <div>
                                <div style={{ fontSize: '12px', color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                                    Episode proof
                                </div>
                                <h3 style={{ margin: '8px 0 0', fontSize: '24px' }}>Ep. {selectedAsset?.episodeNumber} — {selectedAsset?.title}</h3>
                            </div>
                            <button
                                type="button"
                                onClick={handleExportRightsPacket}
                                style={{
                                    border: '1px solid var(--highlight-color)',
                                    background: 'transparent',
                                    color: 'var(--text-color)',
                                    borderRadius: '999px',
                                    padding: '8px 12px',
                                    cursor: 'pointer'
                                }}
                            >
                                Export rights packet
                            </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginTop: '18px' }}>
                            <StatBox label="Owner" value={selectedAsset?.owner || 'You'} />
                            <StatBox label="Format" value={selectedAsset?.format || 'Solo'} />
                            <StatBox label="Duration" value={selectedAsset?.duration || '00:00'} />
                            <StatBox label="License" value={selectedAsset?.licenseType || 'Owner-controlled'} />
                        </div>

                        <div style={{ marginTop: '18px', padding: '12px 14px', borderRadius: '12px', background: 'rgba(15, 23, 42, 0.5)', border: '1px solid var(--border-color)' }}>
                            <div style={{ fontSize: '12px', color: '#93c5fd', marginBottom: '8px' }}>Audio fingerprint</div>
                            <div style={{ color: 'var(--text-color)', lineHeight: 1.6, fontSize: '12px', wordBreak: 'break-all' }}>{selectedAsset?.fingerprint}</div>
                        </div>

                        {selectedAsset?.guests && selectedAsset.guests.length > 0 && (
                            <div style={{ marginTop: '18px', padding: '12px 14px', borderRadius: '12px', background: 'rgba(15, 23, 42, 0.5)', border: '1px solid var(--border-color)' }}>
                                <div style={{ fontSize: '12px', color: '#93c5fd', marginBottom: '8px' }}>Guests / credits</div>
                                <div style={{ color: 'var(--text-color)', lineHeight: 1.6 }}>
                                    {selectedAsset.guests.join(' • ')}
                                </div>
                            </div>
                        )}

                        <div style={{ marginTop: '18px' }}>
                            <div style={{ fontSize: '12px', color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '10px' }}>
                                Episode license
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                                {licenseOptions.map((option) => (
                                    <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => updateSelectedAsset({
                                            licenseType: option.id,
                                            rights: option.id === 'Owner-controlled' ? 'Master retained by creator' : option.id === 'Creative Commons' ? 'CC-licensed attribution required' : option.id === 'Commercial licensing' ? 'Licensed for syndication and commercial use' : 'Custom guest and partnership agreement',
                                            usage: option.id === 'Owner-controlled' ? 'Creator-controlled distribution' : option.id === 'Creative Commons' ? 'Non-commercial use with attribution' : option.id === 'Commercial licensing' ? 'Commercial syndication and sponsorships' : 'Agreement-based usage terms'
                                        })}
                                        style={{
                                            borderRadius: '12px',
                                            border: selectedAsset?.licenseType === option.id ? '1px solid var(--highlight-color)' : '1px solid var(--border-color)',
                                            background: selectedAsset?.licenseType === option.id ? 'rgba(59, 130, 246, 0.08)' : 'rgba(15, 23, 42, 0.5)',
                                            color: 'var(--text-color)',
                                            textAlign: 'left',
                                            padding: '10px 12px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <div style={{ fontWeight: 700, marginBottom: '4px' }}>{option.label}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--light-color)', lineHeight: 1.3 }}>{option.description}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div
                        style={{
                            background: 'var(--card-bg)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '16px',
                            padding: '18px'
                        }}
                    >
                        <div style={{ fontSize: '12px', color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '12px' }}>
                            Protection tools
                        </div>
                        <ul style={{ margin: 0, paddingLeft: '18px', color: 'var(--light-color)', lineHeight: 1.8, fontSize: '13px' }}>
                            {protectionTools.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    </div>

                    <div
                        style={{
                            background: 'var(--card-bg)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '16px',
                            padding: '18px'
                        }}
                    >
                        <div style={{ fontSize: '12px', color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '12px' }}>
                            Rights model
                        </div>
                        <ul style={{ margin: 0, paddingLeft: '18px', color: 'var(--light-color)', lineHeight: 1.8, fontSize: '13px' }}>
                            {rightsChecklist.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    </div>

                    {userHasContent && showUploadPrompt && (
                        <div
                            style={{
                                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(34, 197, 94, 0.08))',
                                border: '1px solid rgba(59, 130, 246, 0.3)',
                                borderRadius: '16px',
                                padding: '18px'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                <div style={{ fontSize: '24px' }}>✨</div>
                                <div style={{ flex: 1 }}>
                                    <h4 style={{ margin: '0 0 6px', color: 'var(--text-color)' }}>Your episode is now protected</h4>
                                    <p style={{ margin: '0 0 12px', color: 'var(--light-color)', fontSize: '13px', lineHeight: 1.5 }}>
                                        Great! Your episode is secured with audio fingerprinting and guest tracking. Ready to add legal protection?
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => setShowUploadPrompt(false)}
                                        style={{
                                            border: '1px solid var(--highlight-color)',
                                            background: 'transparent',
                                            color: 'var(--text-color)',
                                            borderRadius: '999px',
                                            padding: '8px 14px',
                                            cursor: 'pointer',
                                            fontSize: '13px',
                                            fontWeight: 600
                                        }}
                                    >
                                        Explore legal protection →
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {userHasContent && (
                        <div
                            style={{
                                background: 'var(--card-bg)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '16px',
                                padding: '18px'
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                <div>
                                    <div style={{ fontSize: '12px', color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                                        Legal protection
                                    </div>
                                    <h3 style={{ margin: '8px 0 0', fontSize: '24px' }}>Secure guest rights & licensing</h3>
                                </div>
                                <a
                                    href="https://www.rocketlawyer.com/podcaster-contracts"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        fontSize: '12px',
                                        color: '#67e8f9',
                                        textDecoration: 'none',
                                        fontWeight: 600,
                                        borderBottom: '1px solid #67e8f9'
                                    }}
                                >
                                    via Rocket Lawyer
                                </a>
                            </div>

                            <p style={{ margin: '12px 0 16px', color: 'var(--light-color)', lineHeight: 1.5, fontSize: '13px' }}>
                                Protect guest rights, create licensing agreements, and ensure proper credits are tracked. Powered by Rocket Lawyer templates.
                            </p>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                                {contractBundles.map((contract) => (
                                    <div
                                        key={contract.id}
                                        style={{
                                            border: selectedContract === contract.id ? '1px solid var(--highlight-color)' : '1px solid var(--border-color)',
                                            borderRadius: '14px',
                                            background: selectedContract === contract.id ? 'rgba(59, 130, 246, 0.08)' : 'rgba(15, 23, 42, 0.45)',
                                            padding: '14px'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ fontWeight: 700 }}>{contract.name}</div>
                                            <span style={{ fontSize: '11px', color: '#86efac', background: 'rgba(34, 197, 94, 0.12)', borderRadius: '999px', padding: '4px 8px' }}>{contract.cadence}</span>
                                        </div>
                                        <div style={{ marginTop: '12px', fontSize: '28px', fontWeight: 800 }}>{contract.price}</div>
                                        <p style={{ margin: '10px 0', color: 'var(--light-color)', fontSize: '13px', lineHeight: 1.5 }}>{contract.description}</p>
                                        <ul style={{ margin: '0 0 14px', paddingLeft: '18px', color: 'var(--light-color)', lineHeight: 1.8, fontSize: '12px' }}>
                                            {contract.included.map((item) => (
                                                <li key={item}>{item}</li>
                                            ))}
                                        </ul>
                                        <button
                                            type="button"
                                            onClick={() => handleStripeCheckout(contract)}
                                            style={{
                                                width: '100%',
                                                border: '1px solid var(--highlight-color)',
                                                borderRadius: '999px',
                                                background: 'transparent',
                                                color: 'var(--text-color)',
                                                fontWeight: 700,
                                                padding: '10px 12px',
                                                cursor: 'pointer',
                                                fontSize: '12px'
                                            }}
                                        >
                                            {selectedContract === contract.id ? `View ${contractBundles.find((c) => c.id === selectedContract)?.name}` : 'Get Rocket Lawyer Template'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
};

const StatBox = ({ label, value }) => (
    <div
        style={{
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            background: 'rgba(15, 23, 42, 0.52)',
            padding: '12px 14px'
        }}
    >
        <div style={{ fontSize: '11px', color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
        <div style={{ marginTop: '8px', fontWeight: 700, lineHeight: 1.4, fontSize: '14px' }}>{value}</div>
    </div>
);

export default MusicRightsStudioPage;
