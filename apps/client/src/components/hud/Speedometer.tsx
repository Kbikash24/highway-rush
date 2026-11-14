const START = 135;
const SWEEP = 270;
const MAX_KMH = 360;

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
}

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const [x1, y1] = polar(cx, cy, r, from);
  const [x2, y2] = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

interface Props {
  speedKmh: number;
  rpm: number;
  gear: number;
  nitro: number;
  nitroMax: number;
  nitroActive: boolean;
}

export function Speedometer({ speedKmh, rpm, gear, nitro, nitroMax, nitroActive }: Props) {
  const speedFrac = Math.min(1, speedKmh / MAX_KMH);
  const nitroFrac = Math.max(0, Math.min(1, nitro / nitroMax));
  const ticks = [];
  for (let i = 0; i <= 12; i++) {
    const deg = START + (SWEEP * i) / 12;
    const [x1, y1] = polar(110, 110, 92, deg);
    const [x2, y2] = polar(110, 110, i % 3 === 0 ? 80 : 86, deg);
    ticks.push(<line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className={i % 3 === 0 ? 'tick major' : 'tick'} />);
    if (i % 3 === 0) {
      const [tx, ty] = polar(110, 110, 68, deg);
      ticks.push(
        <text key={`t${i}`} x={tx} y={ty + 4} className="tick-label">
          {(MAX_KMH / 12) * i}
        </text>,
      );
    }
  }
  return (
    <div className={`speedo ${nitroActive ? 'nitro-on' : ''}`}>
      <svg viewBox="0 0 220 220">
        <defs>
          <linearGradient id="speedGrad" x1="0" x2="1" y1="1" y2="0">
            <stop offset="0" stopColor="#22d3ee" />
            <stop offset="0.6" stopColor="#f59e0b" />
            <stop offset="1" stopColor="#ff3d5a" />
          </linearGradient>
          <linearGradient id="nitroGrad" x1="0" x2="1">
            <stop offset="0" stopColor="#38bdf8" />
            <stop offset="1" stopColor="#a78bfa" />
          </linearGradient>
        </defs>
        <circle cx="110" cy="110" r="104" className="speedo-bg" />
        <path d={arc(110, 110, 98, START, START + SWEEP)} className="speedo-track" />
        {speedFrac > 0.002 && <path d={arc(110, 110, 98, START, START + SWEEP * speedFrac)} className="speedo-fill" stroke="url(#speedGrad)" />}
        <path d={arc(110, 110, 52, START, START + SWEEP)} className="nitro-track" />
        {nitroFrac > 0.002 && <path d={arc(110, 110, 52, START, START + SWEEP * nitroFrac)} className="nitro-fill" stroke="url(#nitroGrad)" />}
        {ticks}
        <rect x="70" y="182" width="80" height="6" rx="3" className="rpm-track" />
        <rect x="70" y="182" width={80 * rpm} height="6" rx="3" className={`rpm-fill ${rpm > 0.9 ? 'redline' : ''}`} />
      </svg>
      <div className="speedo-readout">
        <span className="speed-value">{Math.round(speedKmh)}</span>
        <span className="speed-unit">KM/H</span>
        <span className="gear">{gear === 0 ? 'N' : gear}</span>
      </div>
      <div className="nitro-label">{nitroActive ? 'NITRO!' : 'NITRO'}</div>
    </div>
  );
}
