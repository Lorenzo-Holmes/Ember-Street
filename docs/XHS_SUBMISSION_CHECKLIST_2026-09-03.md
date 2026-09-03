# Ember Street / 余烬长街 — 小红书小工具提交检查清单

日期：2026-09-03

## 冻结版本

- `main` release merge：`9414855d15ac7c46c02b4b08b631406b9e70b8a9`
- 冻结 release candidate：`c21f2652c3e45832b598b85886dd04c08b6cbf87`
- Release PR：#23
- A01–A29：全部按用户已确认 canonical masters 处理

除非发现阻断游玩的生产缺陷，不再改变：
- `据点 / 探索 / 幸存者 / 记录` 一级导航
- 幸存者与街区居民的系统分离
- 街区居民 `后勤 / 维修 / 守备` 群体轮值
- 六座 Lv0–3 设施
- 1–2 人探索与地点优先流程
- 夜间三选一、资源成本、2D6 与后果预览
- 30 天结构、DAY29、DAY30 与结局判定

## 自动门禁

提交包必须由冻结版本构建，并全部通过：

1. `npm run typecheck`
2. `npm test`
3. `npm run audit:assets:strict`
4. `npm run build`
5. `npm run audit:xhs`

移动 UI release candidate 另外已经通过 390×844 UI Smoke。

## 提交 ZIP

使用 `.github/workflows/package-xhs.yml` 生成可复现提交包：

- artifact：`ember-street-xhs-20260903`
- ZIP：`ember-street-xhs-20260903.zip`
- SHA-256：`ember-street-xhs-20260903.sha256`

ZIP 根目录应直接包含 `index.html` 与构建资源，而不是额外嵌套一个 `dist/` 目录。

## 上传前人工检查

- 小工具能从 ZIP 正常启动。
- 首屏为新版插画驱动据点页，而非旧 Dashboard。
- `据点 / 探索 / 幸存者 / 记录` 四导航正常。
- 林夏等已确认人物图可见；地点图与事件图不出现 A 编号。
- 街区居民与命名幸存者不会混为同一角色池。
- 探索出发前能返回重新安排；真正出发后不出现伪返回。
- 夜间三项选择完整可点，资源不足状态正确禁用。
- 页面在手机竖屏无横向滚动，底部导航不遮挡主要按钮。
- 清除旧站点缓存/旧 localStorage 后再检查一次新游戏入口。

## Cloudflare

冻结 `main` 合并后，GitHub Actions 的 `Deploy Cloudflare` 已针对同一 merge SHA 执行。上线域名仍需在真实浏览器/手机上做一次人工视觉确认；CI 成功不能替代生产页面肉眼验收。

## 比赛提交

最终提交时只使用“小红书小工具”称呼，不写成“小程序”。比赛笔记与展示素材应从最终线上版本录制，不使用旧灰度线框或旧 Dashboard 截图。
