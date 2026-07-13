const config = require("../config");
const db = require("../db");
const { createPostgresAdapter } = require("../db/postgres");
const { normalizeTimelineEntry, validateEdit, validateNewCreator, validateProfileUpdate } = require("../validation");

const actor = { discord_id: "900000000000000001", username: "Persistence Audit", role: "owner" };

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Persistence audit is disabled in production.");
  if (config.databaseType !== "postgres") throw new Error("Set DATABASE_URL to a disposable PostgreSQL test database.");

  const creatorId = `persistence-audit-${Date.now()}`;
  const raw = createPostgresAdapter(config.databaseUrl, config.databaseSsl);
  let creator;
  try {
    await db.initDatabase();
    creator = await db.createCreator(validateNewCreator({ name: creatorId, platform: "YouTube", youtubeUrl: "https://youtube.com/@persistence-audit" }), actor, "127.0.0.1");
    creator = await db.updateCreatorProfile({
      creatorId: creator.id,
      updates: validateProfileUpdate({
        status: "On Break",
        priority: "High",
        followUpDate: "2026-07-15",
        lastUploadDate: "2026-07-10",
        notes: "Persistence audit notes",
        discordUsername: "audit.user",
        discordId: "900000000000000001",
        robloxUsername: "PersistenceAudit",
        category: "Video Creator",
        youtubeUrl: "https://youtube.com/@persistence-audit",
        tiktokUrl: "https://tiktok.com/@persistence-audit",
        twitchUrl: "https://twitch.tv/persistence-audit",
        twitterUrl: "https://x.com/persistence_audit",
      }),
      user: actor,
      ip: "127.0.0.1",
    });
    creator = await updateField(creator.id, "collabPosted", "Yes");
    creator = await updateField(creator.id, "dmSent", "Yes");
    creator = await db.addTimelineEntry({ creatorId: creator.id, entry: { type: "note", message: "Persistence audit timeline" }, user: actor, ip: "127.0.0.1" });

    assertCreator(creator);
    assertCreator((await db.getCreators()).find((item) => item.id === creator.id));
    const row = await raw.get("SELECT * FROM creators WHERE id = $1", [creator.id]);
    assertColumns(row);
    const timeline = await raw.get("SELECT * FROM timeline_entries WHERE creator_id = $1 AND message = $2", [creator.id, "Persistence audit timeline"]);
    if (!timeline) throw new Error("timeline_entries row missing");
    const audit = await db.getAuditLog();
    if (!audit.some((item) => item.creator_id === creator.id && item.action === "creator.timeline.add")) throw new Error("timeline audit missing");
    if (!audit.some((item) => item.creator_id === creator.id && item.action === "creator.profile.update")) throw new Error("profile audit missing");

    assertRejected(() => validateProfileUpdate({ followUpDate: "2026-02-30" }), "invalid follow-up date");
    assertRejected(() => validateProfileUpdate({ youtubeUrl: "javascript:alert(1)" }), "unsafe URL");
    assertRejected(() => normalizeTimelineEntry({ type: "note", message: "" }, actor), "empty timeline entry");

    await db.updateCreatorProfile({ creatorId: creator.id, updates: validateProfileUpdate({ followUpDate: "", youtubeUrl: "" }), user: actor, ip: "127.0.0.1" });
    const cleared = await raw.get("SELECT follow_up_date, youtube_url FROM creators WHERE id = $1", [creator.id]);
    if (cleared.follow_up_date !== null || cleared.youtube_url !== null) throw new Error("nullable field clear failed");

    await db.closeDatabase();
    await db.initDatabase();
    const restarted = await db.getCreator(creator.id);
    if (!restarted || restarted.notes !== "Persistence audit notes" || restarted.timeline[0]?.message !== "Persistence audit timeline") throw new Error("restart read-back failed");
    await db.softDeleteCreator({ creatorId: creator.id, user: actor, ip: "127.0.0.1" });
    console.log(`PostgreSQL persistence audit passed for ${creator.id}`);
  } finally {
    await db.closeDatabase().catch(() => {});
    await raw.close().catch(() => {});
  }
}

async function updateField(creatorId, field, value) {
  const validation = validateEdit(field, value);
  if (!validation.ok) throw new Error(`${field} validation failed: ${validation.message}`);
  return db.updateCreatorField({ creatorId, field, value: validation.value, user: actor, ip: "127.0.0.1" });
}

function assertCreator(creator) {
  const expected = {
    status: "On Break", priority: "High", followUpDate: "2026-07-15", lastUploadDate: "2026-07-10",
    notes: "Persistence audit notes", discordUsername: "audit.user", discordId: "900000000000000001",
    robloxUsername: "PersistenceAudit", category: "Video Creator", collabPosted: "Yes", dmSent: "Yes",
    youtubeUrl: "https://youtube.com/@persistence-audit", tiktokUrl: "https://tiktok.com/@persistence-audit",
    twitchUrl: "https://twitch.tv/persistence-audit", twitterUrl: "https://x.com/persistence_audit",
  };
  for (const [field, value] of Object.entries(expected)) if (creator?.[field] !== value) throw new Error(`${field} read-back mismatch`);
  if (creator.timeline[0]?.message !== "Persistence audit timeline") throw new Error("timeline response mismatch");
}

function assertColumns(row) {
  const expected = { status: "On Break", priority: "High", follow_up_date: "2026-07-15", last_upload: "2026-07-10", notes: "Persistence audit notes", discord_username: "audit.user", discord_id: "900000000000000001", roblox_username: "PersistenceAudit", category: "Video Creator", collab_posted: "Yes", dm_sent: "Yes", youtube_url: "https://youtube.com/@persistence-audit", tiktok_url: "https://tiktok.com/@persistence-audit", twitch_url: "https://twitch.tv/persistence-audit", twitter_url: "https://x.com/persistence_audit" };
  for (const [field, value] of Object.entries(expected)) if (dateText(row?.[field]) !== value) throw new Error(`${field} column mismatch`);
}

function assertRejected(work, label) {
  try { work(); } catch (error) { if (error.status === 400) return; throw error; }
  throw new Error(`${label} was accepted`);
}

function dateText(value) { return value instanceof Date ? value.toISOString().slice(0, 10) : value; }

main().catch((error) => { console.error(`PostgreSQL persistence audit failed: ${error.message}`); process.exit(1); });
