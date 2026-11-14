import { useState } from 'react';
import { BIKES, MAPS, type TrafficDensity } from '@highway-rush/shared';
import { audio } from '../game/audio/AudioEngine';
import { BikePicker } from '../components/BikePicker';
import { network } from '../multiplayer/network';
import { useNet } from '../multiplayer/netStore';
import { useGame } from '../store/gameStore';

const DENSITY_LABELS: Array<{ value: TrafficDensity; label: string }> = [
  { value: 'low', label: 'LIGHT' },
  { value: 'medium', label: 'NORMAL' },
  { value: 'high', label: 'RUSH HOUR' },
];

function statusLine(lobby: NonNullable<ReturnType<typeof useNet.getState>['lobby']>) {
  const connected = lobby.players.filter((p) => p.connected);
  const waitingFor = connected.filter((p) => !p.ready);
  if (lobby.phase === 'loading') return 'Loading race…';
  if (lobby.startingIn !== null) return `Race starts in ${lobby.startingIn}…`;
  if (connected.length < lobby.minPlayers) return `Waiting for riders — need ${lobby.minPlayers} to start`;
  if (waitingFor.length) return `Waiting for ${waitingFor.map((p) => p.name).join(', ')} to ready up`;
  return 'Starting…';
}

export function LobbyPage() {
  const { lobby, youId, ping } = useNet();
  const setScreen = useGame((s) => s.setScreen);
  const [copied, setCopied] = useState(false);

  if (!lobby || !youId) {
    return (
      <div className="select-screen lobby-screen">
        <div className="menu-bg" />
        <div className="lobby-loading">CONNECTING TO LOBBY…</div>
      </div>
    );
  }

  const me = lobby.players.find((p) => p.id === youId);
  const isHost = lobby.hostId === youId;
  const locked = lobby.phase !== 'lobby';
  const slots = Array.from({ length: lobby.maxPlayers }, (_, i) => lobby.players[i] ?? null);

  const leave = async () => {
    audio.ui('back');
    await network.leave();
    setScreen('online');
  };

  const copy = async () => {
    audio.ui('click');
    try {
      await navigator.clipboard.writeText(lobby.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable (non-secure context): the code is on screen */
    }
  };

  return (
    <div className="select-screen lobby-screen">
      <div className="menu-bg" />
      <div className="menu-grid-floor" />

      <header className="select-header">
        <button type="button" className="btn ghost small" onClick={leave}>
          ← LEAVE
        </button>
        <h2>{lobby.isPrivate ? 'PRIVATE ROOM' : 'QUICK RACE LOBBY'}</h2>
        <button type="button" className="code-chip" onClick={copy} title="Copy room code">
          <span>ROOM CODE</span>
          <b>{lobby.code}</b>
          <em>{copied ? 'COPIED' : 'COPY'}</em>
        </button>
        <span className="ping-chip">{ping ? `${Math.round(ping)} ms` : '— ms'}</span>
      </header>

      <section className="lobby-players">
        {slots.map((p, i) => {
          const bike = p ? BIKES[p.bikeId] : null;
          return (
            <div key={i} className={`lobby-slot ${p ? '' : 'empty'} ${p?.id === youId ? 'me' : ''} ${p && !p.connected ? 'offline' : ''}`}>
              {p && bike ? (
                <>
                  <div className="slot-avatar" style={{ background: bike.colors.primary }}>
                    {p.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="slot-info">
                    <span className="slot-name">
                      {p.name}
                      {p.id === youId && <small> (YOU)</small>}
                      {p.id === lobby.hostId && <span className="slot-host">HOST</span>}
                    </span>
                    <span className="slot-bike">
                      {bike.name} · {bike.bikeClass}
                    </span>
                  </div>
                  <span className={`slot-ready ${p.ready ? 'on' : ''}`}>{!p.connected ? 'OFFLINE' : p.ready ? 'READY' : 'NOT READY'}</span>
                </>
              ) : (
                <span className="slot-empty">
                  {lobby.fillWithBots ? 'AI RIDER WILL FILL THIS SLOT' : 'WAITING FOR RIDER…'}
                </span>
              )}
            </div>
          );
        })}
        <div className="lobby-status">{statusLine(lobby)}</div>
      </section>

      <aside className="lobby-panel panel">
        <div className="hub-label">YOUR BIKE</div>
        <BikePicker value={me?.bikeId ?? 'viper'} onChange={(id) => network.setBike(id)} disabled={locked || !!me?.ready} />

        <div className="hub-label">TRACK</div>
        <div className="map-list">
          {MAPS.map((m) => (
            <div key={m.id} className={`map-row ${m.id === lobby.mapId ? 'active' : ''} ${m.playable ? '' : 'soon'}`}>
              <b>{m.name}</b>
              <span>{m.playable ? m.tagline : 'Coming soon'}</span>
            </div>
          ))}
        </div>

        <div className="hub-label">RACE RULES {isHost ? '' : '(HOST CONTROLS)'}</div>
        <div className="segmented">
          {DENSITY_LABELS.map((d) => (
            <button
              key={d.value}
              type="button"
              disabled={!isHost || locked}
              className={lobby.trafficDensity === d.value ? 'active' : ''}
              onClick={() => network.setSettings({ trafficDensity: d.value })}
            >
              {d.label}
            </button>
          ))}
        </div>
        <label className={`toggle-row ${!isHost || locked ? 'disabled' : ''}`}>
          <input type="checkbox" checked={lobby.fillWithBots} disabled={!isHost || locked} onChange={(e) => network.setSettings({ fillWithBots: e.target.checked })} />
          <span>Fill empty slots with AI riders (clearly labelled)</span>
        </label>

        <button
          type="button"
          className={`btn big ${me?.ready ? '' : 'primary'}`}
          disabled={locked || !me}
          onClick={() => {
            audio.unlock();
            audio.ui('click');
            network.setReady(!me?.ready);
          }}
        >
          {me?.ready ? 'CANCEL READY' : 'READY UP'}
        </button>
        <p className="hint">The race starts once everyone is ready{lobby.minPlayers > 1 ? ` (at least ${lobby.minPlayers} riders)` : ''}.</p>
      </aside>
    </div>
  );
}
