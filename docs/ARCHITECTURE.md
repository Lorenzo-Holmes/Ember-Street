# Architecture — Ember Street v0.5.0

## 分层

1. `src/game/`：纯 TypeScript Game Core，负责七格、30 天 DAY/NIGHT 状态、RNG、经营、Story Pool、2D6、夜间叙事、日志、存档与挑战。
2. `src/App.tsx`：场景编排、HUD、街区 / 行动 / 日志、骰子表现、黄昏和触控输入；不承载核心数值公式。
3. `src/styles.css` / `src/meta.css` / `src/living.css`：夜间、街区、事件、骰子、日志与移动端表现。
4. `src/shareCard.ts`：按需创建 Canvas 并生成本地分享 PNG。
5. `src/game/storage.ts`：版本化 localStorage、兼容补全、节流写盘、关键判定强制保存与离线结算。
6. `tests/`：规则、叙事、Living Street、30 天贯通、挑战、留存和 Game Feel 测试。

## GameState

主线使用单一 `GameState`。每日挑战使用 App 中独立第二份状态，不写主线存档。

关键状态包括：

- `phase`: `night | summary | street`
- `dayStep`: `morning | event | dusk`
- DAY / 预报 / DAY 30 第一章完成状态
- 7 个配给槽、4 个货架、`rackStock` 批次库存、Fair Queue
- 当前请求、请求 cooldown、当夜请求上限
- 尸潮压力、防线、电力、希望、口粮、药品、零件
- 建筑、幸存者、岗位、信任、伤病
- `logs` / `activeEventId` / `resolvedEventIds`
- `storyFlags` / `resolvedStoryEventIds` / `storyDailyIds`
- `pendingCheck`: 当前 2D6 / 3D6 判定
- `nightFeed` / `nightNarrativeFlags` / `nightIncidentId`
- Combo / 极限出餐 / 紧急清台
- 小灰连续状态

## 白天状态机

```text
summary
→ revealStreet()
→ beginStreetDay()
→ 固定章节事件（若有）
→ 每日街区状况 / Story Pool
→ 可选 2D6 判定
→ enterDusk()
→ dusk
→ startNextNight()
→ night
```

DAY 1–6 的固定章节事件承担前期主线门槛；DAY 7–29 的内容主要来自每日街区状况与 Story Pool。DAY 30 成功后才进入 `chapterComplete`。

## Narrative Core

- `src/game/narrative.ts`：DAY 1–6 固定章节事件与基础日志。
- `src/game/dailySituations.ts`：DAY 1–30 每日街区状况。
- `src/game/story.ts`：地点 / 人物 / 街区 / 世界 / 小灰 Story Pool、Story Flags、条件事件和骰子后果。
- `src/game/nightStory.ts`：夜间动态日志、阶段突发和 DAY 30 关键判定。

事件规则只通过 `GameState` 产生后果，不直接操作 React。

## Dice Core

`src/game/dice.ts` 负责：

- 标准 2D6
- 优势 3D6 取高二
- 劣势 3D6 取低二
- 修正汇总
- 双六 / 双一
- 信任 3 的最低骰重投

所有骰子读取并推进 `rngState`，不得使用 `Math.random()`。

`rollPendingCheck()` 对已经具有 `dice` 的判定直接返回原状态，所以存档恢复后不会重新掷骰。UI 在第一次投骰后使用强制保存，动画只展示已确定的结果。

## 夜间状态机

夜间逻辑按真实 `elapsedMs` 更新，不依赖固定帧率。

请求完成或错过后进入 cooldown；达到当夜请求上限后只剩尸潮守夜。货架每格保存 `rackStock`，连续取 3 件后才补下一批。

夜间叙事只使用少量动态 Feed 和阶段突发。需要玩家阅读 / 投骰时，核心 tick 会尊重待处理判定并暂停对应叙事阶段，避免读文本时损失操作时间。

## 30 天节奏

统一使用 `CHAPTER_FINAL_DAY = 30`，禁止在业务逻辑重新散落 `day === 7` 终局判断。

阶段节点：

- DAY 1–7：立足
- DAY 8–15：扩张
- DAY 16–23：失衡
- DAY 24–30：围城
- DAY 10 / 20：阶段尸潮
- DAY 30：最终尸潮

## RNG

Seeded PRNG 用于：

- Fair Queue
- Story Pool 日抽取
- 2D6 / 3D6
- 夜间叙事
- 每日挑战
- 挑战码
- Bug 复现

核心规则不得使用 `Math.random()`。

## 生存后果

- 防线降低尸潮压力增速。
- 低电力提高尸潮压力增速。
- 药品提供一夜一次医疗请求宽限。
- 伤病影响生产效率，休息可以恢复。
- 口粮按居民数量真实消耗。
- Story Flags 改变后续事件与关键判定。

## 存档

- 继续兼容既有 v2 key。
- `normalizeV2` 给旧存档补齐 Story Flags、Pending Check、Night Feed 等字段。
- v1 仍可迁移。
- 夜间普通写盘节流。
- `visibilitychange` / `pagehide` 强制保存。
- 投骰等不可重放操作立即强制保存。
- 存储失败静默降级，不阻止新游戏启动。

## 性能约束

- React 不进行每帧动画状态更新。
- 七格点击不等待动画结束。
- 尸潮使用单一压力状态，尸影不是独立 AI。
- 骰子动画只使用 CSS / DOM，不引入 Three.js。
- 白天主要依赖静态 DOM/CSS。
- 分享 Canvas 只在主动生成时创建。
- 不加载 3D 引擎、大视频、在线字体或后端 SDK。

## 安全阀

- 七格满：紧急清台，第三次才提前结束当夜。
- 固定章节事件至少保留一条可继续路径。
- Story Pool 失败只产生资源、状态、伤病或路线代价，不永久死亡。
- DAY 30 失败回到最终准备状态，不进入 DAY 31。
- 第一章不做永久角色死亡。

## CI

`.github/workflows/ci.yml` 对 `main`、`dev`、`feat/**` 与 PR 执行：

1. Codespaces devcontainer JSON 校验
2. `npm install`
3. `npm run typecheck`
4. `npm test`
5. `npm run build`
6. Cloudflare `wrangler deploy --dry-run`

关键自动化：

- `tests/living-street.test.ts`：30 天事件覆盖、内容节点、骰子确定性与不可刷新重掷。
- `tests/chapter-flow.test.ts`：NIGHT 1 → DAY 30 完整状态链。