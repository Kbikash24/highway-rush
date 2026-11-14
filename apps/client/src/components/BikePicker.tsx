import { BIKE_LIST, type BikeId } from '@highway-rush/shared';
import { audio } from '../game/audio/AudioEngine';

export function BikePicker({ value, onChange, disabled }: { value: BikeId; onChange: (id: BikeId) => void; disabled?: boolean }) {
  return (
    <div className={`bike-picker ${disabled ? 'disabled' : ''}`}>
      {BIKE_LIST.map((b) => (
        <button
          key={b.id}
          type="button"
          disabled={disabled}
          className={b.id === value ? 'active' : ''}
          style={{ ['--bike-color' as string]: b.colors.primary }}
          onMouseEnter={() => audio.ui('hover')}
          onClick={() => {
            audio.ui('click');
            onChange(b.id);
          }}
        >
          <span className="bike-class">{b.bikeClass}</span>
          <span className="bike-name">{b.name}</span>
        </button>
      ))}
    </div>
  );
}
