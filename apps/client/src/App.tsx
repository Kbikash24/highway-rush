import { useEffect } from 'react';
import { MainMenu } from './pages/MainMenu';
import { BikeSelect } from './pages/BikeSelect';
import { RacePage } from './pages/RacePage';
import { SettingsPanel } from './components/SettingsPanel';
import { useGame } from './store/gameStore';
import { useSettings } from './store/settingsStore';
import { audio } from './game/audio/AudioEngine';

export function App() {
  const screen = useGame((s) => s.screen);
  const settingsOpen = useGame((s) => s.settingsOpen);
  const masterVolume = useSettings((s) => s.masterVolume);
  const sfxVolume = useSettings((s) => s.sfxVolume);
  const musicVolume = useSettings((s) => s.musicVolume);

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

  return (
    <div className="app">
      {screen === 'menu' && <MainMenu />}
      {screen === 'bikeSelect' && <BikeSelect />}
      {screen === 'race' && <RacePage />}
      {settingsOpen && <SettingsPanel />}
      <div className="rotate-hint">Rotate your device to landscape for the best experience</div>
    </div>
  );
}
