import { useState } from 'react';
import { sanitizePlayerName } from '@highway-rush/shared';
import { audio } from '../game/audio/AudioEngine';
import { BikeShowcase } from '../game/scenes/BikeShowcase';
import { BikePicker } from '../components/BikePicker';
import { network } from '../multiplayer/network';
import { useNet } from '../multiplayer/netStore';
import { getServerUrl } from '../multiplayer/serverUrl';
import { useGame } from '../store/gameStore';
import { useSettings } from '../store/settingsStore';

/** Entry point for online play: quick match, create a private room, or join one by code. */
export function OnlineHub() {
  const { selectedBike, selectBike, setScreen } = useGame();
  const playerName = useSettings((s) => s.playerName);
  const setSettings = useSettings((s) => s.set);
  const { status, error } = useNet();
  const [code, setCode] = useState('');
  const busy = status === 'connecting';

  const profile = () => {
    const name = sanitizePlayerName(playerName);
    setSettings({ playerName: name });
    return { name, bikeId: selectedBike };
  };

  const run = async (fn: () => Promise<void>) => {
    audio.unlock();
    audio.ui('click');
    try {
      await fn();
      setScreen('lobby');
    } catch {
      // The error text is already in the net store and shown below.
    }
  };

  return (
    <div className="select-screen online-hub">
      <div className="menu-bg" />
      <div className="menu-grid-floor" />
      <BikeShowcase bikeId={selectedBike} className="select-showcase" />

      <header className="select-header">
        <button
          type="button"
          className="btn ghost small"
          onClick={() => {
            audio.ui('back');
            useNet.getState().reset();
            setScreen('menu');
          }}
        >
          ← BACK
        </button>
        <h2>ONLINE RACING</h2>
        <span className="select-map">COASTAL HIGHWAY · 2–4 RIDERS</span>
      </header>

      <aside className="hub-panel panel">
        <label className="name-field">
          <span>RIDER NAME</span>
          <input value={playerName} maxLength={16} onChange={(e) => setSettings({ playerName: e.target.value })} />
        </label>
        <div className="hub-label">YOUR BIKE</div>
        <BikePicker value={selectedBike} onChange={selectBike} />

        <button type="button" className="btn primary big" disabled={busy} onClick={() => run(() => network.quickMatch(profile()))}>
          {busy ? 'CONNECTING…' : 'QUICK MATCH'}
        </button>
        <p className="hint">Joins the next open public race, or opens a new one for others to find.</p>

        <button type="button" className="btn" disabled={busy} onClick={() => run(() => network.createPrivate(profile()))}>
          CREATE PRIVATE ROOM
        </button>

        <div className="code-row">
          <input
            value={code}
            maxLength={7}
            placeholder="ROOM CODE"
            spellCheck={false}
            autoCapitalize="characters"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && code) void run(() => network.joinCode(code, profile()));
            }}
          />
          <button type="button" className="btn" disabled={busy || code.length < 5} onClick={() => run(() => network.joinCode(code, profile()))}>
            JOIN
          </button>
        </div>

        {error && <div className="net-error">{error}</div>}
        <p className="hint server-url">Server: {getServerUrl()}</p>
      </aside>
    </div>
  );
}
