# Ember Street v0.6.1 — QA Matrix

## Audio Interaction & Notebook Motion V2 验收（2026-09-07）

本轮从已完成 `Audio Atmosphere & Event SFX v1` 与夜间视觉升级的 `main` 继续，只修改表现层、音频来源链和交互反馈。资源收益、事件概率、Seeded RNG、人物生死规则、教程判定、存档 schema 与结局条件均未调整。

### 实现结果

- 夜间音频语义从 18 类扩展到 **19 类**，新增 `night_infected_vocal`；“尸群在街外接近 / 绕行”与“北门 / 围栏已经承受撞击”不再共用一种声音。
- Night 1 木门敲击与野狗改为真实环境素材；另新增感染者、翻页、纸笔画圈、探索收获 4 个 cue。6 个外部高辨识度素材均来自明确锁定的 Mixkit Free License 条目，条目 ID、来源页、处理与 SHA-256 记录在 `docs/audio/SFX_SOURCE_LEDGER_V2.md`。
- 运行时注册 **30 个本地 MP3**。`scripts/audit-audio-assets.mjs` 不再硬编码文件总数，但继续逐项验证路径、MP3 头、单文件 700 KiB 与总音频 3.2 MiB 门禁。
- 世界 / 夜间 cue 继续使用原有 ambience ducking；`page_turn`、`pen_circle`、`expedition_loot` 使用独立 interaction channel，不主动压低 BGM，并有按 cue cooldown。
- 一级导航使用约 220ms 的前 / 后向纸页动作；固定底部导航在动画容器之外。同一 tab 重复点击是 no-op，不重播翻页音。
- 探索地点红圈改为两层 SVG ellipse 的 stroke 绘制；真正切换地点时播放短纸笔 scribble，同一地点重复点击不重画、不重播。
- 探索收获 cue 依据结算前后 `ration / medicine / materials / parts` 的真实库存 delta；撤退、空手或只有负面状态时不播放成功声。
- `prefers-reduced-motion` 会去掉翻页位移 / 旋转和红圈描边过程，仍保留最终状态。

### 浏览器专项验证

在真实 Chromium 会话中解锁音频后逐项观察运行时资源请求：

| 场景 | 实际请求 / 结果 |
| --- | --- |
| Night 1 `gate-knocking` | `sfx_door_knock.mp3` |
| `stray-dogs` | `sfx_dogs.mp3` + 普通夜 BGM |
| `horde-approach` | `sfx_infected_vocal.mp3` + 尸潮 BGM |
| `horde-north-gate` | `sfx_horde_impact.mp3`，确认仍为结构撞击 |
| 据点 → 记录 | `sfx_page_turn.mp3`；重复点击当前“记录”后新增请求为 0 |
| 探索便利店 → 西街药店 | `.v1e-route-circle.is-drawing` 挂载，并请求 `sfx_pen_circle.mp3`；重复点击当前药店后新增请求为 0 |
| 谨慎搜索成功 | 口粮 `12→17`、材料 `12→13`，请求 `sfx_expedition_loot.mp3` |
| 同一探索选择“马上回去” | 库存不变，新增音频请求为 0 |

浏览器控制台未发现本轮代码错误；开发环境仍只有既有 `favicon.ico` 404。

### 自动验证与发布门禁

