import {
  BIKES,
  FIXED_DT,
  RaceSimulation,
  TRACKS,
  TRAFFIC_DENSITY,
  buildResultRows,
  type BikeId,
  type MapId,
  type RacerConfig,
  type TrafficDensity,
} from '@highway-rush/shared';
import { input } from '../input/InputManager';
import type { RaceResults } from '../../store/gameStore';
import { GameSession } from './GameSession';

export const PLAYER_ID = 'player';

const RIVALS: Array<Omit<RacerConfig, 'isHuman'>> = [
  { id: 'rival-1', name: 'Nova', bikeId: 'blade', color: '#f97316', skill: 0.93, aggression: 0.55 },
  { id: 'rival-2', name: 'Diesel', bikeId: 'thunder', color: '#8b5cf6', skill: 0.99, aggression: 0.85 },
  { id: 'rival-3', name: 'Kestrel', bikeId: 'viper', color: '#14b8a6', skill: 0.96, aggression: 0.4 },
];

export interface SessionOptions {
  mapId: MapId;
  bikeId: BikeId;
  playerName: string;
  trafficDensity: TrafficDensity;
}

const MAX_STEPS_PER_FRAME = 8;

/** Solo race: the shared deterministic simulation runs in the browser at a fixed tick. */
export class LocalSession extends GameSession {
  readonly sim: RaceSimulation;
  readonly playerId = PLAYER_ID;
  private accumulator = 0;

  constructor(opts: SessionOptions) {
    super();
    const track = TRACKS[opts.mapId];
    if (!track) throw new Error(`Map ${opts.mapId} is not playable yet`);
    this.sim = new RaceSimulation({
      track,
      racers: [
        { id: PLAYER_ID, name: opts.playerName, bikeId: opts.bikeId, isHuman: true, color: BIKES[opts.bikeId].colors.primary },
        ...RIVALS.map((r) => ({ ...r, isHuman: false })),
      ],
      trafficCount: TRAFFIC_DENSITY[opts.trafficDensity],
      seed: (Math.random() * 2 ** 31) | 0,
      countdownSeconds: 3.5,
    });
  }

  protected advance(dt: number) {
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      this.sim.setInput(this.playerId, input.sample(FIXED_DT));
      this.sim.step(FIXED_DT);
      for (const e of this.sim.drainEvents()) this.handleEvent(e);
      this.accumulator -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;
    this.alpha = this.accumulator / FIXED_DT;
  }

  protected pollResults(): RaceResults | null {
    if (this.sim.phase !== 'finished') return null;
    return { rows: buildResultRows(this.sim), playerId: this.playerId, online: false };
  }
}
