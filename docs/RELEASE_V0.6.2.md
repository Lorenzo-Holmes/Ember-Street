# Ember Street / 余烬长街 v0.6.2

## Xiaohongshu Embedded Audio Compatibility Hotfix

日期：2026-09-07

v0.6.2 只修正小红书小工具发布兼容层。v0.6.1 的 30 个正式声音、事件映射、翻页/画圈交互、资源结算判断、玩法数值、Seeded RNG、教程、存档 schema 与结局条件均不改变。

### 原因

比赛小工具上传器实际允许的代码包文件类型为 HTML / CSS / JS / JSON / 图片 / WOFF 字体，不接受 `.mp3`。因此 v0.6.1 虽然通过旧本地技能审计，上传时仍会被 `assets/audio/music/bgm_dawn_release.mp3` 等文件阻断。

### 修复

- 普通 Web / Cloudflare 构建继续使用原有 30 个 MP3，不降低网页版音质。
- `build:minitool` 从中央音频注册表读取全部 30 个 MP3 源文件，构建期转换为 Base64 字符串。
- 最终小工具把声音拆成 6 个经典 JS 数据文件：5 个 BGM 分片 + 1 个 SFX 分片。
- 小工具 bundle 内的音频路径改为无扩展名 `embedded:music/...` / `embedded:sfx/...` key。
- 运行时检测到 `window.__EMBER_AUDIO_DATA__` 后切换到 Web Audio；通过 `atob → Uint8Array → AudioContext.decodeAudioData()` 解码，再用 `AudioBufferSourceNode` 播放。
- BGM 只保留当前阶段的解码 buffer；短 SFX 最多缓存 8 个解码结果，避免把 30 个声音一次性展开成 PCM 占用内存。
- 小工具最终目录删除整个 `assets/audio/` 媒体目录；ZIP 内 `.mp3` 数量必须为 0。
- `audit-minitool` 的允许扩展名与真实上传白名单同步，`.mp3` 再次混入时直接失败。
- 每条嵌入音频都会被审计实际解码字节数；单条超过 1 MiB 直接失败。

### 已验证

- 30/30 声音均进入小工具 Base64 数据层。
- 最大单条为 560,526 bytes，低于 1 MiB 硬限制。
- 小工具严格 CSP 预览中，启动游戏成功调用 Web Audio 解码并启动白天 BGM。
- 导航切换成功解码并播放翻页 cue。
- Night 1 敲门及 `horde-approach` 感染者事件均成功触发新的 Web Audio source。
- 上述流程中浏览器网络资源请求 `.mp3 = 0`。
- Web Audio 不存在或解码失败时保持静音降级，不影响任何游戏状态与选择。

真机 / 小红书官方模拟器的最终听感仍需以平台上传后的实际预览为准；本版本首先消除代码包文件类型硬阻塞。
