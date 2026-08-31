# Architecture — Ember Street v0.3.0

## 分层

1. `src/game/`：纯 TypeScript Game Core，负责规则、RNG、状态转移、经营、留存与挑战。
2. `src/App.tsx`：场景编排、HUD、触控输入，不承载核心数值公式。
3. `src/styles.css` / `src/meta.css`：UI、环境表现和移动端适配。
4. `src/shareCard.ts`：按需创建 Canvas 并生成本地分享 PNG。
5. `src/game/storage.ts`：版本化 localStorage、迁移、节流写盘与离线结算。
6. `tests/`：规则、挑战、留存和 Game Feel 单元测试。

## GameState

单一 `GameState` 表示主线运行状态；每日挑战在 App 中使用独立的第二份 `GameState`，不写主线存档。

关键状态包括：

- phase: `night | summary | street`
- DAY / 当前预报
- 7 个配给槽、4 个货架、Fair Queue
- 当前请求、尸潮压力、希望、资源
- 建筑、幸存者、岗位
- Combo / 极限出餐 / 紧急清台
- 猫连续状态
- 第一章完成状态

## RNG

关卡内容不得依赖 `Math.random()`。核心随机全部来自 seeded PRNG，因此支持：

- 同 Seed 复现
- 每日挑战
- 挑战码
- Bug 复现
- 自动模拟扩展

Fair Queue 以完整三元组构建后再洗牌，降低不可恢复的坏序列概率。

## 时间模型

夜间逻辑由约 250ms 调度，但所有计算使用真实 `elapsedMs`，不依赖固定帧率。

经营模拟不运行 60FPS；离线期间也不持续运行计时器，而是通过 `lastActiveAt` 一次性计算最多 6 小时收益。

## 存档

- 当前 schema：v2
- 旧 v1 存档可迁移
- 夜间普通状态写盘最多约 5 秒一次
- `visibilitychange` / `pagehide` 强制保存关键状态
- 存储失败时静默降级，不阻止核心游戏运行

## 性能约束

- 七格点击路径不等待动画完成。
- React 不进行每帧粒子更新。
- 尸潮只保留一个压力状态；画面中的尸影不是独立 AI 实体。
- 环境效果必须可以在不改变规则的情况下削减。
- 分享 Canvas 只在用户主动生成时创建。
- 不加载大视频、在线字体、3D 引擎或大型运行时。

## 游戏安全阀

七格满而无法三合时，玩家可主动紧急清台，防止输入软死局。前三次清台形成逐级代价，第三次才提前结束夜晚。

DAY 7 失败不会进入错误的 NIGHT 8，而是返回街区调整后重试 DAY 7。

## CI

`.github/workflows/ci.yml` 在主干、开发分支、功能分支和 PR 上执行：

1. `npm install`
2. `npm run typecheck`
3. `npm test`
4. `npm run build`

合并到 `main` 前必须全部通过。
