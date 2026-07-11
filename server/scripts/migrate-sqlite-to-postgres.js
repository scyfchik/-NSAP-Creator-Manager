const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const config = require("../config");
const { createPostgresAdapter } = require("../db/postgres");
const { runMigrations } = require("../db/migrations");
const { validateCreatorPayload } = require("../validation");

async function main() {
  if (!config.isPostgresUrl(config.databaseUrl)) throw new Error("DATABASE_URL must be a PostgreSQL URL.");
  const sourcePath = config.databasePath;
  const source = fs.existsSync(sourcePath) ? new DatabaseSync(sourcePath, { readOnly: true }) : null;
  const pg = createPostgresAdapter(config.databaseUrl, config.databaseSsl);
  const summary = { inserted: 0, skipped: 0, failed: 0 };
  try {
    await runMigrations(pg);
    let creators = readRows(source, "creators").map((row) => parseJson(row.payload)).filter(Boolean);
    if (!creators.length) creators = validateCreatorPayload(JSON.parse(fs.readFileSync(path.join(config.rootDir, "data", "creators.json"), "utf8")));
    for (const creator of creators) await importCreator(pg, creator, summary);
    for (const user of readRows(source, "users")) await importUser(pg, user, summary);
    for (const session of readRows(source, "sessions")) await importSession(pg, session, summary);
    for (const audit of readRows(source, "audit_logs")) await importAudit(pg, audit, summary);
    console.log(`Migration summary: inserted=${summary.inserted} skipped=${summary.skipped} failed=${summary.failed}`);
    if (summary.failed) process.exitCode = 1;
  } finally { source?.close(); await pg.close(); }
}

function readRows(db, table) {
  if (!db) return [];
  const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
  return exists ? db.prepare(`SELECT * FROM ${table}`).all() : [];
}

async function importCreator(pg, c, summary) {
  try {
    const result = await pg.run(`INSERT INTO creators (id,normalized_name,name,display_name,platform,channel,status,priority,last_upload,last_nsp_content,collab_posted,dm_sent,notes,quick_note,follow_up_date,discord_username,discord_id,roblox_username,youtube_url,tiktok_url,twitch_url,twitter_url,category,avatar,subscribers,views,average_views,latest_video,payload,deleted,deleted_at,created_at,updated_at) VALUES (${Array.from({length:33},(_,i)=>`$${i+1}`).join(",")}) ON CONFLICT(id) DO NOTHING`, [c.id,String(c.name||"").trim().toLowerCase(),c.name,c.displayName||null,c.platform||null,c.channel||null,c.status||null,c.priority||null,c.lastUploadDate||null,c.lastContent||null,c.collabPosted||null,c.dmSent||null,c.notes||null,c.quickNote||null,c.followUpDate||null,c.discordUsername||null,c.discordId||null,c.robloxUsername||null,c.youtubeUrl||null,c.tiktokUrl||null,c.twitchUrl||null,c.twitterUrl||null,c.category||null,c.avatar||null,c.subscriberCount??null,c.views??null,c.averageViews??null,c.latestVideo||null,c,Boolean(c.deleted),c.deletedAt||null,c.createdAt||new Date().toISOString(),c.updatedAt||new Date().toISOString()]);
    if (!result.rowCount) return summary.skipped++;
    summary.inserted++;
    for (const e of c.timeline || []) await pg.run("INSERT INTO timeline_entries (creator_id,actor,actor_role,type,message,created_at) VALUES ($1,$2,$3,$4,$5,$6)",[c.id,e.actorUsername||"System",e.actorRole||"system",e.type||"custom",e.message||"",e.timestamp||new Date().toISOString()]);
  } catch (error) { summary.failed++; console.error(`Creator ${c.id}: ${error.message}`); }
}
async function importUser(pg,u,s){try{const r=await pg.run("INSERT INTO users (discord_id,username,avatar,role,created_at,last_login,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$6) ON CONFLICT(discord_id) DO NOTHING",[u.discord_id,u.username,u.avatar||null,normalizeRole(u.role),u.created_at||new Date().toISOString(),u.last_login||new Date().toISOString()]);r.rowCount?s.inserted++:s.skipped++;}catch(e){s.failed++;console.error(`User ${u.discord_id}: ${e.message}`);}}
async function importSession(pg,x,s){try{const r=await pg.run("INSERT INTO sessions (token_hash,discord_id,created_at,expires_at) VALUES ($1,$2,$3,$4) ON CONFLICT(token_hash) DO NOTHING",[x.token_hash,x.discord_id,x.created_at||new Date().toISOString(),x.expires_at]);r.rowCount?s.inserted++:s.skipped++;}catch(e){s.failed++;console.error(`Session ${x.token_hash?.slice(0,8)||"unknown"}: ${e.message}`);}}
async function importAudit(pg,a,s){try{const r=await pg.run("INSERT INTO audit_logs (discord_id,username,action,creator_id,field,old_value,new_value,ip,timestamp,created_at) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$9 WHERE NOT EXISTS (SELECT 1 FROM audit_logs WHERE action=$3 AND creator_id IS NOT DISTINCT FROM $4 AND timestamp=$9)",[a.discord_id||null,a.username||"System",a.action,a.creator_id||null,a.field||null,a.old_value||null,a.new_value||null,a.ip||null,a.timestamp||new Date().toISOString()]);r.rowCount?s.inserted++:s.skipped++;}catch(e){s.failed++;console.error(`Audit ${a.id}: ${e.message}`);}}
function parseJson(v){try{return typeof v==="string"?JSON.parse(v):v;}catch{return null;}}
function normalizeRole(r){return r==="admin"?"administrator":r==="editor"?"manager":["viewer","manager","administrator","owner"].includes(r)?r:"viewer";}

main().catch((error)=>{console.error(`Migration failed: ${error.message}`);process.exit(1);});
