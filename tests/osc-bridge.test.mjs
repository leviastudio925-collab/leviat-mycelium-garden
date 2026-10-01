import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import { once } from 'node:events';
import test from 'node:test';
import { WebSocket } from 'ws';
import { decodeOscPacket, encodeStartPacket, isStartMessage } from '../scripts/osc-protocol.mjs';
import { startOscBridge } from '../scripts/osc-bridge.mjs';

test('decodes start and ignores button release', () => {
  const [press] = decodeOscPacket(encodeStartPacket(1));
  const [release] = decodeOscPacket(encodeStartPacket(0));
  assert.deepEqual(press, { address: '/mycelium/start', args: [1] });
  assert.equal(isStartMessage(press), true);
  assert.equal(isStartMessage(release), false);
});

test('decodes OSC bundles and rejects truncated packets', () => {
  const message = encodeStartPacket();
  const bundle = Buffer.alloc(8 + 8 + 4 + message.length);
  bundle.write('#bundle', 0, 'ascii');
  bundle.writeInt32BE(message.length, 16);
  message.copy(bundle, 20);
  assert.deepEqual(decodeOscPacket(bundle), [{ address: '/mycelium/start', args: [1] }]);
  assert.throws(() => decodeOscPacket(message.subarray(0, 18)));
});

test('forwards OSC start over WebSocket to the browser', async () => {
  const bridge = await startOscBridge({ udpHost: '127.0.0.1', udpPort: 0, wsHost: '127.0.0.1', wsPort: 0 });
  const client = new WebSocket(`ws://127.0.0.1:${bridge.wsPort}`);
  const udp = dgram.createSocket('udp4');
  try {
    await once(client, 'open');
    const received = once(client, 'message');
    await new Promise((resolve, reject) => udp.send(encodeStartPacket(), bridge.udpPort, '127.0.0.1', (error) => error ? reject(error) : resolve()));
    const [message] = await received;
    assert.deepEqual(JSON.parse(message.toString()), { type: 'start', address: '/mycelium/start' });
  } finally {
    udp.close();
    client.terminate();
    await bridge.close();
  }
});
