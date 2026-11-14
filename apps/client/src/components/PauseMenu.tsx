import { audio } from '../game/audio/AudioEngine';
import { useGame } from '../store/gameStore';

export function PauseMenu({ onResume, onRestart, onQuit, online }: { onResume: () => void; onRestart: () => void; onQuit: () => void; online?: boolean }) {
  const openSettings = useGame((s) => s.setSettingsOpen);
  const click = (fn: () => void) => () => {
    audio.ui('click');
    fn();
  };
  return (
    <div className="modal-backdrop pause">
      <div className="panel pause-panel">
        <h2>{online ? 'MENU' : 'PAUSED'}</h2>
        {online && <p className="hint">Online races never pause — the race continues while this menu is open and your bike won't be steered.</p>}
        <button type="button" className="btn primary" onClick={click(onResume)}>
          RESUME
        </button>
        {!online && (
          <button type="button" className="btn" onClick={click(onRestart)}>
            RESTART RACE
          </button>
        )}
        <button type="button" className="btn" onClick={click(() => openSettings(true))}>
          SETTINGS
        </button>
        <button type="button" className="btn ghost" onClick={click(onQuit)}>
          {online ? 'LEAVE RACE' : 'QUIT TO MENU'}
        </button>
        <ControlsCheatSheet />
      </div>
    </div>
  );
}

export function ControlsCheatSheet() {
  const rows: Array<[string, string]> = [
    ['W / ↑', 'Accelerate'],
    ['S / ↓', 'Brake'],
    ['A D / ← →', 'Steer'],
    ['Shift', 'Nitro'],
    ['E', 'Wheelie stunt'],
    ['J', 'Punch'],
    ['Space', 'Kick'],
    ['K', 'Weapon swing (grab a crate first)'],
    ['L', 'Block (hold)'],
    ['Esc / P', 'Pause'],
  ];
  return (
    <div className="controls-sheet">
      {rows.map(([k, v]) => (
        <div key={k} className="control-row">
          <kbd>{k}</kbd>
          <span>{v}</span>
        </div>
      ))}
    </div>
  );
}
