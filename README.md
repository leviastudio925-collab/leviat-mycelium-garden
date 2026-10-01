# 菌境 · Mycelium Garden

一个可交互的菌丝生长场景。多个发光起点依次出现，同时向四周扩散、交织成网；红色蘑菇随后出现，时间轴到 100% 后仍会继续生长。

在线网站：[leviat-mycelium-garden.leviastudio925.workers.dev](https://leviat-mycelium-garden.leviastudio925.workers.dev)。
公开代码仓库：[leviastudio925-collab/leviat-mycelium-garden](https://github.com/leviastudio925-collab/leviat-mycelium-garden)。

## 本地运行

```bash
npm ci
npm run dev
```

空格切换播放与暂停，WASD 引导枝条，R 从头开始。底部只显示时间轴。Arduino 的 OSC 启动接口见 [OSC.md](OSC.md)。

## 发布与后台内容更新

网站代码可部署为 Cloudflare Worker，静态资源和后台 API 使用同一域名。蘑菇模型与生长参数存储在 Cloudflare KV；更新它们不需要重新构建网页。完整接口、参数范围及密钥设置见 [DEPLOYMENT.md](DEPLOYMENT.md)。

```bash
npm run build
npm run test:api
npm run test:scene
npm run test:sites
npm run test:osc
```

默认模型位于 `public/models/3mushroom.glb`。上传新 GLB 后，网站会优先读取后台模型；新访问或刷新页面后可看到更新。
