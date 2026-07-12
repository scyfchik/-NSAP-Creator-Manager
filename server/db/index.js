const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");
const { normalizeTimelineEntry, validateCreatorPayload } = require("../validation");
const { runMigrations } = require("./migrations");
const { createPostgresAdapter } = require("./postgres");
const { createSqliteAdapter } = require("./sqlite");

let db;
const marker = (n) => db.type === "postgres" ? `$${n}` : "?";
const json = (value) => db.type === "postgres" ? value : JSON.stringify(value);
const parsePayload = (value) => typeof value === "string" ? JSON.parse(value) : value;
const isDevelopment = process.env.NODE_ENV !== "production";

const POSTGRES_CREATOR_COLUMNS = [
  "id", "normalized_name", "name", "display_name", "platform", "channel", "status", "priority",
  "last_upload", "last_nsp_content", "collab_posted", "dm_sent", "notes", "quick_note", "follow_up_date",
  "discord_username", "discord_id", "roblox_username", "youtube_url", "tiktok_url", "twitch_url", "twitter_url",
  "category", "avatar", "subscribers", "views", "average_views", "latest_video", "latest_video_title",
  "latest_video_url", "last_sync", "sync_status", "sync_error", "latest_channel_video_title",
  "latest_channel_video_url", "latest_channel_upload_date", "latest_nsap_video_title", "latest_nsap_video_url",
  "latest_nsap_upload_date", "nsap_match_status", "nsap_match_reason", "nsap_matched_keyword",
  "nsap_decision_video_title", "nsap_decision_video_url", "nsap_decision_video_upload_date", "nsap_decision_actor", "nsap_decision_at",
  "payload", "deleted", "deleted_at", "created_at", "updated_at",
];

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function serializeCreatorPayload(payload) {
  if (!isPlainObject(payload)) {
    throw new TypeError("Creator payload must be a plain object before JSONB serialization.");
  }
  return JSON.stringify(payload);
}

function buildPostgresCreatorUpsert(c, now = new Date().toISOString()) {
  const params = [
    c.id, String(c.name || "").trim().toLowerCase(), c.name, c.displayName || null, c.platform || null,
    c.channel || null, c.status || null, c.priority || null, c.lastUploadDate || null, c.lastContent || null,
    c.collabPosted || null, c.dmSent || null, c.notes || null, c.quickNote || null, c.followUpDate || null,
    c.discordUsername || null, c.discordId || null, c.robloxUsername || null, c.youtubeUrl || null,
    c.tiktokUrl || null, c.twitchUrl || null, c.twitterUrl || null, c.category || null, c.avatar || null,
    c.subscriberCount ?? null, c.views ?? null, c.averageViews ?? null, JSON.stringify(c.latestVideo ?? null),
    c.latestVideoTitle || null, c.latestVideoUrl || null, c.lastSync || null, c.syncStatus || null,
    c.syncError || null, c.latestChannelVideoTitle || null, c.latestChannelVideoUrl || null,
    c.latestChannelUploadDate || null, c.latestNsapVideoTitle || null, c.latestNsapVideoUrl || null,
    c.latestNsapUploadDate || null, c.nsapMatchStatus || null, c.nsapMatchReason || null,
    c.nsapMatchedKeyword || null, c.nsapDecisionVideoTitle || null, c.nsapDecisionVideoUrl || null, c.nsapDecisionVideoUploadDate || null,
    c.nsapDecisionActor || null, c.nsapDecisionAt || null, serializeCreatorPayload(c), Boolean(c.deleted), c.deletedAt || null,
    c.createdAt || now, c.updatedAt || now,
  ];
  const updateColumns = POSTGRES_CREATOR_COLUMNS.filter((column) => column !== "id" && column !== "created_at");
  const sql = `INSERT INTO creators (${POSTGRES_CREATOR_COLUMNS.join(",")}) VALUES (${params.map((_, index) => `$${index + 1}`).join(",")}) ON CONFLICT(id) DO UPDATE SET ${updateColumns.map((column) => `${column}=EXCLUDED.${column}`).join(",")}`;
  return { sql, params, columns: POSTGRES_CREATOR_COLUMNS };
}

