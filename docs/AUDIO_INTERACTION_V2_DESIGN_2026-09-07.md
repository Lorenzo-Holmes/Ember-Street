# Ember Street / 余烬长街
## Audio Interaction & Notebook Motion V2 设计文档

日期：2026-09-07  
状态：IMPLEMENTED / v0.6.2 XHS AUDIO HOTFIX
范围：事件音效、探索结算音效、主导航翻页反馈、探索地点“手绘圈选”动效  
原则：只增强表现层，不修改资源数值、事件概率、RNG、存档结构、教程规则或结局逻辑。

### 实施结果（2026-09-07）

设计已按本文落地为 v0.6.1，并在 v0.6.2 增加小红书专用音频兼容后端。最终采用 6 个明确锁定的 Mixkit Free License 条目，其中敲门与野狗同名替换旧合成 cue，并新增感染者、翻页、画圈、探索收获 4 个运行时文件；来源、条目 ID、处理方式和 SHA-256 见 `docs/audio/SFX_SOURCE_LEDGER_V2.md`。中央注册表仍是 30 个 MP3 源，音频审计实测总载荷约 **2.64 MiB**，低于 3.2 MiB 源素材门禁；普通 Web 直接播放这些 MP3，小红书构建则把全部 30 条转换成 JS Base64 + Web Audio。

交互实现采用独立短音通道：翻页、画圈、探索收获不触发 ambience ducking，并有按 cue 限流。一级导航内容由 `NotebookPageTransition` 包裹、底部导航本体留在容器外；探索红圈由双 SVG ellipse 的 stroke-dashoffset 动画绘制；探索收获则比较结算前后真实库存 delta。浏览器实测确认同一导航与同一地点重复点击均不重复请求对应音频，撤退也不会请求 `sfx_expedition_loot.mp3`。

最终回归还发现并修正了翻页初版的移动端瞬时水平 overflow：不再 transform 整个过渡外壳，而是由固定宽度 / 裁切的外壳包住内部 `.notebook-page-turn__sheet`，仅内部纸页运动。修复后专项 tutorial + V1 mobile 19/19、完整 UI smoke 46/46 通过。v0.6.1 曾生成含 MP3 的小工具 ZIP，但真实上传器随后证明媒体扩展名不在比赛代码包白名单中，因此该 ZIP 已被 v0.6.2 的“0 MP3 / 30 条 Base64 Web Audio”产物取代，不再作为发布候选。

---

## 1. 当前基线

项目已经完成 `Audio Atmosphere & Event SFX v1`：

- 5 条阶段氛围：白天据点、探索、普通夜、尸潮、天亮 / 结局；
- 18 类夜间语义音效；
- 3 个 UI cue：黄昏锁门、骰子、日志落笔；
- `AudioDirector` 负责阶段、夜间事件与 ducking；
- `audioRegistry.ts` 是本地音频注册表；
- `audioRuntime.ts` 负责浏览器播放、解锁、暂停与失败降级；
- 音频设置独立存于 `ember-street-audio-v1`，不进入 GameState；
- 所有运行时音频都必须本地打包，当前音频载荷约 2.70 MiB，审计上限 3.2 MiB。

目前的主要缺口不是“没有声音”，而是：

1. 高辨识度事件仍缺真实质感，例如尸群 / 感染者叫声；
2. 敲门、野狗等已有语义 cue，但现有素材偏合成，需要替换为更自然的免费素材；
3. 探索成功带回物资没有独立结算反馈；
4. 主导航切页只有瞬间 DOM 切换，没有“翻手记”的感觉；
5. 探索地点已经有红笔圈选视觉，但目前是静态出现，没有“笔正在画圈”的动作过程。

---

## 2. 用户体验目标

本轮不是把《余烬长街》改造成高频音效手游，而是让玩家感到：

> 我不是在点网页卡片，而是在翻一本灾后手记；远处真的有东西在叫，门外真的有人敲，路线真的被我用笔圈了下来。

