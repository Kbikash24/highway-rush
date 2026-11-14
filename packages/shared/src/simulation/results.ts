import type { RacerState } from '../types';
import type { RaceSimulation } from './raceSimulation';

export interface RaceResultRow {
  id: string;
  name: string;
  color: string;
  isHuman: boolean;
  /** Human who disconnected before the end (their bike was finished by AI or abandoned). */
  left: boolean;
  place: number;
  time: number;
  /** True when the rider hadn't finished and `time` is an estimate. */
  projected: boolean;
  topSpeedKmh: number;
  wrecks: number;
  knockouts: number;
  hitsLanded: number;
  score: number;
  nearMisses: number;
  collisions: number;
  coins: number;
  xp: number;
}

export function rewardsFor(r: Pick<RacerState, 'score' | 'nearMisses'> & { place: number; knockouts: number }, fieldSize = 4) {
  const placeBonus = [500, 300, 180, 100][r.place - 1] ?? 50;
  return {
    coins: Math.round(placeBonus + r.score * 0.1 + r.nearMisses * 5 + r.knockouts * 75),
    xp: Math.round(120 + Math.max(0, fieldSize - r.place) * 60 + r.score * 0.05),
  };
}

/** Final standings with server-validated times; unfinished riders get a projected time. */
export function buildResultRows(sim: RaceSimulation, leftIds: ReadonlySet<string> = new Set()): RaceResultRow[] {
  const standings = sim.standings();
  return standings.map((r, i) => {
    const place = i + 1;
    const projected = !r.finished;
    const avg = Math.max(20, r.s / Math.max(1, sim.time));
    const time = r.finished ? r.finishTime! : sim.time + Math.max(0, sim.track.raceLength - r.s) / avg;
    const { coins, xp } = rewardsFor({ place, score: r.score, nearMisses: r.nearMisses, knockouts: r.combat.knockouts }, standings.length);
    return {
      id: r.id,
      name: r.name,
      color: r.color,
      isHuman: r.isHuman || leftIds.has(r.id),
      left: leftIds.has(r.id),
      place,
      time,
      projected,
      topSpeedKmh: r.topSpeed * 3.6,
      wrecks: r.wrecks,
      knockouts: r.combat.knockouts,
      hitsLanded: r.combat.hitsLanded,
      score: r.score,
      nearMisses: r.nearMisses,
      collisions: r.collisions,
      coins,
      xp,
    };
  });
}
