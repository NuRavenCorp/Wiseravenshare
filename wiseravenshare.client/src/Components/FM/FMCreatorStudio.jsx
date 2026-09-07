import React, { useEffect, useMemo, useState } from 'react';
import { FiLoader, FiLock, FiRadio, FiSave } from 'react-icons/fi';
import { fmService } from '../../Services/fmService';

const defaultForm = {
  name: '',
  description: '',
  frequency: '',
  band: 'ONLINE',
  genre: 'Talk',
  subGenre: '',
  website: '',
  visibility: 'Public',
  allowChat: true,
  allowRequests: true,
  allowShoutouts: true,
  claimProprietaryFrequency: true
};

const FMCreatorStudio = () => {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(defaultForm);

  const loadStations = async () => {
    setLoading(true);
    setError('');
    try {
      const items = await fmService.getMyCreatorStations();
      setStations(items);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Unable to load creator stations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStations();
  }, []);

  const canCreate = useMemo(() => form.name.trim().length > 0 && form.genre.trim().length > 0, [form.name, form.genre]);

  const patch = (next) => setForm((prev) => ({ ...prev, ...next }));

  const createStation = async () => {
    if (!canCreate || saving) return;
    setSaving(true);
    setError('');
    try {
      const created = await fmService.createCreatorStation(form);
      setStations((prev) => [created, ...prev]);
      setForm(defaultForm);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Station creation failed.');
    } finally {
      setSaving(false);
    }
  };

  const toggleLive = async (station) => {
    try {
      if (station.isLive) {
        await fmService.endCreatorStationLive(station.id);
      } else {
        await fmService.startCreatorStationLive(station.id);
      }
      await loadStations();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Unable to update live status.');
    }
  };

  return (
    <section className="fm-creator-studio">
      <div className="fm-creator-form">
        <div className="fm-creator-head">
          <h4>Creator Radio Studio</h4>
          <span><FiLock /> Proprietary frequency integrity enforced</span>
        </div>

        <div className="fm-creator-grid">
          <label>
            Station name
            <input value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Station name" />
          </label>
          <label>
            Frequency
            <input value={form.frequency} onChange={(e) => patch({ frequency: e.target.value })} placeholder="Auto-assigned if blank" />
          </label>
          <label>
            Band
            <select value={form.band} onChange={(e) => patch({ band: e.target.value })}>
              <option value="ONLINE">Online</option>
              <option value="FM">FM</option>
              <option value="AM">AM</option>
            </select>
          </label>
          <label>
            Genre
            <input value={form.genre} onChange={(e) => patch({ genre: e.target.value })} placeholder="Talk, Hip-Hop, Gospel..." />
          </label>
          <label>
            Sub-genre
            <input value={form.subGenre} onChange={(e) => patch({ subGenre: e.target.value })} />
          </label>
          <label>
            Website
            <input value={form.website} onChange={(e) => patch({ website: e.target.value })} placeholder="https://..." />
          </label>
          <label>
            Visibility
            <select value={form.visibility} onChange={(e) => patch({ visibility: e.target.value })}>
              <option value="Public">Public</option>
              <option value="Unlisted">Unlisted</option>
              <option value="Private">Private</option>
              <option value="SubscribersOnly">Subscribers only</option>
            </select>
          </label>
          <label className="fm-creator-check">
            <input type="checkbox" checked={form.claimProprietaryFrequency} onChange={(e) => patch({ claimProprietaryFrequency: e.target.checked })} />
            Lock proprietary ownership for this frequency
          </label>
        </div>

        <label>
          Description
          <textarea value={form.description} onChange={(e) => patch({ description: e.target.value })} rows={2} />
        </label>

        <div className="fm-creator-check-row">
          <label><input type="checkbox" checked={form.allowChat} onChange={(e) => patch({ allowChat: e.target.checked })} /> Chat</label>
          <label><input type="checkbox" checked={form.allowRequests} onChange={(e) => patch({ allowRequests: e.target.checked })} /> Requests</label>
          <label><input type="checkbox" checked={form.allowShoutouts} onChange={(e) => patch({ allowShoutouts: e.target.checked })} /> Shoutouts</label>
        </div>

        <button type="button" className="fm-btn fm-btn-primary" onClick={createStation} disabled={!canCreate || saving}>
          {saving ? <FiLoader className="spin" /> : <FiSave />} Create station
        </button>
      </div>

      <div className="fm-creator-list">
        <h4>Your stations</h4>
        {loading && <div className="fm-empty"><FiLoader className="spin" /> Loading stations…</div>}
        {!loading && stations.length === 0 && <div className="fm-empty">No stations yet.</div>}

        {!loading && stations.map((station) => (
          <article key={station.id} className="fm-creator-card">
            <div>
              <strong>{station.name}</strong>
              <small>{station.frequency} · {station.band} · {station.status}</small>
              <small>{station.followerCount} followers · {station.listeners} listeners</small>
            </div>
            <div className="fm-creator-actions">
              <span className={`fm-live-state ${station.isLive ? 'live' : ''}`}>{station.isLive ? 'LIVE' : 'OFF AIR'}</span>
              <button type="button" className="fm-icon-btn play" onClick={() => toggleLive(station)}>
                <FiRadio />
              </button>
            </div>
          </article>
        ))}
      </div>

      {error && <div className="fm-error-banner">{error}</div>}
    </section>
  );
};

export default FMCreatorStudio;
