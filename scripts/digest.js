#!/usr/bin/env node
/**
 * 摘要 / 思路梳理辅助脚本。
 *
 * 抓取（或读取已有）逐字稿，解析出「元信息 + 章节骨架」，输出紧凑 JSON，
 * 供 agent 生成「摘要 + 思路梳理」而无需把超长全文读进上下文。
 *
 * 用法:
 *   node digest.js "<单集URL或ID>" [--out <逐字稿.md>] [--json]
 *   node digest.js --file <已有逐字稿.md> [--json]
 *
 * - 不带 --json：仅把完整逐字稿写入 --out（默认临时文件）并回显元信息。
 * - 带 --json：额外在 stdout 打印一行 JSON digest（供 agent 消费）。
 * 完整逐字稿始终落盘到 transcriptFile，供用户「要全文」时按需读取/展示。
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const fetchJs = path.join(__dirname, "fetch.js");
const tsRe = /^\[(\d{1,3}):(\d{2})\]\s*(.*)$/;

function fail(msg, code = 1) {
  console.error(JSON.stringify({ ok: false, error: msg }));
  process.exit(code);
}

function parseTranscript(text) {
  const lines = text.split(/\r?\n/);
  let title = "";
  let podcast = "", publishedAt = "", duration = "", episodeUrl = "";
  let inShownotes = false, inTranscript = false;
  const shownotesLines = [];
  const transcriptLines = [];

  for (const line of lines) {
    if (/^#\s+/.test(line) && !title) {
      title = line.replace(/^#\s+/, "").trim();
      continue;
    }
    if (/^##\s+/.test(line)) {
      const h = line.replace(/^##\s+/, "").trim();
      if (/shownote/i.test(h)) { inShownotes = true; inTranscript = false; continue; }
      if (/文稿/.test(h)) { inTranscript = true; inShownotes = false; continue; }
      inShownotes = false; inTranscript = false; continue;
    }
    if (inTranscript) {
      transcriptLines.push(line);
      continue;
    }
    // 顶层元信息（标题与 ## Shownotes 之间的头部区）
    let m = line.match(/^-\s*播客[：:]\s*(.*)$/); if (m) { podcast = m[1].trim(); continue; }
    m = line.match(/^-\s*发布[：:]\s*(.*)$/); if (m) { publishedAt = m[1].trim(); continue; }
    m = line.match(/^-\s*时长[：:]\s*(.*)$/); if (m) { duration = m[1].trim(); continue; }
    m = line.match(/^-\s*单集[：:]\s*(\S+)/); if (m) { episodeUrl = m[1].trim(); continue; }
    if (inShownotes) {
      shownotesLines.push(line);
    }
  }

  const tsMatches = transcriptLines.map((l) => l.match(tsRe)).filter(Boolean);
  const tsCount = tsMatches.length;
  let firstTs = null, lastTs = null;
  if (tsCount) {
    firstTs = `${tsMatches[0][1]}:${tsMatches[0][2]}`;
    lastTs = `${tsMatches[tsCount - 1][1]}:${tsMatches[tsCount - 1][2]}`;
  }

  let wordCount = 0;
  for (const l of transcriptLines) {
    const m = l.match(tsRe);
    const body = m ? m[3] : l;
    if (/^\[Music\]$/i.test(body.trim())) continue;
    wordCount += body.replace(/\s/g, "").length;
  }

  // 章节骨架：优先取 Shownotes 里的「时间线」块。
  // 时间线区域内混着「一、二、」小节标题与「MM:SS 话题」明细，都收集，
  // 直到 Shownotes 结束（不中途停止），得到带时间戳的完整脉络。
  const outline = [];
  let timelineOn = false;
  for (const l of shownotesLines) {
    if (/时间线|timeline/i.test(l)) { timelineOn = true; continue; }
    if (!timelineOn) continue;
    const tm = l.match(/^(\d{1,3}:\d{2})\s+(.+)$/);
    if (tm) { outline.push({ ts: tm[1], text: tm[2].trim() }); continue; }
    if (/^[一二三四五六七八九十]+、/.test(l) && l.trim().length < 40) {
      outline.push({ ts: "", text: l.trim() });
    }
  }

  // 回退 1：没有时间线块时，退取 Shownotes 里的「一、二、」式小标题
  if (outline.length === 0) {
    for (const l of shownotesLines) {
      if (/^[一二三四五六七八九十]+、/.test(l) && l.trim().length < 40) outline.push({ ts: "", text: l.trim() });
    }
  }
  // 回退 2：仍没有则采样正文前若干条时间戳，至少拼出脉络
  if (outline.length === 0) {
    for (let i = 0; i < Math.min(tsMatches.length, 12); i++) {
      outline.push({ ts: `${tsMatches[i][1]}:${tsMatches[i][2]}`, text: tsMatches[i][3].slice(0, 30) });
    }
  }

  return {
    title, podcast, publishedAt, duration, episodeUrl,
    tsCount, firstTs, lastTs, wordCount,
    outline: outline.slice(0, 40),
  };
}

function main() {
  const argv = process.argv.slice(2);
  let url = null, file = null, out = null, asJson = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--file") file = argv[++i];
    else if (a === "--out") out = argv[++i];
    else if (a === "--json") asJson = true;
    else if (!a.startsWith("--")) url = a;
  }

  if (!file && !url) fail("缺少参数：请传入单集URL/ID，或 --file <已有逐字稿.md>");

  let transcriptFile = file;
  if (!transcriptFile) {
    transcriptFile = out || path.join(os.tmpdir(), `xyz-${Date.now()}.md`);
    // fetch.js / xyz-text 会把「已写入 …」打到 stdout 或 stderr，污染 --json；
    // 成功时整体静默，仅在失败时把底层报错转出来。
    const r = spawnSync(process.execPath, [fetchJs, url, "--timestamps", "--out", transcriptFile], { stdio: ["ignore", "pipe", "pipe"] });
    if (r.status !== 0) {
      const errOut = `${r.stdout || ""}${r.stderr || ""}`.trim();
      fail("抓取失败：" + (errOut || "请检查登录态，或该集是否真的有官方文稿"));
    }
    if (r.status !== 0) fail("抓取失败，请检查登录态或该集是否真的有官方文稿");
  }

  const text = fs.readFileSync(transcriptFile, "utf8");
  const digest = parseTranscript(text);
  digest.transcriptFile = transcriptFile;
  digest.hasTranscript = digest.tsCount > 0;

  if (asJson) {
    console.log(JSON.stringify({ ok: true, ...digest }, null, 2));
  } else {
    console.log(`已保存逐字稿: ${transcriptFile}`);
    console.log(`标题: ${digest.title}`);
    console.log(`播客: ${digest.podcast} | 发布: ${digest.publishedAt} | 时长: ${digest.duration}`);
    console.log(`时间戳条目: ${digest.tsCount} 条 (${digest.firstTs || "?"}–${digest.lastTs || "?"}) | 字数约: ${digest.wordCount}`);
  }
}

main();
