import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  FileText,
  Filter,
  FolderOpen,
  LayoutDashboard,
  Maximize2,
  Menu,
  NotebookText,
  Play,
  RefreshCw,
  Search,
  TriangleAlert,
  X
} from "lucide-react";
import { ACTIVE_STATUS, STATUS_COLORS } from "../core/constants";
import { edgeTargets } from "../core/edgeUtils";
import { renderMarkdownBlock } from "../core/render";
import { deriveRouteProofTree, type ProofTreeNode } from "../core/routeProofTree";
import { resolveRoute, type ResolvedRouteNode, type RouteDiagnostic } from "../core/routeResolver";
import { isObjectCardExpanded, nextObjectExpansionState } from "./cardExpansion";
import { ignoresObjectLinkTarget, objectLinkAction, shouldAutoScrollFocusedObject, type ObjectLinkArea, type ObjectLinkGesture } from "./interactions";
import { relationLabel, sortRelationRows } from "./relations";
import type {
  AtlasRouteView,
  AtlasProblem,
  AtlasView,
  BodyFile,
  NormalizedGraph,
  NormalizedObject,
  ObjectKind,
  ObjectStatus,
  RegistryProjectListItem,
  ViewEmbedItem,
  ViewItem
} from "../core/types";

type BodyCache = Record<string, BodyFile[]>;
type ReferenceSelection = {
  file: string;
  block: string;
  kind: BodyFile["blocks"][number]["kind"];
  excerpt: string;
};
type AppState =
  | { mode: "loading" }
  | { mode: "launcher"; projects: RegistryProjectListItem[] }
  | { mode: "project"; graph: NormalizedGraph };

type RouteState =
  | { mode: "view"; viewName: string; focus?: string; side?: string }
  | { mode: "route"; routeName: string; side?: string }
  | { mode: "object"; objectId: string; side?: string };

type Toast = { text: string; title: string } | null;
type CenterScrollMode = "top" | "preserve";
type RoutePaneTab = "tree" | "narrative";
type LeftNavTab = "views" | "objects";
type RoutePaneUiState = {
  tab?: RoutePaneTab;
};
type ResizeDrag = {
  side: "left" | "right";
  startX: number;
  startWidth: number;
} | null;

const SHORTCUTS = [
  { keys: "Cmd/Ctrl K", action: "Open the command palette." },
  { keys: ">key", action: "Show this shortcut reference inside the command palette." },
  { keys: "R", action: "Toggle the right detail pane for the current center object." },
  { keys: "Esc", action: "Close the command palette or the active overlay page." }
];

const KIND_OPTIONS: ObjectKind[] = ["math", "issue", "note"];
const DEFAULT_LEFT_WIDTH = 262;
const DEFAULT_DETAIL_WIDTH = 560;
const DEFAULT_DETAIL_WIDTH_RATIO = 0.47;
const MIN_LEFT_WIDTH = 190;
const MAX_LEFT_WIDTH = 460;
const MIN_DETAIL_WIDTH = 320;
const MAX_DETAIL_WIDTH = 920;
const COMPACT_WIDTH = 760;
const STATUS_OPTIONS: ObjectStatus[] = [
  "draft",
  "partial",
  "needs_check",
  "checked",
  "open",
  "resolved",
  "disproved",
  "obsolete",
  "archived"
];
const STATIC_DEMO_MODE = import.meta.env.VITE_PROOF_ATLAS_DEMO === "1";

type StaticDemoData = {
  graph: NormalizedGraph;
  bodies: BodyCache;
};

let staticDemoDataPromise: Promise<StaticDemoData> | null = null;

function staticDemoDataUrl(): string {
  return `${import.meta.env.BASE_URL.replace(/\/?$/, "/")}demo-data.json`;
}

async function loadStaticDemoData(): Promise<StaticDemoData> {
  staticDemoDataPromise ??= fetch(staticDemoDataUrl(), { cache: "no-store" }).then(async (response) => {
    if (!response.ok) throw new Error(`Unable to load demo data: ${response.status}`);
    return response.json() as Promise<StaticDemoData>;
  });
  return staticDemoDataPromise;
}

function displayDemoPath(graph: NormalizedGraph, filePath: string): string {
  if (!graph.workspace.root) return filePath;
  const root = graph.workspace.root.replaceAll("\\", "/").replace(/\/+$/, "");
  const normalized = filePath.replaceAll("\\", "/");
  if (normalized === root) return ".";
  return normalized.startsWith(`${root}/`) ? normalized.slice(root.length + 1) : filePath;
}

function formatDemoReference(graph: NormalizedGraph, object: NormalizedObject, selection?: ReferenceSelection): string {
  const lines = [
    "ProofAtlas local reference",
    `project: ${graph.config.project}`,
    `atlas_root: ${graph.atlasRoot}`,
    `workspace_root: ${graph.workspace.root ?? ""}`,
    ...(graph.workspace.texMain ? [`tex_main: ${displayDemoPath(graph, graph.workspace.texMain)}`] : []),
    `uid: ${object.uid}`,
    `name: ${object.name}`,
    ...(object.origin.kind === "project" ? [] : [`origin: ${object.origin.kind}`]),
    ...(object.origin.atlasId ? [`origin_atlas: ${object.origin.atlasId}`] : []),
    ...(object.origin.kind === "project" ? [] : [`origin_atlas_root: ${object.origin.atlasRoot}`]),
    ...(object.citation ? [
      `citation_bibkey: ${object.citation.bibkey}`,
      ...(object.citation.trust ? [`citation_trust: ${object.citation.trust}`] : [])
    ] : []),
    `path: ${object.objectPath}`,
    "body:",
    ...object.body.map((item) => `  - ${item}`)
  ];
  if (selection) {
    lines.push(
      "selection:",
      `  file: ${selection.file}`,
      `  block: ${selection.block}`,
      `  kind: ${selection.kind}`,
      `  excerpt: ${JSON.stringify(selection.excerpt)}`
    );
  }
  return lines.join("\n");
}

function defaultDetailWidth(): number {
  const availableWidth = window.innerWidth - DEFAULT_LEFT_WIDTH;
  return Math.min(MAX_DETAIL_WIDTH, Math.max(MIN_DETAIL_WIDTH, Math.round(availableWidth * DEFAULT_DETAIL_WIDTH_RATIO)));
}

function parseRoute(): RouteState {
  const path = window.location.pathname;
  if (path.startsWith("/object/")) {
    const params = new URLSearchParams(window.location.search);
    return {
      mode: "object",
      objectId: decodeURIComponent(path.slice("/object/".length)),
      side: params.get("side") ?? undefined
    };
  }
  if (path.startsWith("/view/")) {
    const viewName = decodeURIComponent(path.slice("/view/".length)) || "dashboard";
    const params = new URLSearchParams(window.location.search);
    return {
      mode: "view",
      viewName,
      focus: params.get("focus") ?? undefined,
      side: params.get("side") ?? undefined
    };
  }
  if (path.startsWith("/route/")) {
    const routeName = decodeURIComponent(path.slice("/route/".length)) || "";
    const params = new URLSearchParams(window.location.search);
    return {
      mode: "route",
      routeName,
      side: params.get("side") ?? undefined
    };
  }
  return { mode: "view", viewName: "dashboard" };
}

function routeView(view: AtlasView, focus?: string, side?: string): string {
  const params = new URLSearchParams();
  if (focus) params.set("focus", focus);
  if (side) params.set("side", side);
  const query = params.toString();
  return `/view/${encodeURIComponent(view.name)}${query ? `?${query}` : ""}`;
}

function routeGeneratedView(view: AtlasRouteView, side?: string): string {
  const params = new URLSearchParams();
  if (side) params.set("side", side);
  const query = params.toString();
  return `/route/${encodeURIComponent(view.name)}${query ? `?${query}` : ""}`;
}

function objectHref(object: NormalizedObject, side?: string): string {
  const params = new URLSearchParams();
  if (side) params.set("side", side);
  const query = params.toString();
  return `/object/${encodeURIComponent(object.uid)}${query ? `?${query}` : ""}`;
}

function objectForViewEmbed(item: ViewItem, graph: NormalizedGraph): NormalizedObject | undefined {
  if (item.type !== "embed") return undefined;
  return item.uid ? graph.objectsByUid[item.uid] : item.name ? graph.objectsByName[item.name] : graph.objectsByName[item.target];
}

function defaultObjectForView(view: AtlasView, graph: NormalizedGraph): NormalizedObject | undefined {
  for (const item of view.items) {
    const object = objectForViewEmbed(item, graph);
    if (object) return object;
  }
  return graph.objects[0];
}

function viewContainsObject(view: AtlasView, object: NormalizedObject, graph: NormalizedGraph): boolean {
  return view.items.some((item) => objectForViewEmbed(item, graph)?.uid === object.uid);
}

function isPaperView(view: AtlasView): boolean {
  const normalizedName = titleForPath(view.path).toLowerCase().replace(/[-_\s]+/g, "");
  const normalizedTitle = view.title.toLowerCase().replace(/[-_\s]+/g, "");
  return normalizedName === "paper" || normalizedTitle === "paper";
}

function paperViewForObject(graph: NormalizedGraph, object: NormalizedObject): AtlasView | undefined {
  const paperView = graph.views.find(isPaperView);
  if (paperView && viewContainsObject(paperView, object, graph)) return paperView;
  return graph.views.find((view) => viewContainsObject(view, object, graph))
    ?? paperView
    ?? graph.views.find((view) => view.path === graph.config.default_view)
    ?? graph.views[0];
}

function objectCardSelector(uid: string): string {
  return `.object-card[data-object-uid="${uid.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"]`;
}

