# Ember Street / 余烬长街 v0.6.1

## Audio Interaction & Notebook Motion V2

日期：2026-09-07

v0.6.1 是纯表现层升级，不修改资源数值、事件概率、Seeded RNG、教程规则、存档 schema、人物生死规则或结局条件。

### 世界事件音效

- Night 1 敲门替换为真实木门敲击。
- 野狗替换为真实犬吠。
- 新增 `night_infected_vocal`，用于尸群仍在街外接近 / 绕行的阶段。
- 北门、围栏、墙体已经承受冲击的事件继续使用 `night_horde_impact` / `night_structure_creak`，保持“叫声”和“撞墙”的空间语义差异。
- 6 个高辨识度 cue 来自明确锁定的 Mixkit Free License 条目，经本地裁切、滤波、响度统一、单声道化与 MP3 压缩后进入运行时；来源账本见 `docs/audio/SFX_SOURCE_LEDGER_V2.md`。

### 探索反馈

- 探索结算前后比较真实库存。
- 口粮、药品、材料、零件至少一项实际增加时，播放克制的金属 / 物件翻找收纳声。
- 撤退、空手、只发生负面状态时不播放成功 cue。

### 手记交互

- “据点 / 建筑 / 幸存者 / 记录”一级导航增加约 220ms 的纸页掀动。
- 页面切换同步短翻页声；当前 tab 重复点击不重新播放。
- 底部导航本体不参与纸页动画。
- 探索地点红圈由 SVG stroke 从起点画出，并同步真实纸笔 scribble。
- 当前地点重复点击不重画、不重复播音。
- `prefers-reduced-motion` 下去掉明显位移 / 旋转与描边过程，仍即时完成状态变化。

### 音频运行时

- 世界 / 夜间事件保持 active SFX + ambience ducking。
- `page_turn`、`pen_circle`、`expedition_loot` 使用独立 interaction channel，不主动 duck BGM。
- interaction cue 按语义限流，避免连点形成噪声。
- 音频偏好继续存放在 `ember-street-audio-v1`，不进入 `GameState`。
- 所有发布音频继续完全本地化，运行时无 Mixkit / CDN / streaming 请求。

### 包体

- 注册音频：30 个本地 MP3。
- `npm run audit:audio` 实测运行时音频约 2.64 MiB，低于 3.2 MiB 门禁。
- 审计脚本不再硬编码“必须 26/30 个文件”，后续增加合法 cue 不需要修改魔法数字。

最终构建、自动回归、小工具审计与发布包结果记录在 `docs/QA.md`。
