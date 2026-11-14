import { useEffect, useState } from 'react';
import { WEAPONS } from '@highway-rush/shared';
import { useHud, type HudCombat } from '../../store/hudStore';
import { useSettings } from '../../store/settingsStore';
import type { GameSession } from '../../game/session/GameSession';
import { formatTime, ordinal } from '../../utils/format';
import { Speedometer } from './Speedometer';
import { MiniMap } from './MiniMap';
import { useTouchEnabled } from '../TouchControls';

function Countdown({ value, phase }: { value: number; phase: string }) {
  const [showGo, setShowGo] = useState(false);
  useEffect(() => {
    if (phase === 'racing') {
      setShowGo(true);
      const t = window.setTimeout(() => setShowGo(false), 900);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [phase]);
  if (phase === 'countdown' && value > 0 && value <= 3) {
    const n = Math.ceil(value);
    return (
      <div className="countdown" key={n}>
        {n}
      </div>
    );
  }
  if (showGo) return <div className="countdown go">GO!</div>;
  return null;
}

function DamageFlash() {
  const flash = useHud((s) => s.damageFlash);
  if (!flash) return null;
  return <div key={flash} className="damage-flash" />;
}

function ActionSlot({ keyLabel, label, ready, disabled, active, sub }: { keyLabel: string; label: string; ready: number; disabled?: boolean; active?: boolean; sub?: string }) {
  const charging = !disabled && ready < 1;
  return (
    <div className={`action-slot ${disabled ? 'disabled' : ''} ${active ? 'active' : ''} ${!disabled && !charging ? 'ready' : ''}`}>
      {charging && <div className="action-cooldown" style={{ height: `${(1 - ready) * 100}%` }} />}
      <kbd>{keyLabel}</kbd>
      <span className="action-label">{label}</span>
      {sub && <span className="action-sub">{sub}</span>}
    </div>
  );
}

function CombatBar({ combat, compact }: { combat: HudCombat; compact: boolean }) {
  const weapon = combat.weapon ? WEAPONS[combat.weapon] : null;
  return (
    <div className={`combat-bar ${compact ? 'compact' : ''}`}>
      {combat.target && <div className="combat-target">TARGET IN REACH · {combat.target.toUpperCase()}</div>}
      {combat.staggered && <div className="combat-stagger">STAGGERED</div>}
      {compact && weapon && (
        <div className="action-sub">
          {weapon.name.toUpperCase()} {combat.weaponUses}/{combat.weaponMaxUses}
        </div>
      )}
      {!compact && (
        <div className="action-row">
        <ActionSlot keyLabel="J" label="PUNCH" ready={combat.ready.punch} />
        <ActionSlot keyLabel="SPACE" label="KICK" ready={combat.ready.kick} />
        <ActionSlot
          keyLabel="K"
          label={weapon ? weapon.name.toUpperCase() : 'NO WEAPON'}
          ready={combat.ready.weapon}
          disabled={!weapon}
          sub={weapon ? `${combat.weaponUses}/${combat.weaponMaxUses}` : 'grab a crate'}
        />
        <ActionSlot keyLabel="L" label="BLOCK" ready={1} active={combat.blocking} />
        </div>
      )}
    </div>
  );
}

export function RaceHUD({ session }: { session: GameSession }) {
  const snap = useHud((s) => s.snapshot);
  const notifications = useHud((s) => s.notifications);
  const showMinimap = useSettings((s) => s.showMinimap);
  const touch = useTouchEnabled();
  if (!snap) return null;

  const healthFrac = snap.health / snap.maxHealth;
  const nitroFrac = snap.nitro / snap.nitroMax;

  return (
    <div className={`hud ${snap.nitroActive ? 'hud-nitro' : ''}`}>
      <DamageFlash />
      {snap.nitroActive && <div className="nitro-vignette" />}
      {healthFrac < 0.3 && !snap.crashed && <div className="low-health-vignette" />}

      <div className="hud-top-left">
        <div className="position">
          <span className="pos-num">{snap.place}</span>
          <span className="pos-suffix">{ordinal(snap.place).replace(String(snap.place), '')}</span>
          <span className="pos-total">/ {snap.racerCount}</span>
        </div>
        <div className="race-time">{formatTime(snap.time)}</div>
        <div className="distance">
          {(snap.distance / 1000).toFixed(2)} <small>/ {(snap.raceLength / 1000).toFixed(1)} KM</small>
        </div>
      </div>

      <div className="hud-progress">
        <div className="progress-track">
          <div className="progress-finish" />
          {snap.racers.map((r) => (
            <div
              key={r.id}
              className={`progress-marker ${r.isPlayer ? 'me' : ''}`}
              style={{ left: `${r.progress * 100}%`, background: r.color }}
              title={r.name}
            />
          ))}
        </div>
      </div>

      <div className="hud-top-right">
        {showMinimap && <MiniMap session={session} />}
        <div className="opponents">
          {snap.racers.map((r) => (
            <div key={r.id} className={`opponent ${r.isPlayer ? 'me' : ''} ${r.crashed ? 'crashed' : ''}`}>
              <span className="opp-place">{r.place}</span>
              <span className="opp-dot" style={{ background: r.color }} />
              <span className="opp-name">
                {r.isPlayer ? 'YOU' : r.name}
                {r.weapon && <span className="opp-weapon">{WEAPONS[r.weapon].name.toUpperCase()}</span>}
              </span>
              <span className="opp-health">
                <span style={{ width: `${r.health * 100}%`, background: r.health < 0.3 ? '#ef4444' : r.color }} />
              </span>
              <span className="opp-gap">
                {r.finished ? 'FIN' : r.isPlayer ? '' : r.crashed ? 'WRECK' : `${r.gap > 0 ? '+' : ''}${Math.round(r.gap)}m`}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="hud-bottom-left">
        <div className="bar-block">
          <div className="bar-label">
            <span>BIKE HEALTH</span>
            <span>{Math.ceil(snap.health)}</span>
          </div>
          <div className="bar health-bar">
            <div className="bar-fill" style={{ width: `${healthFrac * 100}%` }} data-level={healthFrac < 0.3 ? 'low' : healthFrac < 0.6 ? 'mid' : 'high'} />
          </div>
        </div>
        <div className="bar-block">
          <div className="bar-label">
            <span>NITRO</span>
            <span>{Math.floor(nitroFrac * 100)}%</span>
          </div>
          <div className={`bar nitro-bar ${snap.nitroActive ? 'active' : ''}`}>
            <div className="bar-fill" style={{ width: `${nitroFrac * 100}%` }} />
          </div>
        </div>
        <div className="score-row">
          <span className="score">{snap.score.toLocaleString()}</span>
          <span className="score-label">PTS</span>
          {snap.combo > 1 && (
            <span className="combo" style={{ opacity: Math.min(1, snap.comboTimer + 0.3) }}>
              x{snap.combo} COMBO
            </span>
          )}
          {snap.wheelie && <span className="wheelie-tag">WHEELIE!</span>}
        </div>
      </div>

      <div className="hud-bottom-right">
        <Speedometer speedKmh={snap.speedKmh} rpm={snap.rpm} gear={snap.gear} nitro={snap.nitro} nitroMax={snap.nitroMax} nitroActive={snap.nitroActive} />
      </div>

      {snap.phase !== 'countdown' && !snap.crashed && <CombatBar combat={snap.combat} compact={touch} />}

      <div className="hud-center">
        <Countdown value={snap.countdown} phase={snap.phase} />
        {snap.crashed && (
          <div className="wrecked">
            <div className="wrecked-title">WRECKED</div>
            <div className="wrecked-sub">Respawning in {Math.max(0, snap.respawnIn).toFixed(1)}s</div>
          </div>
        )}
      </div>

      <div className="notifications">
        {notifications.map((n) => (
          <div key={n.id} className={`notification tone-${n.tone}`}>
            <span className="n-text">{n.text}</span>
            {n.sub && <span className="n-sub">{n.sub}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