| 检查 | 最终结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm test` | **45 个测试文件通过、6 个报告生成文件按设计跳过；334/334 执行项通过** |
| `npm run audit:audio` | **30/30 注册 MP3 有效；运行时音频约 2.64 MiB**，低于 3.2 MiB |
| `npm run test:release-blocker` | **2/2** 通过 |
| `npm run test:ui-smoke` | 修复后全量重跑 **46/46** 通过 |
| `npm run audit:assets:strict` | A01–A47 **47/47**，9/9 sprite sheets；图片载荷 699.5 KiB |
| `npm run build` | 通过，生产 CSS / JS 正常生成 |
| `npm run audit:xhs` | 通过；普通 Web `dist` 53 文件，离线 / 容器表面限制通过 |
| `npm run cf:dry-run` | 通过；Wrangler 读取 59 个 Web 静态文件，仅 dry-run |
| 最终 `build:minitool` | `output/releases/ember-street-xhs-20260907T091154Z/app`；解包 **5,593,391 bytes（约 5.33 MiB）** |
| 最终 `audit-minitool` | **51 文件、64 本地资源引用、0 base64**；Chrome 61 静态兼容 / fallback 检查通过 |
| 最终 `package-minitool` | ZIP **4,967,149 bytes（约 4.74 MiB）**，低于 10 MiB 硬上限；仅保留“高于 2 MiB 推荐目标”的非阻断 warning |
| 最终 ZIP SHA-256 | `9038967b20defac3a59a75c2f47468b3275a4e88566cc5fb33d853adf7b1928c` |
| `git diff --check` | 通过；仅输出 Windows 工作树 LF→CRLF 提示，无 whitespace error |

### 回归中发现并修复的问题

第一次全量 `test:ui-smoke` 在 4 个教学视口和建筑 / 幸存者 / 记录移动端页面发现水平宽度瞬时多出约 11–13px。原因是最初直接对整个 `NotebookPageTransition` 外层执行 `translateX + rotate`，Playwright 在 220ms 动画期间测量页面宽度时，变换后的纸页会进入文档 overflow 区域。

没有放宽测试。最终结构改为：外层保持固定宽度并裁切，内部 `.notebook-page-turn__sheet` 执行纸页动作；底部导航继续在外层之外。修复后先定向重跑 tutorial + V1 mobile **19/19**，随后完整 `test:ui-smoke` 再跑 **46/46** 全绿。

### 已知边界

- Mixkit 原始 WAV 只存在于 Git 忽略的 `.audio-source-cache/`，发布包中只有处理后的短 MP3，运行时没有外部音频 URL。
- 自动化验证覆盖桌面 Chromium 与 320 / 360 / 390 / 430 等移动视口；**小红书模拟器、Android 8.1 / Chrome 61 真机、iOS 真机的实际听感仍未实机验证**。
- 小工具 ZIP 约 4.74 MiB，明显低于 10 MiB 硬上限，但高于工具给出的 2 MiB 推荐目标；当前主要体积仍来自字体 / 既有素材而不是新增 V2 音效。
- 最终听感仍建议投稿前在手机外放与耳机各人工试听一次，重点检查真实敲门 / 犬吠 / 感染者声的主观响度与 BGM 平衡；这不影响当前代码和包体门禁通过。

## Audio Atmosphere & Event SFX v1 验收（2026-09-07）

本轮从 `main` / `252f271` 的夜间视觉升级版本继续。工程原先没有任何 MP3、`Audio` / `AudioContext` 播放层或声音设置；新增听觉层只读游戏状态，不改事件数值、RNG、选择、教程或存档 schema。

### 实现结果

- 5 个低密度氛围：白天据点、探索、普通夜、尸潮、天亮/结局。
- 18 个 `NightAudioKey` 类别覆盖 51 个静态夜间事件和医疗/离队两类动态模板；UI 不按单个事件 ID 写音效分支。
- 3 个 UI cue：黄昏门闩、骰子落桌、纸面记录。
- `AudioDirector` 统一处理阶段切换、事件 cue、约 540ms 淡入淡出、SFX ducking、后台暂停和恢复。
- 玩家第一次点击“开始游戏 / 继续游戏”后才解锁音频，避免浏览器自动播放限制。
- `sessionStorage` 记录同一事件实例是否已响过，避免 React 重渲染、菜单往返或同标签刷新后连续重复敲门。
- 菜单与封面均增加声音设置：总开关、背景氛围、事件音效、低/中/高三档音量。偏好保存在 `ember-street-audio-v1`，不进入 `ember-street-save-v3`。
- 26 个本地 MP3 中，5 个阶段 BGM 和 `sfx_power_failure.mp3` 已由本地 `music/` 中六首审核妙响母带导入；其余 20 个短事件/UI 音效由仓库内确定性、无采样生成器生成。
- 原始六首母带约 **34.5 MiB**，保留在 Git 忽略的 `music/`；`scripts/import-reviewed-music.py` 按已确认时长匹配母带，裁切、响度统一并压缩到稳定运行时文件名，避免中文文件名在不同终端编码下造成导入失败。

### 自动验证结果

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run audit:audio` | 26/26 注册 MP3 存在且有有效 MP3 头；审核母带导入后总载荷约 2.70 MiB，仍低于 3.2 MiB 音频预算 |
| `npm test` | 45 个文件、333 项通过；6 个报告生成用例按设计跳过 |
| `WRITE_PLAYTEST_AUDIT=1 npm test`（Windows 使用 `set`） | **51 个文件、339/339 全部通过**，含 30 天策略、压力曲线、600+ 局重复评估、DAY29 矩阵与夜间视觉审计 |
| `npm run test:ui-smoke` | **46/46** 通过；新增 3 项音频专项浏览器验证 |
| `npm run build` + `npm run audit:xhs` | 通过；正式母带版普通 Web 构建音频载荷约 2767.3 KiB |
| `npm run build:minitool` | 通过；MP3 被复制到独立小工具目录 |
| `audit:minitool` | 47 个文件、60 个本地资源引用、0 base64；循环接缝优化后的正式母带版解包约 **5.33 MiB** |
| `package:minitool` | 通过；ZIP **4,966,076 bytes（约 4.74 MiB）**，仍明显低于 10 MiB 硬上限 |
| 小工具 ZIP SHA-256（正式母带预提交候选） | `0be72defb51aa502540ded2ebcdaed213a5e14d3599cde7607c8ff4fc7c5b1eb` |
| `npm run cf:dry-run` | 通过；55 个 Web 静态文件被 Wrangler 读取，仅 dry-run，未在本轮手动执行线上部署 |

