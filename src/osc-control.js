// The browser cannot receive UDP OSC directly; the local bridge forwards it
// over WebSocket. Reconnect quietly while the Arduino bridge is offline.
export function connectOscStart(onStart) {
  const configured = new URLSearchParams(window.location.search).get('oscWs');
  const url = configured || import.meta.env.VITE_OSC_WS_URL || 'ws://127.0.0.1:9001';
  let socket, retry, stopped = false;

  function connect() {
    if (stopped) return;
    try { socket = new WebSocket(url); }
    catch { retry = window.setTimeout(connect, 2000); return; }
    socket.addEventListener('message', (event) => {
      try { if (JSON.parse(event.data).type === 'start') onStart(); }
      catch { /* unrelated or malformed bridge message */ }
    });
    socket.addEventListener('error', () => socket.close());
    socket.addEventListener('close', () => { if (!stopped) retry = window.setTimeout(connect, 2000); });
  }
  connect();
  return () => { stopped = true; window.clearTimeout(retry); socket?.close(); };
}
