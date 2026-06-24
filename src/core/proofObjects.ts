import type { NormalizedObject } from "./types";

export function isProofObligationObject(object: NormalizedObject | undefined): boolean {
  if (!object) return false;
  return object.kind === "math" && object.role === "claim";
}

export const isProofTreeRoot = isProofObligationObject;
