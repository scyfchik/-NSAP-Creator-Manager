import { daysSinceUpload } from "../utils/dates.js";

const priorityRank = {
  High: 0,
  Medium: 1,
  Low: 2,
};

export function applyCreatorFilters(creators, state) {
  const query = state.search.trim().toLowerCase();

  return creators
    .filter((creator) => {
      if (!query) {
        return true;
      }

      return [
        creator.name,
        creator.channel,
        creator.platform,
        creator.status,
        creator.priority,
        creator.lastContent,
        creator.notes,
      ].join(" ").toLowerCase().includes(query);
    })
    .filter((creator) => state.platform === "all" || creator.platform === state.platform)
    .filter((creator) => state.status === "all" || creator.status === state.status)
    .filter((creator) => state.priority === "all" || creator.priority === state.priority)
    .filter((creator) => state.collabPosted === "all" || creator.collabPosted === state.collabPosted)
    .filter((creator) => state.dmSent === "all" || creator.dmSent === state.dmSent)
    .filter((creator) => !state.followUpOnly || creator.followUp === "Yes")
    .filter((creator) => !state.collabMissingOnly || creator.collabPosted !== "Yes")
    .sort((a, b) => compareCreators(a, b, state.sort));
}

export function paginateCreators(creators, page, pageSize) {
  const maxPage = Math.max(1, Math.ceil(creators.length / pageSize));
  const safePage = Math.min(Math.max(1, page), maxPage);
  const start = (safePage - 1) * pageSize;

  return {
    page: safePage,
    maxPage,
    rows: creators.slice(start, start + pageSize),
  };
}

function compareCreators(a, b, sort) {
  const direction = sort.direction === "desc" ? -1 : 1;

  if (sort.field === "days") {
    return direction * ((daysSinceUpload(a.lastUploadDate) ?? -1) - (daysSinceUpload(b.lastUploadDate) ?? -1));
  }

  if (sort.field === "priority") {
    return direction * ((priorityRank[a.priority] ?? 99) - (priorityRank[b.priority] ?? 99));
  }

  return direction * String(a[sort.field] ?? "").localeCompare(String(b[sort.field] ?? ""));
}
