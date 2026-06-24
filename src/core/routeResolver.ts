import type {
  EdgeRef,
  EdgeType,
  NormalizedGraph,
  NormalizedObject,
  RepresentationMode,
  RouteProfile,
  RouteView
} from "./types";
import { edgeTargets, hardEdgeRefs, softEdgeRefs } from "./edgeUtils";
import { isProofObligationObject } from "./proofObjects";

export type RouteNodeRole = "obligation" | "support" | "source";
export type RouteDecision = "expanded" | "boundary" | "unresolved";
export type RouteInclusionClass = "spine" | "vocabulary" | "boundary" | "open";
export type RouteDiagnosticSeverity = "error" | "warning" | "info";

export interface RouteDiagnostic {
  severity: RouteDiagnosticSeverity;
  code: string;
  message: string;
  objectName?: string;
  target?: string;
}

export interface TokenEstimateVector {
  full: number;
  statement: number;
  summary: number;
  reference: number;
}

export interface RouteNodeCost {
  current: number;
  downgrade_to_statement?: number;
  downgrade_to_summary?: number;
  downgrade_to_reference?: number;
  upgrade_to_full?: number;
}

export type RouteBoundaryKind = "accepted_input" | "context_cut";
export type RouteProofChoiceMode = "explicit" | "default" | "mixed" | "missing";

export interface RouteVerificationCounts {
  checked: number;
  needs_check: number;
  partial: number;
  draft: number;
}

export interface RouteProofChoiceStatus {
  mode: RouteProofChoiceMode;
  explicit: number;
  default: number;
  missing: number;
  total: number;
}

export interface RouteStatus {
  structure: "closed" | "open";
  context: "sufficient" | "insufficient";
  proofChoice: RouteProofChoiceStatus;
  verification: RouteVerificationCounts;
  acceptedInputs: string[];
  contextCuts: string[];
  openBlockers: string[];
  exportReadiness: "ready" | "incomplete";
}

export interface ResolvedRouteNode {
  object: NormalizedObject;
  role: RouteNodeRole;
  decision: RouteDecision;
  inclusionClass: RouteInclusionClass;
  representation: RepresentationMode;
  suggestedRepresentation: RepresentationMode;
  depth: number;
  hardness: "hard" | "soft";
  direct: boolean;
  witnessPaths: string[][];
  tokenEstimates: TokenEstimateVector;
  marginalCost: RouteNodeCost;
}

export interface ResolvedRouteEdge {
  source: string;
  target: string;
  type: EdgeType;
  strength: "hard" | "soft";
  reason?: string;
}

export interface ResolvedRoute {
  target: NormalizedObject;
  profile: RouteProfile;
  nodes: ResolvedRouteNode[];
  edges: ResolvedRouteEdge[];
  proofAlternatives: Record<string, string[]>;
  selectedProofs: Record<string, string>;
  boundaries: string[];
  orderHints: string[];
  diagnostics: RouteDiagnostic[];
  totalTokens: number;
  closed: boolean;
  contentSufficient: boolean;
  status: RouteStatus;
}

export interface ResolveRouteOptions {
  target: string;
  profile?: RouteProfile;
  proofChoices?: Record<string, string>;
  boundaries?: string[];
  representation?: Record<string, RepresentationMode>;
}

function isRouteView(value: ResolveRouteOptions | RouteView): value is RouteView {
  return (value as RouteView).type === "route";
}

interface MutableNode {
  object: NormalizedObject;
  role: RouteNodeRole;
  decision: RouteDecision;
  representation?: RepresentationMode;
  suggestedRepresentation?: RepresentationMode;
  depth: number;
  hardness: "hard" | "soft";
  direct: boolean;
  witnessPaths: string[][];
  selectedProof?: boolean;
}

const BAD_PROOF_STATUSES = new Set(["disproved", "obsolete", "archived"]);
const MAX_WITNESS_PATHS = 8;
const REPRESENTATION_RANK: Record<RepresentationMode, number> = {
  omit: 0,
  reference: 1,
  summary: 2,
  statement: 3,
  full: 4
};

const SUPPORT_ROLES = new Set([
  "problem",
  "setting",
  "notation",
  "definition",
  "assumption"
]);

function isAcceptedInputObject(object: NormalizedObject): boolean {
  return object.kind === "math"
    && object.role === "claim"
    && (object.provenance !== "internal" || object.origin.kind !== "project");
}

