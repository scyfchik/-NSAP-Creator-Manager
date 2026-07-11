const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

function createSqliteAdapter(filename) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  return {
    type: "sqlite",
    async exec(sql) { db.exec(sql); },
    async all(sql, params = []) { return db.prepare(sql).all(...params); },
    async get(sql, params = []) { return db.prepare(sql).get(...params) || null; },
    async run(sql, params = []) { return db.prepare(sql).run(...params); },
    async transaction(work) {
      db.exec("BEGIN IMMEDIATE");
      try { const result = await work(this); db.exec("COMMIT"); return result; }
      catch (error) { db.exec("ROLLBACK"); throw error; }
    },
    async close() { db.close(); },
  };
}

module.exports = { createSqliteAdapter };