浏览器专项明确验证：继续一个 `gate-knocking` 夜间存档会请求 `bgm_night_ambient.mp3` 与 `sfx_door_knock.mp3`；关闭声音后偏好跨刷新保留且游戏存档 JSON 完全不变；拦截全部 `*.mp3` 请求时，Night 1 三个选择仍存在并可正常完成。

### 已知边界

- **P1 / 实机：** 当前通过桌面 Edge/Chromium 和 Chrome 61 静态兼容审计，尚未在小红书模拟器、Android 8.1 真机和 iOS 真机实际听感验收。
- **P1 / 听感：** 正式妙响母带已进入运行时版本，但当前仍是自动裁切与响度归一后的第一版；建议投稿前在手机外放与耳机各人工听一遍循环接缝、尸潮压迫感和文字阅读干扰。
- **循环接缝：** 白天 / 普通夜 / 尸潮 / 探索四条循环轨已改为文件内 2 秒首尾交叉融合，不再依赖 1 秒级淡出后硬循环；抽样首尾平均电平差已收敛到约 0.5–3.2 dB。天亮与断电仍保留自然淡出，因为它们是一次性 cue。
- **P2 / 混音：** 当前采用低/中/高三档整体音量，没有独立 BGM/SFX 连续滑杆；比赛版本优先避免增加设置复杂度。

## Night Event Visual Upgrade v1 验收（2026-09-07）

本轮以 `main` / `78d242c` 为恢复点，并保留工作区中已存在的本任务候选改动。先审计真实夜间数据、排程、教程、日志、存档和 A01–A47 映射，再实施与收敛视觉分类；没有新增或覆盖二进制素材，也没有改动资源收益、事件选项、判定结果、尸潮里程碑、结局条件或教学步骤。

### 现状审计与实现结果

