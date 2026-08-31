# Ember Street · 余烬长街

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/Lorenzo-Holmes/Ember-Street?quickstart=1)

> **Seven slots. One last light.**  
> 只有七格，守住最后的灯火。

**Ember Street / 余烬长街** 是一款面向移动 Web 与小红书小工具场景的 **文字末日生存模拟 × 避难街经营 × 七格守夜** 游戏。

当前最初版：**v0.4.0 — Survival Narrative**。

## 核心体验

```text
天亮 / 昨夜日志
→ 查看口粮、药品、防线、电力
→ 街区分工与建筑修复
→ 当日文字生存事件与选择
→ 黄昏准备
→ 60–90 秒七格守夜
→ 尸潮 / 请求 / 三合 / Combo
→ 天亮并记录后果
→ DAY 7 尸潮之夜
```

白天刻意更安静：读信息、认识人物、做选择；夜晚才进入高频七格操作。白天的决定会直接改变当晚的资源、请求容错、尸潮压力和人物状态。

## v0.4.0 已完成

### 文字末日生存

- DAY 1–DAY 7 第一章完整推进
- 「街区 / 行动 / 日志」白天结构
- 余烬日志时间线，记录资源、人物、建筑和夜间后果
- DAY 1–6 固定章节事件，每个事件提供 2–3 个有代价的选择
- 可读生存状态：口粮还能撑多久、药品、防线、电力
- 黄昏准备阶段；当天事件未处理不能直接跳过
- 口粮按居民数量真实消耗
- 低电力会提高夜间尸潮压力
- 药品可自动提供一次医疗请求超时容错
- 幸存者具有特性、信任、精力与可恢复伤病
- 伤病会影响工作效率；休息可恢复

### 七格守夜

- 永久 7 格配给台，不通过升级扩格
- 4 个货架；每个货架按 **3 件一批** 补货，不再每点一次就换品
- 罐头 / 医疗 / 电力三条三合链
- DAY 1 仅 3 个主要请求，DAY 2–6 为 5 个，DAY 7 为 7 个
- 请求之间保留约 2.5–3 秒安静期，不连续闪烁刷新
- DAY 1 首单约 30 秒阅读 / 操作窗口
- 尸潮阶段：外围尸影 → 接近 → 警戒 → 冲击 → 危险
- Combo、极限出餐、紧急清台继续保留
- DAY 7 为 90 秒「尸潮之夜」；失败不删档，可重整后重试

### 街区与长期状态

- 主灯塔 + 第一街段
- 搜索站、修理工坊、诊疗站、守夜岗、宿营屋、广播亭
- 林夏、老周、阿禾、程医生、阿梁、小满 6 名长期幸存者
- 搜索 / 修理 / 诊疗 / 守夜 / 炊事 / 广播 / 休息岗位
- 一键按专长排班与尸潮班表
- 流浪猫 → 常驻猫 → 镇街猫「小灰」
- 最多 6 小时轻量离线备货，不离线推进尸潮

### 复玩与分享

- Seeded PRNG，核心随机可复现
- 每日标准化 60 秒挑战，与主线存档隔离
- `ES1-...` 挑战码
- Canvas 本地生成 1080×1440 分享卡
- localStorage 版本化存档、夜间节流写盘、切后台强制保存

## 技术栈

- React 19
- TypeScript
- Vite
- Vitest
- Cloudflare Workers Static Assets
- GitHub Codespaces
- CSS / SVG / Web Audio / Canvas / localStorage

游戏规则集中在 `src/game/`。React 主要承担表现层。尸潮使用「压力状态 + 少量视觉剪影」而不是大量独立僵尸实体，优先保证移动 WebView 流畅度。

## 在线开发

点击 README 顶部 **Open in GitHub Codespaces**。仓库中的 `.devcontainer/devcontainer.json` 会自动：

- 使用 Node.js 22
- `npm install`
- 运行 `npm run dev:codespaces`
- 转发并自动打开 Vite `5173` 端口

已有 Codespace 更新远端代码：

```bash
git pull origin main
```

## 本地验证

```bash
npm install
npm run typecheck
npm test
npm run build
npm run cf:dry-run
```

GitHub Actions 会在 `main`、`dev`、`feat/**` push 以及面向 `main` 的 PR 上执行全部验证。

## Cloudflare

`wrangler.jsonc` 已配置 Workers Static Assets，构建目录为 `./dist`，SPA fallback 已启用。

```bash
npm run deploy:cf
```

## 最初版冻结原则

1. 白天是「读、想、选」，夜晚才是「快操作」。
2. 七格永久固定为 7，是产品识别度而不是升级项。
3. 资源必须产生后果，不能只作为 HUD 数字。
4. 危机可以准备，失败不制造长期死档。
5. 第一章 DAY 1–7 做完整后停止扩第二章，先做 QA、视觉与投稿。
6. 纯前端可完整游玩，不依赖登录、服务器、AI API、PVP 或真实排行榜。

## 自动化覆盖

测试包括：

- 七格、三合与批次货架
- 首单节奏与请求降频
- 建筑解锁与岗位生产
- 白天事件、选择成本、日志与黄昏门槛
- 生存状态语义
- 低电力尸潮惩罚与药品夜间容错
- 幸存者伤病与恢复
- Combo / 紧急清台
- 离线收益与猫状态
- 每日挑战 / 挑战码
- **NIGHT 1 → DAY 7 第一章全流程贯通测试**

## 文档

- [`docs/GDD.md`](docs/GDD.md)
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/BALANCE.md`](docs/BALANCE.md)
- [`docs/QA.md`](docs/QA.md)
- [`docs/SUBMISSION.md`](docs/SUBMISSION.md)

## 状态

**v0.4.0 — Survival Narrative** 是 Ember Street 的第一套完整可交付玩法骨架。后续优先级是移动端人工 QA、人物 / 建筑视觉识别度、音效与分享表现；不在最初版继续增加第二章、第四物资链、枪战、抽卡或大型 SLG 系统。
