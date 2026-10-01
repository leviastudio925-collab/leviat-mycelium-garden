#!/usr/bin/env node
import dgram from 'node:dgram';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { decodeOscPacket, isStartMessage } from './osc-protocol.mjs';

export async function startOscBridge({ udpHost = '0.0.0.0', udpPort = 9000, wsHost = '127.0.0.1', wsPort = 9001 } = {}) {
  const udp = dgram.createSocket('udp4');
  const wss = new WebSocketServer({ host: wsHost, port: wsPort });
  try {
    await Promise.all([
      new Promise((resolve, reject) => {
        udp.once('error', reject);
        udp.bind(udpPort, udpHost, () => { udp.off('error', reject); resolve(); });
      }),
      once(wss, 'listening'),
    ]);
  } catch (error) {
    udp.close(); wss.close(); throw error;
  }

  let lastTrigger = -Infinity;
  udp.on('message', (packet) => {
    let messages;
    try { messages = decodeOscPacket(packet); }
    catch (error) { console.warn('Ignored invalid OSC packet:', error.message); return; }
    for (const message of messages) {
      if (!isStartMessage(message)) continue;
      const now = Date.now();
      if (now - lastTrigger < 450) continue; // mechanical button bounce
      lastTrigger = now;
      const payload = JSON.stringify({ type: 'start', address: message.address });
      for (const client of wss.clients) if (client.readyState === WebSocket.OPEN) client.send(payload);
      console.log('OSC /mycelium/start → browser');
    }
  });

  return {
    udpPort: udp.address().port,
    wsPort: wss.address().port,
    close: async () => {
      for (const client of wss.clients) client.terminate();
      await Promise.all([
        new Promise((resolve) => udp.close(resolve)),
        new Promise((resolve) => wss.close(resolve)),
      ]);
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const udpPort = Number(process.env.OSC_UDP_PORT || 9000);
  const wsPort = Number(process.env.OSC_WS_PORT || 9001);
  const udpHost = process.env.OSC_UDP_HOST || '0.0.0.0';
  const wsHost = process.env.OSC_WS_HOST || '127.0.0.1';
  startOscBridge({ udpHost, udpPort, wsHost, wsPort }).then((bridge) => {
    console.log(`OSC UDP ${udpHost}:${bridge.udpPort} → WebSocket ws://${wsHost}:${bridge.wsPort}`);
  }).catch((error) => { console.error('OSC bridge failed:', error); process.exitCode = 1; });
}