因此所有新增反馈遵循四条规则：

1. **声音解释世界，不替代文字。** 夜间事件音效要先建立空间感和危险感，不使用夸张恐怖片 jump scare。
2. **UI 声音来自“纸、笔、物件”。** 导航不用电子 click；路线选择不用科技提示音。
3. **动作短，阅读长。** 大部分 UI SFX 控制在约 0.15–0.8 秒；危险环境声可到约 1–2.5 秒，但不循环抢占阅读。
4. **同一语义保持一致。** 敲门就是木门 / 围栏敲击，野狗就是街外犬吠，翻页就是纸页，不为“丰富”而随机换成不相干声音。

---

## 3. 音效素材来源策略

### 3.1 首选：Mixkit

用途：本轮优先从 Mixkit 搜索并下载自然音效，再裁切、响度统一、压缩后打进 `public/assets/audio/sfx/`。

理由：Mixkit 当前对 Sound Effects 提供 Free License；其音效页面明确说明可用于 commercial / personal projects，且不强制署名。正式接入时仍需保存素材名称、来源页、下载日期与许可快照。

官方页面：

- https://mixkit.co/license/
- https://mixkit.co/free-sound-effects/

### 3.2 备选：Pixabay

Pixabay Content License 当前允许免费使用、无需强制署名并允许修改，但禁止把素材基本原样作为 standalone 内容再次出售 / 分发。若 Mixkit 没有合适的感染者、布料、拾取或环境素材，可以作为第二来源。

官方许可摘要：

- https://pixabay.com/service/license-summary/

### 3.3 备选：Freesound

只使用：

- CC0；或
- CC BY，并把作者、作品、许可写入 attribution ledger。

默认拒绝 CC BY-NC，避免比赛发布、宣传和未来商业化时出现许可边界问题。

官方 FAQ：

- https://freesound.org/help/faq/

### 3.4 许可记录

新增：

`docs/audio/SFX_SOURCE_LEDGER_V2.md`

每个外部音效必须记录：

- runtime 文件名；
- 原素材标题；
- 作者 / 上传者（页面可见时）；
- 来源平台；
- 来源 URL；
- 下载日期；
- 当时许可类型；
- 是否裁切 / EQ / 淡入淡出 / 降噪 / 压缩；
- SHA-256（处理后运行时文件）。

运行时不得访问 Mixkit / Pixabay / Freesound；所有音频必须在开发阶段下载并本地化。

---

## 4. 第一批音效清单

### P0：本轮必须完成

| 游戏语义 | 建议素材方向 | 触发位置 | 处理方式 | 备注 |
| --- | --- | --- | --- | --- |
| 感染者 / 尸群叫声 | Monster growl / Angry monster scream / Monsters scream | 尸潮接近、外围街段突破、部分最终尸潮事件 | 裁到 0.8–1.8s，削高频、加一点距离感 | 不使用清晰人类惨叫，避免听成幸存者受伤 |
| 木门 / 围栏敲击 | Knocking on a thick wooden door | `gate-knocking` 等门外求生者事件 | 保留 2–3 下敲击，约 0.7–1.4s | 替换现有偏合成版本 |
| 野狗 | Dog barking twice / Medium size angry dog bark | `stray-dogs` | 1–2 次短吠，轻微削低频 | 替换现有偏合成版本；不要用“快乐小狗” |
| 搜到物资 | 物件翻动 + 小物落入包内 / crate pick-up 类 | 探索结算且实际获得任一物资 | 0.35–0.9s；不使用金币、升级、胜利铃声 | 这是“找到东西”，不是“关卡胜利” |
| 主导航翻页 | Page turn single / Paper slide / Single book paging | 据点 / 建筑 / 幸存者 / 记录互切 | 0.25–0.55s，低音量 | 同一 tab 重复点击不播放 |
| 路线画圈 | Writing scribble on paper / Fast signing with a pen | 探索地点按钮从未选中变为选中 | 0.25–0.65s | 与红笔画圈动效同步 |

