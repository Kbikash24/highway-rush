import { useEffect } from 'react';
import { MainMenu } from './pages/MainMenu';
import { BikeSelect } from './pages/BikeSelect';
import { RacePage } from './pages/RacePage';
import { OnlineHub } from './pages/OnlineHub';
import { LobbyPage } from './pages/LobbyPage';
import { SettingsPanel } from './components/SettingsPanel';
import { NetStatusOverlay } from './components/NetStatusOverlay';
import { useGame } from './store/gameStore';
import { useSettings } from './store/settingsStore';
import { useNet } from './multiplayer/netStore';
import { network } from './multiplayer/network';
import { audio } from './game/audio/AudioEngine';

export function App() {
  const screen = useGame((s) => s.screen);
  const settingsOpen = useGame((s) => s.settingsOpen);
  const masterVolume = useSettings((s) => s.masterVolume);
  const sfxVolume = useSettings((s) => s.sfxVolume);
  const musicVolume = useSettings((s) => s.musicVolume);
  const lobby = useNet((s) => s.lobby);
  const netStatus = useNet((s) => s.status);

  useEffect(() => {
    audio.setVolumes(masterVolume, sfxVolume, musicVolume);
  }, [masterVolume, sfxVolume, musicVolume]);

  useEffect(() => {
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Page reload mid-race: try to take the seat back.
  useEffect(() => {
    void network.tryResume();
  }, []);

  // Routing driven by the server's room state.
  useEffect(() => {
    if (netStatus !== 'connected' || !lobby) return;
    const game = useGame.getState();
    if (lobby.phase === 'lobby' && (game.screen === 'menu' || game.screen === 'online')) game.setScreen('lobby');
    // The race ended while we were away (reload/reconnect): jump back to the lobby.
    if (lobby.phase === 'results' && game.screen !== 'race') {
      network.backToLobby();
      game.setScreen('lobby');
    }
    // The server aborted the race we were in without results.
    if (lobby.phase === 'lobby' && game.screen === 'race' && game.raceMode === 'online' && !game.results) game.setScreen('lobby');
  }, [lobby, netStatus]);

  return (
    <div className="app">
      {screen === 'menu' && <MainMenu />}
      {screen === 'bikeSelect' && <BikeSelect />}
      {screen === 'online' && <OnlineHub />}
      {screen === 'lobby' && <LobbyPage />}
      {screen === 'race' && <RacePage />}
      {settingsOpen && <SettingsPanel />}
      <NetStatusOverlay />
      <div className="rotate-hint">Rotate your device to landscape for the best experience</div>
    </div>
  );
}
