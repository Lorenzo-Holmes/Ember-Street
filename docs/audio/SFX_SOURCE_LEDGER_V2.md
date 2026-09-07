# Ember Street / 余烬长街 — SFX Source Ledger V2

日期：2026-09-07  
范围：Audio Interaction & Notebook Motion V2 新增 / 替换的外部免费音效。

## 许可基线

- 来源平台：Mixkit（Envato）。
- 下载时许可分类：Sound Effects — Free License。
- Mixkit 的 Sound Effects 页面在 2026-09-07 明确写明：免费音效可用于 commercial / personal projects，且 attribution 非强制。
- 许可入口：https://mixkit.co/license/
- 音效入口：https://mixkit.co/free-sound-effects/
- 本项目不把原始 WAV 作为独立素材包再分发；运行时文件均经过裁切、滤波、单声道化、响度处理、淡入淡出与 MP3 压缩后嵌入游戏。
- 原始下载只保存在 Git 忽略的 `.audio-source-cache/`，发布包不包含原始 WAV，也不会在运行时连接 Mixkit。

## 素材记录

| Runtime 文件 | Mixkit 条目 | Item ID | 来源页 | 下载日期 | 处理 | Runtime SHA-256 |
| --- | --- | ---: | --- | --- | --- | --- |
| `sfx_door_knock.mp3` | Knocking on a thick wooden door | 197 | https://mixkit.co/free-sound-effects/doors/ | 2026-09-07 | 高/低通、裁切、首尾淡化、响度统一、mono 32kHz / 56kbps | `c933521f4f432840d35d35ca4774cd5b467a9f93c23ad612323c7cdeab8a4b48` |
| `sfx_dogs.mp3` | Medium size angry dog bark | 54 | https://mixkit.co/free-sound-effects/dog/ | 2026-09-07 | 高/低通、裁切、首尾淡化、响度统一、mono 32kHz / 56kbps | `648757ec01e15dee22e149cab1028b0714f3d521e5e7b3cc4abe29126709fd24` |
| `sfx_infected_vocal.mp3` | Zombie monster growl | 1973 | https://mixkit.co/free-sound-effects/monster/ | 2026-09-07 | 削高低频、裁切至短促远距感、首尾淡化、响度统一、mono 32kHz / 56kbps | `435a027d338822988c87c567a75c9340af69765fc33656d7bf0217894f49d593` |
| `sfx_page_turn.mp3` | Page turn single | 1104 | https://mixkit.co/free-sound-effects/paper/ | 2026-09-07 | 高频纸张保留、低频清理、短裁切、首尾淡化、响度统一、mono 32kHz / 48kbps | `91a1205d019c5a5a5c7c167073dfd5eba10a2b04ae3d2b376c0e5e3267ec5271` |
| `sfx_pen_circle.mp3` | Writing scribble on paper | 2369 | https://mixkit.co/free-sound-effects/write/ | 2026-09-07 | 纸笔频段整理、短裁切、首尾淡化、响度统一、mono 32kHz / 48kbps | `618267e023fe8ceb2afdfb08f8c9f06f0c6afb5487bfb054b74326ee58168091` |
| `sfx_expedition_loot.mp3` | Metal tools browsing | 3166 | https://mixkit.co/free-sound-effects/misc/ | 2026-09-07 | 金属小件频段整理、短裁切、首尾淡化、响度统一、mono 32kHz / 48kbps | `64b82083d7501b38d9259d4885a7e6a4bcda0db8e7101f43fb4c0ea96f6f0a60` |

Mixkit 条目页未在本次抓取的卡片元数据中显示独立作者 / 上传者字段，因此 ledger 不虚构作者名；以平台、条目标题与 Item ID 做唯一来源追踪。

## 可复现导入

执行：

```bash
npm run import:free-sfx-v2
```

脚本只解析上表六个明确标题，通过各条目的 Mixkit 官方下载 modal 取得 WAV，再在本地生成运行时 MP3。它不是整库抓取器，也不会扫描或批量下载 Mixkit 素材库。
