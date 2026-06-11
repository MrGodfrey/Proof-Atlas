import type { AtlasProblem, ProblemSeverity } from "./types";

let problemCounter = 0;

export function resetProblemCounter(): void {
  problemCounter = 0;
}

export function problem(input: Omit<AtlasProblem, "id"> & { severity?: ProblemSeverity }): AtlasProblem {
  problemCounter += 1;
  return {
    id: `p${String(problemCounter).padStart(4, "0")}`,
    severity: input.severity ?? "error",
    code: input.code,
    message: input.message,
    path: input.path,
    objectUid: input.objectUid,
    objectName: input.objectName,
    viewPath: input.viewPath,
    target: input.target,
    strict: input.strict
  };
}

export function hasCheckErrors(problems: AtlasProblem[], strict: boolean): boolean {
  if (strict) return problems.some((item) => item.severity === "error" || item.strict);
  return problems.some((item) => item.severity === "error");
}

