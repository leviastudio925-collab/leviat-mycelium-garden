const align4 = (value) => (value + 3) & ~3;

function readString(buffer, offset, end) {
  const zero = buffer.indexOf(0, offset);
  if (zero < 0 || zero >= end) throw new Error('OSC string is not terminated');
  const next = align4(zero + 1);
  if (next > end) throw new Error('OSC string padding is incomplete');
  return [buffer.toString('utf8', offset, zero), next];
}

function readMessage(buffer, start, end) {
  let cursor = start;
  const [address, addressEnd] = readString(buffer, cursor, end);
  cursor = addressEnd;
  if (!address.startsWith('/')) throw new Error('OSC address must begin with /');
  if (cursor === end) return { address, args: [] };
  const [tags, tagEnd] = readString(buffer, cursor, end);
  cursor = tagEnd;
  if (!tags.startsWith(',')) throw new Error('OSC type tags are missing');
  const args = [];
  for (const tag of tags.slice(1)) {
    if (tag === 'T') { args.push(true); continue; }
    if (tag === 'F') { args.push(false); continue; }
    if (tag === 'N') { args.push(null); continue; }
    if (tag === 'i' || tag === 'f') {
      if (cursor + 4 > end) throw new Error('OSC numeric argument is incomplete');
      args.push(tag === 'i' ? buffer.readInt32BE(cursor) : buffer.readFloatBE(cursor));
      cursor += 4;
      continue;
    }
    if (tag === 's') {
      const [value, next] = readString(buffer, cursor, end);
      args.push(value); cursor = next;
      continue;
    }
    throw new Error(`Unsupported OSC type tag: ${tag}`);
  }
  return { address, args };
}

export function decodeOscPacket(buffer, start = 0, end = buffer.length, depth = 0) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('OSC packet must be a Buffer');
  if (depth > 8 || start < 0 || end > buffer.length || start >= end) throw new Error('Invalid OSC packet');
  const [head, afterHead] = readString(buffer, start, end);
  if (head !== '#bundle') return [readMessage(buffer, start, end)];
  let cursor = afterHead + 8; // OSC bundle timetag
  if (cursor > end) throw new Error('OSC bundle timetag is incomplete');
  const messages = [];
  while (cursor < end) {
    if (cursor + 4 > end) throw new Error('OSC bundle element length is incomplete');
    const length = buffer.readInt32BE(cursor); cursor += 4;
    if (length <= 0 || cursor + length > end) throw new Error('OSC bundle element is incomplete');
    messages.push(...decodeOscPacket(buffer, cursor, cursor + length, depth + 1));
    cursor += length;
  }
  return messages;
}

export function isStartMessage(message) {
  if (message.address !== '/mycelium/start') return false;
  if (!message.args.length) return true;
  const value = message.args[0];
  return value === true || typeof value === 'number' && value > 0 || typeof value === 'string' && ['1', 'start', 'go'].includes(value.toLowerCase());
}

export function encodeStartPacket(value = 1) {
  const packet = Buffer.alloc(24);
  packet.write('/mycelium/start', 0, 'ascii');
  packet.write(',i', 16, 'ascii');
  packet.writeInt32BE(value, 20);
  return packet;
}