function applyCreatorNsapDecision(creator, decision, user, decidedAt = new Date().toISOString()) {
  if (!creator.latestChannelVideoUrl || !creator.latestChannelUploadDate) {
    const error = new Error("Sync YouTube before reviewing NSAP content.");
    error.status = 400;
    throw error;
  }
  const confirmed = decision === "confirmed";
  if (confirmed) {
    creator.latestNsapVideoTitle = creator.latestChannelVideoTitle;
    creator.latestNsapVideoUrl = creator.latestChannelVideoUrl;
    creator.latestNsapUploadDate = creator.latestChannelUploadDate;
  }
  creator.nsapMatchStatus = confirmed ? "manual_confirmed" : "manual_rejected";
  creator.nsapMatchReason = `${confirmed ? "Marked as NSAP content" : "Marked as unrelated"} by ${user?.username || "Manager"}`;
  creator.nsapMatchedKeyword = "";
  creator.nsapDecisionVideoTitle = creator.latestChannelVideoTitle;
  creator.nsapDecisionVideoUrl = creator.latestChannelVideoUrl;
  creator.nsapDecisionVideoUploadDate = creator.latestChannelUploadDate;
  creator.nsapDecisionActor = user?.username || "Manager";
  creator.nsapDecisionAt = decidedAt;
  creator.updatedAt = decidedAt;
  return creator;
}
function creatorSelect() {
  if (db.type === "postgres") {
    return "payload, name, status, priority, last_upload, collab_posted, dm_sent, notes, quick_note, follow_up_date, discord_username, discord_id, roblox_username, youtube_url, tiktok_url, twitch_url, twitter_url, category, latest_video_title, latest_video_url, last_sync, sync_status, sync_error, latest_channel_video_title, latest_channel_video_url, latest_channel_upload_date, latest_nsap_video_title, latest_nsap_video_url, latest_nsap_upload_date, nsap_match_status, nsap_match_reason, nsap_matched_keyword, nsap_decision_video_title, nsap_decision_video_url, nsap_decision_video_upload_date, nsap_decision_actor, nsap_decision_at";
  }

  return `payload,
    json_extract(payload, '$.name') AS name,
    json_extract(payload, '$.status') AS status,
    json_extract(payload, '$.priority') AS priority,
    json_extract(payload, '$.lastUploadDate') AS last_upload,
    json_extract(payload, '$.collabPosted') AS collab_posted,
    json_extract(payload, '$.dmSent') AS dm_sent,
    json_extract(payload, '$.notes') AS notes,
    quick_note, follow_up_date, discord_username, discord_id, roblox_username,
    youtube_url, tiktok_url, twitch_url, twitter_url, category,
    json_extract(payload, '$.latestVideoTitle') AS latest_video_title,
    json_extract(payload, '$.latestVideoUrl') AS latest_video_url,
    json_extract(payload, '$.lastSync') AS last_sync,
    json_extract(payload, '$.syncStatus') AS sync_status,
    json_extract(payload, '$.syncError') AS sync_error,
    json_extract(payload, '$.latestChannelVideoTitle') AS latest_channel_video_title,
    json_extract(payload, '$.latestChannelVideoUrl') AS latest_channel_video_url,
    json_extract(payload, '$.latestChannelUploadDate') AS latest_channel_upload_date,
    json_extract(payload, '$.latestNsapVideoTitle') AS latest_nsap_video_title,
    json_extract(payload, '$.latestNsapVideoUrl') AS latest_nsap_video_url,
    json_extract(payload, '$.latestNsapUploadDate') AS latest_nsap_upload_date,
    json_extract(payload, '$.nsapMatchStatus') AS nsap_match_status,
    json_extract(payload, '$.nsapMatchReason') AS nsap_match_reason,
    json_extract(payload, '$.nsapMatchedKeyword') AS nsap_matched_keyword,
    json_extract(payload, '$.nsapDecisionVideoTitle') AS nsap_decision_video_title,
    json_extract(payload, '$.nsapDecisionVideoUrl') AS nsap_decision_video_url,
    json_extract(payload, '$.nsapDecisionVideoUploadDate') AS nsap_decision_video_upload_date,
    json_extract(payload, '$.nsapDecisionActor') AS nsap_decision_actor,
    json_extract(payload, '$.nsapDecisionAt') AS nsap_decision_at`;
}

