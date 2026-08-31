# Architecture — Ember Street v0.4.0

## 分层

1. `src/game/`：纯 TypeScript Game Core，负责七格、DAY/NIGHT 状态、RNG、经营、文字事件、日志、存档与挑战。
2. `src/App.tsx`：场景编排、HUD、白天三页签、黄昏和触控输入；不承载核心数值公式。
3. `src/styles.css` / `src/meta.css`：夜间、街区、事件、日志与移动端表现。
4. `src/shareCard.ts`：按需创建 Canvas 并生成本地分享 PNG。
5. `src/game/storage.ts`：版本化 localStorage、兼容补全、节流写盘与离线结算。
6. `tests/`：规则、叙事、第一章贯通、挑战、留存和 Game Feel 测试。

## GameState

主线使用单一 `GameState`。每日挑战使用 App 中独立第二份状态，不写主线存档。

关键状态：

- `phase`: `night | summary | street`
- `dayStep`: `morning | event | free | dusk`
- DAY / 预报 / 第一章完成状态
- 7 个配给槽、4 个货架、`rackStock` 批次库存、Fair Queue
- 当前请求、请求 cooldown、当夜请求上限
- 尸潮压力、防线、电力、希望、口粮、药品、零件
- 建筑、幸存者、岗位、信任、伤病
- `logs` / `activeEventId` / `resolvedEventIds`
- Combo / 极限出餐 / 紧急清台
- 小灰连续状态

## 白天状态机

```text
summary
→ revealStreet()
→ beginStreetDay()
→ event
→ resolveNarrativeChoice()
→ free
→ enterDusk()
→ dusk
→ startNextNight()
→ night
```

当天存在事件时，未处理事件不能进入黄昏。`continueChapter()` 会尊重这一门槛，并负责 DAY 7 失败重试而不是误进 NIGHT 8。

## Narrative Core

`src/game/narrative.ts` 保存第一章文字事件和日志规则。

事件由：

- 元数据
- 2–3 个 choice view
- choice availability
- 纯状态 effect

组成。选择结果只通过 GameState 改变资源、人物和日志，不直接操作 React。

## 夜间状态机

夜间逻辑按真实 `elapsedMs` 更新，不依赖固定帧率。

请求不是连续刷新：完成或错过后进入 cooldown；当达到当夜请求上限后只剩尸潮守夜。

货架每格保存 `rackStock`，同类连续取 3 件后才从 Fair Queue 补下一批。

## RNG

核心随机不得使用 `Math.random()`。

Seeded PRNG 用于：

- Fair Queue
- 每日挑战
- 挑战码
- Bug 复现
- 后续自动模拟

## 生存后果

- 防线直接降低尸潮压力增速。
- 电力低于安全区间会提高尸潮压力增速。
- 药品可在一夜内自动提供一次医疗请求宽限。
- 伤病影响生产效率；休息可以恢复。
- 口粮按居民数量在日循环中真实消耗。

这些规则都位于 Game Core，不由 UI 假装表现。

## 存档

- 当前存档版本仍兼容既有 v2 key。
- `normalizeV2` 会给旧 v2 存档补齐 v0.4 新字段。
- v1 仍可迁移。
- 夜间普通写盘最多约 5 秒一次。
- `visibilitychange` / `pagehide` 强制保存。
- 存储失败静默降级，不阻止核心游戏启动。

## 性能约束

- React 不进行每帧动画状态更新。
- 七格点击不等待动画结束。
- 尸潮只有单一压力状态；尸影不是独立 AI。
- 白天主要依赖静态 DOM/CSS，降低持续动画负载。
- 分享 Canvas 只在主动生成时创建。
- 不加载 3D 引擎、大视频、在线字体或后端 SDK。

## 安全阀

- 七格满：紧急清台，第三次才提前结束当夜。
- 事件：至少保留一条可继续的决策路径；不可承担的选择禁用。
- DAY 7 失败：回街区重整后重试，不进入 DAY 8。
- 第一章不做永久死亡。

## CI

`.github/workflows/ci.yml` 对 `main`、`dev`、`feat/**` 与 PR 执行：

1. Codespaces devcontainer JSON 校验
2. `npm install`
3. `npm run typecheck`
4. `npm test`
5. `npm run build`
6. `npm run cf:dry-run`

`tests/chapter-flow.test.ts` 负责验证 NIGHT 1 → DAY 7 的完整状态链。
