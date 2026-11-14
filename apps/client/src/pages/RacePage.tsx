import { useCallback, useEffect, useMemo, useState } from 'react';
import { RaceCanvas } from '../game/scenes/RaceCanvas';
import { GameSession } from '../game/session/GameSession';
import { LocalSession } from '../game/session/LocalSession';
import { OnlineSession } from '../game/session/OnlineSession';
import { audio } from '../game/audio/AudioEngine';
import { input } from '../game/input/InputManager';
import { RaceHUD } from '../components/hud/RaceHUD';
import { PauseMenu } from '../components/PauseMenu';
import { ResultsScreen } from '../components/ResultsScreen';
import { TouchControls, useTouchEnabled } from '../components/TouchControls';
import { network } from '../multiplayer/network';
import { useNet } from '../multiplayer/netStore';
import { useGame } from '../store/gameStore';
import { useHud } from '../store/hudStore';
import { useSettings } from '../store/settingsStore';

export function RacePage() {
  const { raceId, raceMode, selectedBike, selectedMap, paused, setPaused, results, setResults, startRace, setScreen, settingsOpen } = useGame();
  const online = raceMode === 'online';
  const quality = useSettings((s) => s.quality);
  const touch = useTouchEnabled();
  const waiting = useNet((s) => s.waiting);
  const [loading, setLoading] = useState(true);

  const session = useMemo<GameSession | null>(() => {
    if (online) {
      const start = useNet.getState().raceStart;
      return start ? new OnlineSession(start) : null;
    }
    const { playerName, trafficDensity } = useSettings.getState();
    return new LocalSession({ mapId: selectedMap, bikeId: selectedBike, playerName, trafficDensity });
  }, [raceId, online, selectedBike, selectedMap]);

  // An online race that no longer exists (server aborted it): go back to the lobby.
  useEffect(() => {
    if (!session) setScreen(network.connected ? 'lobby' : 'menu');
  }, [session, setScreen]);

  useEffect(() => {
    if (!session) return undefined;
    useHud.getState().reset();
    setLoading(true);
    session.onFinished = (r) => setResults(r);
    session.onReady = () => setLoading(false);
    if (session instanceof OnlineSession) network.attachSession(session);
    input.attach();
    audio.unlock();
    audio.startRaceAudio();
    // Dev-only handle for debugging and automated browser tests; stripped from production builds.
    if (import.meta.env.DEV) (window as unknown as { __HR_SESSION__?: GameSession }).__HR_SESSION__ = session;
    return () => {
      session.onFinished = null;
      session.onReady = null;
      session.dispose();
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
    if (!session) return;
    session.paused = paused || settingsOpen;
    audio.suspend(session.paused && !online);
  }, [paused, settingsOpen, session, online]);

  useEffect(() => {
    // Solo races pause when the tab is hidden. An online race can't, so it just keeps going.
    if (online) return undefined;
    const onVisibility = () => {
      if (document.hidden && !useGame.getState().results) setPaused(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [setPaused, online]);

  if (!session) return null;

  const leaveOnline = async () => {
    await network.leave();
    setPaused(false);
    setScreen('menu');
  };
  const backToLobby = () => {
    network.backToLobby();
    setResults(null);
    setScreen('lobby');
  };

  return (
    <div className={`race-page ${touch ? 'touch-mode' : ''}`}>
      <RaceCanvas key={`${raceId}-${quality}`} session={session} quality={quality} />
      <RaceHUD session={session} />
      <TouchControls onPause={togglePause} />
      {loading && <div className="loading-cover">LOADING COASTAL HIGHWAY…</div>}
      {!loading && online && waiting && <div className="loading-cover waiting">WAITING FOR OTHER RIDERS TO LOAD…</div>}
      {paused && !results && (
        <PauseMenu online={online} onResume={() => setPaused(false)} onRestart={startRace} onQuit={online ? leaveOnline : () => setScreen('menu')} />
      )}
      {results && (
        <ResultsScreen results={results} onRetry={online ? backToLobby : startRace} onMenu={online ? leaveOnline : () => setScreen('menu')} />
      )}
    </div>
  );
}