function dateValue(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function mapCreatorRow(row) {
  const payload = parsePayload(row.payload);
  return {
    ...payload,
    name: row.name,
    status: row.status || "Inactive",
    priority: row.priority || "Medium",
    lastUploadDate: dateValue(row.last_upload),
    collabPosted: row.collab_posted || "No",
    dmSent: row.dm_sent || "No",
    notes: row.notes ?? "",
    quickNote: row.quick_note ?? "",
    followUpDate: dateValue(row.follow_up_date),
    followUp: row.follow_up_date ? "Yes" : "No",
    discordUsername: row.discord_username ?? "",
    discordId: row.discord_id ?? "",
    robloxUsername: row.roblox_username ?? "",
    youtubeUrl: row.youtube_url ?? "",
    tiktokUrl: row.tiktok_url ?? "",
    twitchUrl: row.twitch_url ?? "",
    twitterUrl: row.twitter_url ?? "",
    category: row.category ?? "",
    latestVideoTitle: row.latest_video_title ?? "",
    latestVideoUrl: row.latest_video_url ?? "",
    lastSync: row.last_sync instanceof Date ? row.last_sync.toISOString() : row.last_sync || "",
    syncStatus: row.sync_status ?? "",
    syncError: row.sync_error ?? "",
    latestChannelVideoTitle: row.latest_channel_video_title ?? "",
    latestChannelVideoUrl: row.latest_channel_video_url ?? "",
    latestChannelUploadDate: dateValue(row.latest_channel_upload_date),
    latestNsapVideoTitle: row.latest_nsap_video_title ?? "",
    latestNsapVideoUrl: row.latest_nsap_video_url ?? "",
    latestNsapUploadDate: dateValue(row.latest_nsap_upload_date),
    nsapMatchStatus: row.nsap_match_status ?? "",
    nsapMatchReason: row.nsap_match_reason ?? "",
    nsapMatchedKeyword: row.nsap_matched_keyword ?? "",
    nsapDecisionVideoTitle: row.nsap_decision_video_title ?? "",
    nsapDecisionVideoUrl: row.nsap_decision_video_url ?? "",
    nsapDecisionVideoUploadDate: dateValue(row.nsap_decision_video_upload_date),
    nsapDecisionActor: row.nsap_decision_actor ?? "",
    nsapDecisionAt: row.nsap_decision_at instanceof Date ? row.nsap_decision_at.toISOString() : row.nsap_decision_at || "",
  };
}

function mapTimelineRow(row) {
  return {
    timestamp: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    actorUsername: row.actor || "System",
    actorRole: row.actor_role || "system",
    type: row.type,
    message: row.message,
  };
}

async function initDatabase() {
  if (config.isProduction && config.databaseType !== "postgres") {
    throw new Error("Production requires DATABASE_URL to be a valid postgresql:// connection string; SQLite fallback is disabled.");
  }
  db = config.databaseType === "postgres"
    ? createPostgresAdapter(config.databaseUrl, config.databaseSsl)
    : createSqliteAdapter(config.databasePath);
  await runMigrations(db);
  await seedCreators();
  await ensureAutomaticBackups();
}

async function closeDatabase() { if (db) await db.close(); }

async function getCreators(options = {}, tx = db) {
  const deletedFilter = options.includeDeleted ? "" : `WHERE deleted = ${db.type === "postgres" ? "FALSE" : "0"}`;
  const rows = await tx.all(`SELECT ${creatorSelect()} FROM creators ${deletedFilter} ORDER BY ${db.type === "postgres" ? "normalized_name" : "LOWER(json_extract(payload, '$.name'))"}`);
  const creators = rows.map(mapCreatorRow);
  const byId = new Map(creators.map((creator) => [creator.id, creator]));
  const timelineRows = await tx.all(`SELECT timeline_entries.* FROM timeline_entries JOIN creators ON creators.id = timeline_entries.creator_id ${options.includeDeleted ? "" : `WHERE creators.deleted = ${db.type === "postgres" ? "FALSE" : "0"}`} ORDER BY timeline_entries.created_at DESC, timeline_entries.id DESC`);
  creators.forEach((creator) => { creator.timeline = []; });
  timelineRows.forEach((row) => { byId.get(row.creator_id)?.timeline.push(mapTimelineRow(row)); });
  return creators;
}

async function getCreator(id, tx = db) {
  const row = await tx.get(`SELECT ${creatorSelect()} FROM creators WHERE id = ${marker(1)}`, [id]);
  if (!row) return null;
  const creator = mapCreatorRow(row);
  const timelineRows = await tx.all(`SELECT * FROM timeline_entries WHERE creator_id = ${marker(1)} ORDER BY created_at DESC, id DESC`, [id]);
  creator.timeline = timelineRows.map(mapTimelineRow);
  return creator;
}

async function upsertCreator(c, tx = db) {
  if (db.type === "postgres") {
    const { sql, params } = buildPostgresCreatorUpsert(c);
    await tx.run(sql, params);
  } else {
    await tx.run(`INSERT INTO creators (id,payload,quick_note,follow_up_date,deleted,deleted_at,discord_username,discord_id,roblox_username,youtube_url,tiktok_url,twitch_url,twitter_url,category,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,quick_note=excluded.quick_note,follow_up_date=excluded.follow_up_date,deleted=excluded.deleted,deleted_at=excluded.deleted_at,discord_username=excluded.discord_username,discord_id=excluded.discord_id,roblox_username=excluded.roblox_username,youtube_url=excluded.youtube_url,tiktok_url=excluded.tiktok_url,twitch_url=excluded.twitch_url,twitter_url=excluded.twitter_url,category=excluded.category,updated_at=excluded.updated_at`, [c.id, JSON.stringify(c), c.quickNote||null,c.followUpDate||null,Number(Boolean(c.deleted)),c.deletedAt||null,c.discordUsername||null,c.discordId||null,c.robloxUsername||null,c.youtubeUrl||null,c.tiktokUrl||null,c.twitchUrl||null,c.twitterUrl||null,c.category||null,c.createdAt||new Date().toISOString(),c.updatedAt||new Date().toISOString()]);
  }
}

async function syncTimeline(c, tx) {
  await tx.run(`DELETE FROM timeline_entries WHERE creator_id = ${marker(1)}`, [c.id]);
  for (const entry of c.timeline || []) {
    await tx.run(`INSERT INTO timeline_entries (creator_id,actor,actor_role,type,message,created_at) VALUES (${[1,2,3,4,5,6].map(marker).join(",")})`, [c.id,entry.actorUsername||"System",entry.actorRole||"system",entry.type||"custom",entry.message||"",entry.timestamp||new Date().toISOString()]);
  }
}

async function insertAudit(data, tx = db) {
  const values=[data.user?.discord_id||null,data.user?.username||"Anonymous",data.action,data.creatorId||null,data.field||null,stringify(data.oldValue),stringify(data.newValue),data.ip||null];
  await tx.run(`INSERT INTO audit_logs (discord_id,username,action,creator_id,field,old_value,new_value,ip) VALUES (${values.map((_,i)=>marker(i+1)).join(",")})`, values);
}

async function mutateCreator({creatorId,user,ip,action,field,mutate}) {
  return db.transaction(async (tx) => {
    const creator=await getCreator(creatorId,tx); if(!creator||creator.deleted)return null;
    const oldValue=field ? creator[field] ?? "" : null; const changed=mutate(creator); if(changed===false)return creator;
    creator.updatedAt=new Date().toISOString(); await upsertCreator(creator,tx); await syncTimeline(creator,tx);
    await insertAudit({user,action,creatorId,field,oldValue,newValue:field?creator[field]:changed,ip},tx);
    const persistedCreator = await getCreator(creatorId,tx);
    if(isDevelopment && field==="quickNote")console.info("[db:creator.update]",{creatorId,quickNote:persistedCreator?.quickNote});
    return persistedCreator;
  });
}

async function createCreator(creator,user,ip) {
  return db.transaction(async(tx)=>{ const all=await getCreators({},tx); assertUnique(all,creator); let id=creator.id||"creator",n=2; while(await getCreator(id,tx))id=`${creator.id||"creator"}-${n++}`; const safe={...creator,id,deleted:false,createdAt:creator.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()}; await upsertCreator(safe,tx); await syncTimeline(safe,tx); await insertAudit({user,action:"creator.create",creatorId:id,newValue:safe.name,ip},tx); return safe; });
}
async function updateCreatorField({creatorId,field,value,user,ip}) { return mutateCreator({creatorId,user,ip,action:"creator.update",field,mutate(c){if(c[field]===value)return false;c[field]=value;if(field==="followUpDate")c.followUp=value?"Yes":"No";c.history=Array.isArray(c.history)?c.history:[];c.history.unshift({type:"Creator Updated",date:new Date().toISOString().slice(0,10),note:`${field} changed to ${value||"empty"}.`});return value;}}); }
async function updateCreatorProfile({creatorId,updates,user,ip}) { return db.transaction(async(tx)=>{const c=await getCreator(creatorId,tx);if(!c||c.deleted)return null;const old={},next={};for(const [k,v] of Object.entries(updates)){if(c[k]!==v){old[k]=c[k]??"";next[k]=v;c[k]=v;}}if(!Object.keys(next).length)return c;if(Object.hasOwn(next,"followUpDate")){c.followUp=c.followUpDate?"Yes":"No";appendTimeline(c,normalizeTimelineEntry({type:"followup_set",message:c.followUpDate?`Set follow-up for ${c.followUpDate}.`:"Cleared follow-up date."},user));}c.updatedAt=new Date().toISOString();await upsertCreator(c,tx);await syncTimeline(c,tx);await insertAudit({user,action:"creator.profile.update",creatorId,field:"profile",oldValue:old,newValue:next,ip},tx);return getCreator(creatorId,tx);}); }
async function softDeleteCreator({creatorId,user,ip}) { return mutateCreator({creatorId,user,ip,action:"creator.delete",field:"deleted",mutate(c){c.deleted=true;c.deletedAt=new Date().toISOString();c.status="Inactive";appendTimeline(c,normalizeTimelineEntry({type:"custom",message:"Creator deleted from active workspace."},user));return true;}}); }
async function addTimelineEntry({creatorId,entry,user,ip,auditAction="creator.timeline.add"}) { return mutateCreator({creatorId,user,ip,action:auditAction,field:null,mutate(c){const item=normalizeTimelineEntry(entry,user);appendTimeline(c,item);return item;}}); }
async function markDmSent({creatorId,user,ip}) { return mutateCreator({creatorId,user,ip,action:"creator.dm.mark_sent",field:"dmSent",mutate(c){c.dmSent="Yes";appendTimeline(c,normalizeTimelineEntry({type:"reminder_sent",message:"Marked DM sent."},user));return "Yes";}}); }

async function updateCreatorYouTubeSync({creatorId,result,user,ip}) {
  return db.transaction(async (tx) => {
    const creator = await getCreator(creatorId, tx);
    if (!creator || creator.deleted) return null;
    const oldValue = { latestChannelUploadDate: creator.latestChannelUploadDate, latestNsapUploadDate: creator.latestNsapUploadDate, nsapMatchStatus: creator.nsapMatchStatus, syncStatus: creator.syncStatus };
    creator.lastSync = result.lastSync || new Date().toISOString();
    creator.syncStatus = result.syncStatus;
    creator.syncError = result.syncError || "";
    const syncFields = [
      "latestChannelVideoTitle", "latestChannelVideoUrl", "latestChannelUploadDate",
      "latestNsapVideoTitle", "latestNsapVideoUrl", "latestNsapUploadDate",
      "nsapMatchStatus", "nsapMatchReason", "nsapMatchedKeyword", "nsapDecisionVideoTitle",
      "nsapDecisionVideoUrl", "nsapDecisionVideoUploadDate", "nsapDecisionActor", "nsapDecisionAt",
    ];
    syncFields.forEach((field) => {
      if (Object.hasOwn(result, field)) creator[field] = result[field] || "";
    });
    creator.updatedAt = new Date().toISOString();
    await upsertCreator(creator, tx);
    await insertAudit({ user, action: "creator.youtube.sync", creatorId, field: "youtubeSync", oldValue, newValue: result, ip }, tx);
    return getCreator(creatorId, tx);
  });
}

async function updateCreatorNsapDecision({creatorId,decision,user,ip}) {
  return db.transaction(async (tx) => {
    const creator = await getCreator(creatorId, tx);
    if (!creator || creator.deleted) return null;
    const oldValue = {
      latestNsapVideoTitle: creator.latestNsapVideoTitle,
      latestNsapVideoUrl: creator.latestNsapVideoUrl,
      latestNsapUploadDate: creator.latestNsapUploadDate,
      nsapMatchStatus: creator.nsapMatchStatus,
    };
    applyCreatorNsapDecision(creator, decision, user);
    await upsertCreator(creator, tx);
    await insertAudit({
      user,
      action: `creator.youtube.nsap.${creator.nsapMatchStatus}`,
      creatorId,
      field: "nsapMatchStatus",
      oldValue,
      newValue: {
        status: creator.nsapMatchStatus,
        videoTitle: creator.nsapDecisionVideoTitle,
        videoUrl: creator.nsapDecisionVideoUrl,
        videoUploadDate: creator.nsapDecisionVideoUploadDate,
        actor: creator.nsapDecisionActor,
        timestamp: creator.nsapDecisionAt,
      },
      ip,
    }, tx);
    return getCreator(creatorId, tx);
  });
}

async function getYouTubeChannelMapping(cacheKey) {
  return db.get(`SELECT channel_id, resolved_at FROM youtube_channel_mappings WHERE cache_key=${marker(1)}`, [cacheKey]);
}

async function setYouTubeChannelMapping(cacheKey, channelId) {
  if (db.type === "postgres") {
    await db.run("INSERT INTO youtube_channel_mappings (cache_key,channel_id,resolved_at) VALUES ($1,$2,NOW()) ON CONFLICT(cache_key) DO UPDATE SET channel_id=EXCLUDED.channel_id,resolved_at=NOW()", [cacheKey,channelId]);
  } else {
    await db.run("INSERT INTO youtube_channel_mappings (cache_key,channel_id,resolved_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(cache_key) DO UPDATE SET channel_id=excluded.channel_id,resolved_at=CURRENT_TIMESTAMP", [cacheKey,channelId]);
  }
}

async function replaceCreators(creators,user,reason,options={}) { const {audit=true,backup=true,backupType="manual",ip=null}=options; await db.transaction(async(tx)=>{if(backup)await insertBackup(user,reason,backupType,tx);await tx.run("DELETE FROM creators");for(const c of creators){await upsertCreator(c,tx);await syncTimeline(c,tx);}if(audit)await insertAudit({user,action:"creators.replace",newValue:`${creators.length} creators`,ip},tx);}); }
async function insertBackup(user,reason,type="manual",tx=db) { const payload={schemaVersion:3,creators:await getCreators({},tx)};await tx.run(`INSERT INTO backups (created_by_discord_id,created_by_username,type,reason,payload) VALUES (${[1,2,3,4,5].map(marker).join(",")})`,[user?.discord_id||null,user?.username||"System",type,reason,json(payload)]);await pruneBackups(tx); }
async function getBackups(){return db.all("SELECT id,created_by_discord_id,created_by_username,type,reason,created_at FROM backups ORDER BY id DESC LIMIT 50");}
async function restoreBackup(id,user,ip){const row=await db.get(`SELECT payload FROM backups WHERE id = ${marker(1)}`,[id]);if(!row)return false;await replaceCreators(validateCreatorPayload(parsePayload(row.payload)),user,`Restored backup ${id}`,{ip});return true;}

async function upsertUser(profile){return db.transaction(async(tx)=>{const count=await tx.get("SELECT COUNT(*) AS count FROM users");const old=await tx.get(`SELECT * FROM users WHERE discord_id = ${marker(1)}`,[profile.discord_id]);const role=old?.role||(Number(count.count)===0?"owner":"viewer");if(db.type==="postgres")await tx.run("INSERT INTO users (discord_id,username,avatar,role) VALUES ($1,$2,$3,$4) ON CONFLICT(discord_id) DO UPDATE SET username=EXCLUDED.username,avatar=EXCLUDED.avatar,last_login=NOW(),updated_at=NOW()",[profile.discord_id,profile.username,profile.avatar||null,role]);else await tx.run("INSERT INTO users (discord_id,username,avatar,role) VALUES (?,?,?,?) ON CONFLICT(discord_id) DO UPDATE SET username=excluded.username,avatar=excluded.avatar,last_login=CURRENT_TIMESTAMP",[profile.discord_id,profile.username,profile.avatar||null,role]);return tx.get(`SELECT * FROM users WHERE discord_id = ${marker(1)}`,[profile.discord_id]);});}
async function getUser(id){return db.get(`SELECT * FROM users WHERE discord_id = ${marker(1)}`,[id]);}
async function getUsers(){return db.all("SELECT * FROM users ORDER BY CASE role WHEN 'owner' THEN 4 WHEN 'administrator' THEN 3 WHEN 'manager' THEN 2 ELSE 1 END DESC, LOWER(username)");}
async function updateUserRole(id,role,actor,ip){return db.transaction(async(tx)=>{const user=await tx.get(`SELECT * FROM users WHERE discord_id = ${marker(1)}`,[id]);if(!user)return null;await tx.run(`UPDATE users SET role = ${marker(1)}${db.type === "postgres" ? ", updated_at = CURRENT_TIMESTAMP" : ""} WHERE discord_id = ${marker(2)}`,[role,id]);await insertAudit({user:actor,action:"user.role.update",field:"role",oldValue:user.role,newValue:`${id}:${role}`,ip},tx);return tx.get(`SELECT * FROM users WHERE discord_id = ${marker(1)}`,[id]);});}
async function createSession(id,hash,expires){await db.run(`INSERT INTO sessions (token_hash,discord_id,expires_at) VALUES (${[1,2,3].map(marker).join(",")})`,[hash,id,expires]);}
async function getSessionUser(hash){if(!hash)return null;return db.get(`SELECT users.* FROM sessions JOIN users ON users.discord_id=sessions.discord_id WHERE sessions.token_hash=${marker(1)} AND sessions.expires_at > CURRENT_TIMESTAMP`,[hash]);}
async function deleteSession(hash){if(hash)await db.run(`DELETE FROM sessions WHERE token_hash=${marker(1)}`,[hash]);}
async function getAuditLog(){return db.all("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 200");}

async function pruneBackups(tx){for(const [type,keep] of [["daily",30],["weekly",12],["manual",50]])await tx.run(`DELETE FROM backups WHERE type=${marker(1)} AND id NOT IN (SELECT id FROM backups WHERE type=${marker(2)} ORDER BY id DESC LIMIT ${marker(3)})`,[type,type,keep]);}

async function seedCreators(){const row=await db.get("SELECT COUNT(*) AS count FROM creators");if(Number(row.count)>0)return;const source=JSON.parse(fs.readFileSync(path.join(config.rootDir,"data","creators.json"),"utf8"));await replaceCreators(validateCreatorPayload(source),null,"Seeded from data/creators.json",{audit:false,backup:false});}
async function ensureAutomaticBackups(){for(const [type,days] of [["daily",1],["weekly",7]]){const row=await db.get(`SELECT id FROM backups WHERE type=${marker(1)} AND created_at >= ${db.type==="postgres"?`NOW() - (${marker(2)} * INTERVAL '1 day')`:`datetime('now', ${marker(2)})`} LIMIT 1`,[type,db.type==="postgres"?days:`-${days} days`]);if(!row)await insertBackup(null,`${type[0].toUpperCase()}${type.slice(1)} automatic backup`,type);}}
function appendTimeline(c,e){c.timeline=Array.isArray(c.timeline)?c.timeline:[];c.timeline.unshift(e);}
function stringify(v){return v==null?null:typeof v==="string"?v:JSON.stringify(v);}
function assertUnique(all,c){const norm=v=>String(v||"").trim().toLowerCase();if(all.some(x=>norm(x.name)===norm(c.name)||(c.channel&&norm(x.channel)===norm(c.channel))||(c.discordId&&x.discordId===c.discordId))){const e=new Error("A creator with this name, channel, or Discord ID already exists.");e.status=409;throw e;}}

module.exports={addTimelineEntry,closeDatabase,createCreator,createSession,deleteSession,getAuditLog,getBackups,getCreator,getCreators,getSessionUser,getUser,getUsers,getYouTubeChannelMapping,initDatabase,insertAudit,insertBackup,markDmSent,replaceCreators,restoreBackup,setYouTubeChannelMapping,softDeleteCreator,updateCreatorField,updateCreatorNsapDecision,updateCreatorProfile,updateCreatorYouTubeSync,updateUserRole,upsertUser,__testing:{applyCreatorNsapDecision,buildPostgresCreatorUpsert,isPlainObject,mapCreatorRow,serializeCreatorPayload}};
