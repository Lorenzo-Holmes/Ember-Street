# Ember Street v0.6.0 — QA Matrix

## P0 自动化发布门禁

以下任何一项失败都不能发布到 `main`：

- [x] `GameState` 运行时不再包含七格 / 货架 / 订单 / Combo / 夜间倒计时字段。
- [x] v2 七格存档可迁移到 v3，并回收旧槽位 / 货架剩余物资。
- [x] v3 夜间刷新保留 phase、事件队列、pending dice 和 rngState，不能刷新刷骰。
- [x] 每人每天只有一个主要岗位；黄昏后锁定。
- [x] 5 人供餐：1 个普通厨师不足、2 个普通厨师达到饱腹、阿禾单人明显更高效。
- [x] 救回普通居民会增加真实供餐人口。
- [x] 重伤 / 死亡 / 失踪人物不能正常参加危险调遣。
- [x] 探索支持 1–2 人、风险分级和撤退。
- [x] DAY 1–5 禁止永久死亡；后期极端风险允许失踪 / 死亡链。
- [x] 失踪搜救与确认死亡会更新统计并写入纪念墙。
- [x] 六座建筑支持 Lv0–3 和资源成本。
- [x] 所有玩家夜间决策事件恰好 3 个选择。
- [x] 普通夜 5 个主事件；尸潮夜 6 个。
- [x] Emergency 不占主事件槽。
- [x] DAY 10 / 20 / 29 必定尸潮。
- [x] 同 Seed / 同状态生成同一夜间顺序。
- [x] DAY 30 不生成可玩夜晚。
- [x] DAY 29 四种最终结果均可由状态计算。
- [x] 13 个结局全部具有可达 fixture。
- [x] `npm run typecheck` / `npm test` / `npm run build` / `npm run cf:dry-run` 已在功能 HEAD 通过；最终发布仍要求最新 HEAD 和 `main` release commit 再次全绿。

## P0 手工主流程

发布后 / 投稿前至少人工检查：

- [ ] DAY1 白天可理解人物状态、物资箱、建筑和调遣。
- [ ] 未安排人物默认休息，不造成状态死锁。
- [ ] 探索队 1 人 / 2 人选择正常，撤退按钮始终可用。
- [ ] 失踪后主界面出现搜救入口；广播搜救和两人搜救成本清楚。
- [ ] 首次确认死亡后纪念墙可见。
- [ ] 物资箱数值与建筑升级成本同步。
- [ ] 人口增加后供餐覆盖率即时变化。
- [ ] 黄昏明确提示“夜晚不能换岗”。
- [ ] 普通夜一屏聚焦一个事件，三个方案成本 / 风险可读。
- [ ] 2D6 结果与修正来源可理解。
- [ ] DAY10 / DAY20 / DAY29 尸潮的视觉和文案有明显区别。
- [ ] DAY29 结束后直接进入 DAY30 结算，不再出现操作按钮。
- [ ] 结局图鉴记录解锁并在新开档后保留。

## P1 移动端

重点 viewport：360×800、375×812、390×844、393×873、412×915、430×932。

检查：

- [ ] 无意外横向滚动。
- [ ] 主要触控目标约 44px 或以上。
- [ ] 调遣按钮不互相覆盖。
- [ ] 建筑卡与物资箱在 360px 宽度可自然换行。
- [ ] 探索地点、三选一事件、骰子和结果按钮不会被底部遮挡。
- [ ] DAY30 结局正文和 13 结局图鉴可滚动。
- [ ] `prefers-reduced-motion` 下仍可理解骰子和状态反馈。

## P1 生命周期

- [ ] 切后台 / `pagehide` 后重新打开不会丢失关键进度。
- [ ] 夜间刷新保持当前事件和已经投出的骰子。
- [ ] localStorage 不可用时至少能够开始临时新游戏而不白屏。
- [ ] 无 Web Audio / Vibration 环境不影响规则运行。

## 自动测试文件

- `tests/v060-day-management.test.ts`：岗位和供餐覆盖。
- `tests/expedition-v060.test.ts`：探索风险、撤退、死亡保护 / 后期死亡。
- `tests/memorial-v060.test.ts`：失踪搜救、确认死亡、纪念墙和人口压力。
- `tests/night-scheduler-v060.test.ts`：三选一、determinism、5/6 事件、Emergency、尸潮、2D6。
- `tests/campaign-v060.test.ts`：DAY29 最终可玩、DAY30 ending only。
- `tests/endings-v060.test.ts`：13 结局可达和最终尸潮等级。
- `tests/save-v3.test.ts`：v2→v3 迁移与 v3 刷新安全。

## 放行条件

1. 最新 feature HEAD 完整 CI 全绿。
2. GDD / Architecture / Balance / QA / Submission 与 v0.6 代码一致。
3. 从最终 feature tree 创建单一干净 `feat: release v0.6.0` commit 到 `main`。
4. `main` 自己的 CI 再次全绿。
5. `dev` 同步到同一个 release commit。

Cloudflare CI 仅执行 Wrangler dry-run；没有额外证据时不得把它描述为已实际线上部署。