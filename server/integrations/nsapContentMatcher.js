const STRONG_PHRASES = [
  "night shift at paulie's",
  "night shift at paulies",
  "night shift at pauls",
];

const STRONG_HASHTAGS = [
  "#nightshiftatpaulies",
  "#nightshiftatpauls",
];

function matchNsapContent({ title = "", description = "" } = {}) {
  const titleMatch = matchStrongText(title, "title");
  if (titleMatch) return titleMatch;
  const descriptionMatch = matchStrongText(description, "description");
  if (descriptionMatch) return descriptionMatch;

  const combined = normalizeText(`${title} ${description}`);
  const hasPaulies = hasTerm(combined, "paulies");
  const hasRoblox = hasTerm(combined, "roblox");
  if (hasPaulies && hasRoblox) {
    return matched("Matched combined terms: \"Paulies + Roblox\"", "paulies + roblox");
  }

  const hasNsap = hasTerm(combined, "nsap");
  const nsapSupport = ["roblox", "paulies", "night shift"].find((term) => hasTerm(combined, term));
  if (hasNsap && nsapSupport) {
    return matched(`Matched combined terms: \"NSAP + ${displayTerm(nsapSupport)}\"`, `nsap + ${nsapSupport}`);
  }

  if (hasNsap) {
    return ambiguous("Potential NSAP term requires manual review", "nsap");
  }
  if (hasPaulies) {
    return ambiguous("Potential Paulies reference requires manual review", "paulies");
  }
  if (hasRoblox && hasTerm(combined, "night shift")) {
    return ambiguous("Potential Night Shift + Roblox reference requires manual review", "night shift + roblox");
  }

  return {
    matched: false,
    status: "no_match",
    classification: "unrelated",
    reason: "No relevant NSAP video found in recent feed entries",
    matchedKeyword: "",
  };
}

function matchStrongText(value, source) {
  const canonical = canonicalText(value);
  for (const hashtag of STRONG_HASHTAGS) {
    if (canonical.includes(hashtag)) {
      return matched(`Matched ${source} hashtag: \"${hashtag}\"`, hashtag);
    }
  }

  const normalized = normalizeText(value);
  for (const phrase of STRONG_PHRASES) {
    if (normalized.includes(normalizeText(phrase))) {
      return matched(`Matched ${source} phrase: \"${titleCasePhrase(phrase)}\"`, phrase);
    }
  }
  return null;
}

function canonicalText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc`]/g, "'");
}

function normalizeText(value) {
  return canonicalText(value)
    .replace(/'/g, "")
    .replace(/[^a-z0-9#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasTerm(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`).test(text);
}

function matched(reason, matchedKeyword) {
  return { matched: true, status: "matched", classification: "matched", reason, matchedKeyword };
}

function ambiguous(reason, matchedKeyword) {
  return { matched: false, status: "manual_review_required", classification: "ambiguous", reason, matchedKeyword };
}

function isNsapReviewCandidate(match) {
  return ["matched", "ambiguous"].includes(match?.classification);
}

function displayTerm(term) {
  if (term === "roblox") return "Roblox";
  if (term === "night shift") return "Night Shift";
  return "Paulies";
}

function titleCasePhrase(phrase) {
  if (phrase === "night shift at paulie's") return "Night Shift at Paulie's";
  if (phrase === "night shift at paulies") return "Night Shift at Paulies";
  return "Night Shift at Pauls";
}

module.exports = { STRONG_HASHTAGS, STRONG_PHRASES, isNsapReviewCandidate, matchNsapContent, normalizeText };
