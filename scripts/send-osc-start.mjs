#!/usr/bin/env node
import dgram from 'node:dgram';
import { encodeStartPacket } from './osc-protocol.mjs';

const socket = dgram.createSocket('udp4');
socket.send(encodeStartPacket(), Number(process.env.OSC_UDP_PORT || 9000), '127.0.0.1', (error) => {
  if (error) { console.error(error); process.exitCode = 1; }
  else console.log('Sent OSC /mycelium/start');
  socket.close();
});