export function routeBoundaryKind(node: Pick<ResolvedRouteNode, "object" | "decision">): RouteBoundaryKind | undefined {
  if (node.decision !== "boundary") return undefined;
  return isAcceptedInputObject(node.object) ? "accepted_input" : "context_cut";
}

function emptyRouteStatus(): RouteStatus {
  return {
    structure: "open",
    context: "insufficient",
    proofChoice: {
      mode: "missing",
      explicit: 0,
      default: 0,
      missing: 0,
      total: 0
    },
    verification: {
      checked: 0,
      needs_check: 0,
      partial: 0,
      draft: 0
    },
    acceptedInputs: [],
    contextCuts: [],
    openBlockers: [],
    exportReadiness: "incomplete"
  };
}

function resolveObject(graph: NormalizedGraph, nameOrUid: string): NormalizedObject | undefined {
  return graph.objectsByName[nameOrUid] ?? graph.objectsByUid[nameOrUid] ?? graph.objectsByUid[graph.aliases[nameOrUid]];
}

function nodeRole(object: NormalizedObject): RouteNodeRole {
  if (isProofObligationObject(object)) return "obligation";
  if (object.kind === "note" || object.provenance !== "internal") return "source";
  return "support";
}

function proofCandidates(graph: NormalizedGraph, claim: NormalizedObject): NormalizedObject[] {
  return (claim.reverseEdges.proved_by ?? [])
    .map((name) => graph.objectsByName[name])
    .filter((object): object is NormalizedObject => Boolean(object) && object.kind === "math" && object.role === "proof");
}

function proofSortKey(object: NormalizedObject): string {
  const statusRank: Record<string, number> = {
    checked: 0,
    needs_check: 1,
    partial: 2,
    draft: 3
  };
  const importanceRank: Record<string, number> = {
    main: 0,
    supporting: 1,
    background: 2,
    local: 3
  };
  return [
    statusRank[object.status] ?? 9,
    importanceRank[object.importance] ?? 9,
    object.name
  ].join("|");
}

function chooseProof(
  graph: NormalizedGraph,
  claim: NormalizedObject,
  explicitChoice: string | undefined,
  diagnostics: RouteDiagnostic[],
  alternativesOut: Record<string, string[]>
): NormalizedObject | undefined {
  const allCandidates = proofCandidates(graph, claim).sort((a, b) => proofSortKey(a).localeCompare(proofSortKey(b)));
  alternativesOut[claim.name] = allCandidates.map((object) => object.name);
  if (explicitChoice) {
    const proof = resolveObject(graph, explicitChoice);
    if (!proof) {
      diagnostics.push({
        severity: "error",
        code: "missing_explicit_proof_choice",
        message: `Explicit proof choice ${explicitChoice} for ${claim.name} does not exist.`,
        objectName: claim.name,
        target: explicitChoice
      });
      return undefined;
    }
    if (!edgeTargets(proof.edges.proves).includes(claim.name)) {
      diagnostics.push({
        severity: "error",
        code: "invalid_explicit_proof_choice",
        message: `${proof.name} does not prove ${claim.name}.`,
        objectName: claim.name,
        target: proof.name
      });
      return undefined;
    }
    if (BAD_PROOF_STATUSES.has(proof.status)) {
      diagnostics.push({
        severity: "warning",
        code: "bad_status_explicit_proof",
        message: `${proof.name} has status ${proof.status} but was explicitly selected.`,
        objectName: claim.name,
        target: proof.name
      });
    }
    return proof;
  }

  const activeCandidates = allCandidates.filter((object) => !BAD_PROOF_STATUSES.has(object.status));
  if (activeCandidates.length > 1) {
    diagnostics.push({
      severity: "warning",
      code: "needs_confirmation",
      message: `${claim.name} has multiple candidate proofs; selected ${activeCandidates[0].name} deterministically.`,
      objectName: claim.name,
      target: activeCandidates[0].name
    });
  }
  return activeCandidates[0];
}

function tokenEstimate(object: NormalizedObject): TokenEstimateVector {
  const metadataText = [object.uid, object.name, object.title, object.status, object.provenance].join(" ");
  const summaryText = object.summary ?? "";
  const reference = Math.max(12, Math.ceil(metadataText.length / 4));
  const summary = Math.max(reference, Math.ceil((metadataText.length + summaryText.length) / 4));
  const statement = Math.max(summary + 20, object.body.includes("statement.md") ? 120 : 90);
  const full = Math.max(statement, summary + object.body.length * 220);
  return { full, statement, summary, reference };
}