function titleForPath(path: string): string {
  return path.replace(/^views\//, "").replace(/\.md$/, "");
}

function viewLabel(view?: AtlasView): string {
  if (!view) return "View";
  return titleForPath(view.path).replace(/(^|[-_ ])\w/g, (part) => part.toUpperCase());
}

function kindIcon(kind: ObjectKind, size = 15) {
  if (kind === "issue") return <AlertTriangle size={size} />;
  if (kind === "note") return <NotebookText size={size} />;
  return <FileText size={size} />;
}

function viewIcon(view?: AtlasView, size = 13) {
  const label = viewLabel(view).toLowerCase();
  if (label.includes("dashboard")) return <LayoutDashboard size={size} />;
  if (label.includes("gap")) return <TriangleAlert size={size} />;
  return <FileText size={size} />;
}

function statusColor(status: ObjectStatus): string {
  return STATUS_COLORS[status] ?? "#8A8A8A";
}

function shortName(name: string): string {
  const parts = name.split(".");
  if (parts[0] === "main" && parts.length > 2) return parts.slice(2).join(".");
  if (parts.length > 1) return parts.slice(1).join(".");
  return name;
}

function originLabel(object: NormalizedObject): string | undefined {
  if (object.origin.kind === "global_reference") return object.origin.atlasId ? `global references: ${object.origin.atlasId}` : "global references";
  if (object.origin.kind === "mounted_project") return object.origin.atlasId ? `mounted project: ${object.origin.atlasId}` : "mounted project";
  return undefined;
}

function ObjectFactChips(props: { object: NormalizedObject }) {
  const origin = originLabel(props.object);
  const citation = props.object.citation;
  if (!origin && !citation && !props.object.source_result?.statement_fidelity) return null;
  return (
    <div className="object-fact-chips">
      {origin && <span>{origin}</span>}
      {citation && <span>bibkey: <code>{citation.bibkey}</code></span>}
      {citation?.trust && <span className={`trust-chip trust-${citation.trust}`}>{citation.trust}</span>}
      {props.object.source_result?.statement_fidelity && <span>fidelity: {props.object.source_result.statement_fidelity}</span>}
    </div>
  );
}

function truncateLabel(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function formatTokenCount(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return String(value);
}

function escapeHtmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function emphasizeFirstOccurrence(html: string, value: string): string {
  const escaped = escapeHtmlText(value);
  return html.replace(escaped, `<strong>${escaped}</strong>`);
}

function viewSortKey(graph: NormalizedGraph, view: AtlasView): string {
  const label = viewLabel(view).toLowerCase();
  if (view.path === graph.config.default_view || label.includes("dashboard")) return "0";
  if (label.includes("paper")) return "1";
  if (label.includes("gap")) return "2";
  return `9-${label}`;
}

function groupSortKey(group: string): string {
  const order = ["main.setting", "main.model", "main.claim", "main.proof", "main.issue", "source"];
  const index = order.indexOf(group);
  return `${index === -1 ? 99 : index}-${group}`;
}

function treeGroupForObject(object: NormalizedObject): string {
  const parts = object.name.split(".");
  if (parts[0] === "source") return "source";
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : parts[0];
}

function shouldShowByFilter(object: NormalizedObject, statusFilter: Set<ObjectStatus>, kindFilter: Set<ObjectKind>, showArchived: boolean): boolean {
  if (!showArchived && ["disproved", "obsolete", "archived"].includes(object.status)) return false;
  return statusFilter.has(object.status) && kindFilter.has(object.kind);
}

function defaultExpanded(object: NormalizedObject, embed?: ViewEmbedItem): boolean {
  if (embed?.expanded) return true;
  return ["claim", "problem", "setting", "model", "definition"].includes(object.role);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveGraphObject(graph: NormalizedGraph, target: string): NormalizedObject | undefined {
  const aliasUid = graph.aliases[target];
  return graph.objectsByName[target] ?? graph.objectsByUid[target] ?? (aliasUid ? graph.objectsByUid[aliasUid] : undefined);
}

export function renderObjectSummaryHtml(object: NormalizedObject, graph: NormalizedGraph): string | undefined {
  if (!object.summary) return undefined;
  return renderMarkdownBlock(object.summary, (name) => resolveGraphObject(graph, name), object.name);
}

function linkedObjectFromTarget(target: EventTarget | null, graph: NormalizedGraph): { element: HTMLElement; object: NormalizedObject } | undefined {
  const targetElement = target instanceof Element
    ? target
    : target instanceof Node
      ? target.parentElement
      : null;
  if (!targetElement) return undefined;
  if (ignoresObjectLinkTarget(targetElement)) return undefined;
  const element = targetElement.closest("[data-object-name]") as HTMLElement | null;
  if (!element) return undefined;
  const object = resolveGraphObject(graph, element.dataset.objectName ?? "");
  return object ? { element, object } : undefined;
}

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function linkedProseHandlers(props: {
  graph: NormalizedGraph;
  onSelect: (object: NormalizedObject) => void;
  onOpenPreview: (object: NormalizedObject) => void;
}, pendingClick: { current: number | undefined }) {
  const clearPendingClick = () => {
    if (pendingClick.current !== undefined) {
      window.clearTimeout(pendingClick.current);
      pendingClick.current = undefined;
    }
  };
  return {
    onClickCapture: (event: ReactMouseEvent<HTMLElement>) => {
      const linked = linkedObjectFromTarget(event.target, props.graph);
      if (!linked) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.detail >= 2) {
        clearPendingClick();
        return;
      }
      clearPendingClick();
      pendingClick.current = window.setTimeout(() => {
        props.onSelect(linked.object);
        pendingClick.current = undefined;
      }, 180);
    },
    onDoubleClickCapture: (event: ReactMouseEvent<HTMLElement>) => {
      const linked = linkedObjectFromTarget(event.target, props.graph);
      if (!linked) return;
      event.preventDefault();
      event.stopPropagation();
      clearPendingClick();
      props.onOpenPreview(linked.object);
    }
  };
}

function LinkedProse(props: {
  graph: NormalizedGraph;
  className?: string;
  html?: string;
  children?: ReactNode;
  onSelect: (object: NormalizedObject) => void;
  onOpenPreview: (object: NormalizedObject) => void;
}) {
  const pendingClick = useRef<number | undefined>(undefined);
  useEffect(() => () => {
    if (pendingClick.current !== undefined) window.clearTimeout(pendingClick.current);
  }, []);
  const handlers = linkedProseHandlers(props, pendingClick);
  const className = props.className ?? "prose";
  if (props.html !== undefined) {
    return <div className={className} {...handlers} dangerouslySetInnerHTML={{ __html: props.html }} />;
  }
  return <div className={className} {...handlers}>{props.children}</div>;
}

function getSelectionForReference(): { file: string; block: string; kind: BodyFile["blocks"][number]["kind"]; excerpt: string } | undefined {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return undefined;
  const range = selection.getRangeAt(0);
  const node = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer as Element
    : range.startContainer.parentElement;
  const block = node?.closest("[data-block-id]") as HTMLElement | null;
  if (!block) return undefined;
  return {
    file: block.dataset.sourceFile ?? "",
    block: block.dataset.blockId ?? "",
    kind: (block.dataset.blockKind ?? "paragraph") as BodyFile["blocks"][number]["kind"],
    excerpt: block.dataset.excerpt ?? ""
  };
}

function historyUrl(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function historyObject(): Record<string, unknown> {
  return window.history.state && typeof window.history.state === "object"
    ? window.history.state as Record<string, unknown>
    : {};
}

function readRoutePaneUiState(key: string): RoutePaneUiState {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as RoutePaneUiState;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeRoutePaneUiState(key: string, patch: RoutePaneUiState): void {
  const next = { ...readRoutePaneUiState(key), ...patch };
  window.sessionStorage.setItem(key, JSON.stringify(next));
}

function ColumnResizer(props: {
  side: "left" | "right";
  label: string;
  onMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className={`column-resizer ${props.side}`}
      role="separator"
      aria-label={props.label}
      aria-orientation="vertical"
      onMouseDown={props.onMouseDown}
    />
  );
}

export default function App() {
  const [appState, setAppState] = useState<AppState>({ mode: "loading" });
  const [route, setRoute] = useState<RouteState>(() => parseRoute());
  const [bodyCache, setBodyCache] = useState<BodyCache>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [treeFilter, setTreeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<Set<ObjectStatus>>(() => new Set(ACTIVE_STATUS));
  const [kindFilter, setKindFilter] = useState<Set<ObjectKind>>(() => new Set(KIND_OPTIONS));
  const [showArchived, setShowArchived] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [detailDismissed, setDetailDismissed] = useState(false);
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_WIDTH);
  const [detailWidth, setDetailWidth] = useState(() => defaultDetailWidth());
  const [resizeDrag, setResizeDrag] = useState<ResizeDrag>(null);
  const [projectOpen, setProjectOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [buildOpen, setBuildOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [buildFlash, setBuildFlash] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [overlayUid, setOverlayUid] = useState<string | null>(null);
  const [copiedUid, setCopiedUid] = useState<string | null>(null);
  const centerPaneRef = useRef<HTMLElement | null>(null);
  const lastCenterFocusScrollKey = useRef<string | undefined>(undefined);
  const pendingObjectLinkClick = useRef<number | null>(null);
  const pendingCenterScroll = useRef<number | null>(null);
  const scrollWriteFrame = useRef<number | null>(null);

  const refreshState = useCallback(async () => {
    if (STATIC_DEMO_MODE) {
      const data = await loadStaticDemoData();
      setBodyCache(data.bodies);
      setAppState({ mode: "project", graph: data.graph });
      return;
    }
    const response = await fetch("/api/state", { cache: "no-store" });
    setAppState(await response.json() as AppState);
  }, []);

  const centerScrollTop = useCallback(() => centerPaneRef.current?.scrollTop ?? 0, []);

  const persistCenterScroll = useCallback((scrollTop = centerScrollTop()) => {
    window.history.replaceState({
      ...historyObject(),
      paCenterScroll: scrollTop
    }, "", historyUrl());
  }, [centerScrollTop]);

  const scheduleCenterScrollPersist = useCallback(() => {
    if (scrollWriteFrame.current !== null) return;
    scrollWriteFrame.current = window.requestAnimationFrame(() => {
      scrollWriteFrame.current = null;
      persistCenterScroll();
    });
  }, [persistCenterScroll]);
  const centerFocusedUid = route.mode === "view" ? route.focus : undefined;
  const centerFocusKey = route.mode === "view" && route.focus ? `${route.viewName}:${route.focus}` : undefined;

  useEffect(() => {
    if (typeof historyObject().paCenterScroll !== "number") persistCenterScroll(0);
    return () => {
      if (scrollWriteFrame.current !== null) window.cancelAnimationFrame(scrollWriteFrame.current);
    };
  }, [persistCenterScroll]);

  useEffect(() => {
    void refreshState();
    const onPop = (event: PopStateEvent) => {
      const nextScroll = event.state && typeof event.state.paCenterScroll === "number"
        ? event.state.paCenterScroll
        : 0;
      pendingCenterScroll.current = nextScroll;
      setRoute(parseRoute());
    };
    window.addEventListener("popstate", onPop);
    const events = STATIC_DEMO_MODE ? undefined : new EventSource("/api/events");
    events?.addEventListener("build", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as { type: string; problemCount?: number };
      setBuildFlash(data.type === "rebuilt" || data.type === "project_opened" ? `Rebuilt · ${data.problemCount ?? 0} problems` : "Rebuild failed");
      setTimeout(() => setBuildFlash(null), 1800);
      setBodyCache({});
      void refreshState();
    });
    return () => {
      window.removeEventListener("popstate", onPop);
      events?.close();
    };
  }, [refreshState]);

  useLayoutEffect(() => {
    if (pendingCenterScroll.current === null) return;
    const nextScroll = pendingCenterScroll.current;
    pendingCenterScroll.current = null;
    if (centerPaneRef.current) centerPaneRef.current.scrollTop = nextScroll;
  }, [route, appState.mode]);

  useLayoutEffect(() => {
    if (!centerFocusedUid || !centerFocusKey) {
      lastCenterFocusScrollKey.current = undefined;
      return;
    }
    if (!shouldAutoScrollFocusedObject(lastCenterFocusScrollKey.current, centerFocusKey)) return;
    const pane = centerPaneRef.current;
    if (!pane) return;
    const card = pane.querySelector<HTMLElement>(objectCardSelector(centerFocusedUid));
    if (!card) return;
    lastCenterFocusScrollKey.current = centerFocusKey;
    const paneRect = pane.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const headerVisible = cardRect.top >= paneRect.top && cardRect.top <= paneRect.bottom - 96;
    if (headerVisible) return;
    card.scrollIntoView({ block: "start", inline: "nearest" });
    persistCenterScroll(pane.scrollTop);
  }, [appState.mode, centerFocusKey, centerFocusedUid, persistCenterScroll]);

  useEffect(() => {
    const scrollTimers = new Map<Element, number>();
    const onScroll = (event: Event) => {
      const target = event.target;
      const element = target === document
        ? document.scrollingElement
        : target instanceof Element
          ? target
          : null;
      if (!element) return;
      element.classList.add("is-scrolling");
      const existingTimer = scrollTimers.get(element);
      if (existingTimer !== undefined) window.clearTimeout(existingTimer);
      const nextTimer = window.setTimeout(() => {
        element.classList.remove("is-scrolling");
        scrollTimers.delete(element);
      }, 760);
      scrollTimers.set(element, nextTimer);
    };
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      for (const timer of scrollTimers.values()) window.clearTimeout(timer);
      for (const element of scrollTimers.keys()) element.classList.remove("is-scrolling");
      scrollTimers.clear();
    };
  }, []);

  useEffect(() => {
    if (!resizeDrag) return undefined;
    document.body.classList.add("resizing-columns");
    const onMove = (event: globalThis.MouseEvent) => {
      const delta = event.clientX - resizeDrag.startX;
      if (resizeDrag.side === "left") {
        setLeftWidth(clamp(resizeDrag.startWidth + delta, MIN_LEFT_WIDTH, MAX_LEFT_WIDTH));
      } else {
        setDetailWidth(clamp(resizeDrag.startWidth - delta, MIN_DETAIL_WIDTH, MAX_DETAIL_WIDTH));
      }
    };
    const onUp = () => setResizeDrag(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      document.body.classList.remove("resizing-columns");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [resizeDrag]);

  useEffect(() => {
    if (!projectOpen && !filterOpen && !buildOpen) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".top-popover-anchor")) return;
      setProjectOpen(false);
      setFilterOpen(false);
      setBuildOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [buildOpen, filterOpen, projectOpen]);

  const graph = appState.mode === "project" ? appState.graph : null;
  const objectsByUid = graph?.objectsByUid ?? {};
  const objectsByName = graph?.objectsByName ?? {};

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (!graph) return;
        event.preventDefault();
        setCommandOpen(true);
        setProjectOpen(false);
        setFilterOpen(false);
        setBuildOpen(false);
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [graph]);

  const currentView = useMemo(() => {
    if (!graph) return undefined;
    if (route.mode !== "view") return graph.views.find((view) => view.path === graph.config.default_view) ?? graph.views[0];
    return graph.views.find((view) => view.name === route.viewName || titleForPath(view.path) === route.viewName)
      ?? graph.views.find((view) => view.path === graph.config.default_view)
      ?? graph.views[0];
  }, [graph, route]);

  const currentRouteView = useMemo(() => {
    if (!graph || route.mode !== "route") return undefined;
    return graph.routeViews.find((view) => view.name === route.routeName || titleForPath(view.path) === route.routeName)
      ?? graph.routeViews[0];
  }, [graph, route]);

  const sideObject = (route.mode === "view" || route.mode === "route" || route.mode === "object") && route.side
    ? (objectsByUid[route.side] ?? objectsByName[route.side])
    : undefined;
  const fullObject = route.mode === "object"
    ? (objectsByUid[route.objectId] ?? objectsByName[route.objectId])
    : undefined;
  const overlayObject = overlayUid
    ? (objectsByUid[overlayUid] ?? objectsByName[overlayUid])
    : undefined;
  const currentResolvedRoute = useMemo(() => {
    if (!graph || route.mode !== "route" || !currentRouteView) return undefined;
    return resolveRoute(graph, currentRouteView.route);
  }, [currentRouteView, graph, route.mode]);
  const sideRouteNode = currentResolvedRoute && sideObject
    ? currentResolvedRoute.nodes.find((node) => node.object.uid === sideObject.uid)
    : undefined;
  const sideRouteDiagnostics = currentResolvedRoute && sideObject
    ? currentResolvedRoute.diagnostics.filter((item) => item.objectName === sideObject.name || item.target === sideObject.name)
    : [];
  const centerObject = route.mode === "object"
    ? fullObject
    : route.mode === "view" && route.focus
      ? (objectsByUid[route.focus] ?? objectsByName[route.focus])
      : route.mode === "route"
        ? sideObject ?? currentResolvedRoute?.target
        : undefined;

  const expansionScope = route.mode === "view" && currentView
    ? `view:${currentView.path}`
    : route.mode === "route" && currentRouteView
      ? `route:${currentRouteView.path}`
      : route.mode === "object" && fullObject
        ? `object:${fullObject.uid}`
        : "none";

  useEffect(() => {
    setExpanded(new Set());
    setCollapsed(new Set());
  }, [expansionScope]);

  useEffect(() => {
    if (!graph || !currentView || route.mode !== "view" || route.side || detailDismissed) return;
    if (window.innerWidth <= COMPACT_WIDTH) return;
    const object = route.focus
      ? (objectsByUid[route.focus] ?? objectsByName[route.focus] ?? defaultObjectForView(currentView, graph))
      : defaultObjectForView(currentView, graph);
    if (!object) return;
    window.history.replaceState({}, "", routeView(currentView, route.focus ?? object.uid, object.uid));
    setRoute(parseRoute());
  }, [currentView, detailDismissed, graph, objectsByName, objectsByUid, route]);

  const navigate = useCallback((url: string, scrollMode: CenterScrollMode = "top") => {
    setOverlayUid(null);
    persistCenterScroll();
    const nextScroll = scrollMode === "preserve" ? centerScrollTop() : 0;
    window.history.pushState({ paCenterScroll: nextScroll }, "", url);
    pendingCenterScroll.current = nextScroll;
    setRoute(parseRoute());
  }, [centerScrollTop, persistCenterScroll]);

  const selectObject = useCallback((object: NormalizedObject) => {
    setFilterOpen(false);
    setBuildOpen(false);
    setDetailDismissed(false);
    if (route.mode === "object" && fullObject) {
      navigate(objectHref(fullObject, object.uid), "preserve");
      return;
    }
    if (route.mode === "route" && currentRouteView) {
      navigate(routeGeneratedView(currentRouteView, object.uid), "preserve");
      return;
    }
    if (!currentView) return;
    navigate(routeView(currentView, object.uid, object.uid), "preserve");
  }, [currentRouteView, currentView, fullObject, navigate, route.mode]);

  const openFull = useCallback((object: NormalizedObject) => {
    setFilterOpen(false);
    setBuildOpen(false);
    const preservedSide = detailDismissed ? undefined : sideObject?.uid;
    navigate(objectHref(object, preservedSide));
  }, [detailDismissed, navigate, sideObject?.uid]);

  const openView = useCallback((view: AtlasView) => {
    setFilterOpen(false);
    setBuildOpen(false);
    const object = detailDismissed || !graph ? undefined : defaultObjectForView(view, graph);
    navigate(routeView(view, object?.uid, object?.uid));
  }, [detailDismissed, graph, navigate]);

  const openRouteView = useCallback((view: AtlasRouteView) => {
    setFilterOpen(false);
    setBuildOpen(false);
    const preservedSide = detailDismissed ? undefined : sideObject?.uid;
    navigate(routeGeneratedView(view, preservedSide));
  }, [detailDismissed, navigate, sideObject?.uid]);

  const ensureBody = useCallback(async (uid: string) => {
    if (bodyCache[uid]) return;
    if (STATIC_DEMO_MODE) {
      const data = await loadStaticDemoData();
      setBodyCache((cache) => ({ ...cache, [uid]: data.bodies[uid] ?? [] }));
      return;
    }
    const response = await fetch(`/api/object/${encodeURIComponent(uid)}/body`, { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json() as { files: BodyFile[] };
    setBodyCache((cache) => ({ ...cache, [uid]: data.files }));
  }, [bodyCache]);

  const openPaperViewForObject = useCallback((object: NormalizedObject) => {
    if (!graph) return;
    const view = paperViewForObject(graph, object);
    if (!view) return;
    setFilterOpen(false);
    setBuildOpen(false);
    setDetailDismissed(false);
    navigate(routeView(view, object.uid, object.uid));
    void ensureBody(object.uid);
  }, [ensureBody, graph, navigate]);

  const openSideObject = useCallback((object: NormalizedObject) => {
    setFilterOpen(false);
    setBuildOpen(false);
    setDetailDismissed(false);
    if (route.mode === "object" && fullObject) {
      navigate(objectHref(fullObject, object.uid), "preserve");
    } else if (route.mode === "route" && currentRouteView) {
      navigate(routeGeneratedView(currentRouteView, object.uid), "preserve");
    } else if (currentView) {
      navigate(routeView(currentView, route.mode === "view" ? route.focus : undefined, object.uid), "preserve");
    } else {
      return;
    }
    void ensureBody(object.uid);
  }, [currentRouteView, currentView, ensureBody, fullObject, navigate, route]);

  const selectObjectKeepingOverlay = useCallback((object: NormalizedObject) => {
    setFilterOpen(false);
    setBuildOpen(false);
    setDetailDismissed(false);
    if (route.mode === "route" && currentRouteView) {
      persistCenterScroll();
      window.history.pushState({}, "", routeGeneratedView(currentRouteView, object.uid));
    } else if (currentView) {
      persistCenterScroll();
      window.history.pushState({}, "", routeView(currentView, object.uid, object.uid));
    } else {
      return;
    }
    window.history.replaceState({ ...historyObject(), paCenterScroll: centerScrollTop() }, "", historyUrl());
    setRoute(parseRoute());
    void ensureBody(object.uid);
  }, [centerScrollTop, currentRouteView, currentView, ensureBody, persistCenterScroll, route.mode]);

  const openOverlay = useCallback((object: NormalizedObject) => {
    setFilterOpen(false);
    setBuildOpen(false);
    setOverlayUid(object.uid);
    void ensureBody(object.uid);
  }, [ensureBody]);

  useEffect(() => {
    if (!graph) return undefined;
    const clearPendingObjectLinkClick = () => {
      if (pendingObjectLinkClick.current !== null) {
        window.clearTimeout(pendingObjectLinkClick.current);
        pendingObjectLinkClick.current = null;
      }
    };
    const linkTarget = (event: MouseEvent): { area: ObjectLinkArea; object: NormalizedObject } | undefined => {
      const linked = linkedObjectFromTarget(event.target, graph);
      if (!linked) return undefined;
      const area: ObjectLinkArea = linked.element.closest(".object-overlay-panel")
        ? "overlay"
        : linked.element.closest(".detail-panel")
          ? "detail"
          : "center";
      return { area, object: linked.object };
    };
    const runAction = (area: ObjectLinkArea, gesture: ObjectLinkGesture, object: NormalizedObject) => {
      const action = objectLinkAction(area, gesture);
      if (action === "preview") {
        openOverlay(object);
      } else if (action === "openSide") {
        openSideObject(object);
      } else if (action === "selectKeepingOverlay") {
        selectObjectKeepingOverlay(object);
      } else {
        selectObject(object);
      }
    };
    const intercept = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    const onClick = (event: MouseEvent) => {
      const target = linkTarget(event);
      if (!target) return;
      intercept(event);
      if (event.detail >= 2) {
        clearPendingObjectLinkClick();
        return;
      }
      clearPendingObjectLinkClick();
      pendingObjectLinkClick.current = window.setTimeout(() => {
        runAction(target.area, "single", target.object);
        pendingObjectLinkClick.current = null;
      }, 180);
    };
    const onDoubleClick = (event: MouseEvent) => {
      const target = linkTarget(event);
      if (!target) return;
      intercept(event);
      clearPendingObjectLinkClick();
      runAction(target.area, "double", target.object);
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("dblclick", onDoubleClick, true);
    return () => {
      clearPendingObjectLinkClick();
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("dblclick", onDoubleClick, true);
    };
  }, [graph, openOverlay, openSideObject, selectObject, selectObjectKeepingOverlay]);

  const goHistory = useCallback((delta: -1 | 1) => {
    setOverlayUid(null);
    persistCenterScroll();
    if (delta < 0) window.history.back();
    else window.history.forward();
  }, [persistCenterScroll]);

  const closeDetailPanel = useCallback(() => {
    setDetailDismissed(true);
    if (route.mode === "object" && fullObject) {
      navigate(objectHref(fullObject), "preserve");
      return;
    }
    if (route.mode === "route" && currentRouteView) {
      navigate(routeGeneratedView(currentRouteView), "preserve");
      return;
    }
    if (currentView) navigate(routeView(currentView, route.mode === "view" ? route.focus : undefined), "preserve");
  }, [currentRouteView, currentView, fullObject, navigate, route]);

  useEffect(() => {
    const detailVisible = Boolean(sideObject && (route.mode === "view" || route.mode === "route" || route.mode === "object"));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (commandOpen) {
          event.preventDefault();
          setCommandOpen(false);
          return;
        }
        if (overlayUid) {
          event.preventDefault();
          setOverlayUid(null);
        }
        return;
      }
      if (isEditableShortcutTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "r") {
        event.preventDefault();
        if (detailVisible) {
          closeDetailPanel();
          return;
        }
        const object = centerObject ?? fullObject ?? sideObject;
        if (object) selectObject(object);
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [centerObject, closeDetailPanel, commandOpen, fullObject, overlayUid, route.mode, selectObject, sideObject]);

  const startResize = useCallback((side: "left" | "right", event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setResizeDrag({
      side,
      startX: event.clientX,
      startWidth: side === "left" ? leftWidth : detailWidth
    });
  }, [detailWidth, leftWidth]);

  const copyReference = useCallback(async (object: NormalizedObject) => {
    const selection = getSelectionForReference();
    let text: string;
    if (STATIC_DEMO_MODE) {
      if (!graph) return;
      text = formatDemoReference(graph, object, selection);
    } else {
      const response = await fetch("/api/reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: object.uid, selection })
      });
      const data = await response.json() as { text: string };
      text = data.text;
    }
    await navigator.clipboard?.writeText(text).catch(() => undefined);
    setCopiedUid(object.uid);
    setToast({ title: "Copied local reference", text });
    setTimeout(() => setCopiedUid(null), 1500);
    setTimeout(() => setToast(null), 3600);
  }, [graph]);

  const openProjectFromLauncher = useCallback(async (input: string): Promise<string | undefined> => {
    if (STATIC_DEMO_MODE) return "The hosted demo is read-only and uses the bundled example atlas.";
    const response = await fetch("/api/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input })
    });
    const data = await response.json() as { mode?: "project"; graph?: NormalizedGraph; error?: string };
    if (!response.ok || !data.graph) return data.error ?? "Unable to open project.";
    setBodyCache({});
    setExpanded(new Set());
    setCollapsed(new Set());
    setDetailDismissed(false);
    setProjectOpen(false);
    setFilterOpen(false);
    setBuildOpen(false);
    setCommandOpen(false);
    setOverlayUid(null);
    setAppState({ mode: "project", graph: data.graph });
    window.history.pushState({}, "", "/");
    setRoute(parseRoute());
    return undefined;
  }, []);

  if (appState.mode === "loading") {
    return <div className="loading">Loading Proof Atlas...</div>;
  }

  if (appState.mode === "launcher") {
    return <LauncherHome projects={appState.projects} onOpen={openProjectFromLauncher} onRefresh={refreshState} />;
  }

  if (!graph) return <div className="loading">Loading Proof Atlas...</div>;

  const errorCount = graph.problems.filter((item) => item.severity === "error").length;
  const warningCount = graph.problems.filter((item) => item.severity === "warning").length;
  const buildState = errorCount ? "error" : warningCount ? "warning" : "ok";
  const currentLabel = route.mode === "object" && fullObject
    ? fullObject.title
    : route.mode === "route" && currentRouteView
      ? currentRouteView.title
      : currentView ? viewLabel(currentView) : "View";
  const appShellStyle = {
    "--left-width": `${leftWidth}px`,
    "--detail-width": `${detailWidth}px`
  } as CSSProperties;

  return (
    <div
      className={`app-shell ${leftOpen ? "left-visible" : ""} ${sideObject && (route.mode === "view" || route.mode === "route" || route.mode === "object") ? "side-visible" : ""} ${resizeDrag ? "is-resizing" : ""}`}
      style={appShellStyle}
    >
      <TopBar
        graph={graph}
        currentLabel={currentLabel}
        leftOpen={leftOpen}
        onToggleLeft={() => setLeftOpen((value) => !value)}
        filterOpen={filterOpen}
        setFilterOpen={setFilterOpen}
        buildOpen={buildOpen}
        setBuildOpen={setBuildOpen}
        buildState={buildState}
        buildFlash={buildFlash}
        projectOpen={projectOpen}
        setProjectOpen={setProjectOpen}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        kindFilter={kindFilter}
        setKindFilter={setKindFilter}
        onProblemClick={(problem) => {
          const object = problem.objectUid ? objectsByUid[problem.objectUid] : problem.objectName ? objectsByName[problem.objectName] : undefined;
          if (object) selectObject(object);
        }}
        onSwitchProject={openProjectFromLauncher}
        staticDemo={STATIC_DEMO_MODE}
      />
      <div className="main-row">
        {leftOpen && (
          <LeftNav
            graph={graph}
            currentView={route.mode === "view" ? currentView : undefined}
            treeFilter={treeFilter}
            setTreeFilter={setTreeFilter}
            statusFilter={statusFilter}
            kindFilter={kindFilter}
            showArchived={showArchived}
            setShowArchived={setShowArchived}
            onView={openView}
            currentRouteView={currentRouteView}
            onRouteView={openRouteView}
            onOpenFull={openFull}
            selectedUid={sideObject?.uid ?? fullObject?.uid}
            width={leftWidth}
          />
        )}
        {leftOpen && (
          <ColumnResizer side="left" label="Resize navigation column" onMouseDown={(event) => startResize("left", event)} />
        )}
        <main
          className="center-pane"
          ref={centerPaneRef}
          onScroll={scheduleCenterScrollPersist}
        >
          {errorCount > 0 && (
            <div className="build-error-bar">
              {errorCount} build error{errorCount === 1 ? "" : "s"} found. The last readable graph is still shown.
            </div>
          )}
          {route.mode === "object" && fullObject ? (
            <FullObjectPage
              graph={graph}
              object={fullObject}
              body={bodyCache[fullObject.uid]}
              ensureBody={ensureBody}
              onSelect={selectObject}
              onOpenSide={openSideObject}
              onOpenFull={openFull}
              onBack={() => openPaperViewForObject(fullObject)}
              onCopy={copyReference}
              copied={copiedUid === fullObject.uid}
              onOpenPreview={openOverlay}
            />
          ) : route.mode === "route" && currentRouteView ? (
            <GeneratedRoutePane
              graph={graph}
              routeView={currentRouteView}
              bodyCache={bodyCache}
              ensureBody={ensureBody}
              selectedUid={sideObject?.uid}
              onSelect={selectObject}
              onOpenFull={openFull}
            />
          ) : currentView ? (
            <ViewPane
              graph={graph}
              view={currentView}
              bodyCache={bodyCache}
              ensureBody={ensureBody}
              expanded={expanded}
              collapsed={collapsed}
              setExpanded={setExpanded}
              setCollapsed={setCollapsed}
              statusFilter={statusFilter}
              kindFilter={kindFilter}
              showArchived={showArchived}
              selectedUid={route.mode === "view" ? route.focus : undefined}
              onSelect={selectObject}
              onOpenSide={openSideObject}
              onOpenFull={openFull}
              onOpenPreview={openOverlay}
              onCopy={copyReference}
              copiedUid={copiedUid}
            />
          ) : (
            <div className="empty-state">No view found.</div>
          )}
        </main>
        {sideObject && (route.mode === "view" || route.mode === "route" || route.mode === "object") && (
          <ColumnResizer side="right" label="Resize detail column" onMouseDown={(event) => startResize("right", event)} />
        )}
        {sideObject && (route.mode === "view" || route.mode === "route" || route.mode === "object") && (
          <DetailPanel
            graph={graph}
            object={sideObject}
            onClose={closeDetailPanel}
            onHistoryBack={() => goHistory(-1)}
            onHistoryForward={() => goHistory(1)}
            onSelect={selectObject}
            onOpenFull={openFull}
            onOpenPreview={openOverlay}
            onCopy={copyReference}
            copied={copiedUid === sideObject.uid}
            body={bodyCache[sideObject.uid]}
            ensureBody={ensureBody}
            width={detailWidth}
            routeNode={sideRouteNode}
            routeDiagnostics={sideRouteDiagnostics}
          />
        )}
      </div>
      {overlayObject && (
        <ObjectOverlay
          graph={graph}
          object={overlayObject}
          body={bodyCache[overlayObject.uid]}
          ensureBody={ensureBody}
          onClose={() => setOverlayUid(null)}
          onSelect={selectObjectKeepingOverlay}
          onOpenFull={(object) => {
            setOverlayUid(null);
            openFull(object);
          }}
          onOpenPreview={openOverlay}
          onCopy={copyReference}
          copied={copiedUid === overlayObject.uid}
        />
      )}
      {commandOpen && (
        <CommandPalette
          graph={graph}
          currentView={currentView}
          currentRouteView={currentRouteView}
          selectedUid={sideObject?.uid ?? fullObject?.uid}
          onClose={() => setCommandOpen(false)}
          onView={(view) => {
            setCommandOpen(false);
            openView(view);
          }}
          onRouteView={(view) => {
            setCommandOpen(false);
            openRouteView(view);
          }}
          onOpenFull={(object) => {
            setCommandOpen(false);
            openFull(object);
          }}
        />
      )}
      {toast && <Toast toast={toast} />}
    </div>
  );
}

function LauncherHome(props: {
  projects: RegistryProjectListItem[];
  onOpen: (input: string) => Promise<string | undefined>;
  onRefresh: () => Promise<void>;
}) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = async (value: string) => {
    const target = value.trim();
    if (!target) return;
    setBusy(target);
    setError(null);
    const nextError = await props.onOpen(target);
    if (nextError) setError(nextError);
    setBusy(null);
  };
  return (
    <main className="launcher-shell">
      <section className="launcher-panel">
        <div className="launcher-heading">
          <div>
            <div className="view-kicker">Proof Atlas</div>
            <h1>Open a project</h1>
          </div>
          <button className="icon-button" title="Refresh recent projects" onClick={() => void props.onRefresh()}>
            <RefreshCw size={16} />
          </button>
        </div>
        <form className="launcher-open-row" onSubmit={(event) => {
          event.preventDefault();
          void open(input);
        }}>
          <FolderOpen size={16} />
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="/path/to/paper or /path/to/ProofAtlas"
          />
          <button className="toolbar-button" type="submit" disabled={!input.trim() || Boolean(busy)}>
            <Play size={13} /> Open
          </button>
        </form>
        {error && <div className="launcher-error">{error}</div>}
        <div className="launcher-label">Recent projects</div>
        <div className="launcher-projects">
          {props.projects.length === 0 ? (
            <div className="empty-state">No registered projects.</div>
          ) : props.projects.map((project) => (
            <button
              key={`${project.id}-${project.atlas_root}`}
              className={`launcher-project ${project.missing ? "missing" : ""}`}
              onClick={() => void open(project.id)}
            >
              <span className="launcher-project-title">{project.title}</span>
              <code>{project.id}</code>
              <small>{project.missing ? "missing" : project.atlas_root}</small>
              <em>{project.last_opened}</em>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

function ProjectSwitcher(props: {
  open: boolean;
  setOpen: (value: boolean) => void;
  onSwitchProject: (input: string) => Promise<string | undefined>;
  onBeforeOpen: () => void;
}) {
  const [input, setInput] = useState("");
  const [projects, setProjects] = useState<RegistryProjectListItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshProjects = useCallback(async () => {
    const response = await fetch("/api/projects", { cache: "no-store" });
    const data = await response.json() as { projects: RegistryProjectListItem[] };
    setProjects(data.projects ?? []);
  }, []);

  useEffect(() => {
    if (props.open) void refreshProjects();
  }, [props.open, refreshProjects]);

  const switchProject = async (value: string) => {
    const target = value.trim();
    if (!target) return;
    setBusy(true);
    setError(null);
    const nextError = await props.onSwitchProject(target);
    if (nextError) {
      setError(nextError);
      setBusy(false);
      return;
    }
    setInput("");
    setBusy(false);
  };

  return (
    <div className="top-popover-anchor">
      <button className={`toolbar-button ${props.open ? "active" : ""}`} onClick={() => {
        const next = !props.open;
        if (next) props.onBeforeOpen();
        props.setOpen(next);
      }}>
        <FolderOpen size={13} /> Open
      </button>
      {props.open && (
        <div className="dropdown project-panel">
          <form className="project-open-form" onSubmit={(event) => {
            event.preventDefault();
            void switchProject(input);
          }}>
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="/path/to/paper, ProofAtlas/, or project-id"
            />
            <button className="toolbar-button" type="submit" disabled={!input.trim() || busy}>
              <Play size={12} /> Open
            </button>
          </form>
          {error && <div className="project-open-error">{error}</div>}
          <div className="dropdown-label">Recent projects</div>
          <div className="project-menu-list">
            {projects.length === 0 ? (
              <div className="muted">No registered projects.</div>
            ) : projects.map((project) => (
              <button
                key={`${project.id}-${project.atlas_root}`}
                className={`project-menu-row ${project.missing ? "missing" : ""}`}
                onClick={() => void switchProject(project.id)}
              >
                <span>{project.title}</span>
                <code>{project.id}</code>
                <small>{project.missing ? "missing" : project.atlas_root}</small>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TopBar(props: {
  graph: NormalizedGraph;
  currentLabel: string;
  leftOpen: boolean;
  onToggleLeft: () => void;
  filterOpen: boolean;
  setFilterOpen: (value: boolean) => void;
  buildOpen: boolean;
  setBuildOpen: (value: boolean) => void;
  buildState: "ok" | "warning" | "error";
  buildFlash: string | null;
  projectOpen: boolean;
  setProjectOpen: (value: boolean) => void;
  statusFilter: Set<ObjectStatus>;
  setStatusFilter: (value: Set<ObjectStatus>) => void;
  kindFilter: Set<ObjectKind>;
  setKindFilter: (value: Set<ObjectKind>) => void;
  onProblemClick: (problem: AtlasProblem) => void;
  onSwitchProject: (input: string) => Promise<string | undefined>;
  staticDemo: boolean;
}) {
  const buildColor = props.buildState === "ok" ? "#2E7D32" : props.buildState === "warning" ? "#B8860B" : "#C62828";
  const buildLabel = props.buildState === "ok" ? "Build OK" : props.buildState === "warning" ? `${props.graph.problems.length} problem(s)` : "Build error";
  const toggleStatus = (status: ObjectStatus) => {
    const next = new Set(props.statusFilter);
    if (next.has(status)) next.delete(status); else next.add(status);
    props.setStatusFilter(next);
  };
  const toggleKind = (kind: ObjectKind) => {
    const next = new Set(props.kindFilter);
    if (next.has(kind)) next.delete(kind); else next.add(kind);
    props.setKindFilter(next);
  };
  return (
    <header className="topbar">
      <button className="icon-button" title="Toggle navigation" onClick={props.onToggleLeft}><Menu size={16} /></button>
      <span className="project-name" title={props.graph.config.title}>{props.graph.config.title}</span>
      <span className="top-slash">/</span>
      <span className="current-view" title={props.currentLabel}>{props.currentLabel}</span>
      <div className="top-spacer" />
      {props.buildFlash && <span className="build-flash">{props.buildFlash}</span>}
      {props.staticDemo ? (
        <span className="demo-chip">Cloudflare demo</span>
      ) : (
        <ProjectSwitcher
          open={props.projectOpen}
          setOpen={props.setProjectOpen}
          onSwitchProject={props.onSwitchProject}
          onBeforeOpen={() => {
            props.setFilterOpen(false);
            props.setBuildOpen(false);
          }}
        />
      )}
      <div className="top-popover-anchor">
        <button className={`toolbar-button ${props.filterOpen ? "active" : ""}`} onClick={() => {
          props.setFilterOpen(!props.filterOpen);
          props.setBuildOpen(false);
          props.setProjectOpen(false);
        }}>
          <Filter size={13} /> Filter
        </button>
        {props.filterOpen && (
          <div className="dropdown filter-panel">
            <div className="dropdown-label">Status</div>
            {STATUS_OPTIONS.map((status) => (
              <button className="check-row" key={status} onClick={() => toggleStatus(status)}>
                <span className={`check-box ${props.statusFilter.has(status) ? "checked" : ""}`}>{props.statusFilter.has(status) ? <Check size={10} /> : null}</span>
                <span className="status-dot" style={{ background: statusColor(status) }} />
                <span className="mono">{status}</span>
              </button>
            ))}
            <div className="dropdown-label">Kind</div>
            {KIND_OPTIONS.map((kind) => (
              <button className="check-row" key={kind} onClick={() => toggleKind(kind)}>
                <span className={`check-box ${props.kindFilter.has(kind) ? "checked" : ""}`}>{props.kindFilter.has(kind) ? <Check size={10} /> : null}</span>
                <span>{kind}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="top-popover-anchor">
        <button className="toolbar-button" onClick={() => {
          props.setBuildOpen(!props.buildOpen);
          props.setFilterOpen(false);
          props.setProjectOpen(false);
        }}>
          <span className="build-dot" style={{ background: buildColor, boxShadow: `0 0 0 3px ${buildColor}2a` }} />
          {buildLabel}
        </button>
        {props.buildOpen && (
          <div className="dropdown build-panel">
            <div className="build-title">{buildLabel}</div>
            {props.graph.problems.length === 0 ? (
              <div className="muted">Normalized graph built without problems.</div>
            ) : props.graph.problems.slice(0, 12).map((problem) => (
              <button key={problem.id} className={`problem-row ${problem.severity}`} onClick={() => props.onProblemClick(problem)}>
                <span>{problem.code}</span>
                <small>{problem.path}</small>
                <em>{problem.message}</em>
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}

function LeftNav(props: {
  graph: NormalizedGraph;
  currentView?: AtlasView;
  currentRouteView?: AtlasRouteView;
  treeFilter: string;
  setTreeFilter: (value: string) => void;
  statusFilter: Set<ObjectStatus>;
  kindFilter: Set<ObjectKind>;
  showArchived: boolean;
  setShowArchived: (value: boolean) => void;
  onView: (view: AtlasView) => void;
  onRouteView: (view: AtlasRouteView) => void;
  onOpenFull: (object: NormalizedObject) => void;
  selectedUid?: string;
  width: number;
}) {
  const [activeTab, setActiveTab] = useState<LeftNavTab>("views");
  const manualViews = useMemo(() => {
    return [...props.graph.views].sort((a, b) => viewSortKey(props.graph, a).localeCompare(viewSortKey(props.graph, b)));
  }, [props.graph]);
  const generatedViews = useMemo(() => {
    return [...props.graph.routeViews].sort((a, b) => a.title.localeCompare(b.title));
  }, [props.graph.routeViews]);
  const routeSummaries = useMemo(() => {
    return new Map(generatedViews.map((view) => {
      const route = resolveRoute(props.graph, view.route);
      return [view.path, {
        target: shortName(route.target.name),
        objects: route.nodes.length,
        tokens: formatTokenCount(route.totalTokens)
      }];
    }));
  }, [generatedViews, props.graph]);
  const grouped = useMemo(() => {
    const filter = props.treeFilter.toLowerCase();
    const groups = new Map<string, NormalizedObject[]>();
    for (const object of props.graph.objects) {
      if (!shouldShowByFilter(object, props.statusFilter, props.kindFilter, props.showArchived)) continue;
      if (filter && !`${object.name} ${object.title}`.toLowerCase().includes(filter)) continue;
      const group = treeGroupForObject(object);
      groups.set(group, [...(groups.get(group) ?? []), object]);
    }
    return [...groups.entries()].sort(([a], [b]) => groupSortKey(a).localeCompare(groupSortKey(b))).map(([group, objects]) => ({
      group,
      objects: objects.sort((a, b) => a.name.localeCompare(b.name))
    }));
  }, [props.graph.objects, props.kindFilter, props.showArchived, props.statusFilter, props.treeFilter]);
  const archivedCount = props.graph.objects.filter((object) => ["disproved", "obsolete", "archived"].includes(object.status)).length;
  const viewCount = manualViews.length + generatedViews.length;
  return (
    <aside className="left-nav" style={{ width: props.width, flexBasis: props.width }}>
      <div className="left-nav-tabs" role="tablist" aria-label="Navigation mode">
        <button className={activeTab === "views" ? "active" : ""} onClick={() => setActiveTab("views")}>
          <span>Views</span><code>{viewCount}</code>
        </button>
        <button className={activeTab === "objects" ? "active" : ""} onClick={() => setActiveTab("objects")}>
          <span>Objects</span><code>{props.graph.objects.length}</code>
        </button>
      </div>
      {activeTab === "views" ? (
        <section className="views-tab-panel">
          <div className="nav-section">
            <div className="nav-label">Manual</div>
            {manualViews.map((view) => (
              <button
                key={view.path}
                className={`view-button ${props.currentView?.path === view.path ? "active" : ""}`}
                onClick={() => props.onView(view)}
              >
                {viewIcon(view)}
                <span>{viewLabel(view)}</span>
                {view.path === props.graph.config.default_view && <span className="view-kind-badge">default</span>}
              </button>
            ))}
          </div>
          <div className="nav-section generated-view-section">
            <div className="nav-label">Generated</div>
            {generatedViews.length === 0 ? (
              <div className="nav-empty">No generated views.</div>
            ) : generatedViews.map((view) => {
              const summary = routeSummaries.get(view.path);
              return (
                <button
                  key={view.path}
                  className={`view-button generated ${props.currentRouteView?.path === view.path ? "active" : ""}`}
                  onClick={() => props.onRouteView(view)}
                >
                  <FileText size={13} />
                  <span className="view-button-main">
                    <b>{view.title}</b>
                    {summary && <small>{summary.target} · {summary.objects} objects · {summary.tokens} tokens</small>}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="command-hint">Find any object with Cmd/Ctrl+K.</div>
        </section>
      ) : (
        <>
          <section className="filter-input-wrap">
            <Search size={14} />
            <input value={props.treeFilter} onChange={(event) => props.setTreeFilter(event.target.value)} placeholder="Filter objects..." />
          </section>
          <section className="tree-section">
            {grouped.length === 0 ? (
              <div className="tree-empty">No matching objects.</div>
            ) : grouped.map((group) => (
              <div className="tree-group" key={group.group}>
                <div className="tree-group-label">{group.group}</div>
                {group.objects.map((object) => (
                  <button
                    key={object.uid}
                    className={`tree-item ${props.selectedUid === object.uid ? "selected" : ""} ${["disproved", "obsolete", "archived"].includes(object.status) ? "faded" : ""}`}
                    data-object-uid={object.uid}
                    onClick={() => props.onOpenFull(object)}
                    title="Open full page"
                  >
                    <span className="status-dot" style={{ background: statusColor(object.status) }} />
                    <span className="kind-mini">{kindIcon(object.kind, 12)}</span>
                    <span className="tree-short">{shortName(object.name)}</span>
                  </button>
                ))}
              </div>
            ))}
          </section>
          <button className="archived-toggle" onClick={() => props.setShowArchived(!props.showArchived)}>
            {props.showArchived ? "Hide" : "Show"} archived & obsolete ({archivedCount})
          </button>
        </>
      )}
    </aside>
  );
}

function CommandPalette(props: {
  graph: NormalizedGraph;
  currentView?: AtlasView;
  currentRouteView?: AtlasRouteView;
  selectedUid?: string;
  onClose: () => void;
  onView: (view: AtlasView) => void;
  onRouteView: (view: AtlasRouteView) => void;
  onOpenFull: (object: NormalizedObject) => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const manualViews = useMemo(() => {
    return [...props.graph.views].sort((a, b) => viewSortKey(props.graph, a).localeCompare(viewSortKey(props.graph, b)));
  }, [props.graph]);
  const generatedViews = useMemo(() => {
    return [...props.graph.routeViews].sort((a, b) => a.title.localeCompare(b.title));
  }, [props.graph.routeViews]);
  const routeSummaries = useMemo(() => {
    return new Map(generatedViews.map((view) => {
      const route = resolveRoute(props.graph, view.route);
      return [view.path, {
        target: shortName(route.target.name),
        objects: route.nodes.length,
        tokens: formatTokenCount(route.totalTokens)
      }];
    }));
  }, [generatedViews, props.graph]);
  const normalizedQuery = query.trim().toLowerCase();
  const showShortcuts = normalizedQuery === ">key" || normalizedQuery === ">keys" || normalizedQuery.startsWith(">key ");
  const objectResults = useMemo(() => {
    if (showShortcuts) return [];
    return props.graph.objects
      .filter((object) => {
        if (!normalizedQuery) return true;
        return `${object.name} ${object.title} ${object.role}`.toLowerCase().includes(normalizedQuery);
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 10);
  }, [normalizedQuery, props.graph.objects, showShortcuts]);
  const manualResults = manualViews.filter((view) => {
    if (showShortcuts) return false;
    if (!normalizedQuery) return true;
    return `${viewLabel(view)} ${view.path}`.toLowerCase().includes(normalizedQuery);
  }).slice(0, 5);
  const generatedResults = generatedViews.filter((view) => {
    if (showShortcuts) return false;
    const summary = routeSummaries.get(view.path);
    if (!normalizedQuery) return true;
    return `${view.title} ${view.path} ${summary?.target ?? ""}`.toLowerCase().includes(normalizedQuery);
  }).slice(0, 5);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const empty = !showShortcuts && objectResults.length === 0 && manualResults.length === 0 && generatedResults.length === 0;
  return (
    <div className="command-overlay" onMouseDown={props.onClose}>
      <section className="command-panel" onMouseDown={(event) => event.stopPropagation()}>
        <div className="command-search">
          <Search size={15} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Jump to a view or object. Type >key for shortcuts..."
          />
          <kbd>Esc</kbd>
        </div>
        {empty ? (
          <div className="command-empty">No matching commands.</div>
        ) : (
          <div className="command-results">
            {showShortcuts && (
              <div className="command-group">
                <div className="command-group-label">Keyboard Shortcuts</div>
                {SHORTCUTS.map((shortcut) => (
                  <div className="command-row shortcut-row" key={shortcut.keys}>
                    <kbd>{shortcut.keys}</kbd>
                    <span>
                      <b>{shortcut.action}</b>
                    </span>
                  </div>
                ))}
              </div>
            )}
            {manualResults.length > 0 && (
              <div className="command-group">
                <div className="command-group-label">Manual Views</div>
                {manualResults.map((view) => (
                  <button
                    key={view.path}
                    className={`command-row ${props.currentView?.path === view.path ? "active" : ""}`}
                    onClick={() => props.onView(view)}
                  >
                    {viewIcon(view)}
                    <span>
                      <b>{viewLabel(view)}</b>
                      <small>{view.path === props.graph.config.default_view ? "default view" : view.path}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {generatedResults.length > 0 && (
              <div className="command-group">
                <div className="command-group-label">Generated Views</div>
                {generatedResults.map((view) => {
                  const summary = routeSummaries.get(view.path);
                  return (
                    <button
                      key={view.path}
                      className={`command-row ${props.currentRouteView?.path === view.path ? "active" : ""}`}
                      onClick={() => props.onRouteView(view)}
                    >
                      <FileText size={14} />
                      <span>
                        <b>{view.title}</b>
                        <small>{summary ? `${summary.target} · ${summary.objects} objects · ${summary.tokens} tokens` : view.path}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {objectResults.length > 0 && (
              <div className="command-group">
                <div className="command-group-label">Objects</div>
                {objectResults.map((object) => (
                  <button
                    key={object.uid}
                    className={`command-row ${props.selectedUid === object.uid ? "active" : ""}`}
                    onClick={() => props.onOpenFull(object)}
                  >
                    <span className="status-dot" style={{ background: statusColor(object.status) }} />
                    <span>
                      <b>{object.title}</b>
                      <small>{shortName(object.name)} · {object.role}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function ViewPane(props: {
  graph: NormalizedGraph;
  view: AtlasView;
  bodyCache: BodyCache;
  ensureBody: (uid: string) => Promise<void>;
  expanded: Set<string>;
  collapsed: Set<string>;
  setExpanded: (value: Set<string>) => void;
  setCollapsed: (value: Set<string>) => void;
  statusFilter: Set<ObjectStatus>;
  kindFilter: Set<ObjectKind>;
  showArchived: boolean;
  selectedUid?: string;
  onSelect: (object: NormalizedObject) => void;
  onOpenSide: (object: NormalizedObject) => void;
  onOpenFull: (object: NormalizedObject) => void;
  onOpenPreview: (object: NormalizedObject) => void;
  onCopy: (object: NormalizedObject) => Promise<void>;
  copiedUid: string | null;
}) {
  const isDashboard = props.view.path === props.graph.config.default_view;
  if (isDashboard) return <DashboardPane {...props} />;
  return (
    <div className="reading-shell">
      <div className="view-kicker">{`${props.view.title} view`}</div>
      <h1>{props.view.title}</h1>
      <p className="view-subtitle">A local object route through the mathematical graph.</p>
      {props.view.items.map((item, index) => (
        <ViewItemRenderer key={`${props.view.path}-${index}`} {...props} item={item} />
      ))}
    </div>
  );
}

function GeneratedRoutePane(props: {
  graph: NormalizedGraph;
  routeView: AtlasRouteView;
  bodyCache: BodyCache;
  ensureBody: (uid: string) => Promise<void>;
  selectedUid?: string;
  onSelect: (object: NormalizedObject) => void;
  onOpenFull: (object: NormalizedObject) => void;
}) {
  const routeUiKey = `proof-atlas:route-ui:${props.graph.root}:${props.routeView.path}`;
  const initialRouteUi = readRoutePaneUiState(routeUiKey);
  const [tab, setTab] = useState<RoutePaneTab>(initialRouteUi.tab === "narrative" ? "narrative" : "tree");
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => new Set());
  const pendingClick = useRef<number | undefined>(undefined);
  const resolved = useMemo(() => resolveRoute(props.graph, props.routeView.route), [props.graph, props.routeView]);
  const proofTree = useMemo(() => deriveRouteProofTree(resolved, props.graph), [props.graph, resolved]);
  const routeStatusLabel = proofTree.openNodes.length > 0
    ? `open at ${shortName(proofTree.openNodes[0].object.name)}${proofTree.openNodes.length > 1 ? ` +${proofTree.openNodes.length - 1}` : ""}`
    : resolved.closed && resolved.contentSufficient ? "closed" : "diagnostics";
  const proofChoiceCount = Object.keys(resolved.selectedProofs).length;
  const narrativeNotes = useMemo(() => {
    const relatedNames = new Set([
      resolved.target.name,
      proofTree.selectedRootProof?.name
    ].filter((name): name is string => Boolean(name)));
    return props.graph.objects
      .filter((object) => object.kind === "note" && object.role === "external_context")
      .filter((object) => (object.edges.related_to ?? []).some((ref) => relatedNames.has(ref.target)))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [props.graph.objects, proofTree.selectedRootProof?.name, resolved.target.name]);
  const objectForDiagnostic = (item: RouteDiagnostic): NormalizedObject | undefined => {
    const candidate = item.objectName ?? item.target;
    if (!candidate) return undefined;
    const aliasUid = props.graph.aliases[candidate];
    return props.graph.objectsByName[candidate] ?? props.graph.objectsByUid[candidate] ?? (aliasUid ? props.graph.objectsByUid[aliasUid] : undefined);
  };
  const diagnosticItemKey = (item: RouteDiagnostic): string => {
    return [item.severity, item.code, item.objectName ?? "", item.target ?? "", item.message].join(":");
  };
  useEffect(() => () => {
    if (pendingClick.current !== undefined) window.clearTimeout(pendingClick.current);
  }, []);
  useEffect(() => {
    const stored = readRoutePaneUiState(routeUiKey);
    setTab(stored.tab === "narrative" ? "narrative" : "tree");
  }, [routeUiKey]);
  useEffect(() => {
    writeRoutePaneUiState(routeUiKey, { tab });
  }, [routeUiKey, tab]);
  useEffect(() => {
    setExpandedNodes(new Set(proofTree.defaultExpandedNodeIds));
  }, [proofTree.defaultExpandedNodeIds, routeUiKey]);
  useEffect(() => {
    if (tab !== "narrative") return;
    for (const note of narrativeNotes) void props.ensureBody(note.uid);
  }, [narrativeNotes, props.ensureBody, tab]);
  const clearPendingClick = () => {
    if (pendingClick.current !== undefined) {
      window.clearTimeout(pendingClick.current);
      pendingClick.current = undefined;
    }
  };
  const handleGeneratedClick = (event: ReactMouseEvent<Element>, object: NormalizedObject) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.detail >= 2) {
      clearPendingClick();
      return;
    }
    clearPendingClick();
    pendingClick.current = window.setTimeout(() => {
      props.onSelect(object);
      pendingClick.current = undefined;
    }, 180);
  };
  const handleGeneratedDoubleClick = (event: ReactMouseEvent<Element>, object: NormalizedObject) => {
    event.preventDefault();
    event.stopPropagation();
    clearPendingClick();
    props.onOpenFull(object);
  };
  const handleGeneratedKeyDown = (event: ReactKeyboardEvent<Element>, object: NormalizedObject) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    props.onSelect(object);
  };
  const toggleProofTreeNode = (id: string) => {
    setExpandedNodes((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const copyCommand = async (command: string) => {
    await navigator.clipboard?.writeText(command).catch(() => undefined);
  };
  const routeCommand = `npm run atlas -- route ${props.routeView.path} ${props.graph.root}`;
  const exportCommand = `npm run atlas -- export ${props.routeView.path} ${props.graph.root} --format markdown`;
  const localAiRequest = [
    `Inspect the Proof Atlas generated route ${props.routeView.path}.`,
    `Project: ${props.graph.root}`,
    `Target: ${resolved.target.name}`,
    `Run: ${routeCommand}`,
    `Cloud context: ${exportCommand}`
  ].join("\n");

  const renderTreeNode = (node: ProofTreeNode): ReactNode => {
    const hasChildren = node.children.length > 0;
    const expanded = expandedNodes.has(node.id);
    const roleLabel = node.role.replaceAll("_", " ");
    return (
      <div
        key={node.id}
        className={`proof-tree-node depth-${node.depth} role-${node.role} ${props.selectedUid === node.object.uid ? "selected" : ""}`}
        style={{ "--proof-tree-depth": node.depth } as CSSProperties}
      >
        <div
          className="proof-tree-row"
          data-object-name={node.object.name}
          data-object-uid={node.object.uid}
        >
          <button
            className="proof-tree-toggle"
            type="button"
            data-object-link-ignore="true"
            disabled={!hasChildren}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${node.object.title}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              toggleProofTreeNode(node.id);
            }}
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            {hasChildren && <ChevronDown size={14} className={expanded ? "open" : ""} />}
          </button>
          <button
            type="button"
            className="proof-tree-content"
            onClick={(event) => handleGeneratedClick(event, node.object)}
            onDoubleClick={(event) => handleGeneratedDoubleClick(event, node.object)}
            onKeyDown={(event) => handleGeneratedKeyDown(event, node.object)}
          >
            <span className="status-dot" style={{ background: statusColor(node.object.status) }} />
            <span className="proof-tree-title">
              <b>{node.object.title}</b>
              <code>{node.object.name}</code>
            </span>
            <span className="route-chip route-chip-class">{node.object.display_as}</span>
            <span className={`route-chip route-chip-decision role-${node.role}`}>{roleLabel}</span>
            {node.routeNode && <span className="route-chip route-chip-representation">{node.routeNode.representation}</span>}
          </button>
        </div>
        {expanded && hasChildren && <div className="proof-tree-children">{node.children.map(renderTreeNode)}</div>}
      </div>
    );
  };

  const renderContextNode = (node: ResolvedRouteNode) => (
    <button
      key={node.object.uid}
      type="button"
      className={`generated-node-row inclusion-${node.inclusionClass} ${props.selectedUid === node.object.uid ? "selected" : ""}`}
      data-object-name={node.object.name}
      data-object-uid={node.object.uid}
      onClick={(event) => handleGeneratedClick(event, node.object)}
      onDoubleClick={(event) => handleGeneratedDoubleClick(event, node.object)}
    >
      <span className="status-dot" style={{ background: statusColor(node.object.status) }} />
      <span className="generated-node-title">{node.object.title}</span>
      <code>{shortName(node.object.name)}</code>
      <span className="route-chip route-chip-class">{node.inclusionClass}</span>
      <span className="route-chip route-chip-representation">{node.representation}</span>
    </button>
  );

  return (
    <div className="reading-shell generated-view">
      <div className="view-kicker">Generated View</div>
      <div className="generated-heading">
        <div>
          <h1>{props.routeView.title}</h1>
          <p className="view-subtitle"><code>{resolved.target.name}</code> · proof tree · {routeStatusLabel}</p>
        </div>
        <div className="generated-actions">
          <button
            className="toolbar-button"
            title="Copy the CLI command that resolves this generated route."
            onClick={() => void copyCommand(routeCommand)}
          >
            <Copy size={13} /> Route
          </button>
          <button
            className="toolbar-button"
            title="Copy a local-AI prompt with this project and route context."
            onClick={() => void copyCommand(localAiRequest)}
          >
            <Copy size={13} /> Local AI
          </button>
          <button
            className="toolbar-button"
            title="Copy the CLI command that exports this route as Markdown."
            onClick={() => void copyCommand(exportCommand)}
          >
            <Copy size={13} /> Export
          </button>
        </div>
      </div>
      <div className="route-summary-strip" aria-label="Route summary">
        <span><b>Route</b><code>{resolved.closed && resolved.contentSufficient ? "closed" : "open"}</code></span>
        <span><b>Target status</b><code>{resolved.target.status}</code></span>
        <span><b>Boundary</b><code>{resolved.boundaries.length}</code></span>
        <span><b>Proof choices</b><code>{proofChoiceCount}</code></span>
        <span><b>Diagnostics</b><code>{resolved.diagnostics.length}</code></span>
        <span><b>Tokens</b><code>{formatTokenCount(resolved.totalTokens)}</code></span>
      </div>
      <div className="segmented-control">
        <button className={tab === "tree" ? "active" : ""} onClick={() => setTab("tree")}>Proof Tree</button>
        <button className={tab === "narrative" ? "active" : ""} onClick={() => setTab("narrative")}>Narrative</button>
      </div>

      {(proofTree.openNodes.length > 0 || !resolved.contentSufficient) && (
        <div className="route-open-banner">
          <AlertTriangle size={15} />
          {proofTree.openNodes.length > 0 ? (
            <span>
              Route is open at{" "}
              {proofTree.openNodes.map((node, index) => (
                <span key={node.object.uid}>
                  {index > 0 && ", "}
                  <button type="button" onClick={() => props.onSelect(node.object)}>{shortName(node.object.name)}</button>
                </span>
              ))}
              .
            </span>
          ) : (
            <span>Route has blocking diagnostics.</span>
          )}
        </div>
      )}

      {resolved.diagnostics.length > 0 && (
        <div className="route-diagnostics">
          {resolved.diagnostics.map((item) => {
            const object = objectForDiagnostic(item);
            const label = `${item.code}: ${item.message}`;
            if (!object) {
              return <div key={diagnosticItemKey(item)} className={item.severity}>{label}</div>;
            }
            return (
              <button
                key={diagnosticItemKey(item)}
                type="button"
                className={item.severity}
                data-object-name={object.name}
                data-object-uid={object.uid}
                title={`Show ${object.title} in the detail panel`}
                onClick={() => props.onSelect(object)}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {tab === "tree" ? (
        <div className="generated-proof-tree">
          <div className="proof-tree-actions">
            <button className="toolbar-button" onClick={() => setExpandedNodes(new Set(proofTree.mainPathNodeIds))}>Expand main path</button>
            <button className="toolbar-button" onClick={() => setExpandedNodes(new Set())}>Collapse all</button>
          </div>
          <div className="proof-tree">
            {renderTreeNode(proofTree.root)}
          </div>
          {proofTree.foundationNodes.length > 0 && (
            <details className="generated-context-section">
              <summary>
                <span className="proof-tree-toggle generated-context-toggle" aria-hidden="true">
                  <ChevronDown size={14} />
                </span>
                <span className="generated-context-title">Foundation / context</span>
                <code>{proofTree.foundationNodes.length} context</code>
              </summary>
              <div className="generated-node-list">
                {proofTree.foundationNodes.map(renderContextNode)}
              </div>
            </details>
          )}
        </div>
      ) : (
        <div className="generated-narrative">
          {narrativeNotes.length === 0 ? (
            <div className="empty-state">No narrative note is related to this route target or selected proof.</div>
          ) : (
            narrativeNotes.map((note) => (
              <section className="narrative-note" key={note.uid} data-object-uid={note.uid}>
                <div className="generated-section-heading">
                  <h2>{note.title}</h2>
                  <button type="button" className="toolbar-button" onClick={() => props.onSelect(note)}>Details</button>
                </div>
                <MarkdownBody
                  graph={props.graph}
                  object={note}
                  files={props.bodyCache[note.uid]}
                  onSelect={props.onSelect}
                  onOpenPreview={props.onSelect}
                />
              </section>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function DashboardPane(props: Parameters<typeof ViewPane>[0]) {
  const sections = useMemo(() => {
    const out: Record<string, NormalizedObject[]> = {};
    let section = "";
    for (const item of props.view.items) {
      if (item.type === "heading" && item.level > 1) {
        section = item.text.toLowerCase();
        continue;
      }
      if (item.type !== "embed" || !item.uid) continue;
      const object = props.graph.objectsByUid[item.uid];
      if (!object) continue;
      out[section] = [...(out[section] ?? []), object];
    }
    return out;
  }, [props.graph.objectsByUid, props.view.items]);

  const question = sections["the question"]?.[0]
    ?? props.graph.objects.find((object) => object.role === "problem" && object.importance === "main")
    ?? props.graph.objects.find((object) => object.role === "problem");
  const mainResult = sections["main result"]?.[0]
    ?? props.graph.objects.find((object) => object.importance === "main" && object.role === "claim");
  const currentProof = sections["current proof route"]?.[0]
    ?? props.graph.objects.find((object) => object.importance === "main" && object.role === "proof");
  const issueSeed = sections["open issues"] ?? [];
  const openIssues = [
    ...issueSeed,
    ...props.graph.objects.filter((object) => object.kind === "issue" && object.status === "open")
  ].filter((object, index, list) => list.findIndex((item) => item.uid === object.uid) === index);

  useEffect(() => {
    if (question) void props.ensureBody(question.uid);
  }, [props.ensureBody, question]);

  const toggleObject = (object: NormalizedObject, isExpanded: boolean) => {
    const next = nextObjectExpansionState(object.uid, isExpanded, props.expanded, props.collapsed);
    if (!isExpanded) void props.ensureBody(object.uid);
    props.setExpanded(next.expanded);
    props.setCollapsed(next.collapsed);
  };

  const renderCard = (object: NormalizedObject, forceExpanded = false) => {
    const isExpanded = isObjectCardExpanded({
      collapsed: props.collapsed,
      defaultExpanded: defaultExpanded(object),
      expanded: props.expanded,
      forceExpanded,
      uid: object.uid
    });
    return (
      <ObjectCard
        graph={props.graph}
        object={object}
        body={props.bodyCache[object.uid]}
        expanded={isExpanded}
        selected={props.selectedUid === object.uid}
        ensureBody={props.ensureBody}
        onToggle={() => toggleObject(object, isExpanded)}
        onSelect={props.onSelect}
        onOpenSide={props.onOpenSide}
        onOpenFull={props.onOpenFull}
        onOpenPreview={props.onOpenPreview}
        onCopy={props.onCopy}
        copied={props.copiedUid === object.uid}
      />
    );
  };

  const recentRows = props.graph.objects
    .filter((object) => object.status !== "draft")
    .slice(0, 5)
    .map((object) => ({
      object,
      from: object.status === "checked" ? "needs_check" : object.status === "open" ? "draft" : "draft",
      to: object.status
    }));

  return (
    <div className="reading-shell dashboard">
      <div className="view-kicker">Dashboard</div>
      <h1>{props.graph.config.title}</h1>

      {question && (
        <>
          <DashboardLabel>The question</DashboardLabel>
          <div className="dashboard-question">
            <DashboardQuestionBody
              graph={props.graph}
              object={question}
              files={props.bodyCache[question.uid]}
              onSelect={props.onOpenSide}
              onOpenPreview={props.onOpenPreview}
            />
          </div>
        </>
      )}

      {mainResult && (
        <>
          <DashboardLabel>Main result</DashboardLabel>
          <div className="dashboard-card-slot">{renderCard(mainResult, true)}</div>
        </>
      )}

      {currentProof && (
        <>
          <DashboardLabel>Current proof route</DashboardLabel>
          <div className="dashboard-card-slot">{renderCard(currentProof)}</div>
        </>
      )}

      <DashboardLabel>Open issues</DashboardLabel>
      <div className="issue-list">
        {openIssues.length === 0 ? (
          <div className="issue-empty"><span /> All issues resolved - proof route is unblocked.</div>
        ) : openIssues.map((issue) => (
          <button className="issue-row" key={issue.uid} onClick={() => props.onSelect(issue)}>
            <span className="issue-dot" />
            <b>{issue.priority ?? "open"}</b>
            <strong>{issue.title}</strong>
            <code>blocks {shortName(edgeTargets(issue.edges.blocks)[0] ?? "")}</code>
          </button>
        ))}
      </div>

      {recentRows.length > 0 && (
        <>
          <DashboardLabel>Recent changes</DashboardLabel>
          <div className="recent-list">
            {recentRows.map(({ object, from, to }) => (
              <button key={object.uid} className="recent-row" onClick={() => props.onOpenFull(object)}>
                <span>{shortName(object.name)}</span>
                <em style={{ color: statusColor(from as ObjectStatus) }}>{from}</em>
                <i>{"->"}</i>
                <b style={{ color: statusColor(to) }}>{to}</b>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DashboardLabel(props: { children: ReactNode }) {
  return <div className="dashboard-label">{props.children}</div>;
}

function DashboardQuestionBody(props: {
  graph: NormalizedGraph;
  object: NormalizedObject;
  files?: BodyFile[];
  onSelect: (object: NormalizedObject) => void;
  onOpenPreview: (object: NormalizedObject) => void;
}) {
  if (!props.files) return <div className="body-loading">Loading body...</div>;
  let firstBlock = true;
  return (
    <LinkedProse
      graph={props.graph}
      onSelect={props.onSelect}
      onOpenPreview={props.onOpenPreview}
    >
      {props.files.map((file) => (
        <div className="body-file" key={file.file}>
          {file.blocks.map((block) => {
            const html = firstBlock ? emphasizeFirstOccurrence(block.html, props.object.title) : block.html;
            firstBlock = false;
            return (
              <div
                key={`${file.file}-${block.id}`}
                data-source-file={block.file}
                data-block-id={block.id}
                data-block-kind={block.kind}
                data-excerpt={block.excerpt}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            );
          })}
        </div>
      ))}
    </LinkedProse>
  );
}

function ViewItemRenderer(props: Parameters<typeof ViewPane>[0] & { item: ViewItem }) {
  if (props.item.type === "heading") {
    if (props.item.level === 1) return null;
    return (
      <div className="view-heading">
        <span>Section</span>
        <h2>{props.item.text}</h2>
      </div>
    );
  }
  if (props.item.type === "markdown") {
    return (
      <LinkedProse
        graph={props.graph}
        className="prose view-markdown"
        html={props.item.html}
        onSelect={props.onOpenSide}
        onOpenPreview={props.onOpenPreview}
      />
    );
  }
  const object = props.item.uid ? props.graph.objectsByUid[props.item.uid] : undefined;
  if (!object) {
    return <div className="missing-embed">Missing embed: {props.item.target}</div>;
  }
  if (!shouldShowByFilter(object, props.statusFilter, props.kindFilter, props.showArchived)) {
    return (
      <button className="filtered-placeholder" onClick={() => {
        props.setExpanded(new Set([...props.expanded, object.uid]));
        const nextCollapsed = new Set(props.collapsed);
        nextCollapsed.delete(object.uid);
        props.setCollapsed(nextCollapsed);
      }}>
        <span className="status-dot" style={{ background: statusColor(object.status) }} />
        1 {object.status} object hidden - {shortName(object.name)} · show
      </button>
    );
  }
  const isExpanded = isObjectCardExpanded({
    collapsed: props.collapsed,
    defaultExpanded: defaultExpanded(object, props.item),
    expanded: props.expanded,
    uid: object.uid
  });
  return (
    <ObjectCard
      graph={props.graph}
      object={object}
      body={props.bodyCache[object.uid]}
      expanded={isExpanded}
      selected={props.selectedUid === object.uid}
      ensureBody={props.ensureBody}
      onToggle={() => {
        const next = nextObjectExpansionState(object.uid, isExpanded, props.expanded, props.collapsed);
        if (!isExpanded) void props.ensureBody(object.uid);
        props.setExpanded(next.expanded);
        props.setCollapsed(next.collapsed);
      }}
      onSelect={props.onSelect}
      onOpenSide={props.onOpenSide}
      onOpenFull={props.onOpenFull}
      onOpenPreview={props.onOpenPreview}
      onCopy={props.onCopy}
      copied={props.copiedUid === object.uid}
    />
  );
}

function ObjectCard(props: {
  graph: NormalizedGraph;
  object: NormalizedObject;
  body?: BodyFile[];
  expanded: boolean;
  selected: boolean;
  ensureBody: (uid: string) => Promise<void>;
  onToggle: () => void;
  onSelect: (object: NormalizedObject) => void;
  onOpenSide: (object: NormalizedObject) => void;
  onOpenFull: (object: NormalizedObject) => void;
  onOpenPreview: (object: NormalizedObject) => void;
  onCopy: (object: NormalizedObject) => Promise<void>;
  copied: boolean;
}) {
  useEffect(() => {
    if (props.expanded) void props.ensureBody(props.object.uid);
  }, [props.expanded, props.ensureBody, props.object.uid]);
  const blockers = (props.object.reverseEdges.blocked_by ?? [])
    .map((name) => props.graph.objectsByName[name])
    .filter((object): object is NormalizedObject => Boolean(object) && object.status === "open");
  const isProof = props.object.role === "proof" || props.object.role === "proof_fragment";
  const cardBody = props.expanded ? (
    <MarkdownBody
      graph={props.graph}
      object={props.object}
      files={props.body}
      onSelect={props.onOpenSide}
      onOpenPreview={props.onOpenPreview}
    />
  ) : (
    <ObjectSummary
      graph={props.graph}
      object={props.object}
      isProof={isProof}
      onToggle={props.onToggle}
      onSelect={props.onOpenSide}
      onOpenPreview={props.onOpenPreview}
    />
  );
  return (
    <article
      className={`object-card ${props.selected ? "selected" : ""} ${props.object.status === "disproved" ? "disproved" : ""}`}
      data-object-uid={props.object.uid}
    >
      {props.object.status === "disproved" && (
        <button className="false-banner" onClick={() => (props.object.reverseEdges.replaced_by ?? []).map((name) => props.graph.objectsByName[name]).find(Boolean) && props.onSelect(props.graph.objectsByName[(props.object.reverseEdges.replaced_by ?? [])[0]])}>
          Marked as DISPROVED - superseded by {(props.object.reverseEdges.replaced_by ?? [])[0] ?? "replacement"}
        </button>
      )}
      <div className="card-header" onClick={() => props.onSelect(props.object)} style={{ borderLeftColor: statusColor(props.object.status) }}>
        <div className="card-title-block">
          <div className="card-meta">
            <span className="card-kind-icon" style={{ color: statusColor(props.object.status) }}>{kindIcon(props.object.kind, 13)}</span>
            <span>{props.object.display_as.replaceAll("_", " ").toUpperCase()}</span>
            {props.object.importance === "main" && <b>MAIN</b>}
          </div>
          <h2>{props.object.title}</h2>
        </div>
        <div className="card-actions">
          <button title="Copy local AI reference" onClick={(event) => { event.stopPropagation(); void props.onCopy(props.object); }}>
            {props.copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <span className="status-badge" style={{ background: statusColor(props.object.status) }}>{props.object.status}</span>
          <button onClick={(event) => { event.stopPropagation(); props.onToggle(); }} className={`chevron ${props.expanded ? "open" : ""}`}>
            <ChevronDown size={16} />
          </button>
        </div>
      </div>
      {blockers.length > 0 && (
        <button className="blocked-banner" onClick={() => props.onSelect(blockers[0])}>
          <AlertTriangle size={14} /> Blocked by: {blockers[0].title}
        </button>
      )}
      <div className="card-body">{cardBody}</div>
    </article>
  );
}

function ObjectSummary(props: {
  graph: NormalizedGraph;
  object: NormalizedObject;
  isProof: boolean;
  onToggle: () => void;
  onSelect: (object: NormalizedObject) => void;
  onOpenPreview: (object: NormalizedObject) => void;
}) {
  const html = renderObjectSummaryHtml(props.object, props.graph);
  return (
    <div className="card-summary">
      {html ? (
        <LinkedProse
          graph={props.graph}
          className="card-summary-markdown prose"
          html={html}
          onSelect={props.onSelect}
          onOpenPreview={props.onOpenPreview}
        />
      ) : (
        <span>{props.isProof ? "Proof details are folded until needed." : "Open the card to read this object."}</span>
      )}
      {props.isProof && <button onClick={props.onToggle}>Show proof ({edgeTargets(props.object.edges.uses).length} uses) <ChevronDown size={13} /></button>}
    </div>
  );
}

function MarkdownBody(props: {
  graph: NormalizedGraph;
  object: NormalizedObject;
  files?: BodyFile[];
  onSelect: (object: NormalizedObject) => void;
  onOpenPreview: (object: NormalizedObject) => void;
}) {
  if (!props.files) return <div className="body-loading">Loading body...</div>;
  return (
    <LinkedProse
      graph={props.graph}
      onSelect={props.onSelect}
      onOpenPreview={props.onOpenPreview}
    >
      {props.files.map((file) => (
        <div className="body-file" key={file.file}>
          {props.files!.length > 1 && <div className="body-file-label">{file.file}</div>}
          {file.blocks.map((block) => (
            <div
              key={`${file.file}-${block.id}`}
              data-source-file={block.file}
              data-block-id={block.id}
              data-block-kind={block.kind}
              data-excerpt={block.excerpt}
              dangerouslySetInnerHTML={{ __html: block.html }}
            />
          ))}
        </div>
      ))}
    </LinkedProse>
  );
}

function DetailPanel(props: {
  graph: NormalizedGraph;
  object: NormalizedObject;
  body?: BodyFile[];
  ensureBody: (uid: string) => Promise<void>;
  width: number;
  onClose: () => void;
  onHistoryBack: () => void;
  onHistoryForward: () => void;
  onSelect: (object: NormalizedObject) => void;
  onOpenFull: (object: NormalizedObject) => void;
  onOpenPreview: (object: NormalizedObject) => void;
  onCopy: (object: NormalizedObject) => Promise<void>;
  copied: boolean;
  routeNode?: ResolvedRouteNode;
  routeDiagnostics?: RouteDiagnostic[];
}) {
  useEffect(() => {
    void props.ensureBody(props.object.uid);
  }, [props.ensureBody, props.object.uid]);

  return (
    <aside
      className="detail-panel"
      data-object-uid={props.object.uid}
      style={{ width: props.width, flexBasis: props.width }}
    >
      <div className="detail-head">
        <div className="detail-title-row">
          <h2>{props.object.title}</h2>
          <div className="detail-actions">
            <button className="icon-button" title="Back" onClick={props.onHistoryBack}><ArrowLeft size={16} /></button>
            <button className="icon-button" title="Forward" onClick={props.onHistoryForward}><ArrowRight size={16} /></button>
            <button className="icon-button" title={props.copied ? "Copied" : "Copy local AI reference"} onClick={() => void props.onCopy(props.object)}>
              {props.copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
            <button className="icon-button" title="Open full page" onClick={() => props.onOpenFull(props.object)}><Maximize2 size={16} /></button>
            <button className="icon-button" title="Close details" onClick={props.onClose}><X size={16} /></button>
          </div>
        </div>
        <div className="detail-badges">
          <span className="status-badge" style={{ background: statusColor(props.object.status) }}>{props.object.status}</span>
          <span>{props.object.importance}</span>
          {props.object.priority && <b>priority: {props.object.priority}</b>}
        </div>
        <ObjectFactChips object={props.object} />
      </div>
      <div className="detail-section">
        <div className="detail-label">Rendered content</div>
        <div className="detail-preview">
          <MarkdownBody
            graph={props.graph}
            object={props.object}
            files={props.body}
            onSelect={props.onOpenPreview}
            onOpenPreview={props.onSelect}
          />
        </div>
      </div>
      {props.routeNode && (
        <RouteInclusionPanel node={props.routeNode} diagnostics={props.routeDiagnostics ?? []} />
      )}
      <RelationList graph={props.graph} object={props.object} onSelect={props.onSelect} onOpenPreview={props.onOpenPreview} />
      <div className="detail-section">
        <div className="detail-label">Body files</div>
        {props.object.body.map((file) => <code className="body-chip" key={file}>{file}</code>)}
      </div>
      <div className="identity-box">
        <span>name</span><code>{props.object.name}</code>
        <span>uid</span><code>{props.object.uid}</code>
        <span>path</span><code>{props.object.path}/</code>
        {originLabel(props.object) && (
          <>
            <span>origin</span><code>{originLabel(props.object)}</code>
          </>
        )}
        {props.object.citation && (
          <>
            <span>bibkey</span><code>{props.object.citation.bibkey}</code>
          </>
        )}
      </div>
    </aside>
  );
}

function RouteInclusionPanel(props: { node: ResolvedRouteNode; diagnostics: RouteDiagnostic[] }) {
  const cost = props.node.marginalCost;
  const marginal = [
    cost.downgrade_to_statement !== undefined ? `statement ${cost.downgrade_to_statement >= 0 ? "-" : "+"}${Math.abs(cost.downgrade_to_statement)}` : undefined,
    cost.downgrade_to_summary !== undefined ? `summary ${cost.downgrade_to_summary >= 0 ? "-" : "+"}${Math.abs(cost.downgrade_to_summary)}` : undefined,
    cost.downgrade_to_reference !== undefined ? `reference ${cost.downgrade_to_reference >= 0 ? "-" : "+"}${Math.abs(cost.downgrade_to_reference)}` : undefined,
    cost.upgrade_to_full !== undefined ? `full +${cost.upgrade_to_full}` : undefined
  ].filter(Boolean);
  return (
    <div className="detail-section route-inclusion-panel">
      <div className="detail-label">Route inclusion</div>
      <div className="route-facts">
        <span>role</span><code>{props.node.role}</code>
        <span>class</span><code>{props.node.inclusionClass}</code>
        <span>decision</span><code>{props.node.decision}</code>
        <span>representation</span><code>{props.node.representation}</code>
        <span>hardness</span><code>{props.node.hardness}</code>
        <span>depth</span><code>{props.node.depth}</code>
        <span>tokens</span><code>{props.node.marginalCost.current}</code>
      </div>
      <div className="route-witnesses">
        {props.node.witnessPaths.slice(0, 3).map((pathItems, index) => (
          <div key={`${pathItems.join("-")}-${index}`}>
            <b>{index === 0 ? "why" : "also"}</b>
            <code>{pathItems.join(" -> ")}</code>
          </div>
        ))}
        {props.node.witnessPaths.length > 3 && <small>{props.node.witnessPaths.length - 3} more witness path(s)</small>}
      </div>
      {marginal.length > 0 && (
        <div className="route-marginal">
          <b>marginal</b>
          <span>{marginal.join("; ")}</span>
        </div>
      )}
      {props.diagnostics.length > 0 && (
        <div className="route-node-diagnostics">
          {props.diagnostics.map((item) => (
            <div key={`${item.code}-${item.message}`} className={item.severity}>{item.code}: {item.message}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function RelationList(props: {
  graph: NormalizedGraph;
  object: NormalizedObject;
  onSelect: (object: NormalizedObject) => void;
  onOpenPreview: (object: NormalizedObject) => void;
}) {
  const pendingClick = useRef<number | undefined>(undefined);
  useEffect(() => () => {
    if (pendingClick.current !== undefined) window.clearTimeout(pendingClick.current);
  }, []);
  const clearPendingClick = () => {
    if (pendingClick.current !== undefined) {
      window.clearTimeout(pendingClick.current);
      pendingClick.current = undefined;
    }
  };
  const handleRelationClick = (event: ReactMouseEvent<HTMLButtonElement>, target: NormalizedObject) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.detail >= 2) {
      clearPendingClick();
      return;
    }
    clearPendingClick();
    pendingClick.current = window.setTimeout(() => {
      props.onOpenPreview(target);
      pendingClick.current = undefined;
    }, 180);
  };
  const handleRelationDoubleClick = (event: ReactMouseEvent<HTMLButtonElement>, target: NormalizedObject) => {
    event.preventDefault();
    event.stopPropagation();
    clearPendingClick();
    props.onSelect(target);
  };
  const relationRows: Array<{ label: string; target: NormalizedObject; derived: boolean }> = [];
  for (const [label, refs] of Object.entries(props.object.edges)) {
    for (const target of edgeTargets(refs)) {
      const object = props.graph.objectsByName[target];
      if (object) relationRows.push({ label, target: object, derived: false });
    }
  }
  for (const [label, targets] of Object.entries(props.object.reverseEdges)) {
    for (const target of targets ?? []) {
      const object = props.graph.objectsByName[target];
      if (object && !(label === "related_to" && relationRows.some((row) => row.label === "related_to" && row.target.uid === object.uid))) {
        relationRows.push({ label, target: object, derived: true });
      }
    }
  }
  const rows = sortRelationRows(relationRows);
  return (
    <div className="detail-section">
      <div className="detail-label">Relations</div>
      {rows.length === 0 ? <p className="muted">No relations.</p> : rows.map((row) => (
        <button
          key={`${row.label}-${row.target.uid}-${row.derived}`}
          className={`edge-row ${row.target.status === "open" ? "open" : ""}`}
          data-object-uid={row.target.uid}
          onClick={(event) => handleRelationClick(event, row.target)}
          onDoubleClick={(event) => handleRelationDoubleClick(event, row.target)}
        >
          <span>{relationLabel(row.label)} {row.derived && <em>derived</em>}</span>
          <b>{row.target.name}</b>
          <i style={{ color: statusColor(row.target.status) }}>{row.target.status}</i>
        </button>
      ))}
    </div>
  );
}

function FullObjectPage(props: {
  graph: NormalizedGraph;
  object: NormalizedObject;
  body?: BodyFile[];
  ensureBody: (uid: string) => Promise<void>;
  onSelect: (object: NormalizedObject) => void;
  onOpenSide: (object: NormalizedObject) => void;
  onOpenFull: (object: NormalizedObject) => void;
  onBack: () => void;
  onCopy: (object: NormalizedObject) => Promise<void>;
  copied: boolean;
  onOpenPreview: (object: NormalizedObject) => void;
}) {
  useEffect(() => {
    void props.ensureBody(props.object.uid);
  }, [props.ensureBody, props.object.uid]);
  const uses = [...edgeTargets(props.object.edges.requires), ...edgeTargets(props.object.edges.uses), ...edgeTargets(props.object.edges.proves)]
    .map((name) => props.graph.objectsByName[name])
    .filter((object): object is NormalizedObject => Boolean(object));
  const reverse = Object.entries(props.object.reverseEdges)
    .flatMap(([label, names]) => (names ?? []).map((name) => ({ label, object: props.graph.objectsByName[name] })))
    .filter((item): item is { label: string; object: NormalizedObject } => Boolean(item.object));
  return (
    <div className="full-page reading-shell" data-object-uid={props.object.uid}>
      <div className="breadcrumb">
        <button onClick={props.onBack}>Paper view</button>
        <span>/</span>
        <code>{props.object.name}</code>
      </div>
      <div className="full-title">
        <h1>{props.object.title}</h1>
        <div className="full-title-actions">
          <span className="status-badge" style={{ background: statusColor(props.object.status) }}>{props.object.status}</span>
          <button
            className="copy-inline"
            title={props.copied ? "Copied" : "Copy local AI reference"}
            aria-label={props.copied ? "Copied" : "Copy local AI reference"}
            onClick={() => void props.onCopy(props.object)}
          >
            {props.copied ? <Check size={14} /> : <Copy size={14} />}
            {props.copied ? "Copied" : "AI ref"}
          </button>
        </div>
      </div>
      <ObjectFactChips object={props.object} />
      <MarkdownBody
        graph={props.graph}
        object={props.object}
        files={props.body}
        onSelect={props.onOpenSide}
        onOpenPreview={props.onOpenPreview}
      />
      <div className="context-grid">
        <ContextColumn title="This object uses" items={uses} onOpen={props.onOpenSide} onPreview={props.onOpenPreview} />
        <ContextColumn title="Used by / Proved by / Blocked by" items={reverse.map((item) => item.object)} onOpen={props.onOpenSide} onPreview={props.onOpenPreview} />
      </div>
    </div>
  );
}

function ContextColumn(props: {
  title: string;
  items: NormalizedObject[];
  onOpen: (object: NormalizedObject) => void;
  onPreview?: (object: NormalizedObject) => void;
}) {
  const pendingClick = useRef<number | undefined>(undefined);
  useEffect(() => () => {
    if (pendingClick.current !== undefined) window.clearTimeout(pendingClick.current);
  }, []);
  const clearPendingClick = () => {
    if (pendingClick.current !== undefined) {
      window.clearTimeout(pendingClick.current);
      pendingClick.current = undefined;
    }
  };
  const handleClick = (event: ReactMouseEvent<HTMLButtonElement>, object: NormalizedObject) => {
    if (!props.onPreview) {
      props.onOpen(object);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.detail >= 2) {
      clearPendingClick();
      return;
    }
    clearPendingClick();
    pendingClick.current = window.setTimeout(() => {
      props.onOpen(object);
      pendingClick.current = undefined;
    }, 180);
  };
  const handleDoubleClick = (event: ReactMouseEvent<HTMLButtonElement>, object: NormalizedObject) => {
    if (!props.onPreview) return;
    event.preventDefault();
    event.stopPropagation();
    clearPendingClick();
    props.onPreview(object);
  };
  return (
    <section className="context-column">
      <h3>{props.title}</h3>
      {props.items.length === 0 ? <p className="muted">None.</p> : props.items.map((object) => (
        <button
          key={object.uid}
          data-object-uid={object.uid}
          onClick={(event) => handleClick(event, object)}
          onDoubleClick={(event) => handleDoubleClick(event, object)}
        >
          <span className="status-dot" style={{ background: statusColor(object.status) }} />
          {object.title}
        </button>
      ))}
    </section>
  );
}

function ObjectOverlay(props: {
  graph: NormalizedGraph;
  object: NormalizedObject;
  body?: BodyFile[];
  ensureBody: (uid: string) => Promise<void>;
  onClose: () => void;
  onSelect: (object: NormalizedObject) => void;
  onOpenFull: (object: NormalizedObject) => void;
  onOpenPreview: (object: NormalizedObject) => void;
  onCopy: (object: NormalizedObject) => Promise<void>;
  copied: boolean;
}) {
  useEffect(() => {
    void props.ensureBody(props.object.uid);
  }, [props.ensureBody, props.object.uid]);

  const uses = [...edgeTargets(props.object.edges.requires), ...edgeTargets(props.object.edges.uses), ...edgeTargets(props.object.edges.proves)]
    .map((name) => props.graph.objectsByName[name])
    .filter((object): object is NormalizedObject => Boolean(object));
  const reverse = Object.entries(props.object.reverseEdges)
    .flatMap(([label, names]) => (names ?? []).map((name) => ({ label, object: props.graph.objectsByName[name] })))
    .filter((item): item is { label: string; object: NormalizedObject } => Boolean(item.object));

  return (
    <div className="object-overlay" onClick={props.onClose}>
      <section
        className="object-overlay-panel"
        data-object-uid={props.object.uid}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => {
          if ((event.target as HTMLElement).closest("a, button, [data-object-name]")) return;
          props.onOpenFull(props.object);
        }}
      >
        <div className="overlay-toolbar">
          <button className="icon-button" title={props.copied ? "Copied" : "Copy local AI reference"} onClick={() => void props.onCopy(props.object)}>
            {props.copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
          <button className="icon-button" title="Open full page" onClick={() => props.onOpenFull(props.object)}><Maximize2 size={15} /></button>
          <button className="icon-button" title="Close preview" onClick={props.onClose}><X size={15} /></button>
        </div>
        <div className="overlay-content">
          <div className="overlay-heading">
            <div className="overlay-meta-row">
              <span className="overlay-kind-icon" style={{ color: statusColor(props.object.status) }}>{kindIcon(props.object.kind, 18)}</span>
              <span className="view-kicker">{props.object.display_as.replaceAll("_", " ")}</span>
              <span className="status-badge" style={{ background: statusColor(props.object.status) }}>{props.object.status}</span>
            </div>
            <h1>{props.object.title}</h1>
            <ObjectFactChips object={props.object} />
          </div>
          <MarkdownBody
            graph={props.graph}
            object={props.object}
            files={props.body}
            onSelect={props.onSelect}
            onOpenPreview={props.onOpenPreview}
          />
          <div className="context-grid overlay-context">
            <ContextColumn title="This object uses" items={uses} onOpen={props.onSelect} onPreview={props.onOpenPreview} />
            <ContextColumn title="Used by / Proved by / Blocked by" items={reverse.map((item) => item.object)} onOpen={props.onSelect} onPreview={props.onOpenPreview} />
          </div>
        </div>
      </section>
    </div>
  );
}

function Toast(props: { toast: NonNullable<Toast> }) {
  return (
    <div className="toast">
      <strong>{props.toast.title}</strong>
      <pre>{props.toast.text}</pre>
    </div>
  );
}
