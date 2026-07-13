(function initializeNsapReviewContract(root) {
  const clearDecision = "clear_manual_decision";
  const decision = Object.freeze({
    CONFIRM: "manual_confirmed",
    REJECT: "manual_rejected",
    CLEAR: clearDecision,
    UNDO: clearDecision,
  });
  const contract = Object.freeze({
    DECISION: decision,
    VALUES: Object.freeze([...new Set(Object.values(decision))]),
  });

  if (typeof module === "object" && module.exports) {
    module.exports = contract;
  }
  root.NSAP_REVIEW_CONTRACT = contract;
}(typeof globalThis === "undefined" ? this : globalThis));