function representationFloor(profile: RouteProfile, hardness: "hard" | "soft"): RepresentationMode {
  if (profile === "proof" && hardness === "hard") return "statement";
  return "reference";
}

function hasStatementRepresentation(object: NormalizedObject): boolean {
  if (object.body.includes("statement.md")) return true;
  if (object.kind === "math" && SUPPORT_ROLES.has(object.role)) return object.body.length > 0;
  return false;
}

function suggestedRepresentation(
  object: NormalizedObject,
  profile: RouteProfile,
  hardness: "hard" | "soft",
  selectedProof: boolean,
  targetName: string
): RepresentationMode {
  if (object.name === targetName) return "full";
  if (selectedProof) return "full";
  if (hardness === "soft") return object.summary ? "summary" : "reference";
  if (object.kind === "math" && object.role === "claim") return "statement";
  if (object.kind === "math" && object.role === "proof") return "full";
  if (object.provenance !== "internal") return "statement";
  return hasStatementRepresentation(object) ? "statement" : "full";
}

function marginalCost(estimates: TokenEstimateVector, mode: RepresentationMode): RouteNodeCost {
  const current = mode === "omit" ? 0 : estimates[mode];
  const cost: RouteNodeCost = { current };
  if (mode !== "statement") cost.downgrade_to_statement = current - estimates.statement;
  if (mode !== "summary") cost.downgrade_to_summary = current - estimates.summary;
  if (mode !== "reference") cost.downgrade_to_reference = current - estimates.reference;
  if (mode !== "full") cost.upgrade_to_full = estimates.full - current;
  return cost;
}

function buildResolvedEdges(nodes: Map<string, MutableNode>): ResolvedRouteEdge[] {
  const out: ResolvedRouteEdge[] = [];
  for (const node of nodes.values()) {
    for (const [type, refs] of Object.entries(node.object.edges) as Array<[EdgeType, EdgeRef[]]>) {
      for (const ref of refs) {
        if (!nodes.has(ref.target)) continue;
        out.push({
          source: node.object.name,
          target: ref.target,
          type,
          strength: ref.strength,
          ...(ref.reason ? { reason: ref.reason } : {})
        });
      }
    }
  }
  return out.sort((a, b) => `${a.source}|${a.type}|${a.target}`.localeCompare(`${b.source}|${b.type}|${b.target}`));
}

function isSpineCandidate(object: NormalizedObject): boolean {
  if (object.kind !== "math") return false;
  if (object.role === "proof") return true;
  return isProofObligationObject(object);
}

function computeSpineNames(
  graph: NormalizedGraph,
  target: NormalizedObject,
  nodes: Map<string, MutableNode>,
  selectedProofs: Record<string, string>
): Set<string> {
  const spine = new Set<string>();

  const visit = (name: string) => {
    if (spine.has(name)) return;
    const node = nodes.get(name);
    if (!node) return;
    spine.add(name);

    const selectedProofName = selectedProofs[name];
    if (selectedProofName && nodes.has(selectedProofName)) visit(selectedProofName);

    for (const ref of [...hardEdgeRefs(node.object.edges.proves), ...hardEdgeRefs(node.object.edges.uses)]) {
      const dependency = resolveObject(graph, ref.target);
      if (!dependency || !nodes.has(dependency.name)) continue;
      if (!isSpineCandidate(dependency)) continue;
      visit(dependency.name);
    }
  };

  visit(target.name);
  return spine;
}

function openObjectNames(diagnostics: RouteDiagnostic[]): Set<string> {
  const openCodes = new Set([
    "unresolved_claim",
    "missing_statement_representation",
    "missing_target",
    "missing_edge_target",
    "hard_dependency_omitted"
  ]);
  return new Set(
    diagnostics
      .filter((item) => openCodes.has(item.code))
      .map((item) => item.objectName ?? item.target)
      .filter((name): name is string => Boolean(name))
  );
}

function diagnosticKey(item: RouteDiagnostic): string {
  return [
    item.severity,
    item.code,
    item.objectName ?? "",
    item.target ?? "",
    item.message
  ].join("\u0000");
}

