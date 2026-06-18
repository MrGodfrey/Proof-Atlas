export const KINDS = ["math", "issue", "note"] as const;
export type ObjectKind = (typeof KINDS)[number];

export const MATH_ROLES = [
  "problem",
  "setting",
  "notation",
  "definition",
  "model",
  "assumption",
  "claim",
  "proof",
  "proof_fragment",
  "construction",
  "calculation",
  "example",
  "counterexample"
] as const;

export const ISSUE_ROLES = [
  "gap",
  "question",
  "todo",
  "risk",
  "possible_error",
  "review_concern",
  "missing_reference"
] as const;

export const NOTE_ROLES = [
  "literature",
  "ai_note",
  "meeting",
  "review_note",
  "historical",
  "scratch",
  "external_context"
] as const;

export const ROLES_BY_KIND = {
  math: MATH_ROLES,
  issue: ISSUE_ROLES,
  note: NOTE_ROLES
} as const;

export type ObjectRole =
  | (typeof MATH_ROLES)[number]
  | (typeof ISSUE_ROLES)[number]
  | (typeof NOTE_ROLES)[number];

export const DISPLAY_AS = [
  "plain",
  "problem",
  "setting",
  "notation",
  "definition",
  "assumption",
  "equation",
  "theorem",
  "lemma",
  "proposition",
  "corollary",
  "conjecture",
  "proof",
  "proof_fragment",
  "estimate",
  "construction",
  "calculation",
  "example",
  "counterexample",
  "remark",
  "issue",
  "gap",
  "question",
  "todo",
  "warning",
  "note",
  "literature_note",
  "ai_note",
  "review_note",
  "meeting_note"
] as const;
export type DisplayAs = (typeof DISPLAY_AS)[number];

export const IMPORTANCE = ["main", "supporting", "background", "local"] as const;
export type Importance = (typeof IMPORTANCE)[number];

export const STATUS = [
  "draft",
  "partial",
  "needs_check",
  "checked",
  "open",
  "resolved",
  "disproved",
  "obsolete",
  "archived"
] as const;
export type ObjectStatus = (typeof STATUS)[number];

export const PRIORITY = ["blocker", "high", "normal", "low"] as const;
export type IssuePriority = (typeof PRIORITY)[number];

export const PROVENANCE = ["internal", "external", "imported"] as const;
export type Provenance = (typeof PROVENANCE)[number];

export const EDGE_TYPES = [
  "requires",
  "uses",
  "proves",
  "blocks",
  "refines",
  "replaces",
  "cites",
  "related_to"
] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

export const REVERSE_EDGE_TYPES = [
  "required_by",
  "used_by",
  "proved_by",
  "blocked_by",
  "refined_by",
  "replaced_by",
  "cited_by",
  "related_to"
] as const;
export type ReverseEdgeType = (typeof REVERSE_EDGE_TYPES)[number];

export const EDGE_STRENGTHS = ["hard", "soft"] as const;
export type EdgeStrength = (typeof EDGE_STRENGTHS)[number];

export interface EdgeRef {
  target: string;
  strength: EdgeStrength;
  reason?: string;
}

export type EdgeMap = Partial<Record<EdgeType, EdgeRef[]>>;
export type ReverseEdgeMap = Partial<Record<ReverseEdgeType, string[]>>;

export type ProblemSeverity = "error" | "warning";

export interface AtlasProblem {
  id: string;
  severity: ProblemSeverity;
  code: string;
  message: string;
  path?: string;
  objectUid?: string;
  objectName?: string;
  viewPath?: string;
  target?: string;
  strict: boolean;
}

export interface AtlasWorkspaceConfig {
  root?: string;
  tex_main?: string;
  bib?: string[];
}

export interface AtlasConfig {
  schema_version: "0.1";
  project: string;
  title: string;
  default_view: string;
  math_renderer: "katex" | "mathjax";
  workspace?: AtlasWorkspaceConfig;
}

export interface ResolvedAtlasProject {
  atlasRoot: string;
  workspaceRoot: string | null;
  configPath: string;
  localConfigPath: string | null;
  realAtlasRoot: string;
}

export interface NormalizedWorkspace {
  root: string | null;
  texMain: string | null;
  bib: string[];
}

export interface RawObjectRecord {
  uid?: unknown;
  name?: unknown;
  kind?: unknown;
  role?: unknown;
  title?: unknown;
  body?: unknown;
  display_as?: unknown;
  importance?: unknown;
  status?: unknown;
  summary?: unknown;
  priority?: unknown;
  provenance?: unknown;
  tags?: unknown;
  edges?: unknown;
}

export interface NormalizedObject {
  uid: string;
  name: string;
  kind: ObjectKind;
  role: ObjectRole;
  title: string;
  body: string[];
  display_as: DisplayAs;
  importance: Importance;
  status: ObjectStatus;
  summary?: string;
  priority?: IssuePriority;
  provenance: Provenance;
  tags: string[];
  edges: EdgeMap;
  reverseEdges: ReverseEdgeMap;
  path: string;
  dir: string;
  objectPath: string;
}

export interface BodyBlock {
  id: string;
  file: string;
  kind: "heading" | "paragraph" | "display_math" | "list_item" | "code_block";
  markdown: string;
  html: string;
  excerpt: string;
}

export interface BodyFile {
  file: string;
  blocks: BodyBlock[];
}

export interface ViewHeadingItem {
  type: "heading";
  level: number;
  text: string;
}

export interface ViewMarkdownItem {
  type: "markdown";
  html: string;
}

export interface ViewEmbedItem {
  type: "embed";
  target: string;
  uid?: string;
  name?: string;
  expanded: boolean;
  invalid?: string;
}

export type ViewItem = ViewHeadingItem | ViewMarkdownItem | ViewEmbedItem;

export interface AtlasView {
  type: "markdown";
  path: string;
  name: string;
  title: string;
  items: ViewItem[];
  raw: string;
}

export type RouteProfile = "meaning" | "proof" | "audit" | "history";
export type RepresentationMode = "full" | "statement" | "summary" | "reference" | "omit";

export interface RouteRenderOptions {
  order?: "prerequisites_first";
  show_graph?: boolean;
  show_status?: boolean;
  order_hints?: string[];
}

export interface RouteView {
  schema_version: "0.1";
  uid: string;
  type: "route";
  title: string;
  target: string;
  profile: RouteProfile;
  proof_choices: Record<string, string>;
  boundaries: string[];
  representation: Record<string, RepresentationMode>;
  render: RouteRenderOptions;
}

export interface AtlasRouteView {
  path: string;
  name: string;
  title: string;
  raw: string;
  route: RouteView;
}

export interface NormalizedGraph {
  root: string;
  atlasRoot: string;
  workspaceRoot: string | null;
  configPath: string;
  localConfigPath: string | null;
  workspace: NormalizedWorkspace;
  config: AtlasConfig;
  objects: NormalizedObject[];
  objectsByUid: Record<string, NormalizedObject>;
  objectsByName: Record<string, NormalizedObject>;
  aliases: Record<string, string>;
  views: AtlasView[];
  routeViews: AtlasRouteView[];
  problems: AtlasProblem[];
  builtAt: string;
}

export interface RegistryProjectEntry {
  id: string;
  title: string;
  atlas_root: string;
  workspace_root: string | null;
  last_opened: string;
}

export interface RegistryProjectListItem extends RegistryProjectEntry {
  missing: boolean;
}
