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
    latestChannelVideoTitle: "Unrelated channel upload",
    latestChannelVideoUrl: "https://www.youtube.com/watch?v=channel",
    latestChannelUploadDate: "2026-07-12",
    latestNsapVideoTitle: title,
    latestNsapVideoUrl: "https://www.youtube.com/watch?v=nsap",
    latestNsapUploadDate: "2026-07-10",
    nsapMatchStatus: "matched",
    nsapMatchReason: "Matched title phrase",
    nsapMatchedKeyword: "night shift at paulie's",
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
  assert.equal(indexOf("latest_channel_video_title"), 33, "$34 must be latest_channel_video_title");
  assert.equal(indexOf("latest_nsap_upload_date"), 38, "$39 must be latest_nsap_upload_date");
  assert.equal(indexOf("nsap_match_status"), 39, "$40 must be nsap_match_status");
  assert.equal(indexOf("payload"), 47, "$48 must be the serialized creator payload");
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
  ["latest_video", "latest_video_title", "latest_video_url", "last_sync", "sync_status", "sync_error", "latest_channel_video_title", "latest_channel_video_url", "latest_channel_upload_date", "latest_nsap_video_title", "latest_nsap_video_url", "latest_nsap_upload_date", "nsap_match_status", "nsap_match_reason", "nsap_matched_keyword", "nsap_decision_video_title", "nsap_decision_video_url", "nsap_decision_video_upload_date", "nsap_decision_actor", "nsap_decision_at", "payload"]
    .forEach((column) => assert.match(contract.sql, new RegExp(`${column}=EXCLUDED\\.${column}`)));
  assert.equal(contract.params.length, contract.columns.length);
  contract.params.forEach((_, index) => assert.match(contract.sql, new RegExp(`\\$${index + 1}(?:,|\\))`)));

  assert.throws(() => __testing.serializeCreatorPayload("Time is not an object"), /plain object/);
  assert.throws(() => __testing.serializeCreatorPayload([]), /plain object/);
  assert.equal(__testing.serializeCreatorPayload({ title }), JSON.stringify({ title }));

  const stalePayload = { name: "Dropterr", status: "Inactive", priority: "Low", latestNsapUploadDate: "1999-01-01", nsapMatchStatus: "no_match" };
  const mapped = __testing.mapCreatorRow({
    payload: stalePayload,
    name: "Dropterr",
    status: "Active",
    priority: "High",
    latest_nsap_upload_date: new Date("2026-07-10T00:00:00.000Z"),
    latest_nsap_video_title: title,
    latest_nsap_video_url: creator.latestNsapVideoUrl,
    latest_channel_upload_date: new Date("2026-07-12T00:00:00.000Z"),
    latest_channel_video_title: creator.latestChannelVideoTitle,
    latest_channel_video_url: creator.latestChannelVideoUrl,
    nsap_match_status: "matched",
    nsap_match_reason: "Matched title phrase",
    nsap_matched_keyword: "night shift at paulie's",
  });
  assert.equal(mapped.latestNsapUploadDate, "2026-07-10", "PostgreSQL NSAP date must override stale payload JSON");
  assert.equal(mapped.nsapMatchStatus, "matched", "PostgreSQL match status must remain authoritative");

  const manuallyConfirmed = __testing.applyCreatorNsapDecision({
    latestChannelVideoTitle: "Manual NSAP video",
    latestChannelVideoUrl: "https://www.youtube.com/watch?v=manual",
    latestChannelUploadDate: "2026-07-11",
  }, "confirmed", { username: "Manager One" }, "2026-07-12T13:00:00.000Z");
  assert.equal(manuallyConfirmed.nsapMatchStatus, "manual_confirmed");
  assert.equal(manuallyConfirmed.latestNsapVideoTitle, "Manual NSAP video");
  assert.equal(manuallyConfirmed.nsapDecisionActor, "Manager One");
  const manualContract = __testing.buildPostgresCreatorUpsert({ id: "manual", name: "Manual", ...manuallyConfirmed });
  assert.equal(manualContract.params[manualContract.columns.indexOf("nsap_decision_video_title")], "Manual NSAP video");
  assert.equal(manualContract.params[manualContract.columns.indexOf("nsap_decision_video_url")], "https://www.youtube.com/watch?v=manual");
  assert.equal(manualContract.params[manualContract.columns.indexOf("nsap_decision_video_upload_date")], "2026-07-11");
  assert.equal(manualContract.params[manualContract.columns.indexOf("nsap_decision_actor")], "Manager One");
  assert.equal(manualContract.params[manualContract.columns.indexOf("nsap_decision_at")], "2026-07-12T13:00:00.000Z");

  const manuallyRejected = __testing.applyCreatorNsapDecision({
    latestChannelVideoTitle: "Unrelated video",
    latestChannelVideoUrl: "https://www.youtube.com/watch?v=unrelated",
    latestChannelUploadDate: "2026-07-12",
    latestNsapVideoTitle: "Previous NSAP video",
    latestNsapUploadDate: "2026-06-01",
  }, "rejected", { username: "Manager Two" }, "2026-07-12T14:00:00.000Z");
  assert.equal(manuallyRejected.nsapMatchStatus, "manual_rejected");
  assert.equal(manuallyRejected.latestNsapVideoTitle, "Previous NSAP video", "manual rejection must preserve previous NSAP activity");
  console.log("PostgreSQL creator UPSERT contract tests passed");
}

run();
