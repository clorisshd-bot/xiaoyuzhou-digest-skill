#!/usr/bin/env node
/**
 * 小宇宙扫码登录（可在非交互式终端里跑）。
 *
 *   node login.js create [二维码图片路径]   创建二维码并生成 PNG
 *   node login.js wait [超时秒数]           轮询扫码结果，成功后落地凭证
 *
 * 凭证写到 ~/.xyz-text/credentials.json（权限 600），与 xyz-cli.js 共用。
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const QR = require("qrcode");

const WEB_API = "https://web-api.xiaoyuzhoufm.com";
const CONFIG_DIR = path.join(os.homedir(), ".xyz-text");
const TOKEN_FILE = path.join(CONFIG_DIR, "credentials.json");
const STATE_FILE = path.join(CONFIG_DIR, "qr_state.json");

const HEADERS = {
  "content-type": "application/json;charset=UTF-8",
  origin: "https://accounts.xiaoyuzhoufm.com",
  referer: "https://accounts.xiaoyuzhoufm.com/",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
  "x-midway-app-id": "v6worU4NnWyL",
};

function fail(msg, code = 1) {
  console.log(JSON.stringify({ ok: false, error: msg }));
  process.exit(code);
}

function credsFrom(res) {
  let accessToken = res.headers.get("x-jike-access-token") || "";
  let refreshToken = res.headers.get("x-jike-refresh-token") || "";
  if (!accessToken) {
    const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const line of cookies) {
      const a = line.match(/x-jike-access-token=([^;]+)/);
      if (a) accessToken = a[1];
      const r = line.match(/x-jike-refresh-token=([^;]+)/);
      if (r) refreshToken = r[1];
    }
  }
  if (!accessToken || !refreshToken) return null;
  return {
    accessToken,
    refreshToken,
    deviceId: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
  };
}

async function create(outPath) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const res = await fetch(`${WEB_API}/v1/auth/qrcode/create`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ clientId: "xyz-web" }),
  });
  if (!res.ok) fail(`创建二维码失败 HTTP ${res.status}`);
  const body = await res.json();
  if (!body.id || !body.url) fail("创建二维码响应异常");

  fs.writeFileSync(STATE_FILE, JSON.stringify(body, null, 2), { mode: 0o600 });
  await QR.toFile(outPath, body.url, {
    width: 680,
    margin: 2,
    errorCorrectionLevel: "M",
  });
  console.log(JSON.stringify({ ok: true, image: outPath, id: body.id }));
}

async function wait(timeoutSec) {
  if (!fs.existsSync(STATE_FILE)) fail("没有待完成的登录，请先执行 create");
  const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  const deadline = Date.now() + timeoutSec * 1000;
  let scanned = false;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));
    let res;
    try {
      res = await fetch(`${WEB_API}/v1/auth/qrcode/login`, {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ id: state.id }),
      });
    } catch {
      continue;
    }
    if (res.status === 401) fail("二维码已过期，请重新执行 create", 2);
    if (!res.ok) continue;
    const body = await res.json().catch(() => ({}));
    if (body.status === "SCANNED") {
      if (!scanned) {
        scanned = true;
        console.log(JSON.stringify({ ok: true, status: "scanned" }));
      }
      continue;
    }
    if (body.status === "CONFIRMED" || body.status === "USED") {
      const creds = credsFrom(res);
      if (!creds) fail("登录成功但响应里没有 token", 3);
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
      fs.writeFileSync(TOKEN_FILE, JSON.stringify(creds, null, 2), { mode: 0o600 });
      try {
        fs.chmodSync(TOKEN_FILE, 0o600);
      } catch {}
      try {
        fs.unlinkSync(STATE_FILE);
      } catch {}
      console.log(JSON.stringify({ ok: true, status: "confirmed", token_file: TOKEN_FILE }));
      return;
    }
  }
  fail("等待扫码超时，请重新执行 create", 4);
}

(async () => {
  const cmd = process.argv[2];
  if (cmd === "create") {
    await create(process.argv[3] || path.join(os.tmpdir(), "xiaoyuzhou-qr.png"));
  } else if (cmd === "wait") {
    await wait(Number(process.argv[3] || 300));
  } else {
    console.log("用法: node login.js create [图片路径] | node login.js wait [超时秒数]");
    process.exit(1);
  }
})().catch((e) => fail(String(e && e.message ? e.message : e)));
