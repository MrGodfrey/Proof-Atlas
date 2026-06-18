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
  "model",
  "assumption",
  "construction",
  "calculation",
  "example",
  "counterexample"
]);

function isObligationObject(object: NormalizedObject): boolean {
  return object.kind === "math"
    && object.role === "claim"
    && !["equation", "estimate"].includes(object.display_as);
}

function resolveObject(graph: NormalizedGraph, nameOrUid: string): NormalizedObject | undefined {
  return graph.objectsByName[nameOrUid] ?? graph.objectsByUid[nameOrUid] ?? graph.objectsByUid[graph.aliases[nameOrUid]];
}

function nodeRole(object: NormalizedObject): RouteNodeRole {
  if (isObligationObject(object)) return "obligation";
  if (object.kind === "note" || object.provenance !== "internal") return "source";
  return "support";
}

function proofCandidates(graph: NormalizedGraph, claim: NormalizedObject): NormalizedObject[] {
  return (claim.reverseEdges.proved_by ?? [])
    .map((name) => graph.objectsByName[name])
    .filter((object): object is NormalizedObject => Boolean(object) && object.kind === "math" && ["proof", "proof_fragment"].includes(object.role));
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
  if ((profile === "proof" || profile === "meaning") && hardness === "hard") return "statement";
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
  if (profile === "audit" || profile === "history") return "reference";
  if (object.kind === "math" && object.role === "claim") return "statement";
  if (object.kind === "math" && ["proof", "proof_fragment"].includes(object.role)) return "full";
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
  if (["proof", "proof_fragment", "construction", "calculation"].includes(object.role)) return true;
  return isObligationObject(object);
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

export function resolveRoute(graph: NormalizedGraph, options: ResolveRouteOptions | RouteView): ResolvedRoute {
  const routeInput = isRouteView(options);
  const targetName = options.target;
  const target = resolveObject(graph, targetName);
  const profile = options.profile ?? "proof";
  const proofChoices = routeInput ? options.proof_choices : options.proofChoices ?? {};
  const boundaries = new Set(routeInput ? options.boundaries : options.boundaries ?? []);
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
      contentSufficient: false
    };
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
      const witness = path.includes(object.name) ? path : [...path, object.name];
      if (existing.witnessPaths.length < MAX_WITNESS_PATHS && !existing.witnessPaths.some((item) => item.join(" -> ") === witness.join(" -> "))) {
        existing.witnessPaths.push(witness);
      }
      return existing;
    }
    const node: MutableNode = {
      object,
      role: nodeRole(object),
      decision: boundaries.has(object.name) ? "boundary" : "expanded",
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
      if (isObligationObject(dependency)) {
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
      if (isObligationObject(dependency)) {
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
      if (claim.provenance !== "internal") {
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
    const nextStack = new Set(stack);
    nextStack.add(`claim:${claim.name}`);
    include(proof, [...path, proof.name], depth + 1, "hard", true, true);
    expandProof(proof, [...path, proof.name], depth + 1, nextStack);
  }

  include(target, [target.name], 0, "hard", true);

  if (profile === "proof" || profile === "audit") {
    if (isObligationObject(target)) {
      expandClaim(target, [target.name], 0, new Set());
    } else if (target.kind === "math" && ["proof", "proof_fragment"].includes(target.role)) {
      for (const ref of hardEdgeRefs(target.edges.proves)) {
        const claim = includeRef(target, ref, [target.name], 1);
        if (claim) include(claim, [target.name, claim.name], 1, "hard");
      }
      expandProof(target, [target.name], 0, new Set());
    } else {
      diagnostics.push({
        severity: "warning",
        code: "profile_target_mismatch",
        message: `proof profile is not the default fit for ${target.role}; resolving its hard requires/uses only.`,
        objectName: target.name
      });
      expandNonClaim(target, [target.name], 0, new Set());
    }
  } else if (profile === "meaning") {
    expandRequires(target, [target.name], 0, new Set());
  } else {
    const historyEdges: EdgeType[] = ["refines", "replaces", "cites"];
    const visitHistory = (object: NormalizedObject, path: string[], depth: number, stack: Set<string>) => {
      if (stack.has(object.name)) return;
      const nextStack = new Set(stack);
      nextStack.add(object.name);
      for (const type of historyEdges) {
        for (const ref of hardEdgeRefs(object.edges[type])) {
          const dependency = includeRef(object, ref, path, depth + 1);
          if (dependency) visitHistory(dependency, [...path, dependency.name], depth + 1, nextStack);
        }
      }
    };
    visitHistory(target, [target.name], 0, new Set());
  }

  if (profile === "audit") {
    for (const node of [...nodes.values()]) {
      for (const blockerName of node.object.reverseEdges.blocked_by ?? []) {
        const blocker = graph.objectsByName[blockerName];
        if (blocker) include(blocker, [target.name, node.object.name, blocker.name], node.depth + 1, "soft");
      }
    }
  }

  for (const node of [...nodes.values()]) {
    for (const ref of [...softEdgeRefs(node.object.edges.requires), ...softEdgeRefs(node.object.edges.uses)]) {
      includeRef(node.object, ref, [target.name, node.object.name], node.depth + 1);
    }
  }

  for (const name of boundaries) {
    const object = resolveObject(graph, name);
    if (object) include(object, [target.name, object.name], 1, "hard").decision = "boundary";
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
    if ((profile === "proof" || profile === "meaning") && node.hardness === "hard" && representation === "statement" && !hasStatementRepresentation(node.object)) {
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

  const openNames = openObjectNames(diagnostics);
  const resolvedNodes: ResolvedRouteNode[] = resolvedNodesWithoutClass.map((node) => {
    let inclusionClass: RouteInclusionClass = spineNames.has(node.object.name) ? "spine" : "vocabulary";
    if (node.decision === "boundary" || boundaries.has(node.object.name)) inclusionClass = "boundary";
    if (node.decision === "unresolved" || openNames.has(node.object.name)) inclusionClass = "open";
    return { ...node, inclusionClass };
  }).sort((a, b) => a.depth - b.depth || a.object.name.localeCompare(b.object.name));

  const totalTokens = resolvedNodes.reduce((sum, node) => sum + node.marginalCost.current, 0);
  const closed = !diagnostics.some((item) => ["error"].includes(item.severity) && item.code !== "representation_below_floor" && item.code !== "missing_statement_representation");
  const contentSufficient = !diagnostics.some((item) => item.severity === "error");

  return {
    target,
    profile,
    nodes: resolvedNodes,
    edges: buildResolvedEdges(nodes),
    proofAlternatives,
    selectedProofs,
    boundaries: [...boundaries],
    orderHints,
    diagnostics,
    totalTokens,
    closed,
    contentSufficient
  };
}
