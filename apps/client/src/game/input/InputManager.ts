import type { BikeInput } from '@highway-rush/shared';

type Action = 'up' | 'down' | 'left' | 'right' | 'nitro' | 'wheelie' | 'punch' | 'kick' | 'weapon' | 'block';

const KEY_MAP: Record<string, Action> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'nitro',
  ShiftRight: 'nitro',
  KeyE: 'wheelie',
  KeyJ: 'punch',
  Space: 'kick',
  KeyK: 'weapon',
  KeyL: 'block',
};

const LATCHED = new Set<Action>(['punch', 'kick', 'weapon']);
const BUFFER_MS = 200;

/**
 * Unified keyboard + touch input. Produces a smoothed analogue steer value so keyboard
 * steering feels progressive rather than binary.
 */
class InputManager {
  private keys = new Set<Action>();
  private touch = new Set<Action>();
  /** Attack taps shorter than a sim tick (or made while staggered) are buffered briefly. */
  private buffered = new Map<Action, number>();
  private steer = 0;
  private listeners = new Set<() => void>();
  private attached = false;

  attach() {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  detach() {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.keys.clear();
    this.touch.clear();
    this.buffered.clear();
    this.steer = 0;
  }

  /** Register a callback for the pause key. */
  onPause(cb: () => void) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  setTouch(action: Action, pressed: boolean) {
    if (pressed) {
      this.touch.add(action);
      if (LATCHED.has(action)) this.buffered.set(action, performance.now() + BUFFER_MS);
    } else this.touch.delete(action);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (!e.repeat) this.listeners.forEach((cb) => cb());
      return;
    }
    const action = KEY_MAP[e.code];
    if (action) {
      this.keys.add(action);
      if (!e.repeat && LATCHED.has(action)) this.buffered.set(action, performance.now() + BUFFER_MS);
      e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const action = KEY_MAP[e.code];
    if (action) this.keys.delete(action);
  };

  private onBlur = () => {
    this.keys.clear();
    this.touch.clear();
    this.buffered.clear();
  };

  private has(a: Action) {
    return this.keys.has(a) || this.touch.has(a);
  }

  /** Held, or tapped within the buffer window. The sim ignores it while on cooldown, so no double hits. */
  private pressed(a: Action) {
    const until = this.buffered.get(a);
    if (until !== undefined && performance.now() > until) this.buffered.delete(a);
    return this.has(a) || this.buffered.has(a);
  }

  /** Called when the sim actually started an attack so the buffered tap isn't reused. */
  consumeAttack(kind: 'punch' | 'kick' | 'weapon') {
    this.buffered.delete(kind);
  }

  sample(dt: number): BikeInput {
    const target = (this.has('right') ? 1 : 0) - (this.has('left') ? 1 : 0);
    const rate = target === 0 ? 9 : Math.sign(target) !== Math.sign(this.steer) ? 12 : 5;
    const delta = target - this.steer;
    this.steer += Math.sign(delta) * Math.min(Math.abs(delta), rate * dt);
    return {
      throttle: this.has('up') ? 1 : 0,
      brake: this.has('down') ? 1 : 0,
      steer: this.steer,
      nitro: this.has('nitro'),
      wheelie: this.has('wheelie'),
      punch: this.pressed('punch'),
      kick: this.pressed('kick'),
      weapon: this.pressed('weapon'),
      block: this.has('block'),
    };
  }
}

export const input = new InputManager();
export type { Action as InputAction };
