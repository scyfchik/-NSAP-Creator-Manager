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
  const rows = await tx.all(`SELECT payload FROM creators ${options.includeDeleted ? "" : `WHERE deleted = ${db.type === "postgres" ? "FALSE" : "0"}`} ORDER BY ${db.type === "postgres" ? "normalized_name" : "LOWER(json_extract(payload, '$.name'))"}`);
  return rows.map((row) => parsePayload(row.payload));
}

async function getCreator(id, tx = db) {
  const row = await tx.get(`SELECT payload FROM creators WHERE id = ${marker(1)}`, [id]);
  return row ? parsePayload(row.payload) : null;
}

function creatorValues(c) {
  return [c.id, String(c.name || "").trim().toLowerCase(), c.name, c.displayName || null, c.platform || null, c.channel || null, c.status || null, c.priority || null, c.lastUploadDate || null, c.lastContent || null, c.collabPosted || null, c.dmSent || null, c.notes || null, c.quickNote || null, c.followUpDate || null, c.discordUsername || null, c.discordId || null, c.robloxUsername || null, c.youtubeUrl || null, c.tiktokUrl || null, c.twitchUrl || null, c.twitterUrl || null, c.category || null, c.avatar || null, c.subscriberCount ?? null, c.views ?? null, c.averageViews ?? null, c.latestVideo || null, json(c), db.type === "postgres" ? Boolean(c.deleted) : Number(Boolean(c.deleted)), c.deletedAt || null, c.createdAt || new Date().toISOString(), c.updatedAt || new Date().toISOString()];
}

async function upsertCreator(c, tx = db) {
  if (db.type === "postgres") {
    const values = creatorValues(c);
    await tx.run(`INSERT INTO creators (id,normalized_name,name,display_name,platform,channel,status,priority,last_upload,last_nsp_content,collab_posted,dm_sent,notes,quick_note,follow_up_date,discord_username,discord_id,roblox_username,youtube_url,tiktok_url,twitch_url,twitter_url,category,avatar,subscribers,views,average_views,latest_video,payload,deleted,deleted_at,created_at,updated_at) VALUES (${values.map((_,i)=>`$${i+1}`).join(",")}) ON CONFLICT(id) DO UPDATE SET normalized_name=EXCLUDED.normalized_name,name=EXCLUDED.name,display_name=EXCLUDED.display_name,platform=EXCLUDED.platform,channel=EXCLUDED.channel,status=EXCLUDED.status,priority=EXCLUDED.priority,last_upload=EXCLUDED.last_upload,last_nsp_content=EXCLUDED.last_nsp_content,collab_posted=EXCLUDED.collab_posted,dm_sent=EXCLUDED.dm_sent,notes=EXCLUDED.notes,quick_note=EXCLUDED.quick_note,follow_up_date=EXCLUDED.follow_up_date,discord_username=EXCLUDED.discord_username,discord_id=EXCLUDED.discord_id,roblox_username=EXCLUDED.roblox_username,youtube_url=EXCLUDED.youtube_url,tiktok_url=EXCLUDED.tiktok_url,twitch_url=EXCLUDED.twitch_url,twitter_url=EXCLUDED.twitter_url,category=EXCLUDED.category,avatar=EXCLUDED.avatar,subscribers=EXCLUDED.subscribers,views=EXCLUDED.views,average_views=EXCLUDED.average_views,latest_video=EXCLUDED.latest_video,payload=EXCLUDED.payload,deleted=EXCLUDED.deleted,deleted_at=EXCLUDED.deleted_at,updated_at=EXCLUDED.updated_at`, values);
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
    await insertAudit({user,action,creatorId,field,oldValue,newValue:field?creator[field]:changed,ip},tx); return creator;
  });
}

async function createCreator(creator,user,ip) {
  return db.transaction(async(tx)=>{ const all=await getCreators({},tx); assertUnique(all,creator); let id=creator.id||"creator",n=2; while(await getCreator(id,tx))id=`${creator.id||"creator"}-${n++}`; const safe={...creator,id,deleted:false,createdAt:creator.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()}; await upsertCreator(safe,tx); await syncTimeline(safe,tx); await insertAudit({user,action:"creator.create",creatorId:id,newValue:safe.name,ip},tx); return safe; });
}
async function updateCreatorField({creatorId,field,value,user,ip}) { return mutateCreator({creatorId,user,ip,action:"creator.update",field,mutate(c){if(c[field]===value)return false;c[field]=value;if(field==="followUpDate")c.followUp=value?"Yes":"No";c.history=Array.isArray(c.history)?c.history:[];c.history.unshift({type:"Creator Updated",date:new Date().toISOString().slice(0,10),note:`${field} changed to ${value||"empty"}.`});return value;}}); }
async function updateCreatorProfile({creatorId,updates,user,ip}) { return db.transaction(async(tx)=>{const c=await getCreator(creatorId,tx);if(!c||c.deleted)return null;const old={},next={};for(const [k,v] of Object.entries(updates)){if(c[k]!==v){old[k]=c[k]??"";next[k]=v;c[k]=v;}}if(!Object.keys(next).length)return c;if(Object.hasOwn(next,"followUpDate")){c.followUp=c.followUpDate?"Yes":"No";appendTimeline(c,normalizeTimelineEntry({type:"followup_set",message:c.followUpDate?`Set follow-up for ${c.followUpDate}.`:"Cleared follow-up date."},user));}c.updatedAt=new Date().toISOString();await upsertCreator(c,tx);await syncTimeline(c,tx);await insertAudit({user,action:"creator.profile.update",creatorId,field:"profile",oldValue:old,newValue:next,ip},tx);return c;}); }
async function softDeleteCreator({creatorId,user,ip}) { return mutateCreator({creatorId,user,ip,action:"creator.delete",field:"deleted",mutate(c){c.deleted=true;c.deletedAt=new Date().toISOString();c.status="Inactive";appendTimeline(c,normalizeTimelineEntry({type:"custom",message:"Creator deleted from active workspace."},user));return true;}}); }
async function addTimelineEntry({creatorId,entry,user,ip,auditAction="creator.timeline.add"}) { return mutateCreator({creatorId,user,ip,action:auditAction,field:null,mutate(c){const item=normalizeTimelineEntry(entry,user);appendTimeline(c,item);return item;}}); }
async function markDmSent({creatorId,user,ip}) { return mutateCreator({creatorId,user,ip,action:"creator.dm.mark_sent",field:"dmSent",mutate(c){c.dmSent="Yes";appendTimeline(c,normalizeTimelineEntry({type:"reminder_sent",message:"Marked DM sent."},user));return "Yes";}}); }

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

module.exports={addTimelineEntry,closeDatabase,createCreator,createSession,deleteSession,getAuditLog,getBackups,getCreator,getCreators,getSessionUser,getUser,getUsers,initDatabase,insertAudit,insertBackup,markDmSent,replaceCreators,restoreBackup,softDeleteCreator,updateCreatorField,updateCreatorProfile,updateUserRole,upsertUser};
