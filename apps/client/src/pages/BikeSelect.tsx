import { BIKE_LIST, BIKE_STAT_RANGES, BIKES, sanitizePlayerName, type BikeStats } from '@highway-rush/shared';
import { audio } from '../game/audio/AudioEngine';
import { BikeShowcase } from '../game/scenes/BikeShowcase';
import { useGame } from '../store/gameStore';
import { useSettings } from '../store/settingsStore';

const STAT_LABELS: Array<[keyof BikeStats, string]> = [
  ['topSpeed', 'TOP SPEED'],
  ['acceleration', 'ACCELERATION'],
  ['handling', 'HANDLING'],
  ['braking', 'BRAKING'],
  ['durability', 'DURABILITY'],
  ['nitroCapacity', 'NITRO TANK'],
];

export function BikeSelect() {
  const { selectedBike, selectBike, startRace, setScreen } = useGame();
  const playerName = useSettings((s) => s.playerName);
  const setSettings = useSettings((s) => s.set);
  const bike = BIKES[selectedBike];

  return (
    <div className="select-screen">
      <div className="menu-bg" />
      <div className="menu-grid-floor" />
      <BikeShowcase bikeId={selectedBike} className="select-showcase" />

      <header className="select-header">
        <button
          type="button"
          className="btn ghost small"
          onClick={() => {
            audio.ui('back');
            setScreen('menu');
          }}
        >
          ← BACK
        </button>
        <h2>CHOOSE YOUR RIDE</h2>
        <span className="select-map">COASTAL HIGHWAY · 5.0 KM</span>
      </header>

      <div className="bike-cards">
        {BIKE_LIST.map((b) => (
          <button
            key={b.id}
            type="button"
            className={`bike-card ${b.id === selectedBike ? 'active' : ''}`}
            style={{ ['--bike-color' as string]: b.colors.primary }}
            onMouseEnter={() => audio.ui('hover')}
            onClick={() => {
              audio.ui('click');
              selectBike(b.id);
            }}
          >
            <span className="bike-class">{b.bikeClass}</span>
            <span className="bike-name">{b.name}</span>
          </button>
        ))}
      </div>

      <aside className="bike-stats panel">
        <h3 style={{ color: bike.colors.primary }}>{bike.name}</h3>
        <p className="bike-desc">{bike.description}</p>
        {STAT_LABELS.map(([key, label]) => {
          const [min, max] = BIKE_STAT_RANGES[key];
          const frac = Math.max(0.05, Math.min(1, (bike.stats[key] - min) / (max - min)));
          return (
            <div key={key} className="stat-row">
              <span>{label}</span>
              <div className="stat-bar">
                <div style={{ width: `${frac * 100}%`, background: bike.colors.primary }} />
              </div>
            </div>
          );
        })}
        <label className="name-field">
          <span>RIDER NAME</span>
          <input
            value={playerName}
            maxLength={16}
            onChange={(e) => setSettings({ playerName: e.target.value })}
            onBlur={(e) => setSettings({ playerName: sanitizePlayerName(e.target.value) })}
          />
        </label>
        <button
          type="button"
          className="btn primary big"
          onClick={() => {
            audio.unlock();
            audio.ui('click');
            setSettings({ playerName: sanitizePlayerName(playerName) });
            startRace();
          }}
        >
          START RACE
        </button>
      </aside>
    </div>
  );
}
