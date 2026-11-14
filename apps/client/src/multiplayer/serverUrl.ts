/**
 * Where the Colyseus server lives. Set VITE_SERVER_URL (ws:// or wss://) for deployments; in dev
 * it falls back to port 2567 on whatever host served the page, so LAN/phone testing just works.
 */
export function getServerUrl(): string {
  const configured = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (configured) return configured.replace(/\/$/, '');
  const secure = typeof location !== 'undefined' && location.protocol === 'https:';
  const host = typeof location !== 'undefined' ? location.hostname : 'localhost';
  return `${secure ? 'wss' : 'ws'}://${host}:2567`;
}
