const migrations = [{
  id: "001_initial_postgres_schema",
  postgres: `
    CREATE TABLE IF NOT EXISTS users (discord_id TEXT PRIMARY KEY, username TEXT NOT NULL, avatar TEXT, role TEXT NOT NULL CHECK (role IN ('viewer','manager','administrator','owner')), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_login TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, discord_id TEXT NOT NULL REFERENCES users(discord_id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL);
    CREATE TABLE IF NOT EXISTS creators (id TEXT PRIMARY KEY, normalized_name TEXT NOT NULL, name TEXT NOT NULL, display_name TEXT, platform TEXT, channel TEXT, status TEXT, priority TEXT, last_upload TEXT, last_nsp_content TEXT, collab_posted TEXT, dm_sent TEXT, notes TEXT, quick_note TEXT, follow_up_date TEXT, discord_username TEXT, discord_id TEXT, roblox_username TEXT, youtube_url TEXT, tiktok_url TEXT, twitch_url TEXT, twitter_url TEXT, category TEXT, avatar TEXT, subscribers BIGINT, views BIGINT, average_views BIGINT, latest_video JSONB, payload JSONB NOT NULL, deleted BOOLEAN NOT NULL DEFAULT FALSE, deleted_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS timeline_entries (id BIGSERIAL PRIMARY KEY, creator_id TEXT NOT NULL REFERENCES creators(id) ON DELETE CASCADE, actor TEXT, actor_role TEXT, type TEXT NOT NULL, message TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS audit_logs (id BIGSERIAL PRIMARY KEY, discord_id TEXT, username TEXT, actor TEXT, action TEXT NOT NULL, creator_id TEXT, target TEXT, field TEXT, old_value TEXT, new_value TEXT, details JSONB, ip TEXT, timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS backups (id BIGSERIAL PRIMARY KEY, created_by_discord_id TEXT, created_by_username TEXT, type TEXT NOT NULL CHECK (type IN ('daily','weekly','manual')), reason TEXT NOT NULL, payload JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE INDEX IF NOT EXISTS creators_normalized_name_idx ON creators(normalized_name);
    CREATE INDEX IF NOT EXISTS creators_discord_id_idx ON creators(discord_id);
    CREATE INDEX IF NOT EXISTS timeline_creator_id_idx ON timeline_entries(creator_id);
    CREATE INDEX IF NOT EXISTS audit_created_at_idx ON audit_logs(created_at DESC);
  `,
  sqlite: `
    CREATE TABLE IF NOT EXISTS creators (id TEXT PRIMARY KEY, payload TEXT NOT NULL, quick_note TEXT, follow_up_date TEXT, deleted INTEGER NOT NULL DEFAULT 0, deleted_at TEXT, discord_username TEXT, discord_id TEXT, roblox_username TEXT, youtube_url TEXT, tiktok_url TEXT, twitch_url TEXT, twitter_url TEXT, category TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS users (discord_id TEXT PRIMARY KEY, username TEXT NOT NULL, avatar TEXT, role TEXT NOT NULL CHECK (role IN ('viewer','manager','administrator','owner')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_login TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, discord_id TEXT NOT NULL REFERENCES users(discord_id) ON DELETE CASCADE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, expires_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, discord_id TEXT, username TEXT, action TEXT NOT NULL, creator_id TEXT, field TEXT, old_value TEXT, new_value TEXT, ip TEXT, timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS backups (id INTEGER PRIMARY KEY AUTOINCREMENT, created_by_discord_id TEXT, created_by_username TEXT, type TEXT NOT NULL DEFAULT 'manual', reason TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS timeline_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, creator_id TEXT NOT NULL REFERENCES creators(id) ON DELETE CASCADE, actor TEXT, actor_role TEXT, type TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  `,
}, {
  id: "002_creator_date_columns",
  postgres: `
    CREATE OR REPLACE FUNCTION pg_temp.is_valid_date(value TEXT) RETURNS BOOLEAN AS $$
    BEGIN
      PERFORM value::DATE;
      RETURN TRUE;
    EXCEPTION WHEN OTHERS THEN
      RETURN FALSE;
    END;
    $$ LANGUAGE plpgsql;

    UPDATE creators SET follow_up_date = NULL WHERE follow_up_date IS NOT NULL AND NOT pg_temp.is_valid_date(follow_up_date);
    UPDATE creators SET last_upload = NULL WHERE last_upload IS NOT NULL AND NOT pg_temp.is_valid_date(last_upload);
    ALTER TABLE creators ALTER COLUMN follow_up_date TYPE DATE USING NULLIF(follow_up_date, '')::date;
    ALTER TABLE creators ALTER COLUMN last_upload TYPE DATE USING NULLIF(last_upload, '')::date;
  `,
  sqlite: "SELECT 1;",
}, {
  id: "003_youtube_sync",
  postgres: `
    ALTER TABLE creators ADD COLUMN IF NOT EXISTS latest_video_title TEXT;
    ALTER TABLE creators ADD COLUMN IF NOT EXISTS latest_video_url TEXT;
    ALTER TABLE creators ADD COLUMN IF NOT EXISTS last_sync TIMESTAMPTZ;
    ALTER TABLE creators ADD COLUMN IF NOT EXISTS sync_status TEXT;
    ALTER TABLE creators ADD COLUMN IF NOT EXISTS sync_error TEXT;
    CREATE TABLE IF NOT EXISTS youtube_channel_mappings (
      cache_key TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `,
  sqlite: `
    CREATE TABLE IF NOT EXISTS youtube_channel_mappings (
      cache_key TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      resolved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `,
}, {
  id: "004_nsap_content_tracking",
  postgres: `
    ALTER TABLE creators ADD COLUMN IF NOT EXISTS latest_channel_video_title TEXT;
    ALTER TABLE creators ADD COLUMN IF NOT EXISTS latest_channel_video_url TEXT;
    ALTER TABLE creators ADD COLUMN IF NOT EXISTS latest_channel_upload_date DATE;
    ALTER TABLE creators ADD COLUMN IF NOT EXISTS latest_nsap_video_title TEXT;
    ALTER TABLE creators ADD COLUMN IF NOT EXISTS latest_nsap_video_url TEXT;
    ALTER TABLE creators ADD COLUMN IF NOT EXISTS latest_nsap_upload_date DATE;
    ALTER TABLE creators ADD COLUMN IF NOT EXISTS nsap_match_status TEXT;
    ALTER TABLE creators ADD COLUMN IF NOT EXISTS nsap_match_reason TEXT;
    ALTER TABLE creators ADD COLUMN IF NOT EXISTS nsap_matched_keyword TEXT;
    ALTER TABLE creators ADD COLUMN IF NOT EXISTS nsap_decision_video_title TEXT;
    ALTER TABLE creators ADD COLUMN IF NOT EXISTS nsap_decision_video_url TEXT;
    ALTER TABLE creators ADD COLUMN IF NOT EXISTS nsap_decision_video_upload_date DATE;
    ALTER TABLE creators ADD COLUMN IF NOT EXISTS nsap_decision_actor TEXT;
    ALTER TABLE creators ADD COLUMN IF NOT EXISTS nsap_decision_at TIMESTAMPTZ;

    UPDATE creators SET
      latest_channel_video_title = COALESCE(latest_channel_video_title, latest_video_title),
      latest_channel_video_url = COALESCE(latest_channel_video_url, latest_video_url),
      latest_channel_upload_date = COALESCE(latest_channel_upload_date, last_upload);
  `,
  sqlite: "SELECT 1;",
}, {
  id: "005_creator_nsap_video_reviews",
  postgres: `
    CREATE TABLE IF NOT EXISTS creator_nsap_video_reviews (
      id BIGSERIAL PRIMARY KEY,
      creator_id TEXT NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      video_url TEXT NOT NULL,
      video_title TEXT NOT NULL,
      video_upload_date DATE NOT NULL,
      decision TEXT NOT NULL CHECK (decision IN ('manual_confirmed', 'manual_rejected')),
      actor TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (creator_id, video_url)
    );
    CREATE INDEX IF NOT EXISTS creator_nsap_reviews_creator_idx ON creator_nsap_video_reviews(creator_id);
  `,
  sqlite: `
    CREATE TABLE IF NOT EXISTS creator_nsap_video_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creator_id TEXT NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      video_url TEXT NOT NULL,
      video_title TEXT NOT NULL,
      video_upload_date TEXT NOT NULL,
      decision TEXT NOT NULL CHECK (decision IN ('manual_confirmed', 'manual_rejected')),
      actor TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (creator_id, video_url)
    );
    CREATE INDEX IF NOT EXISTS creator_nsap_reviews_creator_idx ON creator_nsap_video_reviews(creator_id);
  `,
}];

async function runMigrations(db) {
  await db.exec(db.type === "postgres"
    ? "CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
    : "CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  for (const migration of migrations) {
    const marker = db.type === "postgres" ? "$1" : "?";
    if (await db.get(`SELECT id FROM schema_migrations WHERE id = ${marker}`, [migration.id])) continue;
    await db.transaction(async (tx) => {
      await tx.exec(migration[db.type]);
      await tx.run(`INSERT INTO schema_migrations (id) VALUES (${marker})`, [migration.id]);
    });
    console.log(`Applied database migration ${migration.id}`);
  }
}

module.exports = { runMigrations };