### P1：资源允许时追加

| 游戏语义 | 方向 |
| --- | --- |
| 空手而归 | 拉链 / 空包轻响 / 纸上划掉，不使用失败 buzzer |
| 发现新地点 | 铅笔划线 + 很轻的纸张摩擦，而非解锁铃声 |
| 物资箱翻找 | 木箱、金属小件、布包翻动 |
| 建筑升级完成 | 锤击 + 木料落位，短促两段式 |
| 人物受伤 | 布料摩擦、急促呼吸或医疗物件声，不直接播放惨叫 |

---

## 5. 夜间事件音效映射调整

当前 `NightAudioKey` 已有 `night_horde_impact`，它更像“尸群撞击结构”，不适合承担全部尸潮语义。

新增：

```ts
night_infected_vocal
```

建议重新分配：

- `horde-approach` → `night_infected_vocal`
- `horde-breakthrough` → `night_infected_vocal`
- 最终尸潮中“街段逼近 / 改道 / 外部逼近”类 → `night_infected_vocal`
- `horde-north-gate`、墙体 / 围栏受力 → 保持 `night_horde_impact`
- 诊疗、断电、争执等保持原有语义，不因尸潮背景而全部换成感染者叫声。

这样玩家可以通过声音区分：

- **东西在外面叫**；
- **东西已经在撞墙**；
- **屋内正在出问题**。

这比给所有尸潮事件叠同一个吼叫更有空间层次。

---

## 6. 探索结算声音

### 6.1 触发条件

仅当一次探索决定真正增加了库存时播放 `expedition_loot`。

判定应基于结算前后实际库存差，而不是根据玩家选择了“继续深入”或“谨慎绕行”来猜测。

建议比较：

- ration
- medicine
- materials
- parts
- 以及后续若存在的特殊可计数物品

只要任一有效收获 > 0，播放一次。

### 6.2 不应播放的情况

- 玩家撤退；
- 空手而归；
- 只发生受伤 / 失踪 / 死亡，没有获得物资；
- 因 UI 重渲染再次进入同一结果状态；
- 重新加载存档后重复播报旧结算。

### 6.3 声音风格

禁止使用：

- 金币；
- 宝箱闪光；
- 升级；
- “叮！”式手游成功音；
- 明显科幻界面提示。

目标是：

> 手伸进废墟里翻到几件还能用的东西，然后把它们塞进包里。

因此推荐“物件翻动 + 小件碰撞 / 放入袋中”的自然声音。

---

## 7. 主导航“翻手记”效果

### 7.1 触发范围

只针对底部一级导航：

- 据点
- 建筑
- 幸存者
- 记录

不对以下操作强制套翻页：

- 夜间事件选项；
- 探索事件三选一；
- 骰子；
- 模态弹窗；
- 同一页面内部 tab；
- 自动进入黄昏 / 夜晚 / 天亮。

原因：一级导航代表“翻到手记另一页”，事件按钮代表“做决定”，两者视觉语义不同。

### 7.2 动画形式

目标不是 3D 电子书翻页，而是轻量的纸页掀动。

建议时序：

1. `0ms`：用户点击新 tab，播放 `ui_page_turn`；
2. `0–90ms`：当前纸页向点击方向轻微偏移 / 亮边；
3. `70–190ms`：新页面进入，纸张阴影从侧边扫过；
4. `190–240ms`：纸页落平；
5. 动画结束。

总时长建议：**180–240ms**。

视觉参数：

- 位移约 8–16px；
- 旋转不超过约 1.2deg；
- 阴影只在边缘短暂出现；
- 不缩放正文；
- 不让底部导航本身跟着翻走。

### 7.3 技术方案

新增一个轻量页面容器，例如：

