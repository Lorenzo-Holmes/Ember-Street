# 小工具独立打包

普通网页仍使用 `npm run build`。小工具构建单独生成经典脚本、兼容样式、图片压缩副本和字体子集，不修改源素材，也不覆盖已经交付的发布包。

## 环境

- Node.js 22 和项目依赖（`npm ci`）。
- Python 3.10 或更新版本，以及 `fonttools`、`brotli`。
- 如需指定 Python 解释器，设置环境变量 `MINITOOL_PYTHON`。

完整 ZIP 校验使用用户提供的 minitool-zip-builder 1.6.0：

1. 下载 [校验技能包](https://fe-static.xhscdn.com/mini-tool/20260831163932/minitool-zip-builder-1.6.0.skill)。
2. 核对 SHA-256：`29c04115fd89d7eab7b81775f4287ae20c569ad3794d25d8404dc0ec3ec3b65e`。
3. 解压到项目的 `.codex/`，确保 `.codex/minitool-zip-builder/scripts/audit_artifact.py` 存在，并阅读该目录的 `SKILL.md`。

下载的技能和生成产物不加入 Git。

## 构建与校验

```sh
npm test
npm run build:minitool
```

构建会打印 `MINITOOL_ARTIFACT`，其值为新生成的 `output/releases/ember-street-xhs-时间戳/app` 目录。把下面的 `APP_DIRECTORY` 替换为该目录：

```sh
node scripts/audit-minitool.mjs APP_DIRECTORY
node scripts/package-minitool.mjs APP_DIRECTORY
```

ZIP、校验摘要及 SHA-256 文件会生成在 `app` 的同级目录；同名 ZIP 已存在时拒绝覆盖。构建目录旁的 `build-report.json` 记录素材处理和源提交信息。

## GitHub Actions 发布包

`.github/workflows/package-xhs.yml` 使用与本地正式发布相同的专用小工具流程：安装并校验 minitool-zip-builder 1.6.0、执行 `build:minitool`、运行项目静态审计和官方校验脚本，再上传最终 ZIP、SHA-256、`validation.json`、`build-report.json` 与 `release-manifest.txt`。

下载 Actions 产物后，上传小红书前必须核对 `release-manifest.txt` 的 `Source commit` 与计划发布的 Git commit 完全一致。不要继续使用本地下载目录中无法确认来源提交的旧 ZIP。

## 本地检查

```sh
node scripts/serve-minitool.mjs APP_DIRECTORY 4185
```

打开输出的预览地址。追加 `--legacy` 可模拟部分现代特性缺失；此模拟和静态校验都不能替代实际平台、Android 和 iOS 测试。

日记本规矩和请求界面的开发预览分别为 `?scene=social` 与 `?scene=request`。预览选择不会写入正式存档，生产构建不开放这些场景入口。

推送 Git 只会生成新的待提交发布包，不会自动替换小红书创作服务平台里已经上传的版本。正式发布仍需下载对应提交的 Actions 产物，并在小红书创作服务平台重新上传、预览和提交。
