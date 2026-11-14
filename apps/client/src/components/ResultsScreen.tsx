import { audio } from '../game/audio/AudioEngine';
import type { RaceResults } from '../store/gameStore';
import { formatTime, ordinal } from '../utils/format';

export function ResultsScreen({ results, onRetry, onMenu }: { results: RaceResults; onRetry: () => void; onMenu: () => void }) {
  const { player, rows } = results;
  const win = player.place === 1;
  return (
    <div className="modal-backdrop results">
      <div className="panel results-panel">
        <div className={`results-banner ${win ? 'win' : ''}`}>
          <span className="results-place">{ordinal(player.place)}</span>
          <span className="results-title">{win ? 'VICTORY' : player.place <= 3 ? 'PODIUM FINISH' : 'RACE COMPLETE'}</span>
        </div>
        <table className="results-table">
          <thead>
            <tr>
              <th>#</th>
              <th>RIDER</th>
              <th>TIME</th>
              <th>TOP SPEED</th>
              <th>KOs</th>
              <th>WRECKS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.isHuman ? 'me' : ''}>
                <td>{r.place}</td>
                <td>
                  <span className="opp-dot" style={{ background: r.color }} /> {r.isHuman ? `${r.name} (YOU)` : r.name}
                </td>
                <td>
                  {r.projected ? '~' : ''}
                  {formatTime(r.time)}
                </td>
                <td>{Math.round(r.topSpeedKmh)} km/h</td>
                <td>{r.knockouts}</td>
                <td>{r.wrecks}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="results-stats">
          <div>
            <span>STUNT & STYLE</span>
            <b>{player.score.toLocaleString()}</b>
          </div>
          <div>
            <span>HITS LANDED</span>
            <b>{player.hitsLanded}</b>
          </div>
          <div>
            <span>KNOCKOUTS</span>
            <b>{player.knockouts}</b>
          </div>
          <div>
            <span>NEAR MISSES</span>
            <b>{player.nearMisses}</b>
          </div>
          <div>
            <span>COLLISIONS</span>
            <b>{player.collisions}</b>
          </div>
          <div>
            <span>TOP SPEED</span>
            <b>{Math.round(player.topSpeedKmh)} km/h</b>
          </div>
        </div>
        <div className="results-rewards">
          <div className="reward coins">+{player.coins} COINS</div>
          <div className="reward xp">+{player.xp} XP</div>
        </div>
        <p className="hint">Rewards are calculated locally for now — persistent progression arrives with the garage &amp; Supabase in Phase 5.</p>
        <div className="results-actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              audio.ui('click');
              onRetry();
            }}
          >
            RACE AGAIN
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              audio.ui('back');
              onMenu();
            }}
          >
            MAIN MENU
          </button>
        </div>
      </div>
    </div>
  );
}
