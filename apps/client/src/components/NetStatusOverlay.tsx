import { audio } from '../game/audio/AudioEngine';
import { network } from '../multiplayer/network';
import { useNet } from '../multiplayer/netStore';
import { useGame } from '../store/gameStore';

/** Global overlay for connection loss while in an online lobby or race. */
export function NetStatusOverlay() {
  const status = useNet((s) => s.status);
  const error = useNet((s) => s.error);
  const screen = useGame((s) => s.screen);
  const setScreen = useGame((s) => s.setScreen);
  const online = screen === 'lobby' || (screen === 'race' && useGame.getState().raceMode === 'online');
  if (!online) return null;

  if (status === 'reconnecting') {
    return (
      <div className="modal-backdrop net-overlay">
        <div className="panel">
          <h2>RECONNECTING…</h2>
          <p className="hint">Connection interrupted. Your bike is being driven by AI while we get you back into the race.</p>
        </div>
      </div>
    );
  }
  if (status === 'disconnected') {
    return (
      <div className="modal-backdrop net-overlay">
        <div className="panel">
          <h2>DISCONNECTED</h2>
          <p className="hint">{error ?? 'You left the room.'}</p>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              audio.ui('back');
              void network.leave();
              setScreen('menu');
            }}
          >
            BACK TO MENU
          </button>
        </div>
      </div>
    );
  }
  return null;
}
