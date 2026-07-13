const contract = globalThis.NSAP_REVIEW_CONTRACT;

if (!contract?.DECISION || !Array.isArray(contract.VALUES)) {
  throw new Error("NSAP review contract was not loaded.");
}

export const NSAP_REVIEW_DECISION = contract.DECISION;
export const NSAP_REVIEW_DECISION_VALUES = contract.VALUES;

export function isNsapReviewDecision(value) {
  return NSAP_REVIEW_DECISION_VALUES.includes(value);
}
