import { DEFAULT_CONFIG, validateRuntimeConfig } from '../shared/runtime-config.js';

const CONFIG_KEY = 'runtime/config.json';
const MODEL_KEY = 'runtime/mushroom.glb';
const MODEL_PRESENT_KEY = 'runtime/model-present';
const MAX_CONFIG_BYTES = 8192;
const MAX_MODEL_BYTES = 25 * 1024 * 1024;
const encoder = new TextEncoder();

const json = (value, status = 200) => Response.json(value, {
  status,
  headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
});

async function readLimited(request, maxBytes) {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new RangeError('Upload is too large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

async function authorized(request, secret) {
  if (!secret) return false;
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return false;
  const [provided, expected] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(header.slice(7))),
    crypto.subtle.digest('SHA-256', encoder.encode(secret)),
  ]);
  const a = new Uint8Array(provided), b = new Uint8Array(expected);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

async function currentConfig(env) {
  if (!env.CONTENT) return DEFAULT_CONFIG;
  const value = await env.CONTENT.get(CONFIG_KEY);
  if (!value) return DEFAULT_CONFIG;
  try { return validateRuntimeConfig(JSON.parse(value)); }
  catch { return DEFAULT_CONFIG; }
}

function validGlb(bytes) {
  if (bytes.byteLength < 12) return false;
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return data.getUint32(0, true) === 0x46546c67 && data.getUint32(4, true) === 2 && data.getUint32(8, true) === bytes.byteLength;
}

async function handleApi(request, env, pathname) {
  if (pathname === '/api/config' && request.method === 'GET') {
    const [config, model] = await Promise.all([currentConfig(env), env.CONTENT?.get(MODEL_PRESENT_KEY)]);
    return json({ config, modelUrl: model ? '/api/model' : '/models/3mushroom.glb' });
  }
  if (pathname === '/api/model' && request.method === 'GET') {
    const bytes = await env.CONTENT?.get(MODEL_KEY, 'arrayBuffer');
    if (!bytes) {
      const url = new URL(request.url); url.pathname = '/models/3mushroom.glb';
      return env.ASSETS.fetch(new Request(url, request));
    }
    return new Response(bytes, {
      headers: { 'content-type': 'model/gltf-binary', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
    });
  }
  if (pathname === '/api/admin/config' && request.method === 'PUT') {
    if (!env.CONTENT || !env.ADMIN_TOKEN) return json({ error: 'Admin updates are not configured' }, 503);
    if (!await authorized(request, env.ADMIN_TOKEN)) return json({ error: 'Unauthorized' }, 401);
    if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Expected JSON' }, 415);
    try {
      const bytes = await readLimited(request, MAX_CONFIG_BYTES);
      const config = validateRuntimeConfig(JSON.parse(new TextDecoder().decode(bytes)));
      await env.CONTENT.put(CONFIG_KEY, JSON.stringify(config));
      return json({ config });
    } catch (error) {
      return json({ error: error.message }, error instanceof RangeError ? 413 : 400);
    }
  }
  if (pathname === '/api/admin/model' && request.method === 'PUT') {
    if (!env.CONTENT || !env.ADMIN_TOKEN) return json({ error: 'Admin updates are not configured' }, 503);
    if (!await authorized(request, env.ADMIN_TOKEN)) return json({ error: 'Unauthorized' }, 401);
    const contentType = request.headers.get('content-type') || '';
    if (!['model/gltf-binary', 'application/octet-stream'].includes(contentType)) return json({ error: 'Expected a GLB file' }, 415);
    try {
      const bytes = await readLimited(request, MAX_MODEL_BYTES);
      if (!validGlb(bytes)) return json({ error: 'Invalid GLB header or length' }, 400);
      await env.CONTENT.put(MODEL_KEY, bytes.buffer);
      await env.CONTENT.put(MODEL_PRESENT_KEY, '1');
      return json({ ok: true, bytes: bytes.byteLength });
    } catch (error) {
      return json({ error: error.message }, error instanceof RangeError ? 413 : 400);
    }
  }
  return null;
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    const apiResponse = await handleApi(request, env, pathname);
    if (apiResponse) return apiResponse;
    if (pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);

    const response = await env.ASSETS.fetch(request);
    const acceptsHtml = request.headers.get('accept')?.includes('text/html');
    if (response.status !== 404 || !acceptsHtml || !['GET', 'HEAD'].includes(request.method)) return response;

    const indexUrl = new URL(request.url);
    indexUrl.pathname = '/index.html';
    indexUrl.search = '';
    return env.ASSETS.fetch(new Request(indexUrl, request));
  },
};