- 共审计 **51 个静态夜间事件定义**：31 个普通事件、6 个随机尸潮片段、8 个紧急事件、6 个 DAY29 最终尸潮阶段；另有按人物生成的医疗危机和低希望离队两类动态模板。
- 原因不是素材文件缺失，而是夜间 UI 用事件 ID 做精确图片查询；夜间 ID 与探索事件素材 ID 不同，因此几乎全部回退到同一张 A06 宿营屋总览。
- 每个夜间事件现在都在数据层声明 `visualKey`；UI 仅通过 `NIGHT_VISUAL_DEFINITIONS` 取得锁定素材，不再按事件 ID 写分支。
- 14 个语义类别已注册：门外来访、医疗、负伤归来、室内分歧、外部威胁、空床、失窃、短暂安静、门外遗留物、离开、断电、广播、建筑受损、火险。
- P0 五类全部接入锁定正式素材：A20 / 门外来访、A28 / 医疗、A25 / 负伤归来、A22 / 室内分歧、A23 / 外部威胁。P1 五类也均有注册素材；`night_package` 暂无现有剧情强行使用，避免为了展示图片而制造语义错配。
- 事件结算继续写原有 `night_seen:<eventId>:<day>`，并追加 `night_visual_seen:<visualKey>:<day>`。排程优先选择本夜未用且最近两夜未出现的视觉；候选不足时按确定性层级回退，绝不缩减事件预算或替换为不匹配图片。
- 没有增加存档版本。旧 v2/v3 存档缺少视觉历史时按空历史处理；当前事件仍由已保存的 `nightState.currentEventId` 决定，刷新不会重抽事件或换图。
- 素材源加载失败时显示语义化暗场文本，不显示破图，也不阻塞三个正式选项。
- 完整内部工作清单由报告模式生成到 `qa/playtest/out/night-event-visual-audit.md` 与 `.json`；前者便于逐行复核，后者保留每个事件的完整正文、触发字段、三个选项、成本 / 检定 / 结果、旧图路径、新图路径与共享映射。该目录按既有规则忽略提交。

### 自动验证结果

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm test` | 44 个文件、329 项通过；6 个报告生成用例按设计跳过 |
| `WRITE_PLAYTEST_AUDIT=1 npm test`（Windows 使用 `set`） | 50 个文件、335 项全部通过，无跳过；包含 30 天主流程、600+ 局重复评估、压力曲线、DAY29 场景矩阵和 53 行夜间视觉审计清单 |
| `npm run test:ui-smoke` | 43 项全部通过，包含新增的 7 项夜间视觉浏览器验证及完整 Tutorial DAY1→NIGHT1→DAY2 日志流程 |
| `npm run audit:assets:strict` | A01–A47 47/47、9/9 sprite sheets 通过；图片载荷 699.5 KiB |
| `npm run build` | 通过 |
| `npm run cf:dry-run` | 通过；只验证 Cloudflare 构建和上传配置，未发布线上版本 |
| `npm run audit:xhs` | 普通 Web `dist` 文件表面审计通过；不把 18.95 MiB 普通构建当作上传包 |
| `npm run build:minitool` + `audit:minitool` + `package:minitool` | 20 个文件；解压 2.67 MiB；ZIP 2.19 MiB；ES2017 经典脚本、Chrome 61 静态兼容、相对本地资源和禁用能力检查通过 |
| 小工具技能包 `audit_artifact.py` | 目录与 ZIP 均通过；仅提示 2.19 MiB 高于 2 MiB 推荐目标，远低于 10 MiB 硬上限 |
| `git diff --check` | 通过；项目没有独立 lint 脚本，不虚报 lint 已运行 |

### 流程验收

| 流程 | 验证范围 |
| --- | --- |
| A Night 1 教学 | 320×568、360×844、390×844、430×844 完整执行新游戏、白天安排、探索、首夜敲门选择、DAY2 日志；首夜明确命中 `night_door_visitor` 且素材加载完成 |
| B 多个夜晚 | 单元测试跨 seed 验证同夜视觉去重及最近两夜冷却；完整 30 天模拟和 600+ 局报告模式通过，事件预算不缩减 |
| C 刷新 | 浏览器刷新前后事件 ID、`visualKey`、背景定位、夜间队列、RNG、统计与选择状态保持一致；已投骰不重投 |
| D 旧存档 | 缺少视觉历史的 v2/v3 形态可加载；有效 DAY12 旧档保持 DAY12、不触发教学、不重置进度 |
| E 移动端 | 320×568、360×800、390×844、430×932 无横向溢出；插图保持 4:3，三个按钮至少 48px，最后一个选项可滚动到达；Chrome 61 有无 `aspect-ratio` 的尺寸回退 |
| F 30 天回归 | Day / Night、资源、人物、探索、建筑、日志、教学、存档、DAY29 最终尸潮与 DAY30 结局相关自动回归全部通过 |

### 本轮发现与处理

浏览器首轮检查发现夜间图片固定高度与笔记本边框/内边距叠加后，实际比例被压到约 1.25:1；没有放宽断言，而是改为现代浏览器原生 4:3、Chrome 61 独立回退公式，随后四档手机视口全部通过。代码复核还发现动态医疗危机在结算时会先清除自身触发标记，若随后再反查事件就无法记录本次 `visualKey`；现改为把玩家实际看到的 key 传入结算，并增加专门回归。另修正了发布文档中“普通夜固定 5 件”以及 A19/A27/A29 仍未批准的过时描述，并将既有 `playwright-production-report/` 明确列为生成产物，未删除其中内容。

### 已知边界

- **P1 / 低：** 当前 P0 使用已批准的环境叙事素材，而非为本轮重新绘制的五张专属场景；类别已经明显分开，但“负伤归来”和“室内争执”仍是语义复用，后续有审核通过的专属图时只需替换集中映射。
- **P1 / 低：** `night_package` 的注册素材已就绪，但现有 51 个事件里没有真正的门外包裹剧情，因此没有强行映射。
- **P1 / 实机边界：** 本轮使用桌面 Edge/Chromium 手机视口与静态 Chrome 61 兼容审计；尚未在小红书模拟器、Android 8.1 真机或 iOS 真机验收。
- **P2 / 有意不做：** 没有给历史日志增加夜间缩略图，避免为非必要 P1 功能重构日志数据。
- **P2 / 既有内容频率：** 30 天策略审计仍显示 `gate-knocking` 等少数事件出现频率偏高。本轮没有借视觉任务改事件权重；最近两夜的视觉冷却已生效，但它不等同于重写事件内容池。

## Tutorial / New Player Experience v1 验收（2026-09-06）

本轮从干净的 `main` / `b0a6642` 开始。先核对真实 V1 入口、人物选路/锁定名单、分档夜晚、v3 存档与 A47 素材映射，再集成教学；未重画素材或调整资源、人物、探索收益、人口、结局和尸潮概率。

### 自动验证结果

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm test` | 正常门禁 319 项通过；5 个生成审计报告的可选用例默认跳过 |
| `WRITE_PLAYTEST_AUDIT=1 npm test`（Windows 使用 `set`） | 48 个文件、324 项全部通过，无跳过 |
| `npm run test:ui-smoke` | 36 项全部通过，包含新增的 12 项教学/日志浏览器验证 |
| `npm run build` | 通过 |
| `npm run cf:dry-run` | 通过；仅模拟部署，未执行线上发布 |
| `npm run audit:assets:strict` | 47/47 锁定素材、9/9 sprite sheets 通过 |
| `npm run audit:xhs` | 普通 Web 构建的文件表面审计通过；不把普通 dist 当作小工具上传包 |
| `npm run build:minitool` + `audit:minitool` | 独立小工具构建和经典脚本/相对资源/禁用能力检查通过 |
| 技能包 `audit_artifact.mjs` | 小工具静态目录体积审计通过 |
| `git diff --check` | 通过；无独立 lint 脚本，不虚报 lint 已运行 |

