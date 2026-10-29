# xiaoyuzhou-text-skill

> 快速提取小宇宙播客的**官方逐字稿**，秒级出稿，无需转录。

一个给 [WorkBuddy](https://www.workbuddy.cn) 用的 Skill。发一条小宇宙单集链接，直接拿到平台已经生成好的 AI 文稿——带逐句时间戳的 Markdown，不用下音频、不用跑 Whisper、不用等。

## 为什么需要它

小宇宙 App 里每集播客都有「文字稿」，但那是 App 专属功能，网页端不提供，也没法复制出来。想拿文字稿的人通常会走另一条路：下载音频 + 本地语音识别。

两条路差别很大：

|  | 本技能（官方稿） | 本地 Whisper 转写 |
|---|---|---|
| 耗时（60 分钟单集） | **约 2 秒** | 20～60 分钟（CPU） |
| 标点 | 完整、符合口语习惯 | 常常没有标点或断句混乱 |
| 专有名词 / 人名 | 基本准确 | 大量同音错字，需人工校对 |
| 时间戳 | 平台自带逐句时间轴 | 需自己切分 |
| 前置成本 | 扫码登录一次 | 装 ffmpeg + 下模型 |

实测：80 分钟单集，输出 2.9 万字、474 条时间戳，覆盖 `00:00`–`80:07` 全长。

## 安装

```bash
git clone https://github.com/youshidizipian/xiaoyuzhou-text-skill.git
cd xiaoyuzhou-text-skill
npm install
```

作为 Skill 使用：把整个目录放到 `~/.workbuddy/skills/xiaoyuzhou-text-skill/`，重启 WorkBuddy。

也可以当普通 CLI 用，不装进 WorkBuddy 同样能跑。

环境要求：Node 20+。

## 使用

```bash
# 带时间戳的【完整逐字稿】（用户明确要全文时）
node scripts/fetch.js "https://www.xiaoyuzhoufm.com/episode/65846753bf3589e89419056a" --timestamps --out 逐字稿.md

# 纯段落
node scripts/fetch.js "<单集URL或ID>" --out 逐字稿.md

# 直接输出到终端
node scripts/fetch.js "<单集URL或ID>" --timestamps

# 【默认】抓稿 + 解析骨架，输出紧凑 JSON；不传 --out 则逐字稿写系统临时目录
# （默认不落用户工作区）。供 agent 读取后产出「四部分分析报告」。
node scripts/digest.js "<单集URL或ID>" --json

# 明确要落盘保存时再加 --out
node scripts/digest.js "<单集URL或ID>" --out 逐字稿.md --json

# 已有逐字稿文件时，只做解析（不联网）
node scripts/digest.js --file 逐字稿.md --json
```

输出长这样：

```markdown
# 纯过日子人致富指南：不买房、攒本金、复利别断、戒掉攀比！

- 播客: 搞钱女孩（大花生就酱）
- 发布: 2026-10-21
- 时长: 1小时1分
- 单集: https://www.xiaoyuzhoufm.com/episode/...

## Shownotes
...

## 文稿

[00:00] 大家好，欢迎来到搞钱女孩……
[00:12] 今天我们聊一个特别实在的话题……
```

## 四部分分析报告（默认行为，在线阅读）

发一条单集链接，**默认产出"四部分分析报告"**，直接写在对话里供在线阅读，**不默认落盘**：

1. `digest.js` 抓取逐字稿（**默认写系统临时目录**，不占/不弄脏用户工作区），并解析出 `title / podcast / 时长 / tsCount / outline（带时间戳的章节脉络）` 打成 JSON。
2. 再**读取逐字稿全文**（忠实原文的前提），按固定四部分输出：
   - **第一部分 基本信息**：标题 / 主讲·主持·嘉宾 / 发布日期 / 平台及链接 / 时长 / 核心主题 / 内容来源与转写完整度（不确定标"未核实"）。
   - **第二部分 内容摘要**：约 300–500 字，客观书面语，区分事实与观点。
   - **第三部分 思路总结与逻辑框架**：核心问题 → 3–7 个主要观点（观点/论据/结论/时间戳）→ 论证逻辑重建 → 值得深入思考的内容（区分【主讲】与【补充】）。
   - **第四部分 原文实录**：内容过长时改为"详细分段梳理 + 带时间戳短摘录"，完整逐字稿已生成、可全文提供。
3. **完整逐字稿按需保存**：用户要"存下来 / 导出 / 全文"时才写到指定文件夹并展示；否则不落盘、不占本地。

> 设计取舍：超长单集数万字，全量塞进上下文既费 token 又淹没信息；但"忠实原文、不编造"要求必须读全文（不能只靠骨架）。故 digest 给骨架用于快速定位，正文按需分段精读。

注意：**不是每集都有官方文稿**——若 `hasTranscript:false`，这集平台未生成 AI 稿，`outline` 可能只来自 Shownotes 小标题，此时报告应明确标注「无逐句时间戳」。

## 登录

首次使用需要扫码，凭证保存在 `~/.xyz-text/credentials.json`（权限 600）。

```bash
node scripts/login.js create ./qr.png   # 生成二维码
node scripts/login.js wait 300          # 等待扫码，成功后自动落地凭证
```

用小宇宙 App 扫码：**「我的」页右上角 → 扫一扫 → 确认**。二维码有效期约 3 分钟，过期重新 `create` 即可。

凭证长期有效，之后抓取都走登录态，不会再弹码。

## 工作原理

并不是在本地做语音识别，而是复用 App 已经生成好的文稿：

1. `POST /v1/auth/qrcode/create` 拿登录二维码，扫码换取 `x-jike-access-token`
2. `POST /v1/episode/get` 取单集元数据，解析出 `transcriptMediaId`
3. `POST /v1/episode-transcript/get` 换取 CDN 签名地址
4. 带 App UA 拉取分段 JSON（`[{text, startMs}]`），拼成 Markdown

抓取部分基于 [`xyz-text`](https://www.npmjs.com/package/xyz-text)（MIT）——它已经把这套接口封装好了，本仓库只补了一个绕过 TTY 限制的登录脚本和 Skill 封装。

## 已知限制

**不是每集都有稿。** 平台只给部分单集生成 AI 文稿，新节目覆盖率高，2023–2024 的老单集、超长单集常常没有。

注意一个坑：单集页面里 `isTranscriptEnabled` 为 `true` **不代表**文稿已生成。有些单集这个开关是开的、`transcriptMediaId` 也存在，但接口就是返回 `{"data":null}`。判断方法很简单——输出的正文里有没有 `[分:秒]`，0 条就是没稿。

遇到没稿的单集，只能退回本地 ASR，或者直接用 Shownotes。

## 免责声明

- 本项目**非官方**，与小宇宙无任何关联。
- 调用的是 App 的个人账号接口，请**仅用于个人学习与自用**，保持低频，不要批量抓取或二次分发他人作品。
- 文稿版权归原播客与平台所有，请遵守小宇宙的用户协议及相应著作权规定。
- 接口随时可能变更，届时本项目可能失效。

## 致谢

- [`xyz-text`](https://www.npmjs.com/package/xyz-text) — 接口实现，MIT
- [`qrcode`](https://www.npmjs.com/package/qrcode) — 二维码渲染，MIT

## License

MIT
