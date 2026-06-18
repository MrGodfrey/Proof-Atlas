import type {
  DisplayAs,
  EdgeType,
  Importance,
  ObjectKind,
  ObjectRole,
  ObjectStatus,
  Provenance,
  ReverseEdgeType
} from "./types";

export const UID_PATTERN = /^obj_[0-9]{8}_[a-z0-9]{4,8}$/;
export const NAME_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export const DEFAULT_IMPORTANCE: Importance = "supporting";
export const DEFAULT_PROVENANCE: Provenance = "internal";

export const DEFAULT_DISPLAY_AS: Record<ObjectKind, Partial<Record<ObjectRole, DisplayAs>>> = {
  math: {
    problem: "problem",
    setting: "setting",
    notation: "notation",
    definition: "definition",
    model: "plain",
    assumption: "assumption",
    claim: "theorem",
    proof: "proof",
    proof_fragment: "proof_fragment",
    construction: "construction",
    calculation: "calculation",
    example: "example",
    counterexample: "counterexample"
  },
  issue: {
    gap: "gap",
    question: "question",
    todo: "todo",
    risk: "warning",
    possible_error: "warning",
    review_concern: "warning",
    missing_reference: "warning"
  },
  note: {
    literature: "literature_note",
    ai_note: "ai_note",
    meeting: "meeting_note",
    review_note: "review_note",
    historical: "note",
    scratch: "note",
    external_context: "note"
  }
};

export const REVERSE_EDGE: Record<EdgeType, ReverseEdgeType> = {
  requires: "required_by",
  uses: "used_by",
  proves: "proved_by",
  blocks: "blocked_by",
  refines: "refined_by",
  replaces: "replaced_by",
  cites: "cited_by",
  related_to: "related_to"
};

export const ACTIVE_STATUS = new Set<ObjectStatus>([
  "draft",
  "partial",
  "needs_check",
  "checked",
  "open"
]);

export function defaultStatus(kind: ObjectKind): ObjectStatus {
  return kind === "issue" ? "open" : "draft";
}

export function defaultDisplayAs(kind: ObjectKind, role: ObjectRole): DisplayAs {
  return DEFAULT_DISPLAY_AS[kind][role] ?? "plain";
}

export function defaultBodyFile(kind: ObjectKind, role: ObjectRole): string {
  if (kind === "math" && role === "claim") return "statement.md";
  if (kind === "math" && (role === "proof" || role === "proof_fragment")) return "proof.md";
  if (kind === "issue") return "note.md";
  if (kind === "note") return "note.md";
  return "body.md";
}

export const STATUS_COLORS: Record<ObjectStatus, string> = {
  checked: "#2E7D32",
  needs_check: "#B8860B",
  partial: "#8A8A8A",
  draft: "#8A8A8A",
  open: "#C62828",
  resolved: "#5B8A72",
  disproved: "#B71C1C",
  obsolete: "#B0ADA4",
  archived: "#B0ADA4"
};