`tests/tutorial-v1.test.ts` 新增 25 项，覆盖状态机、真实操作、全阶段跳过、存档迁移、日志去重和主流程。100 个 seed 验证首夜换入已有敲门事件后，随机数状态、预算、尸潮判定和紧急队列仍与对照一致。另以相同状态逐日比较「已完成教学」与「没有教学字段」两组 DAY2→DAY30 的工作、建筑、夜间结果、存档和结局，确认教程完成后不改玩法。

原有自动模拟器的 5 个报告生成用例全部实际运行。主审计完成 **1320 次**策略模拟，三种策略的流程完成率均为 100%；这不是人类玩家胜率，也不代表游戏没有平衡压力。其他报告包括修正版策略、每日压力曲线、600+ 局事件重复评估及 DAY29 场景矩阵。

### 实际浏览器流程

| 流程 | 验证范围 |
| --- | --- |
| A 新游戏 | 在 320×568、360×844、390×844、430×844 完整执行清点、真实炊事、真实选路/出发、探索选择、结束白天、第一夜、DAY2 日志、自由安排并刷新 |
| B 中途刷新 | ASSIGN_SURVIVOR、SEND_EXPEDITION，以及首夜已经投出的判定；核对物资、日期、统计、RNG、骰子和夜间队列不变 |
| C 跳过 | INTRO、SEND_EXPEDITION、FIRST_NIGHT 跳过后继续/刷新；无残留高亮、遮罩、锁定或重复出现的教程 |
| D 旧存档 | v2、缺字段的 v3 DAY1/2/12/29 代码层兼容；真实浏览器加载有效 DAY12 fixture 不退回教程、不覆盖进度 |
| E 主流程 | 原有 DAY1→30、结局、建筑、探索、人口、失踪/死亡、存档用例与全部既有 UI smoke 回归通过 |
| 额外边界 | 明确选择默认休息可推进；撤退合法；无 ResizeObserver/scroll-margin 时定位按钮仍可见；45 条日志按 20/20/5 分页且旧页不丢失 |