```tsx
<NotebookPageTransition navKey={nav} direction={direction}>
  {pageContent}
</NotebookPageTransition>
```

推荐同步切换 React 内容，CSS 只负责新页进入和纸页遮罩动画，不人为延迟业务状态。

原因：

- 不阻塞点击；
- 不依赖 View Transition API；
- 小工具 WebView 兼容风险更低；
- 不会因为 setTimeout 延迟导航导致教程或状态不同步。

导航方向由固定顺序计算：

```text
据点 → 建筑 → 幸存者 → 记录
```

点击右侧 tab：从右向左翻；点击左侧 tab：反向。

### 7.4 可访问性

`prefers-reduced-motion: reduce` 时：

- 关闭位移 / 旋转动画；
- 保留即时切页；
- 翻页音效仍按用户声音设置执行。

---

## 8. 探索地点“用笔画圈”动效

### 8.1 当前状态

目前 `.v1e-location.active ...::after` 已经生成一个红色不规则椭圆圈，但它是瞬间出现的静态 border。

### 8.2 目标

点击一个地点后，让玩家看到：

1. 笔尖落下；
2. 红圈沿地点名称周围快速画一圈；
3. 末端有非常轻微的越线 / 抖动；
4. 圈最终停留，作为当前选中态。

### 8.3 推荐实现：SVG stroke 绘制

不要尝试用复杂 JS canvas。

在地点标题容器中，当 `active === true` 时挂载一个绝对定位的小 SVG：

```svg
<ellipse ... pathLength="1" />
```

用：

```css
stroke-dasharray: 1;
stroke-dashoffset: 1;
animation: notebook-circle-draw 260ms ease-out forwards;
```

可以叠第二条略微偏移、低透明度路径，制造真实手绘重复线条感。

优点：

- 真正是“线被画出来”，不是整个圆缩放出现；
- 只在当前 active 元素挂载，状态简单；
- 不需要额外图片；
- 体积几乎为零；
- 可以自然与 `ui_pen_scribble` 同步。

### 8.4 声画同步

地点发生真实变化时：

- 立即播放 `ui_pen_scribble`；
- stroke 动画约 240–320ms；
- 音效尾部允许比动画多约 100–200ms，形成“笔离开纸面”的自然收尾。

同一地点重复点击：

- 不重新播放；
- 不重新画圈。

---

## 9. 音频架构 V2 改动

### 9.1 `audioTypes.ts`

扩展：

```ts
export type UiAudioCueKey =
  | 'dusk_lock'
  | 'dice_roll'
  | 'journal_mark'
  | 'page_turn'
  | 'pen_circle'
  | 'expedition_loot';
```

`NightAudioKey` 新增：

```ts
| 'night_infected_vocal'
```

### 9.2 `audioRegistry.ts`

新增本地映射，例如：

```text
sfx_infected_vocal.mp3
sfx_page_turn.mp3
sfx_pen_circle.mp3
sfx_expedition_loot.mp3
```

并用真实免费素材替换：

```text
sfx_door_knock.mp3
sfx_dogs.mp3
```

替换同名文件不会增加注册表数量；新增 4 个文件后，注册总数预计由 26 变为 30。

### 9.3 `audioRuntime.ts`

当前单一 active SFX 策略适合夜间事件，但 UI 快速反馈不应该把所有短音都当成互斥长事件。

建议分为两类：

- `world/event`：继续使用当前 active SFX + ambience ducking；
- `interaction`：翻页、画圈、探索拾取使用短 UI cue，可不触发明显 ducking，且允许上一条短 UI cue 自然结束。

最低实现可以保持现有 `playUiCue`，但给 UI cue 使用更低音量并减少 / 禁止背景 ducking；若实测快速切页出现截断，再拆成 interaction channel。

### 9.4 `V1BottomNav.tsx` / `V1Entry.tsx`

导航包装函数：

