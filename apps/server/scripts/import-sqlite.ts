import "reflect-metadata";
import fs from "node:fs";
import path from "node:path";
import { DataSource } from "typeorm";
import { databaseOptions } from "../src/database/data-source-options";

const initSqlJs = require("sql.js") as () => Promise<{
  Database: new (data: Uint8Array) => {
    exec: (sql: string) => Array<{
      columns: string[];
      values: unknown[][];
    }>;
  };
}>;

const TABLE_ORDER = [
  "user",
  "channel",
  "model",
  "canvas_folder",
  "manju_folder",
  "job",
  "canvas_project",
  "manju_project",
  "asset",
  "app_setting",
  "audit_log",
  "project_chat",
];

function loadEnv(file: string) {
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

function quote(name: string) {
  return `\`${name.replace(/`/g, "``")}\``;
}

loadEnv(path.resolve(__dirname, "../.env"));
loadEnv(path.resolve(__dirname, "../../.env"));

async function main() {
  const sqlitePath = path.resolve(__dirname, "../data/sql.db");
  const ds = new DataSource(
    databaseOptions({ get: (key) => process.env[key] }),
  );
  await ds.initialize();
  const runner = ds.createQueryRunner();

  if (!fs.existsSync(sqlitePath)) {
    console.log("schema synced; no sqlite file at", sqlitePath);
    await ds.destroy();
    return;
  }

  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(sqlitePath));
  const listed = db.exec(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  );
  const sqliteTables = new Set(
    (listed[0]?.values ?? []).map((row) => String(row[0])),
  );

  const mysqlTables = (
    (await runner.query("SHOW TABLES")) as Array<Record<string, string>>
  ).map((row) => Object.values(row)[0]);

  await runner.query("SET FOREIGN_KEY_CHECKS=0");
  for (const table of mysqlTables) {
    await runner.query(`TRUNCATE TABLE ${quote(table)}`);
  }

  const ordered = [
    ...TABLE_ORDER.filter((name) => sqliteTables.has(name)),
    ...[...sqliteTables].filter((name) => !TABLE_ORDER.includes(name)),
  ];

  for (const table of ordered) {
    if (!mysqlTables.includes(table)) {
      console.log("skip", table, "(not in MySQL schema)");
      continue;
    }
    const dumped = db.exec(`SELECT * FROM ${quote(table)}`);
    const block = dumped[0];
    if (!block || block.values.length === 0) {
      console.log(table, 0);
      continue;
    }
    const columnMeta = (await runner.query(
      `SHOW COLUMNS FROM ${quote(table)}`,
    )) as Array<{ Field: string; Type: string }>;
    const mysqlCols = new Set(columnMeta.map((col) => col.Field));
    const jsonCols = new Set(
      columnMeta
        .filter((col) => col.Type.toLowerCase().includes("json"))
        .map((col) => col.Field),
    );
    const columns = block.columns.filter((name) => mysqlCols.has(name));
    const indexes = columns.map((name) => block.columns.indexOf(name));
    const colSql = columns.map(quote).join(", ");
    let inserted = 0;
    for (const row of block.values) {
      const values = indexes.map((index, position) => {
        const value = row[index];
        const column = columns[position];
        if (value == null) return null;
        if (jsonCols.has(column)) {
          if (value === "") return null;
          if (typeof value === "string") JSON.parse(value);
        }
        return value;
      });
      await runner.query(
        `INSERT INTO ${quote(table)} (${colSql}) VALUES (${columns
          .map(() => "?")
          .join(", ")})`,
        values,
      );
      inserted += 1;
    }
    console.log(table, inserted);
  }

  await runner.query("SET FOREIGN_KEY_CHECKS=1");
  await ds.destroy();
  console.log("imported", sqlitePath);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
