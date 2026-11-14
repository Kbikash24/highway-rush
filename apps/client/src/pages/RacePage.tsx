import { useCallback, useEffect, useMemo, useState } from 'react';
import { RaceCanvas } from '../game/scenes/RaceCanvas';
import { GameSession } from '../game/session/GameSession';
import { audio } from '../game/audio/AudioEngine';
import { input } from '../game/input/InputManager';
import { RaceHUD } from '../components/hud/RaceHUD';
import { PauseMenu } from '../components/PauseMenu';
import { ResultsScreen } from '../components/ResultsScreen';
import { TouchControls, useTouchEnabled } from '../components/TouchControls';
import { useGame } from '../store/gameStore';
import { useHud } from '../store/hudStore';
import { useSettings } from '../store/settingsStore';

export function RacePage() {
  const { raceId, selectedBike, selectedMap, paused, setPaused, results, setResults, startRace, setScreen, settingsOpen } = useGame();
  const quality = useSettings((s) => s.quality);
  const touch = useTouchEnabled();
  const [loading, setLoading] = useState(true);

  const session = useMemo(() => {
    const { playerName, trafficDensity } = useSettings.getState();
    return new GameSession({ mapId: selectedMap, bikeId: selectedBike, playerName, trafficDensity });
  }, [raceId, selectedBike, selectedMap]);

  useEffect(() => {
    useHud.getState().reset();
    setLoading(true);
    session.onFinished = (r) => setResults(r);
    session.onReady = () => setLoading(false);
    input.attach();
    audio.unlock();
    audio.startRaceAudio();
    // Dev-only handle for debugging and automated browser tests; stripped from production builds.
    if (import.meta.env.DEV) (window as unknown as { __HR_SESSION__?: GameSession }).__HR_SESSION__ = session;
    return () => {
      session.onFinished = null;
      session.onReady = null;
      audio.stopRaceAudio();
      input.detach();
    };
  }, [session, setResults]);

  const togglePause = useCallback(() => {
    if (useGame.getState().results) return;
    setPaused(!useGame.getState().paused);
  }, [setPaused]);

  useEffect(() => input.onPause(togglePause), [togglePause]);

  useEffect(() => {
    session.paused = paused || settingsOpen;
    audio.suspend(session.paused);
  }, [paused, settingsOpen, session]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && !useGame.getState().results) setPaused(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [setPaused]);

  return (
    <div className={`race-page ${touch ? 'touch-mode' : ''}`}>
      <RaceCanvas key={`${raceId}-${quality}`} session={session} quality={quality} />
      <RaceHUD session={session} />
      <TouchControls onPause={togglePause} />
      {loading && <div className="loading-cover">LOADING COASTAL HIGHWAY…</div>}
      {paused && !results && <PauseMenu onResume={() => setPaused(false)} onRestart={startRace} onQuit={() => setScreen('menu')} />}
      {results && <ResultsScreen results={results} onRetry={startRace} onMenu={() => setScreen('menu')} />}
    </div>
  );
}