```text
若 target === active：return
计算方向
playUiCue('page_turn')
setNav(target)
```

页面 content 外包一层 `NotebookPageTransition`。

### 9.5 `ExploreRouteV1.tsx`

地点点击：

```text
若 location.id !== locationId：
  playUiCue('pen_circle')
  setLocationId(location.id)
```

active 标题渲染 SVG stroke 圈。

### 9.6 探索结算

在 `V1Entry.tsx` 的 expedition `onDecision` 中，在 `resolveExpeditionStance()` 前后计算库存差。

只有检测到真实正向收获时：

```ts
gameAudio.playUiCue('expedition_loot')
```

音效失败不得影响 `commit()`。

---

## 10. 音量与混音建议

以当前 `medium` 总音量为基准：

| Cue | 相对 registry volume 建议 |
| --- | ---: |
| 感染者叫声 | 0.46–0.54 |
| 敲门 | 0.52–0.60 |
| 野狗 | 0.42–0.50 |
| 探索物资 | 0.30–0.38 |
| 翻页 | 0.22–0.30 |
| 画圈 | 0.20–0.28 |

约束：

- 翻页 / 画圈不得压过 BGM；
- 感染者声音可以短暂 duck ambience；
- 翻页和画圈不要 duck，避免连续操作时背景音乐“抽吸”；
- 同一秒内大量 UI cue 必须限流，尤其防止连点导航产生重叠噪音。

---

## 11. 包体预算

当前音频运行时约 2.70 MiB，审计上限 3.2 MiB，理论余量约 0.50 MiB。

本轮原则：

- 两个现有文件（敲门、野狗）直接同名替换，不增加注册数量；
- 新增感染者、翻页、画圈、探索物资 4 个短 MP3；
- 新文件尽量单声道；
- 目标码率 48–80 kbps；
- 单个 UI cue 尽量 < 40 KiB；
- 感染者 cue 尽量 < 80 KiB；
- 新增总量目标 < 180 KiB；
- 完成后仍保持音频总载荷 < 3.0 MiB，给后续音效留下余量；绝不只卡在 3.2 MiB 边缘。

`scripts/audit-audio-assets.mjs` 当前硬编码“必须 26 个注册 MP3”，实现 V2 时应同步更新，最好改为“至少存在注册表引用且全部本地可解析”，避免未来每加一个合法 cue 都修改魔法数字。

---

## 12. 免费素材候选池

实现阶段优先试听以下 Mixkit 素材方向：

### 敲门

- `Knocking on a thick wooden door`

来源类别：Doors  
https://mixkit.co/free-sound-effects/doors/

### 野狗

- `Dog barking twice`
- `Medium size angry dog bark`

来源类别：Dog  
https://mixkit.co/free-sound-effects/dog/

### 感染者 / 尸群

- `Monster growl`
- `Angry monster scream`
- `Monsters scream`

来源类别：Scream / Monster  
https://mixkit.co/free-sound-effects/scream/

试听时排除：

- 明显龙吼；
- 卡通怪物；
- 极清晰、近距离的人类惨叫；
- 影视预告片式巨响；
- 有明显音乐底的素材。

### 翻页

- `Page turn single`
- `Paper slide`
- `Single book paging`

来源：  
https://mixkit.co/free-sound-effects/paper/  
https://mixkit.co/free-sound-effects/page/

### 画圈

- `Writing scribble on paper`
- `Fast signing with a pen`
- `Writing with a pen on paper`

来源类别：School / Paper / Write  
https://mixkit.co/free-sound-effects/school/

### 搜到物资

优先从真实物件声组合，而不是直接使用“game success”：

- `Metal tools browsing`
- `Metal tools box browsing`
- `Mechanical crate pick up`（仅在试听后确认不显科幻时）
- `Small wood plank pile drop`

来源：  
https://mixkit.co/free-sound-effects/tools/  
https://mixkit.co/free-sound-effects/misc/

