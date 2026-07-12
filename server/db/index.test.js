const assert = require("node:assert/strict");
const { __testing } = require("./index");

function run() {
  const title = "Time to Create: Sync titles with spaces & punctuation!";
  const creator = {
    id: "dropterr",
    name: "Dropterr",
    status: "Active",
    priority: "High",
    quickNote: "Manual note stays unchanged",
    latestVideo: title,
    latestVideoTitle: title,
    latestVideoUrl: "https://www.youtube.com/watch?v=example",
    lastSync: "2026-07-12T12:00:00.000Z",
    syncStatus: "synced",
    syncError: "",
    deleted: false,
  };

  const contract = __testing.buildPostgresCreatorUpsert(creator, "2026-07-12T12:00:00.000Z");
  const indexOf = (column) => contract.columns.indexOf(column);

  assert.equal(indexOf("latest_video"), 27, "$28 must remain latest_video");
  assert.equal(indexOf("latest_video_title"), 28, "$29 must be latest_video_title");
  assert.equal(indexOf("latest_video_url"), 29, "$30 must be latest_video_url");
  assert.equal(indexOf("last_sync"), 30, "$31 must be last_sync");
  assert.equal(indexOf("sync_status"), 31, "$32 must be sync_status");
  assert.equal(indexOf("sync_error"), 32, "$33 must be sync_error");
  assert.equal(indexOf("payload"), 33, "$34 must be the serialized creator payload");
  assert.equal(JSON.parse(contract.params[indexOf("latest_video")]), title);
  assert.equal(contract.params[indexOf("latest_video_title")], title);
  assert.equal(contract.params[indexOf("latest_video_url")], creator.latestVideoUrl);
  assert.equal(contract.params[indexOf("last_sync")], creator.lastSync);
  assert.equal(contract.params[indexOf("sync_status")], "synced");
  assert.equal(contract.params[indexOf("sync_error")], null);

  const payloadParam = contract.params[indexOf("payload")];
  assert.equal(typeof payloadParam, "string");
  assert.notEqual(payloadParam, title, "A Time-prefixed title must never occupy the payload parameter");
  assert.deepEqual(JSON.parse(payloadParam), creator);
  ["latest_video", "latest_video_title", "latest_video_url", "last_sync", "sync_status", "sync_error", "payload"]
    .forEach((column) => assert.match(contract.sql, new RegExp(`${column}=EXCLUDED\\.${column}`)));
  assert.equal(contract.params.length, contract.columns.length);
  contract.params.forEach((_, index) => assert.match(contract.sql, new RegExp(`\\$${index + 1}(?:,|\\))`)));

  assert.throws(() => __testing.serializeCreatorPayload("Time is not an object"), /plain object/);
  assert.throws(() => __testing.serializeCreatorPayload([]), /plain object/);
  assert.equal(__testing.serializeCreatorPayload({ title }), JSON.stringify({ title }));
  console.log("PostgreSQL creator UPSERT contract tests passed");
}

run();
