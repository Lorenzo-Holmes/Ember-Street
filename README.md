# Ember Street · 余烬长街

> Seven slots. One last light.

**Ember Street** 是一款面向移动 Web / 小红书小工具的末日避难街轻量经营游戏。白天经营与修复街区，晚上进入只有七个格子的配给台，在幸存者订单与尸潮压力之间做快速取舍。

当前版本：**v0.1.0 — First Light**。

## 当前可玩内容

- NIGHT 1：75 秒短局
- 4 个物资货架 + 永久 7 格配给台
- 三个同类物资自动合成 Tier 2
- 幸存者求助 / 防线急需两类订单
- 尸潮压力、订单耐心、希望与零件奖励
- 天亮结算
- 第一次“镜头退开”：发现整条避难街
- 搜索站修复、第一位长期幸存者加入
- NIGHT 2 入口
- Seeded PRNG、本地存档、移动端适配

## 开发

```bash
npm install
npm run dev
```

验证：

```bash
npm run typecheck
npm test
npm run build
```

## 架构原则

- React 负责表现层，不承担每帧模拟。
- 核心玩法位于 `src/game/`，保持纯 TypeScript、可测试、可 Seed 复现。
- 经营模拟采用低频 Tick；高频动画使用 CSS/Web APIs。
- 不依赖服务器、账号、AI API 或联网排行榜。
- **流畅 > 华丽；先验证七格手感，再扩展 DAY 1–7。**

详细设计见 `docs/`。
