# Architecture

## 分层

1. `src/game/`：纯 TypeScript Game Core，负责规则、RNG、状态转移。
2. React：负责 HUD、场景和输入，不存放核心数值规则。
3. CSS/Web APIs：负责瞬时反馈和氛围表现。
4. `storage.ts`：本地版本化存档，失败时静默降级。

## 性能约束

- 七格点击路径不得等待动画结束。
- 夜晚逻辑 Tick 当前为 250ms 调度，逻辑使用 elapsed time，不依赖固定帧率。
- 尸潮用单一 `pressure` 状态表示，不模拟大量僵尸实体。
- 背景尸影只负责表现规模。
- React 不进行每帧粒子更新。

## RNG

核心随机必须来自 seeded PRNG；`Math.random()` 不参与关卡内容生成。这样可用于每日挑战、好友 Seed、Bug 复现和自动模拟。
