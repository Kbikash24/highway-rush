import { useEffect, useState, type PointerEvent } from 'react';
import { input, type InputAction } from '../game/input/InputManager';
import { useSettings } from '../store/settingsStore';

function TouchButton({ action, label, className }: { action: InputAction; label: string; className?: string }) {
  const [active, setActive] = useState(false);
  const press = (e: PointerEvent, down: boolean) => {
    e.preventDefault();
    if (down) {
      try {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      } catch {
        // Pointer already released; the press itself must still register.
      }
    }
    setActive(down);
    input.setTouch(action, down);
  };
  return (
    <button
      type="button"
      className={`touch-btn ${className ?? ''} ${active ? 'active' : ''}`}
      onPointerDown={(e) => press(e, true)}
      onPointerUp={(e) => press(e, false)}
      onPointerCancel={(e) => press(e, false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}

export function useTouchEnabled() {
  const mode = useSettings((s) => s.touchControls);
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    setIsTouch(window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window);
  }, []);
  return mode === 'on' || (mode === 'auto' && isTouch);
}

export function TouchControls({ onPause }: { onPause: () => void }) {
  if (!useTouchEnabled()) return null;
  return (
    <div className="touch-controls">
      <button type="button" className="touch-pause" onClick={onPause}>
        II
      </button>
      <div className="touch-left">
        <div className="touch-row combat">
          <TouchButton action="block" label="BLOCK" className="combat block" />
          <TouchButton action="punch" label="PUNCH" className="combat" />
          <TouchButton action="kick" label="KICK" className="combat" />
          <TouchButton action="weapon" label="WEAPON" className="combat weapon" />
        </div>
        <div className="touch-row">
          <TouchButton action="left" label="◀" className="steer" />
          <TouchButton action="right" label="▶" className="steer" />
        </div>
      </div>
      <div className="touch-right">
        <div className="touch-row">
          <TouchButton action="wheelie" label="STUNT" className="small" />
          <TouchButton action="nitro" label="NITRO" className="nitro" />
        </div>
        <div className="touch-row">
          <TouchButton action="down" label="BRAKE" className="brake" />
          <TouchButton action="up" label="GAS" className="gas" />
        </div>
      </div>
    </div>
  );
}