如果候选都太“游戏化”，改从 Pixabay / Freesound 搜索：

```text
rummage bag
scavenging debris
small objects into backpack
metal parts pickup
cloth bag rustle
```

---

## 13. 实施顺序

### Phase A — 素材与许可

1. 从首选免费库逐项试听候选；
2. 下载原始文件到不进入发布包的临时素材目录；
3. 建立 `SFX_SOURCE_LEDGER_V2.md`；
4. 裁切、响度统一、淡入淡出、压 MP3；
5. 更新 runtime manifest。

### Phase B — 声音代码

1. 新增 `night_infected_vocal`；
2. 更新夜间事件映射；
3. 新增 `page_turn`、`pen_circle`、`expedition_loot`；
4. 替换敲门 / 野狗 runtime 文件；
5. 调整音频审计脚本。

### Phase C — 纸本交互动效

1. 底部主导航接翻页 cue；
2. 新增 `NotebookPageTransition`；
3. 探索地点圈选改为 SVG stroke draw；
4. 接 pen cue；
5. 增加 reduced-motion 规则。

### Phase D — 探索结算

1. 计算库存 delta；
2. 有真实收获才播放；
3. 验证撤退 / 空手 / 负面事件不误播。

### Phase E — QA

1. `npm test`
2. `npm run build`
3. `npm run audit:audio`
4. 手机宽度 320 / 360 / 390 / 430 回归；
5. 开 / 关 SFX、低 / 中 / 高音量回归；
6. 连续快速切四个主导航，确认不爆音、不叠成噪声；
7. 探索地点反复切换，确认圈选动作跟手；
8. Night 1 敲门必须明显可辨；
9. 野狗事件必须听起来在街外，而不是宠物就在玩家旁边；
10. 尸潮叫声与“撞墙”声音必须能区分；
11. 拦截所有 MP3 时游戏仍可完整操作；
12. 最终发布包重新核对小工具体积。

---

## 14. 验收标准

本轮只有同时满足以下条件才算完成：

- [x] 敲门使用真实自然的门 / 围栏敲击素材；
- [x] 野狗使用真实犬吠素材；
- [x] 至少一类尸潮事件使用独立感染者 / 尸群叫声；
- [x] 尸潮撞击类事件仍保留结构撞击声，不被叫声全部覆盖；
- [x] 成功搜到物资时有一次克制的“找到东西”反馈；
- [x] 空手、撤退时不播放成功结算声；
- [x] 点击四个底部一级导航会播放纸张翻页声；
- [x] 同一导航重复点击不重复播音效；
- [x] 一级导航切换有 180–240ms 左右的纸页动作；
- [x] `prefers-reduced-motion` 下不执行明显翻页位移动画；
- [x] 探索地点切换时，红圈是“画出来”的，不是瞬间显示；
- [x] 画圈同时有短促笔划声；
- [x] 现有声音总开关 / 事件音效开关可以控制新增 cue；
- [x] 所有外部素材都有来源与许可记录；
- [x] 运行时不加载任何外部音频 URL；
- [x] `npm test`、`npm run build`、`npm run audit:audio` 全部通过；
- [x] 音频总载荷保持在 3.2 MiB 内，目标仍低于约 3.0 MiB；
- [x] 音频失效时不影响任何玩法、选择、存档或教程。

---

## 15. 最终设计结论

推荐本轮名称：

**Audio Interaction & Notebook Motion V2 / 听觉交互与手记动效升级**

本轮重点不是“再加很多音效”，而是建立三种明确的反馈语言：

1. **世界真的在发生事情**：感染者、敲门、犬吠；
2. **玩家真的完成了一次行动**：探索找到东西；
3. **玩家真的在操作一本手记**：翻页、用笔画圈。

这三层与《余烬长街》现有的灾后手记视觉、低密度 BGM、文字决策玩法是同一方向，可以明显增加代入感，同时保持包体、性能和交互克制。
