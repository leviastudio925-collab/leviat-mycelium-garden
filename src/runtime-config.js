import { DEFAULT_CONFIG, validateRuntimeConfig } from '../shared/runtime-config.js';

const fallback = () => ({ config: DEFAULT_CONFIG, modelUrl: '/models/3mushroom.glb' });

export async function loadRuntimeConfig(fetcher = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetcher('/api/config', { cache: 'no-store', signal: controller.signal });
    if (!response.ok) return fallback();
    const data = await response.json();
    const config = validateRuntimeConfig(data.config);
    const modelUrl = data.modelUrl === '/api/model' ? '/api/model' : '/models/3mushroom.glb';
    return { config, modelUrl };
  } catch {
    return fallback();
  } finally {
    clearTimeout(timeout);
  }
}