function dedupeDiagnostics(diagnostics: RouteDiagnostic[]): RouteDiagnostic[] {
  const seen = new Set<string>();
  const out: RouteDiagnostic[] = [];
  for (const item of diagnostics) {
    const key = diagnosticKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function verificationCounts(nodes: ResolvedRouteNode[]): RouteVerificationCounts {
  const counts: RouteVerificationCounts = {
    checked: 0,
    needs_check: 0,
    partial: 0,
    draft: 0
  };
  for (const node of nodes) {
    if (node.object.status === "checked") counts.checked += 1;
    if (node.object.status === "needs_check") counts.needs_check += 1;
    if (node.object.status === "partial") counts.partial += 1;
    if (node.object.status === "draft") counts.draft += 1;
  }
  return counts;
}

function openBlockerNames(graph: NormalizedGraph, nodes: ResolvedRouteNode[]): string[] {
  const blockers = new Map<string, NormalizedObject>();
  for (const node of nodes) {
    for (const name of node.object.reverseEdges.blocked_by ?? []) {
      const object = graph.objectsByName[name];
      if (object?.kind === "issue" && object.status === "open") blockers.set(object.name, object);
    }
  }
  return [...blockers.values()].sort((a, b) => a.name.localeCompare(b.name)).map((object) => object.name);
}

function proofChoiceStatus(
  nodes: ResolvedRouteNode[],
  proofChoices: Record<string, string>,
  selectedProofs: Record<string, string>
): RouteProofChoiceStatus {
  let explicit = 0;
  let defaultChoice = 0;
  let missing = 0;

  for (const node of nodes) {
    if (!isProofObligationObject(node.object)) continue;
    if (routeBoundaryKind(node) === "accepted_input") continue;
    const selected = selectedProofs[node.object.name];
    if (!selected) {
      missing += 1;
      continue;
    }
    if (proofChoices[node.object.name] === selected) explicit += 1;
    else defaultChoice += 1;
  }

  const total = explicit + defaultChoice + missing;
  const activeKinds = [explicit > 0, defaultChoice > 0, missing > 0].filter(Boolean).length;
  const mode: RouteProofChoiceMode = missing > 0 && activeKinds === 1
    ? "missing"
    : activeKinds > 1
      ? "mixed"
      : explicit > 0
        ? "explicit"
        : defaultChoice > 0
          ? "default"
          : "missing";

  return {
    mode,
    explicit,
    default: defaultChoice,
    missing,
    total
  };
}

function deriveRouteStatus(
  graph: NormalizedGraph,
  nodes: ResolvedRouteNode[],
  diagnostics: RouteDiagnostic[],
  closed: boolean,
  proofChoices: Record<string, string>,
  selectedProofs: Record<string, string>
): RouteStatus {
  const acceptedInputs = nodes
    .filter((node) => routeBoundaryKind(node) === "accepted_input")
    .map((node) => node.object.name)
    .sort();
  const contextCuts = nodes
    .filter((node) => routeBoundaryKind(node) === "context_cut")
    .map((node) => node.object.name)
    .sort();
  const blockers = openBlockerNames(graph, nodes);
  const hasError = diagnostics.some((item) => item.severity === "error");
  const context: RouteStatus["context"] = hasError || contextCuts.length > 0 ? "insufficient" : "sufficient";
  const structure: RouteStatus["structure"] = closed ? "closed" : "open";
  const exportReadiness: RouteStatus["exportReadiness"] = structure === "closed" && context === "sufficient" && blockers.length === 0
    ? "ready"
    : "incomplete";

  return {
    structure,
    context,
    proofChoice: proofChoiceStatus(nodes, proofChoices, selectedProofs),
    verification: verificationCounts(nodes),
    acceptedInputs,
    contextCuts,
    openBlockers: blockers,
    exportReadiness
  };
}

function plural(value: number, singular: string, pluralValue = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : pluralValue}`;
}

export function routeStatusLine(status: RouteStatus): string {
  const verificationNeeds = [
    status.verification.needs_check
      ? `${plural(status.verification.needs_check, "node")} ${status.verification.needs_check === 1 ? "needs" : "need"} check`
      : undefined,
    status.verification.partial ? `${plural(status.verification.partial, "partial node")}` : undefined,
    status.verification.draft ? `${plural(status.verification.draft, "draft node")}` : undefined
  ].filter((part): part is string => Boolean(part));
  const verification = verificationNeeds.length ? verificationNeeds.join(", ") : "all included nodes checked or externally accepted";
  return [
    `structure ${status.structure}`,
    `context ${status.context}`,
    `${status.proofChoice.mode} proof choices`,
    verification,
    status.acceptedInputs.length ? plural(status.acceptedInputs.length, "accepted input") : "no accepted inputs",
    status.contextCuts.length ? plural(status.contextCuts.length, "context cut") : "no context cuts",
    status.openBlockers.length ? plural(status.openBlockers.length, "open blocker") : "no open blockers"
  ].join("; ");
}

export function resolveRoute(graph: NormalizedGraph, options: ResolveRouteOptions | RouteView): ResolvedRoute {
  const routeInput = isRouteView(options);
  const targetName = options.target;
  const target = resolveObject(graph, targetName);
  const profile = options.profile ?? "proof";
  const proofChoices = routeInput ? options.proof_choices : options.proofChoices ?? {};
  const requestedBoundaries = routeInput ? options.boundaries : options.boundaries ?? [];
  const boundaries = new Set(requestedBoundaries.map((name) => resolveObject(graph, name)?.name ?? name));
  const invalidBoundaryNames = new Set<string>();
  const representationOverrides = routeInput ? options.representation : options.representation ?? {};
  const orderHints = routeInput ? options.render.order_hints ?? [] : [];

  const diagnostics: RouteDiagnostic[] = [];
  const nodes = new Map<string, MutableNode>();
  const proofAlternatives: Record<string, string[]> = {};
  const selectedProofs: Record<string, string> = {};

  if (!target) {
    const placeholder = graph.objects[0];
    diagnostics.push({
      severity: "error",
      code: "missing_target",
      message: `Route target ${targetName} does not exist.`,
      target: targetName
    });
    return {
      target: placeholder,
      profile,
      nodes: [],
      edges: [],
      proofAlternatives,
      selectedProofs,
      boundaries: [...boundaries],
      orderHints,
      diagnostics,
      totalTokens: 0,
      closed: false,
      contentSufficient: false,
      status: emptyRouteStatus()
    };
  }

  for (const name of boundaries) {
    if (name !== target.name) continue;
    invalidBoundaryNames.add(name);
    diagnostics.push({
      severity: "error",
      code: "boundary_is_target",
      message: `Route boundary ${name} cannot be the route target.`,
      objectName: target.name,
      target: name
    });
  }

  const include = (
    object: NormalizedObject,
    path: string[],
    depth: number,
    hardness: "hard" | "soft",
    direct = false,
    selectedProof = false
  ): MutableNode => {
    const existing = nodes.get(object.name);
    if (existing) {
      existing.depth = Math.min(existing.depth, depth);
      if (hardness === "hard") existing.hardness = "hard";
      existing.direct ||= direct;
      existing.selectedProof ||= selectedProof;
      if (invalidBoundaryNames.has(object.name) && existing.decision === "boundary") {
        existing.decision = "expanded";
      }
      const witness = path.includes(object.name) ? path : [...path, object.name];
      if (existing.witnessPaths.length < MAX_WITNESS_PATHS && !existing.witnessPaths.some((item) => item.join(" -> ") === witness.join(" -> "))) {
        existing.witnessPaths.push(witness);
      }
      return existing;
    }
    const node: MutableNode = {
      object,
      role: nodeRole(object),
      decision: boundaries.has(object.name) && !invalidBoundaryNames.has(object.name) ? "boundary" : "expanded",
      depth,
      hardness,
      direct,
      witnessPaths: [path.includes(object.name) ? path : [...path, object.name]],
      selectedProof
    };
    nodes.set(object.name, node);
    return node;
  };

  const includeRef = (
    source: NormalizedObject,
    ref: EdgeRef,
    path: string[],
    depth: number,
    direct = false
  ): NormalizedObject | undefined => {
    const object = resolveObject(graph, ref.target);
    if (!object) {
      diagnostics.push({
        severity: "error",
        code: "missing_edge_target",
        message: `${source.name} has ${ref.strength} edge to missing object ${ref.target}.`,
        objectName: source.name,
        target: ref.target
      });
      return undefined;
    }
    include(object, [...path, object.name], depth, ref.strength, direct);
    return object;
  };

  const expandRequires = (object: NormalizedObject, path: string[], depth: number, stack: Set<string>) => {
    const node = nodes.get(object.name);
    if (node?.decision === "boundary") return;
    if (stack.has(object.name)) {
      diagnostics.push({
        severity: "error",
        code: "route_cycle",
        message: `Route resolver stopped at cycle ${[...stack, object.name].join(" -> ")}.`,
        objectName: object.name
      });
      return;
    }
    const nextStack = new Set(stack);
    nextStack.add(object.name);
    for (const ref of hardEdgeRefs(object.edges.requires)) {
      const dependency = includeRef(object, ref, path, depth + 1);
      if (dependency) expandRequires(dependency, [...path, dependency.name], depth + 1, nextStack);
    }
  };

  const expandNonClaim = (object: NormalizedObject, path: string[], depth: number, stack: Set<string>) => {
    const node = nodes.get(object.name);
    if (node?.decision === "boundary") return;
    expandRequires(object, path, depth, stack);
    if (stack.has(`uses:${object.name}`)) {
      diagnostics.push({
        severity: "error",
        code: "route_cycle",
        message: `Route resolver stopped at uses cycle ${[...stack, object.name].join(" -> ")}.`,
        objectName: object.name
      });
      return;
    }
    const nextStack = new Set(stack);
    nextStack.add(`uses:${object.name}`);
    for (const ref of hardEdgeRefs(object.edges.uses)) {
      const dependency = includeRef(object, ref, path, depth + 1, true);
      if (!dependency) continue;
      if (isProofObligationObject(dependency)) {
        expandClaim(dependency, [...path, dependency.name], depth + 1, nextStack);
      } else {
        expandNonClaim(dependency, [...path, dependency.name], depth + 1, nextStack);
      }
    }
  };

  const expandProof = (proof: NormalizedObject, path: string[], depth: number, stack: Set<string>) => {
    include(proof, path, depth, "hard", true, true);
    expandRequires(proof, path, depth, stack);
    if (nodes.get(proof.name)?.decision === "boundary") return;
    for (const ref of hardEdgeRefs(proof.edges.uses)) {
      const dependency = includeRef(proof, ref, path, depth + 1, true);
      if (!dependency) continue;
      if (isProofObligationObject(dependency)) {
        expandClaim(dependency, [...path, dependency.name], depth + 1, stack);
      } else {
        expandNonClaim(dependency, [...path, dependency.name], depth + 1, stack);
      }
    }
  };

  function expandClaim(claim: NormalizedObject, path: string[], depth: number, stack: Set<string>) {
    include(claim, path, depth, "hard");
    expandRequires(claim, path, depth, stack);
    const node = nodes.get(claim.name);
    if (node?.decision === "boundary") return;
    if (stack.has(`claim:${claim.name}`)) {
      diagnostics.push({
        severity: "error",
        code: "route_cycle",
        message: `Route resolver stopped at claim cycle ${[...stack, claim.name].join(" -> ")}.`,
        objectName: claim.name
      });
      return;
    }
    const proof = chooseProof(graph, claim, proofChoices[claim.name], diagnostics, proofAlternatives);
    if (!proof) {
      if (isAcceptedInputObject(claim)) {
        node!.decision = "boundary";
      } else {
        node!.decision = "unresolved";
        diagnostics.push({
          severity: "error",
          code: "unresolved_claim",
          message: `${claim.name} has no available proof choice.`,
          objectName: claim.name
        });
      }
      return;
    }
    selectedProofs[claim.name] = proof.name;
    if (boundaries.has(proof.name)) {
      invalidBoundaryNames.add(proof.name);
      const proofNode = nodes.get(proof.name);
      if (proofNode?.decision === "boundary") proofNode.decision = "expanded";
      diagnostics.push({
        severity: "error",
        code: "boundary_is_selected_proof",
        message: `Route boundary ${proof.name} cannot be the selected proof for ${claim.name}.`,
        objectName: claim.name,
        target: proof.name
      });
    }
    const nextStack = new Set(stack);
    nextStack.add(`claim:${claim.name}`);
    include(proof, [...path, proof.name], depth + 1, "hard", true, true);
    expandProof(proof, [...path, proof.name], depth + 1, nextStack);
  }

  include(target, [target.name], 0, "hard", true);

  if (isProofObligationObject(target)) {
    expandClaim(target, [target.name], 0, new Set());
  } else {
    diagnostics.push({
      severity: "error",
      code: "unsupported_proof_tree_target",
      message: "Proof tree target must be a math claim.",
      objectName: target.name
    });
  }

  for (const node of [...nodes.values()]) {
    for (const ref of [...softEdgeRefs(node.object.edges.requires), ...softEdgeRefs(node.object.edges.uses)]) {
      includeRef(node.object, ref, [target.name, node.object.name], node.depth + 1);
    }
  }

  for (const name of boundaries) {
    if (invalidBoundaryNames.has(name)) continue;
    const node = nodes.get(name);
    if (!node || node.decision !== "boundary") {
      diagnostics.push({
        severity: "warning",
        code: "unused_boundary",
        message: `Route boundary ${name} was not encountered from ${target.name}.`,
        target: name
      });
    }
  }

  const spineNames = computeSpineNames(graph, target, nodes, selectedProofs);
  const resolvedNodesWithoutClass = [...nodes.values()].map((node) => {
    const suggested = suggestedRepresentation(node.object, profile, node.hardness, Boolean(node.selectedProof), target.name);
    const representation = representationOverrides[node.object.name] ?? suggested;
    const floor = representationFloor(profile, node.hardness);
    if (node.hardness === "hard" && representation === "omit") {
      diagnostics.push({
        severity: "error",
        code: "hard_dependency_omitted",
        message: `${node.object.name} is a hard dependency and cannot be omitted.`,
        objectName: node.object.name
      });
    }
    if (REPRESENTATION_RANK[representation] < REPRESENTATION_RANK[floor]) {
      diagnostics.push({
        severity: "error",
        code: "representation_below_floor",
        message: `${node.object.name} is ${node.hardness} in ${profile} profile and needs at least ${floor}, got ${representation}.`,
        objectName: node.object.name
      });
    }
    if (profile === "proof" && node.hardness === "hard" && representation === "statement" && !hasStatementRepresentation(node.object)) {
      diagnostics.push({
        severity: "error",
        code: "missing_statement_representation",
        message: `${node.object.name} needs a statement representation but no v1 statement source is available.`,
        objectName: node.object.name
      });
    }
    const estimates = tokenEstimate(node.object);
    return {
      object: node.object,
      role: node.role,
      decision: node.decision,
      inclusionClass: "vocabulary" as RouteInclusionClass,
      representation,
      suggestedRepresentation: suggested,
      depth: node.depth,
      hardness: node.hardness,
      direct: node.direct,
      witnessPaths: node.witnessPaths,
      tokenEstimates: estimates,
      marginalCost: marginalCost(estimates, representation)
    };
  });

  for (const node of resolvedNodesWithoutClass) {
    if (routeBoundaryKind(node) !== "context_cut") continue;
    diagnostics.push({
      severity: "warning",
      code: "boundary_kind_warning",
      message: `${node.object.name} is a context cut, not an external accepted input.`,
      objectName: node.object.name
    });
  }

  const uniqueDiagnostics = dedupeDiagnostics(diagnostics);
  const openNames = openObjectNames(uniqueDiagnostics);
  const resolvedNodes: ResolvedRouteNode[] = resolvedNodesWithoutClass.map((node) => {
    let inclusionClass: RouteInclusionClass = spineNames.has(node.object.name) ? "spine" : "vocabulary";
    if (node.decision === "boundary") inclusionClass = "boundary";
    if (node.decision === "unresolved" || openNames.has(node.object.name)) inclusionClass = "open";
    return { ...node, inclusionClass };
  }).sort((a, b) => a.depth - b.depth || a.object.name.localeCompare(b.object.name));

  const totalTokens = resolvedNodes.reduce((sum, node) => sum + node.marginalCost.current, 0);
  const closed = !uniqueDiagnostics.some((item) => ["error"].includes(item.severity) && item.code !== "representation_below_floor" && item.code !== "missing_statement_representation");
  const contentSufficient = !uniqueDiagnostics.some((item) => item.severity === "error");
  const encounteredBoundaries = [...boundaries].filter((name) => (
    !invalidBoundaryNames.has(name)
    && resolvedNodes.some((node) => node.object.name === name && node.decision === "boundary")
  ));
  const status = deriveRouteStatus(graph, resolvedNodes, uniqueDiagnostics, closed, proofChoices, selectedProofs);

  return {
    target,
    profile,
    nodes: resolvedNodes,
    edges: buildResolvedEdges(nodes),
    proofAlternatives,
    selectedProofs,
    boundaries: encounteredBoundaries,
    orderHints,
    diagnostics: uniqueDiagnostics,
    totalTokens,
    closed,
    contentSufficient,
    status
  };
}