新手流程逐页截图复核：每屏一张短便签，教学按钮至少 44px，320px 不横向溢出；定位只滚动/导航，不冒充游戏操作。开局、选路、夜间与日志截图留在 `output/tutorial-v1/`；旧测试自行产出的 `qa/ui-overhaul/screenshots/`、策略审计 `qa/playtest/out/` 以及报告/缓存均已忽略，不混入代码提交。选路截图等待真实素材解码，避免把未完成加载的占位背景当成素材缺失。

### 本轮发现与处理

明确选择「休息」原先会因其等于默认显示岗位而没有实际写入存档；现已记录这个真实选择并增加浏览器回归。首页此前不传建筑等级，会显示 A06 据点总览；现改为按实际等级取图，浏览器核对首页和建筑页 Lv1 都来自 A47 所在的 `buildings-b.webp` 最后一格。Day2 固定解锁通知曾会抢在日志前，现仅延后显示，不删除事件或虚标已读。白天结算与夜间排程补上重复调用防护。

测试配置原先会收集 `output/` 中旧发布快照的重复用例；现明确收集当前 `tests/` 和 `qa/playtest/`，没有删除历史工程。一次浏览器全量运行中出现 `net::ERR_NETWORK_CHANGED` 导致开发服务器模块加载失败；已保留 trace 定位并完整重跑通过，没有通过放宽断言掩盖。旧存档测试先修正为已回答第7天原则的有效第12天存档，避免把缺失历史决定的跳日 fixture 误判为教学阻塞。

### 限制与未覆盖环境

**P1／实机验收边界：** 本轮是桌面 Edge/Chromium 的手机视口和能力降级测试，不是 Android 8.1 / Chrome 61、iOS 或小红书真机容器验收。未测真实设备性能，也没有测量第一次接触游戏的人类阅读时间；1–3 分钟仍是设计目标。GitHub 推送与 Cloudflare dry-run 不等于线上部署或小红书上传成功。

**P2／既有平衡诊断：** 策略报告仍提示 DAY7/DAY14 原则结果差距、部分地点访问占比低和事件重复率。本轮保留报告、不以教学任务名义擅改数值。

**P3／有意保留的范围：** 老存档不存在的详细历史不能补造；新日志最多保留 360 条，每页 20 条。没有新增独立的 Night1 延迟剧情链，仅复用真实选择及故事标记。未增加设置中的重放教学功能。

## P0 自动化发布门禁

以下任何一项失败都不能发布到 `main`：

- [x] `GameState` 运行时不再包含七格 / 货架 / 订单 / Combo / 夜间倒计时字段。
- [x] v2 七格存档可迁移到 v3，并回收旧槽位 / 货架剩余物资。
- [x] v3 夜间刷新保留 phase、事件队列、pending dice 和 rngState，不能刷新刷骰。
- [x] 每人每天只有一个主要岗位；确认名单后锁定，探索出发后不能重写。
- [x] 5 人供餐：1 个普通厨师不足、2 个普通厨师达到饱腹、阿禾单人明显更高效。
- [x] 救回普通居民会增加真实供餐人口。
- [x] 重伤 / 死亡 / 失踪人物不能正常参加危险调遣。
- [x] 探索支持 1–2 人、风险分级和撤退。
- [x] DAY 1–5 禁止永久死亡；后期极端风险允许失踪 / 死亡链。
- [x] 失踪搜救与确认死亡会更新统计并写入纪念墙。
- [x] 六座建筑支持 Lv0–3 和资源成本。
- [x] 所有玩家夜间决策事件恰好 3 个选择。
- [x] 普通事件使用 2/3/4 的日期分档预算，尸潮片段替换部分普通槽，DAY29 使用固定最终序列。
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
