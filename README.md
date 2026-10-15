# 菌境 · Mycelium Garden

一个可交互的地下洞窟与菌丝生长场景。先在真实洞窟模型中行走，沿漂浮微光穿过曲折通道，进入深处的大空腔后转入菌丝生长。六个彼此分散的发光起点依次出现，同时向四周扩散、交织成网；红色蘑菇随后出现，时间轴到 100% 后仍会继续生长。

在线网站：[leviat-mycelium-garden.leviastudio925.workers.dev](https://leviat-mycelium-garden.leviastudio925.workers.dev)。
公开代码仓库：[leviastudio925-collab/leviat-mycelium-garden](https://github.com/leviastudio925-collab/leviat-mycelium-garden)。

## 本地运行

```bash
npm ci
npm run dev
```

洞窟阶段：WASD 行走，点击画面后鼠标控制视角，Esc 释放鼠标；不支持鼠标锁定的浏览器也可按住左键拖动视角。人物有石壁碰撞和地面跟随，发光粒子提示通往大空腔的路线；按正常步速沿路线行走约半分钟，抵达后自动衔接生长。

生长阶段：WASD 引导枝条，底部只显示原有时间轴。两个阶段均可按空格暂停/继续，R 从洞窟入口重新开始。Arduino 的 OSC 启动接口见 [OSC.md](OSC.md)。

默认生长时长为 **2 分钟**（不含洞窟行走），先缓慢萌发，再逐渐加快；暂停时不计时。分支更丰富，后半程生成更多大小不同的红色蘑菇；时间轴到 100% 后仍继续生长。

洞窟资源位于 `public/models/cave.glb`。网页版本仅将原始 8K 贴图缩至 2K，几何与碰撞结构保持原样，体积约 15.5 MB；可用 `scripts/prepare-cave-model.py` 从原始 GLB 重新生成（需要 Pillow）。

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

## Blender 工程

可编辑的菌丝、蘑菇 GLB 和镜头动画位于 [`exports/mycelium-garden.blend`](exports/mycelium-garden.blend)。操作与重新生成说明见 [BLENDER.md](BLENDER.md)。
