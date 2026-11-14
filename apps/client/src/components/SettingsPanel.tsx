import { audio } from '../game/audio/AudioEngine';
import { useGame } from '../store/gameStore';
import { useSettings, type Quality } from '../store/settingsStore';
import type { TrafficDensity } from '@highway-rush/shared';

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={o.value === value ? 'active' : ''}
          onClick={() => {
            audio.ui('click');
            onChange(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Slider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="slider">
      <input type="range" min={0} max={1} step={0.05} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span>{Math.round(value * 100)}</span>
    </div>
  );
}

export function SettingsPanel() {
  const settings = useSettings();
  const close = useGame((s) => s.setSettingsOpen);
  const inRace = useGame((s) => s.screen === 'race');

  return (
    <div className="modal-backdrop" onClick={() => close(false)}>
      <div className="panel settings-panel" onClick={(e) => e.stopPropagation()}>
        <h2>SETTINGS</h2>
        <div className="settings-grid">
          <label>Graphics quality</label>
          <Segmented<Quality>
            value={settings.quality}
            options={[
              { value: 'low', label: 'LOW' },
              { value: 'medium', label: 'MEDIUM' },
              { value: 'high', label: 'HIGH' },
            ]}
            onChange={(quality) => settings.set({ quality })}
          />
          <label>Traffic density</label>
          <Segmented<TrafficDensity>
            value={settings.trafficDensity}
            options={[
              { value: 'low', label: 'LIGHT' },
              { value: 'medium', label: 'NORMAL' },
              { value: 'high', label: 'RUSH HOUR' },
            ]}
            onChange={(trafficDensity) => settings.set({ trafficDensity })}
          />
          <label>Master volume</label>
          <Slider value={settings.masterVolume} onChange={(masterVolume) => settings.set({ masterVolume })} />
          <label>Effects volume</label>
          <Slider value={settings.sfxVolume} onChange={(sfxVolume) => settings.set({ sfxVolume })} />
          <label>Music volume</label>
          <Slider value={settings.musicVolume} onChange={(musicVolume) => settings.set({ musicVolume })} />
          <label>Radar mini-map</label>
          <Segmented<'on' | 'off'>
            value={settings.showMinimap ? 'on' : 'off'}
            options={[
              { value: 'on', label: 'ON' },
              { value: 'off', label: 'OFF' },
            ]}
            onChange={(v) => settings.set({ showMinimap: v === 'on' })}
          />
          <label>Touch controls</label>
          <Segmented<'auto' | 'on' | 'off'>
            value={settings.touchControls}
            options={[
              { value: 'auto', label: 'AUTO' },
              { value: 'on', label: 'ON' },
              { value: 'off', label: 'OFF' },
            ]}
            onChange={(touchControls) => settings.set({ touchControls })}
          />
        </div>
        {inRace && <p className="hint">Traffic density applies from the next race.</p>}
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            audio.ui('back');
            close(false);
          }}
        >
          DONE
        </button>
      </div>
    </div>
  );
}
