const roleRank = {
  anonymous: 0,
  viewer: 1,
  manager: 2,
  administrator: 3,
  owner: 4,
};

const editableFields = new Set([
  "status",
  "priority",
  "dmSent",
  "collabPosted",
  "notes",
  "quickNote",
  "lastContent",
  "lastUploadDate",
  "followUp",
  "deadline",
  "response",
]);
const validRoles = new Set(["viewer", "manager", "administrator", "owner"]);
const roleLabels = {
  anonymous: "Anonymous",
  viewer: "Viewer",
  manager: "Manager",
  administrator: "Administrator",
  owner: "Owner",
};

function getRole(user) {
  return user?.role || "anonymous";
}

function hasRole(user, minimumRole) {
  return roleRank[getRole(user)] >= roleRank[minimumRole];
}

function canEditCreator(user) {
  return hasRole(user, "manager");
}

function canAdmin(user) {
  return hasRole(user, "administrator");
}

function canOwn(user) {
  return hasRole(user, "owner");
}

function getClientPermissions(user) {
  return {
    canEdit: canEditCreator(user),
    canImportExport: canAdmin(user),
    canManageUsers: canAdmin(user),
    canRestoreBackups: canAdmin(user),
    canDeleteCreators: canAdmin(user),
    role: getRole(user),
    roleLabel: roleLabels[getRole(user)] || roleLabels.anonymous,
  };
}

module.exports = {
  editableFields,
  roleLabels,
  validRoles,
  canAdmin,
  canEditCreator,
  canOwn,
  getClientPermissions,
  getRole,
  hasRole,
  roleRank,
};
