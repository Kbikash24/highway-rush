import type { RacerState } from '../types';
import type { Rng } from './math';

/**
 * Hands a rider to the AI (e.g. while a player is disconnected) or back to its human.
 * The AI keeps driving the same bike from its current state.
 */
export function setAIControl(r: RacerState, on: boolean, rng: Rng) {
  if (on) {
    if (r.ai) return;
    r.isHuman = false;
    r.ai = { targetD: r.d, decisionTimer: 0, skill: 0.9, nitroBias: rng.next(), aggression: 0.25, combatTimer: 0, threatKey: null, blockThreat: false };
  } else {
    delete r.ai;
    r.isHuman = true;
    r.speedScale = 1;
  }
}
