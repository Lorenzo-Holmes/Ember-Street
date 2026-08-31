# Ember Street · 余烬长街

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/Lorenzo-Holmes/Ember-Street?quickstart=1)

> **Seven slots. One last light.**  
> 只有七格，守住最后的灯火。

**Ember Street / 余烬长街** 是一款面向移动 Web 与小红书小工具场景的 **文字末日生存模拟 × 跑团判定 × 避难街经营 × 七格守夜** 游戏。

当前开发版：**v0.5.0 — Living Street**。

## 核心体验

```text
天亮 / 昨夜日志
→ 查看口粮、药品、防线、电力
→ 街区分工、建筑修复、每日街区状况
→ 主线 / 人物 / 地点 / 世界 Story Pool
→ 不确定行动触发 2D6 跑团判定
→ 黄昏准备
→ 七格守夜 + 夜间动态日志 + 阶段突发
→ 天亮并记录即时与延迟后果
→ DAY 10 / 20 阶段尸潮
→ DAY 30 最终尸潮
```

白天刻意更安静：读信息、认识人物、做选择；夜晚才进入高频七格操作。白天获得的 Story Flags、人物信任、伤病、设施、资源与路线情报会直接影响后续事件和 DAY 30 最终判定。

## v0.5.0 — Living Street

### 30 天生存章

- 第一章从 DAY 1 扩展到 **DAY 30**，不再以 DAY 7 作为终局
- DAY 1–7：立足期
- DAY 8–15：扩张期
- DAY 16–23：失衡期
- DAY 24–30：围城期
- DAY 10 第一轮尸潮、DAY 20 第二轮尸潮、DAY 30 最终尸潮
- 普通夜保持约 75 秒，阶段尸潮逐步延长，DAY 30 约 120 秒
- 建筑与幸存者解锁被重新分散到 30 天，避免第一周把所有系统一次性发完

### Living Street 事件生态

事件不再只有“每天一张固定大卡片”，而是组合为：

- DAY 1–6 固定章节事件
- DAY 1–30 每天至少一个 **街区状况**
- 地点事件链：药店、居民楼、超市、修车铺、地下车库等
- 人物事件链：林夏、老周、阿禾、程医生、阿梁、小满
- 世界事件、广播、天气与无选择生活日志
- 夜间动态日志与阶段突发事件
- Story Flags 记录过去选择并触发延迟后果
- 单局只抽取少量 Story Pool 内容，避免弹窗疲劳

### 2D6 跑团判定

只在结果确实不确定时投骰，不把普通经营动作全部骰子化。

- 标准：`2D6`
- 2–6：失败 / 付出明显代价
- 7–9：部分成功
- 10–11：完全成功
- 12+：极佳结果
- 双六可打开额外故事机会
- 双一产生更明显但不永久死亡的代价
- 优势：`3D6` 取最高两颗
- 劣势：`3D6` 取最低两颗
- 专长、信任、伤病、设施、路线情报和 Story Flags 提供修正
- 信任达到 3 的关键人物可以在适用判定中重投最低一颗骰子
- 骰子由 Seeded PRNG 决定；结果一旦落地立即写入存档，刷新网页不会重新投骰

### 七格守夜

- 永久 7 格配给台，不通过升级扩格
- 4 个货架；每个货架按 **3 件一批** 补货
- 罐头 / 医疗 / 电力三条三合链
- 请求之间保留安静期，不连续闪烁刷新
- DAY 1 首单约 30 秒阅读 / 操作窗口
- 尸潮阶段：外围尸影 → 接近 → 警戒 → 冲击 → 危险
- Combo、极限出餐、紧急清台继续保留
- 夜间中部区域用于低干扰动态日志与少量突发判定
- 突发判定出现时会暂停夜间计时，读剧情不会被偷时间

### DAY 30 高潮

最终夜不是 Boss 僵尸，而是过去 29 天的准备集中兑现。

- 主灯线路故障可触发关键维修判定
- 北门最后一轮冲击可触发关键守夜判定
- 过去获得的稳压模块、路线情报、围栏准备、人物信任等 Story Flags 会直接修改最终骰子
- 成功后第一街段完整亮起，并以“这条街，还活着。”收束第一章

### 街区与长期状态

- 主灯塔 + 第一街段
- 搜索站、修理工坊、诊疗站、守夜岗、宿营屋、广播亭
- 林夏、老周、阿禾、程医生、阿梁、小满 6 名长期幸存者
- 搜索 / 修理 / 诊疗 / 守夜 / 炊事 / 广播 / 休息岗位
- 幸存者具有特性、信任、精力与伤病
- 口粮按居民数量真实消耗
- 低电力会提高夜间尸潮压力
- 药品可提供一次医疗请求超时容错
- 流浪猫 → 常驻猫 → 镇街猫「小灰」
- 最多 6 小时轻量离线备货，不离线推进尸潮

### 复玩与分享

- Seeded PRNG，核心随机与跑团判定可复现
- 每日标准化 60 秒七格挑战，与主线存档隔离
- `ES1-...` 挑战码
- Canvas 本地生成 1080×1440 分享卡
- localStorage 版本化存档、夜间节流写盘、关键骰子强制写盘

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

## v0.5.0 冻结原则

1. 第一章正式长度固定为 DAY 1–30。
2. 白天是「读、想、选」，夜晚才是「快操作」。
3. 七格永久固定为 7，是产品识别度而不是升级项。
4. 骰子只处理不确定性，不把普通操作变成随机惩罚。
5. Story Flags 必须产生后续影响，资源不能只作为 HUD 数字。
6. 失败可以留下伤病、资源和路线代价，但第一章不使用永久角色死亡。
7. 不继续增加第四物资链、枪战、抽卡、PVP 或大型 SLG 系统。
8. 纯前端可完整游玩，不依赖登录、服务器或 AI API。

## 自动化覆盖目标

- 七格、三合与批次货架
- 首单节奏与请求降频
- 建筑解锁与岗位生产
- 白天事件、选择成本、日志与黄昏门槛
- DAY 1–30 每日街区状况覆盖
- Living Street 内容节点下限
- 2D6 确定性与优势 / 劣势
- 已落地骰子不可通过刷新重掷
- 生存状态、低电力尸潮惩罚与药品夜间容错
- 幸存者伤病与恢复
- Combo / 紧急清台
- 离线收益与猫状态
- 每日挑战 / 挑战码
- **NIGHT 1 → DAY 30 第一章全流程贯通测试**

## 文档

- [`docs/GDD.md`](docs/GDD.md)
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/BALANCE.md`](docs/BALANCE.md)
- [`docs/QA.md`](docs/QA.md)
- [`docs/SUBMISSION.md`](docs/SUBMISSION.md)

## 状态

**v0.5.0 — Living Street** 的目标是让《余烬长街》从“带文字的七格小游戏”变成“一条街、一群人和连续 30 天故事的末日生存模拟”。发布前门槛为：TypeScript、全部 Vitest、Production Build 与 Cloudflare dry-run 全绿。