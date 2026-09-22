const fs = require("node:fs");
const path = require("node:path");
const mysql = require("mysql2/promise");

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] === undefined) {
      process.env[key] = trimmed.slice(eq + 1).trim();
    }
  }
}

loadEnv(path.resolve(__dirname, "../../.env"));

const url =
  process.env.DATABASE_URL || "mysql://joyai:joyai@127.0.0.1:3306/joyai";

async function main() {
  const conn = await mysql.createConnection(url);
  const [rows] = await conn.query("SHOW TABLES");
  await conn.query("SET FOREIGN_KEY_CHECKS=0");
  for (const row of rows) {
    const name = Object.values(row)[0];
    await conn.query("DROP TABLE IF EXISTS ??", [name]);
    console.log("dropped", name);
  }
  await conn.query("SET FOREIGN_KEY_CHECKS=1");
  await conn.end();
  console.log("schema cleared; restart the server to recreate tables");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
