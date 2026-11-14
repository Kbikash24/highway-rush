import { useState } from 'react';
import { MAPS } from '@highway-rush/shared';
import { audio } from '../game/audio/AudioEngine';
import { BikeShowcase } from '../game/scenes/BikeShowcase';
import { useGame } from '../store/gameStore';
import { ControlsCheatSheet } from '../components/PauseMenu';

interface MenuItem {
  label: string;
  sub: string;
  action?: () => void;
  phase?: string;
}

export function MainMenu() {
  const { setScreen, setSettingsOpen, selectedBike } = useGame();
  const [showControls, setShowControls] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const comingSoon = (label: string, phase: string) => () => {
    audio.ui('back');
    setToast(`${label} unlocks in ${phase}. This build focuses on the core racing prototype.`);
    window.setTimeout(() => setToast(null), 3200);
  };

  const items: MenuItem[] = [
    { label: 'SOLO RACE', sub: 'Coastal Highway vs 3 AI rivals', action: () => setScreen('bikeSelect') },
    { label: 'QUICK RACE', sub: 'Online · find a public race', action: () => setScreen('online') },
    { label: 'PRIVATE ROOM', sub: 'Invite friends with a code', action: () => setScreen('online') },
    { label: 'CAMPAIGN', sub: 'Missions & boss races', phase: 'Phase 5' },
    { label: 'GARAGE', sub: 'Upgrades & paint', phase: 'Phase 5' },
    { label: 'SETTINGS', sub: 'Graphics · audio · controls', action: () => setSettingsOpen(true) },
  ];

  return (
    <div className="menu-screen" onPointerDown={() => audio.unlock()}>
      <div className="menu-bg" />
      <div className="menu-grid-floor" />
      <BikeShowcase bikeId={selectedBike} className="menu-showcase" />

      <div className="menu-content">
        <h1 className="logo" data-text="HIGHWAY RUSH">
          <span className="logo-highway">HIGHWAY</span>
          <span className="logo-rush">RUSH</span>
        </h1>
        <p className="tagline">Ride fast. Ride dirty. Nobody brakes.</p>

        <nav className="menu-list">
          {items.map((item, i) => (
            <button
              key={item.label}
              type="button"
              className={`menu-item ${item.phase ? 'locked' : ''}`}
              style={{ animationDelay: `${0.15 + i * 0.06}s` }}
              onMouseEnter={() => audio.ui('hover')}
              onClick={() => {
                audio.unlock();
                if (item.action) {
                  audio.ui('click');
                  item.action();
                } else comingSoon(item.label, item.phase!)();
              }}
            >
              <span className="menu-item-label">{item.label}</span>
              <span className="menu-item-sub">{item.sub}</span>
              {item.phase && <span className="menu-badge">{item.phase}</span>}
            </button>
          ))}
        </nav>

        <button type="button" className="link-btn" onClick={() => setShowControls((v) => !v)}>
          {showControls ? 'Hide controls' : 'Show controls'}
        </button>
        {showControls && <ControlsCheatSheet />}
      </div>

      <div className="menu-maps">
        {MAPS.map((m) => (
          <div key={m.id} className={`map-chip ${m.playable ? 'playable' : ''}`}>
            <b>{m.name}</b>
            <span>{m.playable ? m.tagline : 'Coming soon'}</span>
          </div>
        ))}
      </div>

      {toast && <div className="toast">{toast}</div>}
      <div className="build-tag">CREATED BY BIKASH K · v0.2</div>
    </div>
  );
}
