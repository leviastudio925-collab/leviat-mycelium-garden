import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../worker/index.js';

const url = (path) => `https://example.test${path}`;

function makeEnv() {
  const objects = new Map();
  return {
    ADMIN_TOKEN: 'test-admin-token',
    CONTENT: {
      async get(key, type = 'text') {
        const value = objects.get(key);
        if (!value) return null;
        return type === 'arrayBuffer'
          ? value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
          : new TextDecoder().decode(value);
      },
      async put(key, value) { objects.set(key, value instanceof ArrayBuffer ? new Uint8Array(value) : new TextEncoder().encode(value)); },
    },
    ASSETS: { fetch: async (request) => new Response(`asset:${new URL(request.url).pathname}`) },
  };
}

function validGlb() {
  const bytes = new Uint8Array(12);
  bytes.set([0x67, 0x6c, 0x54, 0x46]);
  new DataView(bytes.buffer).setUint32(4, 2, true);
  new DataView(bytes.buffer).setUint32(8, bytes.length, true);
  return bytes;
}

test('public config uses defaults, then reflects an authenticated update', async () => {
  const env = makeEnv();
  const initial = await worker.fetch(new Request(url('/api/config')), env);
  assert.equal(initial.status, 200);
  assert.equal((await initial.json()).config.growth.primaryThickness, 1);

  const update = {
    growth: { primaryThickness: 1.5, secondaryThickness: .7, speed: 1.25, density: .8 },
    mushrooms: { size: 1.3 },
  };
  const unauthorized = await worker.fetch(new Request(url('/api/admin/config'), {
    method: 'PUT', body: JSON.stringify(update), headers: { 'content-type': 'application/json' },
  }), env);
  assert.equal(unauthorized.status, 401);

  const saved = await worker.fetch(new Request(url('/api/admin/config'), {
    method: 'PUT', body: JSON.stringify(update),
    headers: { authorization: 'Bearer test-admin-token', 'content-type': 'application/json' },
  }), env);
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).config.growth.primaryThickness, 1.5);
  const current = await worker.fetch(new Request(url('/api/config')), env);
  assert.deepEqual((await current.json()).config, update);
});

test('model upload validates GLB and serves the replacement', async () => {
  const env = makeEnv();
  const headers = { authorization: 'Bearer test-admin-token', 'content-type': 'model/gltf-binary' };
  const bad = await worker.fetch(new Request(url('/api/admin/model'), {
    method: 'PUT', body: new Uint8Array([1, 2, 3]), headers,
  }), env);
  assert.equal(bad.status, 400);

  const good = await worker.fetch(new Request(url('/api/admin/model'), {
    method: 'PUT', body: validGlb(), headers,
  }), env);
  assert.equal(good.status, 200);
  const model = await worker.fetch(new Request(url('/api/model')), env);
  assert.equal(model.status, 200);
  assert.equal(model.headers.get('content-type'), 'model/gltf-binary');
  assert.deepEqual(new Uint8Array(await model.arrayBuffer()), validGlb());
});

test('unknown API routes never return the site HTML', async () => {
  const env = makeEnv();
  const response = await worker.fetch(new Request(url('/api/missing'), {
    headers: { accept: 'text/html' },
  }), env);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, 'Not found');
});
