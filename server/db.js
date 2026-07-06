const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { databasePath, rootDir } = require("./config");
const { validateCreatorPayload } = require("./validation");

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new DatabaseSync(databasePath);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS creators (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      discord_id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      avatar TEXT,
      role TEXT NOT NULL CHECK (role IN ('viewer', 'manager', 'administrator', 'owner')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_login TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      discord_id TEXT NOT NULL REFERENCES users(discord_id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id TEXT,
      username TEXT,
      action TEXT NOT NULL,
      creator_id TEXT,
      field TEXT,
      old_value TEXT,
      new_value TEXT,
      ip TEXT,
      timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS backups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_by_discord_id TEXT,
      created_by_username TEXT,
      type TEXT NOT NULL DEFAULT 'manual' CHECK (type IN ('daily', 'weekly', 'manual')),
      reason TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  migrateLegacySchema();
  seedCreators();
  ensureAutomaticBackups();
}

function migrateLegacySchema() {
  migrateUsersRoleConstraint();

  if (tableExists("audit_log")) {
    db.exec(`
      INSERT INTO audit_logs (discord_id, username, action, creator_id, field, old_value, new_value, timestamp)
      SELECT discord_id, username, action, creator_id, field, old_value, new_value, timestamp
      FROM audit_log
      WHERE NOT EXISTS (SELECT 1 FROM audit_logs);
    `);
  }

  addColumnIfMissing("audit_logs", "ip", "TEXT");
  addColumnIfMissing("backups", "type", "TEXT NOT NULL DEFAULT 'manual'");

  const userColumns = getColumns("users");
  if (userColumns.length && userColumns.some((column) => column.name === "role")) {
    db.prepare("UPDATE users SET role = 'manager' WHERE role = 'editor'").run();
    db.prepare("UPDATE users SET role = 'administrator' WHERE role = 'admin'").run();
  }
}

function migrateUsersRoleConstraint() {
  const usersSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get()?.sql || "";
  if (!usersSchema.includes("'editor'") && !usersSchema.includes("'admin'")) {
    return;
  }

  try {
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("BEGIN");
    db.exec("ALTER TABLE users RENAME TO users_legacy_roles");
    db.exec(`
      CREATE TABLE users (
        discord_id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        avatar TEXT,
        role TEXT NOT NULL CHECK (role IN ('viewer', 'manager', 'administrator', 'owner')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_login TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO users (discord_id, username, avatar, role, created_at, last_login)
      SELECT
        discord_id,
        username,
        avatar,
        CASE role
          WHEN 'editor' THEN 'manager'
          WHEN 'admin' THEN 'administrator'
          ELSE role
        END,
        created_at,
        last_login
      FROM users_legacy_roles;

      CREATE TABLE sessions_new (
        token_hash TEXT PRIMARY KEY,
        discord_id TEXT NOT NULL REFERENCES users(discord_id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT NOT NULL
      );

      INSERT INTO sessions_new (token_hash, discord_id, created_at, expires_at)
      SELECT token_hash, discord_id, created_at, expires_at
      FROM sessions
      WHERE discord_id IN (SELECT discord_id FROM users);

      DROP TABLE sessions;
      ALTER TABLE sessions_new RENAME TO sessions;
      DROP TABLE users_legacy_roles;
    `);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

function tableExists(name) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

function getColumns(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all();
}

function addColumnIfMissing(table, column, definition) {
  if (!getColumns(table).some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function seedCreators() {
  const count = db.prepare("SELECT COUNT(*) AS count FROM creators").get().count;
  if (count > 0) {
    return;
  }

  const seedPath = path.join(rootDir, "data", "creators.json");
  const payload = JSON.parse(fs.readFileSync(seedPath, "utf8"));
  const creators = validateCreatorPayload(payload);
  replaceCreators(creators, null, "Seeded from data/creators.json", { audit: false, backup: false });
}

function getCreators() {
  return db.prepare("SELECT payload FROM creators ORDER BY json_extract(payload, '$.name') COLLATE NOCASE").all()
    .map((row) => JSON.parse(row.payload));
}

function getCreator(id) {
  const row = db.prepare("SELECT payload FROM creators WHERE id = ?").get(id);
  return row ? JSON.parse(row.payload) : null;
}

function upsertCreator(creator) {
  db.prepare(`
    INSERT INTO creators (id, payload, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = CURRENT_TIMESTAMP
  `).run(creator.id, JSON.stringify(creator));
}

function updateCreatorField({ creatorId, field, value, user, ip }) {
  const creator = getCreator(creatorId);
  if (!creator) {
    return null;
  }

  const oldValue = creator[field] ?? "";
  creator[field] = value;
  creator.history = Array.isArray(creator.history) ? creator.history : [];
  creator.history.unshift({
    type: getHistoryType(field, value),
    date: new Date().toISOString().slice(0, 10),
    note: `${field} changed to ${value || "empty"}.`,
  });

  upsertCreator(creator);
  insertAudit({
    user,
    action: "creator.update",
    creatorId,
    field,
    oldValue,
    newValue: value,
    ip,
  });

  return creator;
}

function replaceCreators(creators, user, reason, options = {}) {
  const { audit = true, backup = true, backupType = "manual", ip = null } = options;

  if (backup) {
    insertBackup(user, reason, backupType);
  }

  try {
    db.exec("BEGIN");
    db.prepare("DELETE FROM creators").run();
    creators.forEach(upsertCreator);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  if (audit) {
    insertAudit({
      user,
      action: "creators.replace",
      creatorId: null,
      field: null,
      oldValue: null,
      newValue: `${creators.length} creators`,
      ip,
    });
  }
}

function insertBackup(user, reason, type = "manual") {
  const payload = JSON.stringify({
    schemaVersion: 2,
    creators: getCreators(),
  });

  db.prepare(`
    INSERT INTO backups (created_by_discord_id, created_by_username, type, reason, payload)
    VALUES (?, ?, ?, ?, ?)
  `).run(user?.discord_id || null, user?.username || "System", type, reason, payload);

  pruneBackups();
}

function restoreBackup(id, user, ip = null) {
  const row = db.prepare("SELECT payload FROM backups WHERE id = ?").get(id);
  if (!row) {
    return false;
  }

  const creators = validateCreatorPayload(JSON.parse(row.payload));
  replaceCreators(creators, user, `Restored backup ${id}`, { audit: true, backup: true, backupType: "manual", ip });
  return true;
}

function getBackups() {
  return db.prepare(`
    SELECT id, created_by_discord_id, created_by_username, type, reason, created_at
    FROM backups
    ORDER BY id DESC
    LIMIT 50
  `).all();
}

function upsertUser(profile) {
  const existingCount = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  const existing = db.prepare("SELECT * FROM users WHERE discord_id = ?").get(profile.discord_id);
  const role = existing?.role || (existingCount === 0 ? "owner" : "viewer");

  db.prepare(`
    INSERT INTO users (discord_id, username, avatar, role, last_login)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(discord_id) DO UPDATE SET
      username = excluded.username,
      avatar = excluded.avatar,
      last_login = CURRENT_TIMESTAMP
  `).run(profile.discord_id, profile.username, profile.avatar || null, role);

  return getUser(profile.discord_id);
}

function getUser(discordId) {
  return db.prepare("SELECT * FROM users WHERE discord_id = ?").get(discordId);
}

function getUsers() {
  return db.prepare(`
    SELECT *
    FROM users
    ORDER BY
      CASE role
        WHEN 'owner' THEN 4
        WHEN 'administrator' THEN 3
        WHEN 'manager' THEN 2
        WHEN 'viewer' THEN 1
        ELSE 0
      END DESC,
      username COLLATE NOCASE
  `).all();
}

function updateUserRole(discordId, role, actor, ip = null) {
  const user = getUser(discordId);
  if (!user) {
    return null;
  }

  db.prepare("UPDATE users SET role = ? WHERE discord_id = ?").run(role, discordId);
  insertAudit({
    user: actor,
    action: "user.role.update",
    creatorId: null,
    field: "role",
    oldValue: user.role,
    newValue: `${discordId}:${role}`,
    ip,
  });

  return getUser(discordId);
}

function createSession(discordId, tokenHash, expiresAt) {
  db.prepare("INSERT INTO sessions (token_hash, discord_id, expires_at) VALUES (?, ?, ?)")
    .run(tokenHash, discordId, expiresAt);
}

function getSessionUser(tokenHash) {
  if (!tokenHash) {
    return null;
  }

  const row = db.prepare(`
    SELECT users.*
    FROM sessions
    JOIN users ON users.discord_id = sessions.discord_id
    WHERE sessions.token_hash = ? AND datetime(sessions.expires_at) > CURRENT_TIMESTAMP
  `).get(tokenHash);

  return row || null;
}

function deleteSession(tokenHash) {
  if (tokenHash) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
  }
}

function insertAudit({ user, action, creatorId, field, oldValue, newValue, ip }) {
  db.prepare(`
    INSERT INTO audit_logs (discord_id, username, action, creator_id, field, old_value, new_value, ip)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    user?.discord_id || null,
    user?.username || "Anonymous",
    action,
    creatorId,
    field,
    stringifyAuditValue(oldValue),
    stringifyAuditValue(newValue),
    ip || null,
  );
}

function getAuditLog() {
  return db.prepare("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 200").all();
}

function ensureAutomaticBackups() {
  createAutomaticBackupIfNeeded("daily");
  createAutomaticBackupIfNeeded("weekly");
}

function createAutomaticBackupIfNeeded(type) {
  const modifier = type === "weekly" ? "-7 days" : "-1 day";
  const row = db.prepare(`
    SELECT id
    FROM backups
    WHERE type = ? AND created_at >= datetime('now', ?)
    LIMIT 1
  `).get(type, modifier);

  if (!row) {
    insertBackup(null, `${type[0].toUpperCase()}${type.slice(1)} automatic backup`, type);
  }
}

function pruneBackups() {
  pruneBackupType("daily", 30);
  pruneBackupType("weekly", 12);
  pruneBackupType("manual", 50);
}

function pruneBackupType(type, keep) {
  db.prepare(`
    DELETE FROM backups
    WHERE type = ?
      AND id NOT IN (
        SELECT id FROM backups WHERE type = ? ORDER BY id DESC LIMIT ?
      )
  `).run(type, type, keep);
}

function stringifyAuditValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === "string" ? value : JSON.stringify(value);
}

function getHistoryType(field, value) {
  const types = {
    status: "Status Changed",
    priority: "Priority Changed",
    dmSent: value === "Yes" ? "Reminder Sent" : "DM Updated",
    collabPosted: value === "Yes" ? "Collab Posted" : "Collab Updated",
    notes: "Notes Updated",
    lastContent: "Content Updated",
    lastUploadDate: "Upload Date Updated",
    followUp: "Follow-up Updated",
    deadline: "Deadline Updated",
    response: "Response Updated",
  };

  return types[field] || "Creator Updated";
}

module.exports = {
  createSession,
  deleteSession,
  getAuditLog,
  getBackups,
  getCreators,
  getCreator,
  getSessionUser,
  getUser,
  getUsers,
  initDatabase,
  insertBackup,
  insertAudit,
  replaceCreators,
  restoreBackup,
  updateCreatorField,
  updateUserRole,
  upsertUser,
};
