import * as THREE from 'three';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return { c, ctx };
}

function speckle(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, count: number, colors: string[], size = 2) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
    const s = Math.random() * size + 0.5;
    ctx.fillRect(x + Math.random() * w, y + Math.random() * h, s, s);
  }
}

/** Road texture spanning d = -halfSpan..halfSpan across U and `metersPerRepeat` along V. */
export function createRoadTexture(halfSpan: number, metersPerRepeat: number, maxAnisotropy: number) {
  const W = 1024;
  const H = 1024;
  const { c, ctx } = canvas(W, H);
  const pxPerM = W / (halfSpan * 2);
  const vPerM = H / metersPerRepeat;
  const X = (d: number) => (d + halfSpan) * pxPerM;

  ctx.fillStyle = '#2b2d33';
  ctx.fillRect(0, 0, W, H);
  speckle(ctx, 0, 0, W, H, 60000, ['#25272c', '#33363c', '#3a3d43', '#202227'], 2);

  // Worn tyre tracks in each lane.
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#16171a';
  for (const lane of [-5.4, -1.8, 1.8, 5.4]) {
    for (const off of [-0.8, 0.8]) ctx.fillRect(X(lane + off) - 12, 0, 24, H);
  }
  ctx.globalAlpha = 1;

  // Shoulders and gravel edge.
  ctx.fillStyle = '#383a40';
  ctx.fillRect(X(-8.8), 0, X(-7.2) - X(-8.8), H);
  ctx.fillRect(X(7.2), 0, X(8.8) - X(7.2), H);
  speckle(ctx, X(-8.8), 0, X(-7.2) - X(-8.8), H, 6000, ['#2f3136', '#45474d'], 2);
  speckle(ctx, X(7.2), 0, X(8.8) - X(7.2), H, 6000, ['#2f3136', '#45474d'], 2);
  ctx.fillStyle = '#5b544c';
  ctx.fillRect(0, 0, X(-8.8), H);
  ctx.fillRect(X(8.8), 0, W - X(8.8), H);
  speckle(ctx, 0, 0, X(-8.8), H, 8000, ['#6f675d', '#463f38', '#837a6e'], 3);
  speckle(ctx, X(8.8), 0, W - X(8.8), H, 8000, ['#6f675d', '#463f38', '#837a6e'], 3);

  // Edge lines.
  ctx.fillStyle = '#e8e8e2';
  const lw = 0.16 * pxPerM;
  ctx.fillRect(X(-7.2) - lw / 2, 0, lw, H);
  ctx.fillRect(X(7.2) - lw / 2, 0, lw, H);

  // Double yellow center line.
  ctx.fillStyle = '#f2b81c';
  ctx.fillRect(X(-0.16) - lw / 2, 0, lw, H);
  ctx.fillRect(X(0.16) - lw / 2, 0, lw, H);

  // Dashed lane dividers: 3m dash, 9m gap.
  ctx.fillStyle = '#e8e8e2';
  for (const d of [-3.6, 3.6]) {
    for (let m = 0; m < metersPerRepeat; m += 12) ctx.fillRect(X(d) - lw / 2, m * vPerM, lw, 3 * vPerM);
  }

  // Paint wear.
  ctx.globalAlpha = 0.25;
  speckle(ctx, 0, 0, W, H, 9000, ['#2b2d33'], 3);
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createWaterNormalTexture() {
  const S = 256;
  const { c, ctx } = canvas(S, S);
  const img = ctx.createImageData(S, S);
  const h = (x: number, y: number) =>
    Math.sin((x / S) * Math.PI * 8) * 0.5 +
    Math.sin(((x + y) / S) * Math.PI * 14) * 0.3 +
    Math.sin(((y * 2 - x) / S) * Math.PI * 10) * 0.25 +
    Math.cos((y / S) * Math.PI * 6) * 0.4;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = h(x + 1, y) - h(x - 1, y);
      const dy = h(x, y + 1) - h(x, y - 1);
      const nx = -dx * 2;
      const ny = -dy * 2;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * S + x) * 4;
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function createBannerTexture(text: string, kind: 'start' | 'finish' | 'ad', accent = '#ff3d5a') {
  const { c, ctx } = canvas(1024, 256);
  if (kind === 'ad') {
    const g = ctx.createLinearGradient(0, 0, 1024, 256);
    g.addColorStop(0, '#0b0b14');
    g.addColorStop(1, '#1d1030');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1024, 256);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, 1004, 236);
  } else {
    const sq = 32;
    for (let y = 0; y < 256; y += sq)
      for (let x = 0; x < 1024; x += sq) {
        ctx.fillStyle = (x / sq + y / sq) % 2 === 0 ? '#111' : '#f5f5f5';
        ctx.fillRect(x, y, sq, sq);
      }
    ctx.fillStyle = kind === 'start' ? 'rgba(220,38,38,0.92)' : 'rgba(10,10,14,0.88)';
    ctx.fillRect(140, 48, 744, 160);
  }
  ctx.font = '900 112px Orbitron, Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = kind === 'ad' ? accent : '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 12;
  ctx.fillText(text, 512, 134, 700);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
