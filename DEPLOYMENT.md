# Cloudflare 发布与后台更新接口

网站使用一个 Cloudflare Worker 同时提供前端资源和后台 API。`wrangler.jsonc` 定义静态资源与 KV 绑定，`worker/index.js` 提供接口。后台写入必须携带 `ADMIN_TOKEN`，该密钥只保存在 Cloudflare Secret 中，不提交到 GitHub。

当前网站：<https://leviat-mycelium-garden.leviastudio925.workers.dev>。当前 KV 命名空间已在 `wrangler.jsonc` 中配置，重复部署无需重新创建。
公开代码：<https://github.com/leviastudio925-collab/leviat-mycelium-garden>。

## 首次发布

```bash
npm ci
npx wrangler login
npx wrangler kv namespace create MYCELIUM_CONTENT
npm run deploy:cloudflare
npx wrangler secret put ADMIN_TOKEN
```

将新建 KV 的命名空间 ID 填入 `wrangler.jsonc` 的 `kv_namespaces[0].id`。`ADMIN_TOKEN` 应使用至少 32 字节的随机值。首次发布后，将 Wrangler 输出的网站地址保存为环境变量 `MYCELIUM_SITE_URL`，并把同一密钥保存在本机环境变量 `MYCELIUM_ADMIN_TOKEN`。GitHub 仓库公开，但密钥和 `.dev.vars`、`.admin-token` 均被 `.gitignore` 排除。

## 接口

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/api/config` | 读取当前参数和模型地址；无后台数据时返回默认值 |
| `GET` | `/api/model` | 读取已上传的 GLB；未上传时使用项目内置模型 |
| `PUT` | `/api/admin/config` | 更新完整参数 JSON，要求 `Authorization: Bearer <ADMIN_TOKEN>` |
| `PUT` | `/api/admin/model` | 上传 GLB，要求相同密钥，最大 25 MiB |

更新参数时，请复制并修改 [config.example.json](config.example.json)，然后运行：

```bash
npm run update:config -- ./config.example.json
npm run update:model -- ./new-mushroom.glb
```

`MYCELIUM_SITE_URL` 和 `MYCELIUM_ADMIN_TOKEN` 必须已设置。也可以直接对上述 `PUT` 路径发送请求。模型须为完整的 glTF 2.0 `.glb`，且包含可渲染的网格。KV 变更在不同地区可能需要约一分钟才可见，之后刷新页面即可看到新参数与模型；已经播放中的页面不会被强行中断。

原始 Windows 项目文件夹中的 `.admin-token` 保存了当前密钥，且不会上传到 GitHub。在 PowerShell 中可这样设置环境变量，再运行上面的更新命令：

```powershell
$env:MYCELIUM_SITE_URL = 'https://leviat-mycelium-garden.leviastudio925.workers.dev'
$env:MYCELIUM_ADMIN_TOKEN = Get-Content -LiteralPath .admin-token -Raw
```

如果当前机器使用系统代理访问外网，还需执行：

```powershell
$env:HTTPS_PROXY = [System.Net.WebRequest]::DefaultWebProxy.GetProxy([uri]$env:MYCELIUM_SITE_URL).AbsoluteUri
$env:NODE_USE_ENV_PROXY = '1'
```

在其他机器上操作时，需安全转移密钥或在 Cloudflare 中轮换 `ADMIN_TOKEN`。

### 参数范围

| 参数 | 范围 | 含义 |
| --- | --- | --- |
| `growth.primaryThickness` | `0.5–2` | 主分支粗细倍率 |
| `growth.secondaryThickness` | `0.3–1.5` | 二级分支粗细倍率 |
| `growth.speed` | `0.25–3` | 时间轴及后续生长速度倍率 |
| `growth.density` | `0.5–1.25` | 分叉数量倍率 |
| `mushrooms.size` | `0.5–2` | 蘑菇模型大小倍率 |

接口拒绝缺失、越界及未知参数。默认值均为 `1`。

## 代码更新

代码修改后先运行测试与构建，再推送 GitHub 并运行 `npm run deploy:cloudflare`。内容更新只用后台接口，无需重发前端。

Cloudflare 官方参考：[Workers 静态资源](https://developers.cloudflare.com/workers/static-assets/)、[KV 读写](https://developers.cloudflare.com/kv/api/)、[KV 一致性](https://developers.cloudflare.com/kv/concepts/how-kv-works/)、[Wrangler 配置](https://developers.cloudflare.com/workers/wrangler/configuration/)。
