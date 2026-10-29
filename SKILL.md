---
name: xiaoyuzhou-text-skill
description: 从小宇宙单集**快速提取平台官方逐字稿**（非本地语音转文字），并默认产出**摘要 + 思路梳理**（浓缩版），完整带时间戳逐字稿按需给出。当用户发来小宇宙单集链接，或要求「小宇宙逐字稿 / 文字稿 / 官方文稿 / 摘要 / 概要 / 思路梳理 / 这集讲什么 / 总结一下 / 做笔记」时使用。触发词：小宇宙逐字稿、小宇宙文字稿、提取小宇宙文稿、播客官方文稿、免转录、小宇宙摘要、思路梳理、这集讲什么、xiaoyuzhou transcript。
---

# 小宇宙官方逐字稿提取

拿的是小宇宙服务端已经生成好的**原生 AI 文稿**，不是本地 ASR 转写。区别很实际：

| | 本技能 | 本地 Whisper |
|---|---|---|
| 耗时 | 数秒（只下一次文稿） | 音频时长 × 0.3～1 |
| 标点 | 完整 | 常缺标点、需二次处理 |
| 专名 | 基本准确 | 大量同音错字 |
| 时间戳 | 平台自带逐句时间轴 | 需额外生成 |

## 何时使用

- 用户发来 `https://www.xiaoyuzhoufm.com/episode/<id>` 链接，要文字稿；
- 用户明确说「要小宇宙 App 里那份文稿」「不要语音转文字」；
- 需要某集播客的逐字稿做笔记、摘要、二次加工。

**不要**在本技能里跑 Whisper / faster-whisper —— 那是另一条路，出稿质量不同。

## 默认产出：摘要 + 思路梳理（完整逐字稿按需给）

用户发来单集链接时，**先判断意图**，默认不要直接把几百行带时间戳全文甩给对方：

- 若用户明确要「逐字稿 / 全文 / 完整文字稿」→ 走下方「抓取」直接给全文。
- 否则（要摘要、概要、思路、笔记，或只发了链接没说要全文）→ 走下面「摘要模式」。

### 摘要模式（默认）

先抓到本地文件并拿到紧凑 JSON 骨架，再基于骨架生成浓缩版，避免把数万字全文读进上下文。

```bash
# 1) 抓取并解析：完整逐字稿落盘 + 向 stdout 打印紧凑 JSON（元信息 + 章节骨架）
node ~/.workbuddy/skills/xiaoyuzhou-text-skill/scripts/digest.js \
  "<单集URL或ID>" --out "<工作区>/逐字稿_<episodeId>.md" --json
```

`digest.js` 会调用 fetch 抓稿存盘，并输出一段 JSON：
`{ title, podcast, publishedAt, duration, tsCount, firstTs, lastTs, wordCount, outline:[{ts,text}], transcriptFile, hasTranscript }`。
**只读这段 JSON 进上下文**，不要为了做摘要把整篇逐字稿读进来（超长单集可达数万字）。

2) 基于 JSON 生成下面四块，**不要**粘贴全文：

- **一句话摘要**：这集在聊什么、核心结论是什么（1–2 句）。
- **核心要点**：3–7 条，每条可带时间戳（如 `[08:21]`），取自 `outline`。
- **思路梳理**：用 `outline` 的层级搭出脉络——`一/二/三` 小节作一级，其下 `MM:SS 话题` 作二级；每条补一句「这点在讲什么 / 结论是什么」。这是本技能最有价值的部分，务必展开。
- **适合谁听 / 关键词**：可选，2–4 行。

3) 收尾提示用户：

> 完整带时间戳逐字稿已存到 `<transcriptFile>`（共 N 条时间戳、约 M 字）。需要某一段、某时间戳附近的内容，或要全文 Markdown，说一声就发你。

### 无官方文稿时

若 `hasTranscript:false`（或 `tsCount:0`）：这集平台没生成 AI 文稿。此时仍可基于 `outline`（往往来自 Shownotes 的小标题）给概要，但必须明确告诉用户「该集无官方逐字稿，以下仅基于 Shownotes，没有逐句时间戳」。

### 按需给全文

用户说要全文 / 逐字稿时：

- 已抓过：直接用 `present_files` 展示 `<transcriptFile>`。
- 没抓过：执行下方「抓取」里的 `fetch.js --timestamps --out ...` 再展示。

## 安装

```bash
git clone https://github.com/youshidizipian/xiaoyuzhou-text-skill.git
cd xiaoyuzhou-text-skill
npm install
```

然后把整个目录放到 `~/.workbuddy/skills/xiaoyuzhou-text-skill/`，重启 WorkBuddy 即生效。

需要 Node 20+。依赖两个包：`xyz-text`（抓取实现，MIT）与 `qrcode`（把登录链接渲染成二维码）。

## 抓取（完整逐字稿，按需使用）

默认走「摘要模式」即可；只有用户明确要全文时才用这里。

```bash
node ~/.workbuddy/skills/xiaoyuzhou-text-skill/scripts/fetch.js \
  "<单集URL或单集ID>" --timestamps --out "<输出.md>"
```

- 加 `--timestamps` 每句前带 `[分:秒]`；不加则是纯段落。
- 不给 `--out` 会输出到 stdout。
- 输出结构：标题 → 播客名/发布日期/时长/原始链接 → Shownotes → 官方文稿正文。
- 抓完用 `present_files` 把 `<输出.md>` 展示给用户。

## 登录（仅在无凭证或凭证过期时）

抓取走登录态。原版 CLI 的 `--login` 要求交互式 TTY，在自动化环境里会直接报错，所以本技能自带一个可在任意环境跑的登录脚本，分两步：

```bash
# 1. 生成二维码图片
node ~/.workbuddy/skills/xiaoyuzhou-text-skill/scripts/login.js create "<二维码png路径>"
# 返回 {"ok":true,"image":"...","id":"..."}
```

拿到图片后**必须用 present_files 展示给用户**，并提示：小宇宙 App →「我的」页右上角「扫一扫」→ 扫码 → 手机上点确认。

```bash
# 2. 轮询结果（建议后台跑，超时默认 300 秒）
node ~/.workbuddy/skills/xiaoyuzhou-text-skill/scripts/login.js wait 300
# {"ok":true,"status":"scanned"} → 已扫码待确认
# {"ok":true,"status":"confirmed","token_file":"..."} → 成功
# {"ok":false,"error":"二维码已过期..."} → 重新 create（二维码有效期约 3 分钟）
```

凭证存于 `~/.xyz-text/credentials.json`（权限 600）。

## 已知限制

- **不是每集都有官方文稿**。平台只给部分单集生成 AI 文稿，新节目覆盖率高，冷门或很老的单集可能没有。没稿时输出里只有 Shownotes。
- **`isTranscriptEnabled: true` 不等于有稿**。页面里的这个标记只是功能开关，`transcriptMediaId` 也可能存在，但接口仍返回 `{"data":null}`——那是平台从没生成过这集的内容（2023–2024 的老单集、超长单集尤其常见）。判断方法：看输出有没有 `[分:秒]` 时间戳，0 条就是没稿，不要以为是接口坏了。
- 走的是用户个人账号的接口，**自用、低频**，不要批量爬取。

## 排错

| 现象 | 处理 |
|---|---|
| `登录态已过期` / HTTP 401 | 重新执行登录两步 |
| 输出只有 Shownotes 没有正文 | 该集没有官方文稿，不是接口问题 |
| 二维码扫了没反应 | 有效期约 3 分钟，过期需重新 `create` |
| `缺少依赖 xyz-text` | 项目根目录执行 `npm install` |
