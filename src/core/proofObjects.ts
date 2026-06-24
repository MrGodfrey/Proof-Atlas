import type { NormalizedObject } from "./types";

const NON_OBLIGATION_CLAIM_DISPLAYS = new Set(["equation", "estimate"]);

export function isProofObligationObject(object: NormalizedObject | undefined): boolean {
  if (!object) return false;
  return object.kind === "math"
    && object.role === "claim"
    && !NON_OBLIGATION_CLAIM_DISPLAYS.has(object.display_as);
}

export const isProofTreeRoot = isProofObligationObject;
