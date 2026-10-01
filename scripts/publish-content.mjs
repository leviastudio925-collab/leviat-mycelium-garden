#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { validateRuntimeConfig } from '../shared/runtime-config.js';

const [kind, filePath] = process.argv.slice(2);
const siteUrl = process.env.MYCELIUM_SITE_URL;
const token = process.env.MYCELIUM_ADMIN_TOKEN;
if (!['config', 'model'].includes(kind) || !filePath || !siteUrl || !token) {
  throw new Error('Set MYCELIUM_SITE_URL and MYCELIUM_ADMIN_TOKEN, then pass a config JSON or GLB file path.');
}

const file = await readFile(filePath);
let body, contentType, endpoint;
if (kind === 'config') {
  body = JSON.stringify(validateRuntimeConfig(JSON.parse(file.toString('utf8'))));
  contentType = 'application/json';
  endpoint = '/api/admin/config';
} else {
  body = file;
  contentType = 'model/gltf-binary';
  endpoint = '/api/admin/model';
}

const response = await fetch(new URL(endpoint, siteUrl), {
  method: 'PUT', body,
  headers: { authorization: `Bearer ${token}`, 'content-type': contentType },
});
const result = await response.json();
if (!response.ok) throw new Error(result.error || `Update failed: HTTP ${response.status}`);
console.log(`${kind} updated successfully.`);
