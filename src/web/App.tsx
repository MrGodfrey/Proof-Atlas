import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  FileText,
  Filter,
  LayoutDashboard,
  Maximize2,
  Menu,
  NotebookText,
  Search,
  TriangleAlert,
  X
} from "lucide-react";
import { ACTIVE_STATUS, STATUS_COLORS } from "../core/constants";
import type {
  AtlasProblem,
  AtlasView,
  BodyFile,
  NormalizedGraph,
  NormalizedObject,
  ObjectKind,
  ObjectStatus,
  ViewEmbedItem,
  ViewItem
} from "../core/types";

type BodyCache = Record<string, BodyFile[]>;

type RouteState =
  | { mode: "view"; viewName: string; focus?: string; side?: string }
  | { mode: "object"; objectId: string };

type Toast = { text: string; title: string } | null;
type ResizeDrag = {
  side: "left" | "right";
  startX: number;
  startWidth: number;
} | null;

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

function defaultDetailWidth(): number {
  const availableWidth = window.innerWidth - DEFAULT_LEFT_WIDTH;
  return Math.min(MAX_DETAIL_WIDTH, Math.max(MIN_DETAIL_WIDTH, Math.round(availableWidth * DEFAULT_DETAIL_WIDTH_RATIO)));
}

function parseRoute(): RouteState {
  const path = window.location.pathname;
  if (path.startsWith("/object/")) {
    return { mode: "object", objectId: decodeURIComponent(path.slice("/object/".length)) };
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
  return { mode: "view", viewName: "dashboard" };
}

function routeView(view: AtlasView, focus?: string, side?: string): string {
  const params = new URLSearchParams();
  if (focus) params.set("focus", focus);
  if (side) params.set("side", side);
  const query = params.toString();
  return `/view/${encodeURIComponent(view.name)}${query ? `?${query}` : ""}`;
}

function objectHref(object: NormalizedObject): string {
  return `/object/${encodeURIComponent(object.uid)}`;
}

function defaultObjectForView(view: AtlasView, graph: NormalizedGraph): NormalizedObject | undefined {
  for (const item of view.items) {
    if (item.type !== "embed") continue;
    const object = item.uid ? graph.objectsByUid[item.uid] : item.name ? graph.objectsByName[item.name] : graph.objectsByName[item.target];
    if (object) return object;
  }
  return graph.objects[0];
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

function relationLabel(key: string): string {
  return key.replaceAll("_", " ").toUpperCase();
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

function linkedObjectFromTarget(target: EventTarget | null, graph: NormalizedGraph): { element: HTMLElement; object: NormalizedObject } | undefined {
  const targetElement = target instanceof Element
    ? target
    : target instanceof Node
      ? target.parentElement
      : null;
  if (!targetElement) return undefined;
  const element = targetElement.closest("[data-object-name]") as HTMLElement | null;
  if (!element) return undefined;
  const object = graph.objectsByName[element.dataset.objectName ?? ""];
  return object ? { element, object } : undefined;
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
    onClick: (event: ReactMouseEvent<HTMLElement>) => {
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
    onDoubleClick: (event: ReactMouseEvent<HTMLElement>) => {
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
  const [graph, setGraph] = useState<NormalizedGraph | null>(null);
  const [route, setRoute] = useState<RouteState>(() => parseRoute());
  const [bodyCache, setBodyCache] = useState<BodyCache>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [treeFilter, setTreeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<Set<ObjectStatus>>(() => new Set(ACTIVE_STATUS));
  const [kindFilter, setKindFilter] = useState<Set<ObjectKind>>(() => new Set(KIND_OPTIONS));
  const [showArchived, setShowArchived] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [detailDismissed, setDetailDismissed] = useState(false);
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_WIDTH);
  const [detailWidth, setDetailWidth] = useState(() => defaultDetailWidth());
  const [resizeDrag, setResizeDrag] = useState<ResizeDrag>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [buildOpen, setBuildOpen] = useState(false);
  const [buildFlash, setBuildFlash] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [overlayUid, setOverlayUid] = useState<string | null>(null);
  const [copiedUid, setCopiedUid] = useState<string | null>(null);

  const refreshGraph = useCallback(async () => {
    const response = await fetch("/api/graph", { cache: "no-store" });
    setGraph(await response.json() as NormalizedGraph);
  }, []);

  useEffect(() => {
    void refreshGraph();
    const onPop = () => setRoute(parseRoute());
    window.addEventListener("popstate", onPop);
    const events = new EventSource("/api/events");
    events.addEventListener("build", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as { type: string; problemCount?: number };
      setBuildFlash(data.type === "rebuilt" ? `Rebuilt · ${data.problemCount ?? 0} problems` : "Rebuild failed");
      setTimeout(() => setBuildFlash(null), 1800);
      setBodyCache({});
      void refreshGraph();
    });
    return () => {
      window.removeEventListener("popstate", onPop);
      events.close();
    };
  }, [refreshGraph]);

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

  const objectsByUid = graph?.objectsByUid ?? {};
  const objectsByName = graph?.objectsByName ?? {};

  const currentView = useMemo(() => {
    if (!graph) return undefined;
    if (route.mode !== "view") return graph.views.find((view) => view.path === graph.config.default_view) ?? graph.views[0];
    return graph.views.find((view) => view.name === route.viewName || titleForPath(view.path) === route.viewName)
      ?? graph.views.find((view) => view.path === graph.config.default_view)
      ?? graph.views[0];
  }, [graph, route]);

  const sideObject = route.mode === "view" && route.side
    ? (objectsByUid[route.side] ?? objectsByName[route.side])
    : undefined;
  const fullObject = route.mode === "object"
    ? (objectsByUid[route.objectId] ?? objectsByName[route.objectId])
    : undefined;
  const overlayObject = overlayUid
    ? (objectsByUid[overlayUid] ?? objectsByName[overlayUid])
    : undefined;

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

  const navigate = useCallback((url: string) => {
    setOverlayUid(null);
    window.history.pushState({}, "", url);
    setRoute(parseRoute());
  }, []);

  const selectObject = useCallback((object: NormalizedObject) => {
    if (!currentView) return;
    setFilterOpen(false);
    setBuildOpen(false);
    setDetailDismissed(false);
    navigate(routeView(currentView, object.uid, object.uid));
  }, [currentView, navigate]);

  const openFull = useCallback((object: NormalizedObject) => {
    setFilterOpen(false);
    setBuildOpen(false);
    navigate(objectHref(object));
  }, [navigate]);

  const openView = useCallback((view: AtlasView) => {
    setFilterOpen(false);
    setBuildOpen(false);
    const object = detailDismissed || !graph ? undefined : defaultObjectForView(view, graph);
    navigate(routeView(view, object?.uid, object?.uid));
  }, [detailDismissed, graph, navigate]);

  const ensureBody = useCallback(async (uid: string) => {
    if (bodyCache[uid]) return;
    const response = await fetch(`/api/object/${encodeURIComponent(uid)}/body`, { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json() as { files: BodyFile[] };
    setBodyCache((cache) => ({ ...cache, [uid]: data.files }));
  }, [bodyCache]);

  const selectObjectKeepingOverlay = useCallback((object: NormalizedObject) => {
    if (!currentView) return;
    setFilterOpen(false);
    setBuildOpen(false);
    setDetailDismissed(false);
    window.history.pushState({}, "", routeView(currentView, object.uid, object.uid));
    setRoute(parseRoute());
    void ensureBody(object.uid);
  }, [currentView, ensureBody]);

  const openOverlay = useCallback((object: NormalizedObject) => {
    setFilterOpen(false);
    setBuildOpen(false);
    setOverlayUid(object.uid);
    void ensureBody(object.uid);
  }, [ensureBody]);

  const goHistory = useCallback((delta: -1 | 1) => {
    setOverlayUid(null);
    if (delta < 0) window.history.back();
    else window.history.forward();
  }, []);

  const closeDetailPanel = useCallback(() => {
    setDetailDismissed(true);
    if (currentView) navigate(routeView(currentView, route.mode === "view" ? route.focus : undefined));
  }, [currentView, navigate, route]);

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
    const response = await fetch("/api/reference", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: object.uid, selection })
    });
    const data = await response.json() as { text: string };
    await navigator.clipboard?.writeText(data.text).catch(() => undefined);
    setCopiedUid(object.uid);
    setToast({ title: "Copied local reference", text: data.text });
    setTimeout(() => setCopiedUid(null), 1500);
    setTimeout(() => setToast(null), 3600);
  }, []);

  if (!graph) {
    return <div className="loading">Loading Proof Atlas...</div>;
  }

  const errorCount = graph.problems.filter((item) => item.severity === "error").length;
  const warningCount = graph.problems.filter((item) => item.severity === "warning").length;
  const buildState = errorCount ? "error" : warningCount ? "warning" : "ok";
  const appShellStyle = {
    "--left-width": `${leftWidth}px`,
    "--detail-width": `${detailWidth}px`
  } as CSSProperties;

  return (
    <div
      className={`app-shell ${leftOpen ? "left-visible" : ""} ${sideObject && route.mode === "view" ? "side-visible" : ""} ${resizeDrag ? "is-resizing" : ""}`}
      style={appShellStyle}
    >
      <TopBar
        graph={graph}
        currentView={currentView}
        leftOpen={leftOpen}
        onToggleLeft={() => setLeftOpen((value) => !value)}
        filterOpen={filterOpen}
        setFilterOpen={setFilterOpen}
        buildOpen={buildOpen}
        setBuildOpen={setBuildOpen}
        buildState={buildState}
        buildFlash={buildFlash}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        kindFilter={kindFilter}
        setKindFilter={setKindFilter}
        onProblemClick={(problem) => {
          const object = problem.objectUid ? objectsByUid[problem.objectUid] : problem.objectName ? objectsByName[problem.objectName] : undefined;
          if (object) selectObject(object);
        }}
      />
      <div className="main-row">
        {leftOpen && (
          <LeftNav
            graph={graph}
            currentView={currentView}
            treeFilter={treeFilter}
            setTreeFilter={setTreeFilter}
            statusFilter={statusFilter}
            kindFilter={kindFilter}
            showArchived={showArchived}
            setShowArchived={setShowArchived}
            onView={openView}
            onOpenFull={openFull}
            selectedUid={sideObject?.uid ?? fullObject?.uid}
            width={leftWidth}
          />
        )}
        {leftOpen && (
          <ColumnResizer side="left" label="Resize navigation column" onMouseDown={(event) => startResize("left", event)} />
        )}
        <main className="center-pane">
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
              onOpenFull={openFull}
              onBack={() => currentView && navigate(routeView(currentView))}
              onHistoryBack={() => goHistory(-1)}
              onHistoryForward={() => goHistory(1)}
              onCopy={copyReference}
              copied={copiedUid === fullObject.uid}
              onOpenPreview={openOverlay}
            />
          ) : currentView ? (
            <ViewPane
              graph={graph}
              view={currentView}
              bodyCache={bodyCache}
              ensureBody={ensureBody}
              expanded={expanded}
              setExpanded={setExpanded}
              statusFilter={statusFilter}
              kindFilter={kindFilter}
              showArchived={showArchived}
              selectedUid={sideObject?.uid}
              onSelect={selectObject}
              onOpenFull={openFull}
              onOpenPreview={openOverlay}
              onCopy={copyReference}
              copiedUid={copiedUid}
            />
          ) : (
            <div className="empty-state">No view found.</div>
          )}
        </main>
        {sideObject && route.mode === "view" && (
          <ColumnResizer side="right" label="Resize detail column" onMouseDown={(event) => startResize("right", event)} />
        )}
        {sideObject && route.mode === "view" && (
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
      {toast && <Toast toast={toast} />}
    </div>
  );
}

function TopBar(props: {
  graph: NormalizedGraph;
  currentView?: AtlasView;
  leftOpen: boolean;
  onToggleLeft: () => void;
  filterOpen: boolean;
  setFilterOpen: (value: boolean) => void;
  buildOpen: boolean;
  setBuildOpen: (value: boolean) => void;
  buildState: "ok" | "warning" | "error";
  buildFlash: string | null;
  statusFilter: Set<ObjectStatus>;
  setStatusFilter: (value: Set<ObjectStatus>) => void;
  kindFilter: Set<ObjectKind>;
  setKindFilter: (value: Set<ObjectKind>) => void;
  onProblemClick: (problem: AtlasProblem) => void;
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
      <span className="project-name">{props.graph.config.title}</span>
      <span className="top-slash">/</span>
      <span className="current-view">{viewLabel(props.currentView)}</span>
      <div className="top-spacer" />
      {props.buildFlash && <span className="build-flash">{props.buildFlash}</span>}
      <div className="top-popover-anchor">
        <button className={`toolbar-button ${props.filterOpen ? "active" : ""}`} onClick={() => {
          props.setFilterOpen(!props.filterOpen);
          props.setBuildOpen(false);
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
  treeFilter: string;
  setTreeFilter: (value: string) => void;
  statusFilter: Set<ObjectStatus>;
  kindFilter: Set<ObjectKind>;
  showArchived: boolean;
  setShowArchived: (value: boolean) => void;
  onView: (view: AtlasView) => void;
  onOpenFull: (object: NormalizedObject) => void;
  selectedUid?: string;
  width: number;
}) {
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
  return (
    <aside className="left-nav" style={{ width: props.width, flexBasis: props.width }}>
      <section className="nav-section">
        <div className="nav-label">Views</div>
        {[...props.graph.views].sort((a, b) => viewSortKey(props.graph, a).localeCompare(viewSortKey(props.graph, b))).map((view) => (
          <button
            key={view.path}
            className={`view-button ${props.currentView?.path === view.path ? "active" : ""}`}
            onClick={() => props.onView(view)}
          >
            {viewIcon(view)}
            {viewLabel(view)}
          </button>
        ))}
      </section>
      <section className="filter-input-wrap">
        <Search size={14} />
        <input value={props.treeFilter} onChange={(event) => props.setTreeFilter(event.target.value)} placeholder="Filter objects..." />
      </section>
      <section className="tree-section">
        {grouped.map((group) => (
          <div className="tree-group" key={group.group}>
            <div className="tree-group-label">{group.group}</div>
            {group.objects.map((object) => (
              <button
                key={object.uid}
                className={`tree-item ${props.selectedUid === object.uid ? "selected" : ""} ${["disproved", "obsolete", "archived"].includes(object.status) ? "faded" : ""}`}
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
    </aside>
  );
}

function ViewPane(props: {
  graph: NormalizedGraph;
  view: AtlasView;
  bodyCache: BodyCache;
  ensureBody: (uid: string) => Promise<void>;
  expanded: Set<string>;
  setExpanded: (value: Set<string>) => void;
  statusFilter: Set<ObjectStatus>;
  kindFilter: Set<ObjectKind>;
  showArchived: boolean;
  selectedUid?: string;
  onSelect: (object: NormalizedObject) => void;
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
    const next = new Set(props.expanded);
    if (next.has(object.uid) || (isExpanded && !props.expanded.has(object.uid))) next.delete(object.uid);
    else next.add(object.uid);
    if (!isExpanded) void props.ensureBody(object.uid);
    props.setExpanded(next);
  };

  const renderCard = (object: NormalizedObject, forceExpanded = false) => {
    const isExpanded = forceExpanded || props.expanded.has(object.uid) || defaultExpanded(object);
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
              onSelect={props.onSelect}
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
            <code>blocks {shortName((issue.edges.blocks ?? [])[0] ?? "")}</code>
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
        onSelect={props.onSelect}
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
      <button className="filtered-placeholder" onClick={() => props.setExpanded(new Set([...props.expanded, object.uid]))}>
        <span className="status-dot" style={{ background: statusColor(object.status) }} />
        1 {object.status} object hidden - {shortName(object.name)} · show
      </button>
    );
  }
  const isExpanded = props.expanded.has(object.uid) || defaultExpanded(object, props.item);
  return (
    <ObjectCard
      graph={props.graph}
      object={object}
      body={props.bodyCache[object.uid]}
      expanded={isExpanded}
      selected={props.selectedUid === object.uid}
      ensureBody={props.ensureBody}
      onToggle={() => {
        const next = new Set(props.expanded);
        if (next.has(object.uid) || (isExpanded && !props.expanded.has(object.uid))) next.delete(object.uid);
        else next.add(object.uid);
        if (!isExpanded) void props.ensureBody(object.uid);
        props.setExpanded(next);
      }}
      onSelect={props.onSelect}
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
      onSelect={props.onSelect}
      onOpenPreview={props.onOpenPreview}
    />
  ) : (
    <div className="card-summary">
      {props.object.summary || (isProof ? "Proof details are folded until needed." : "Open the card to read this object.")}
      {isProof && <button onClick={props.onToggle}>Show proof ({(props.object.edges.uses ?? []).length} uses) <ChevronDown size={13} /></button>}
    </div>
  );
  return (
    <article className={`object-card ${props.selected ? "selected" : ""} ${props.object.status === "disproved" ? "disproved" : ""}`}>
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
}) {
  useEffect(() => {
    void props.ensureBody(props.object.uid);
  }, [props.ensureBody, props.object.uid]);

  return (
    <aside className="detail-panel" style={{ width: props.width, flexBasis: props.width }}>
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
      <RelationList graph={props.graph} object={props.object} onSelect={props.onSelect} onOpenPreview={props.onOpenPreview} />
      <div className="detail-section">
        <div className="detail-label">Body files</div>
        {props.object.body.map((file) => <code className="body-chip" key={file}>{file}</code>)}
      </div>
      <div className="identity-box">
        <span>name</span><code>{props.object.name}</code>
        <span>uid</span><code>{props.object.uid}</code>
        <span>path</span><code>{props.object.path}/</code>
      </div>
    </aside>
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
  const rows: Array<{ label: string; target: NormalizedObject; derived: boolean }> = [];
  for (const [label, targets] of Object.entries(props.object.edges)) {
    for (const target of targets ?? []) {
      const object = props.graph.objectsByName[target];
      if (object) rows.push({ label, target: object, derived: false });
    }
  }
  for (const [label, targets] of Object.entries(props.object.reverseEdges)) {
    for (const target of targets ?? []) {
      const object = props.graph.objectsByName[target];
      if (object && !(label === "related_to" && rows.some((row) => row.label === "related_to" && row.target.uid === object.uid))) {
        rows.push({ label, target: object, derived: true });
      }
    }
  }
  return (
    <div className="detail-section">
      <div className="detail-label">Relations</div>
      {rows.length === 0 ? <p className="muted">No relations.</p> : rows.map((row) => (
        <button
          key={`${row.label}-${row.target.uid}-${row.derived}`}
          className={`edge-row ${row.target.status === "open" ? "open" : ""}`}
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
  onOpenFull: (object: NormalizedObject) => void;
  onBack: () => void;
  onHistoryBack: () => void;
  onHistoryForward: () => void;
  onCopy: (object: NormalizedObject) => Promise<void>;
  copied: boolean;
  onOpenPreview: (object: NormalizedObject) => void;
}) {
  useEffect(() => {
    void props.ensureBody(props.object.uid);
  }, [props.ensureBody, props.object.uid]);
  const uses = [...(props.object.edges.uses ?? []), ...(props.object.edges.proves ?? [])]
    .map((name) => props.graph.objectsByName[name])
    .filter((object): object is NormalizedObject => Boolean(object));
  const reverse = Object.entries(props.object.reverseEdges)
    .flatMap(([label, names]) => (names ?? []).map((name) => ({ label, object: props.graph.objectsByName[name] })))
    .filter((item): item is { label: string; object: NormalizedObject } => Boolean(item.object));
  return (
    <div className="full-page reading-shell">
      <div className="history-nav">
        <button className="icon-button" title="Back" onClick={props.onHistoryBack}><ArrowLeft size={15} /></button>
        <button className="icon-button" title="Forward" onClick={props.onHistoryForward}><ArrowRight size={15} /></button>
      </div>
      <div className="breadcrumb">
        <button onClick={props.onBack}>Paper view</button>
        <span>/</span>
        <code>{props.object.name}</code>
      </div>
      <div className="full-title">
        <span style={{ color: statusColor(props.object.status) }}>{kindIcon(props.object.kind, 18)}</span>
        <h1>{props.object.title}</h1>
        <span className="status-badge" style={{ background: statusColor(props.object.status) }}>{props.object.status}</span>
        <button className="copy-inline" onClick={() => void props.onCopy(props.object)}>
          {props.copied ? <Check size={14} /> : <Copy size={14} />}
          {props.copied ? "Copied" : "Copy local AI reference"}
        </button>
      </div>
      <MarkdownBody
        graph={props.graph}
        object={props.object}
        files={props.body}
        onSelect={props.onSelect}
        onOpenPreview={props.onOpenPreview}
      />
      <div className="context-grid">
        <ContextColumn title="This object uses" items={uses} onOpen={props.onOpenFull} />
        <ContextColumn title="Used by / Proved by / Blocked by" items={reverse.map((item) => item.object)} onOpen={props.onOpenFull} />
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

  const uses = [...(props.object.edges.uses ?? []), ...(props.object.edges.proves ?? [])]
    .map((name) => props.graph.objectsByName[name])
    .filter((object): object is NormalizedObject => Boolean(object));
  const reverse = Object.entries(props.object.reverseEdges)
    .flatMap(([label, names]) => (names ?? []).map((name) => ({ label, object: props.graph.objectsByName[name] })))
    .filter((item): item is { label: string; object: NormalizedObject } => Boolean(item.object));

  return (
    <div className="object-overlay" onClick={props.onClose}>
      <section
        className="object-overlay-panel"
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
