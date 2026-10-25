#!/usr/bin/env node
/**
 * 抓取包装：把参数透传给 xyz-text 的 CLI。
 * 单独包一层的原因是可固定入口、给出更清楚的中文报错，并让 Skill 内的调用路径统一。
 */
const { spawnSync } = require("child_process");

let cli;
try {
  cli = require.resolve("xyz-text/dist/cli.js");
} catch {
  console.error("缺少依赖 xyz-text，请先在项目根目录执行: npm install");
  process.exit(1);
}

const r = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: "inherit",
});

if (r.error) {
  console.error("调用失败:", r.error.message);
  process.exit(1);
}
process.exit(r.status === null ? 1 : r.status);
