#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { Command } from "commander";
import {
  defaultBodyFile,
  NAME_PATTERN,
  UID_PATTERN
} from "../core/constants";
import { appendBibEntryToUnverified, BibError, loadBibRegistryForRoot, parseSingleBibEntry } from "../core/bibtex";
import { buildBodyFiles, buildGraph, findObject } from "../core/graph";
import { exportRoute, createSnapshot, type ExportFormat } from "../core/contextExporter";
import { edgeTargets } from "../core/edgeUtils";
import { parseMarkdownReferences, rewriteMarkdownObjectNames } from "../core/markdownRefs";
import { pathExists, listFilesRecursive } from "../core/pathUtils";
import { hasCheckErrors } from "../core/problems";
import { expandHome, ProjectError, resolveAtlasProject } from "../core/project";
import { formatLocalReference } from "../core/reference";
import { resolveRoute, routeStatusLine, type ResolvedRoute } from "../core/routeResolver";
import { DEFAULT_DEV_SERVER_PORT } from "../core/serverConfig";
import { applySuggestionSet, createSuggestionSet, readSuggestionSet } from "../core/suggestions";
import {
  listRegistryProjects,
  registerResolvedProject,
  resolveProjectPathOrId,
  shortenHome,
  unregisterProject
} from "../core/registry";
import {
  KINDS,
  ROLES_BY_KIND,
  EDGE_TYPES,
  type EdgeRef,
  type ObjectKind,
  type ObjectRole,
  type RegistryProjectListItem,
  type RepresentationMode,
  type RouteProfile,
  type RouteView,
  type ResolvedAtlasProject
} from "../core/types";
import { readYamlFile, stringifyYaml, writeYamlFile } from "../core/yaml";
import { agentsTemplate, atlasConfigTemplate, atlasGitignoreEntries, dashboardTemplate } from "./templates";
import { startDevServer } from "../server/devServer";

function printProblems(problems: Awaited<ReturnType<typeof buildGraph>>["problems"]): void {
  if (problems.length === 0) {
    console.log("No problems.");
    return;
  }
  for (const item of problems) {
    const location = item.path ? ` ${item.path}` : "";
    console.log(`[${item.severity}] ${item.code}${location}: ${item.message}`);
  }
}

function cliError(message: string, code = 2): never {
  console.error(message);
  process.exit(code);
}

function requireMapping(value: unknown, filePath: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProjectError(`${filePath} must be a YAML mapping.`);
  }
  return value as Record<string, unknown>;
}

async function readProjectIdentity(project: ResolvedAtlasProject): Promise<{ project: string; title: string }> {
  const raw = requireMapping(await readYamlFile<unknown>(project.configPath), project.configPath);
  if (typeof raw.project !== "string" || !raw.project) {
    throw new ProjectError(`atlas.yml is missing required field project.`);
  }
  if (typeof raw.title !== "string" || !raw.title) {
    throw new ProjectError(`atlas.yml is missing required field title.`);
  }
  return { project: raw.project, title: raw.title };
}

async function writeIfMissing(filePath: string, content: string): Promise<void> {
  if (await pathExists(filePath)) return;
  await fs.writeFile(filePath, content, "utf8");
}

async function ensureWorkspaceGitignore(workspaceRoot: string, atlasRoot: string): Promise<string[]> {
  const gitignorePath = path.join(workspaceRoot, ".gitignore");
  const entries = atlasGitignoreEntries(atlasRoot, workspaceRoot);
  const text = (await pathExists(gitignorePath)) ? await fs.readFile(gitignorePath, "utf8") : "";
  const existing = new Set(text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  const missing = entries.filter((entry) => !existing.has(entry));
  if (missing.length === 0) return [];
  const separator = text.length === 0 ? "" : text.endsWith("\n") ? "\n" : "\n\n";
  await fs.writeFile(gitignorePath, `${text}${separator}# Proof Atlas local files.\n${missing.join("\n")}\n`, "utf8");
  return missing;
}

function initTarget(input?: string): string {
  const resolved = path.resolve(process.cwd(), expandHome(input ?? "ProofAtlas"));
  return path.basename(resolved) === "ProofAtlas" ? resolved : path.join(resolved, "ProofAtlas");
}

export async function commandInit(input?: string): Promise<void> {
  const root = initTarget(input);
  const workspaceRoot = path.dirname(root);
  await fs.mkdir(path.join(root, "objects"), { recursive: true });
  await fs.mkdir(path.join(root, "views"), { recursive: true });
  await fs.mkdir(path.join(root, ".atlas", "cache"), { recursive: true });
  await writeIfMissing(path.join(root, "atlas.yml"), "");
  const config = atlasConfigTemplate(path.basename(path.dirname(root)) || "proof-atlas-project", "Proof Atlas Project");
  if ((await fs.readFile(path.join(root, "atlas.yml"), "utf8")).trim() === "") {
    await writeYamlFile(path.join(root, "atlas.yml"), config);
  }
  await writeIfMissing(path.join(root, "views", "dashboard.md"), dashboardTemplate);
  await writeIfMissing(path.join(root, ".atlas", "aliases.yml"), "{}\n");
  await fs.writeFile(path.join(root, "AGENTS.md"), agentsTemplate(config, {
    atlasRoot: root,
    workspaceRoot
  }), "utf8");
  await ensureWorkspaceGitignore(workspaceRoot, root);
  console.log(`Initialized ${root}`);
}

export async function commandCheck(project: string | undefined, strict: boolean): Promise<void> {
  const graph = await buildGraph(project);
  printProblems(graph.problems);
  const failed = hasCheckErrors(graph.problems, strict);
  console.log(`${failed ? "FAILED" : "OK"} ${strict ? "strict" : "dev"} check: ${graph.problems.length} problem(s).`);
  process.exit(failed ? 1 : 0);
}

export async function commandLocate(nameOrUid: string, project?: string): Promise<void> {
  const graph = await buildGraph(project);
  const object = findObject(graph, nameOrUid);
  if (!object) cliError(`Object not found: ${nameOrUid}`, 1);
  console.log(formatLocalReference(graph, object).trimEnd());
}

function assertKindRole(kind: string, role: string): asserts kind is ObjectKind {
  if (!(KINDS as readonly string[]).includes(kind)) cliError(`Invalid kind: ${kind}`, 2);
  if (!(ROLES_BY_KIND[kind as ObjectKind] as readonly string[]).includes(role)) {
    cliError(`Invalid role ${role} for kind ${kind}`, 2);
  }
}

function generateUid(existing: Set<string>): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  for (let i = 0; i < 50; i += 1) {
    const suffix = crypto.randomBytes(4).toString("hex").slice(0, 6);
    const uid = `obj_${date}_${suffix}`;
    if (UID_PATTERN.test(uid) && !existing.has(uid)) return uid;
  }
  throw new Error("Unable to generate unique uid.");
}

export async function commandNew(kind: string, role: string, name: string, title: string, options: { project?: string }): Promise<void> {
  assertKindRole(kind, role);
  if (!NAME_PATTERN.test(name)) cliError(`Invalid object name: ${name}`, 2);
  const project = await resolveAtlasProject(options.project);
  const root = project.atlasRoot;
  const graph = await buildGraph(project);
  if (graph.objectsByName[name]) cliError(`Object already exists: ${name}`, 1);
  const uid = generateUid(new Set(graph.objects.map((object) => object.uid)));
  const bodyFile = defaultBodyFile(kind, role as ObjectRole);
  const dir = path.join(root, "objects", name);
  if (await pathExists(dir)) cliError(`Directory already exists: ${dir}`, 1);
  await fs.mkdir(dir, { recursive: true });
  await writeYamlFile(path.join(dir, "object.yml"), {
    uid,
    name,
    kind,
    role,
    title,
    body: [bodyFile]
  });
  await fs.writeFile(path.join(dir, bodyFile), "Write the object body here.\n", "utf8");
  console.log(`Created ${name} (${uid})`);
}

export async function commandDoctor(project?: string): Promise<void> {
  const resolved = await resolveAtlasProject(project);
  const root = resolved.atlasRoot;
  const graph = await buildGraph(resolved);
  await fs.mkdir(path.join(root, ".atlas", "cache"), { recursive: true });
  await fs.writeFile(path.join(root, "AGENTS.md"), agentsTemplate(graph.config, {
    atlasRoot: graph.atlasRoot,
    workspaceRoot: graph.workspaceRoot
  }), "utf8");
  await ensureWorkspaceGitignore(graph.workspaceRoot ?? path.dirname(root), root);
  const warnings: string[] = [];
  let current = root;
  while (path.dirname(current) !== current && !(await pathExists(path.join(current, ".git")))) {
    current = path.dirname(current);
  }
  const repoAgents = path.join(current, "AGENTS.md");
  if (await pathExists(path.join(current, ".git"))) {
    const text = (await pathExists(repoAgents)) ? await fs.readFile(repoAgents, "utf8") : "";
    if (!text.includes("ProofAtlas/AGENTS.md")) {
      warnings.push(`Repository root AGENTS.md should mention ProofAtlas/AGENTS.md (${repoAgents}).`);
    }
    const localConfigPath = path.join(root, ".atlas", "local.yml");
    if (await pathExists(localConfigPath)) {
      const tracked = await isGitTracked(current, localConfigPath);
      if (tracked) warnings.push(`.atlas/local.yml is local-only but is tracked by git (${localConfigPath}). Add it to .gitignore and untrack it.`);
    }
  }
  printProblems(graph.problems);
  for (const warning of warnings) console.log(`[warning] doctor: ${warning}`);
  console.log(`Updated ${path.join(root, "AGENTS.md")}`);
}

async function isGitTracked(repoRoot: string, filePath: string): Promise<boolean> {
  const { spawn } = await import("node:child_process");
  return new Promise((resolve) => {
    const child = spawn("git", ["ls-files", "--error-unmatch", path.relative(repoRoot, filePath)], {
      cwd: repoRoot,
      stdio: "ignore"
    });
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

async function rewriteObjectYaml(file: string, oldName: string, newName: string): Promise<void> {
  const raw = await readYamlFile<Record<string, unknown>>(file);
  if (raw.name === oldName) raw.name = newName;
  if (raw.edges && typeof raw.edges === "object" && !Array.isArray(raw.edges)) {
    for (const edge of EDGE_TYPES) {
      const list = (raw.edges as Record<string, unknown>)[edge];
      if (Array.isArray(list)) {
        (raw.edges as Record<string, unknown>)[edge] = list.map((item) => {
          if (item === oldName) return newName;
          if (item && typeof item === "object" && !Array.isArray(item) && (item as Record<string, unknown>).target === oldName) {
            return { ...(item as Record<string, unknown>), target: newName };
          }
          return item;
        });
      }
    }
  }
  await writeYamlFile(file, raw);
}

function rewriteObjectNameKeyedMap(value: unknown, oldName: string, newName: string): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    next[key === oldName ? newName : key] = item === oldName ? newName : item;
  }
  return next;
}

async function rewriteRouteYaml(file: string, oldName: string, newName: string): Promise<void> {
  const raw = await readYamlFile<Record<string, unknown>>(file);
  if (raw.target === oldName) raw.target = newName;
  raw.proof_choices = rewriteObjectNameKeyedMap(raw.proof_choices, oldName, newName);
  raw.representation = rewriteObjectNameKeyedMap(raw.representation, oldName, newName);
  if (Array.isArray(raw.boundaries)) {
    raw.boundaries = raw.boundaries.map((item) => item === oldName ? newName : item);
  }
  if (raw.render && typeof raw.render === "object" && !Array.isArray(raw.render)) {
    const render = raw.render as Record<string, unknown>;
    if (Array.isArray(render.order_hints)) {
      render.order_hints = render.order_hints.map((item) => item === oldName ? newName : item);
    }
  }
  await writeYamlFile(file, raw);
}

async function rewriteMarkdownFiles(files: string[], oldName: string, newName: string): Promise<void> {
  for (const file of files) {
    const source = await fs.readFile(file, "utf8");
    parseMarkdownReferences(source);
    const next = rewriteMarkdownObjectNames(source, oldName, newName);
    if (next !== source) await fs.writeFile(file, next, "utf8");
  }
}

export async function commandRename(oldName: string, newName: string, options: { project?: string; keepDir?: boolean }): Promise<void> {
  if (!NAME_PATTERN.test(newName)) cliError(`Invalid new object name: ${newName}`, 2);
  const project = await resolveAtlasProject(options.project);
  const root = project.atlasRoot;
  const graph = await buildGraph(project);
  const object = findObject(graph, oldName);
  if (!object) cliError(`Object not found: ${oldName}`, 1);
  if (object.origin.kind !== "project" || object.origin.readonly) {
    cliError(`Mounted objects are readonly. Open the owner atlas to edit: ${object.name}`, 1);
  }
  if (object.name.startsWith("source.") && graph.objects.some((item) => item.source_result?.parent === object.name)) {
    cliError(`Cannot rename ${object.name}: source roots with child claims require a manual data rewrite.`, 1);
  }
  if (graph.objectsByName[newName]) cliError(`Target object name already exists: ${newName}`, 1);

  const objectFiles = await listFilesRecursive(path.join(root, "objects"), (file) => path.basename(file) === "object.yml");
  for (const file of objectFiles) await rewriteObjectYaml(file, oldName, newName);
  const routeFiles = await listFilesRecursive(path.join(root, "views"), (file) => /\.route\.ya?ml$/.test(file));
  for (const file of routeFiles) await rewriteRouteYaml(file, oldName, newName);

  const markdownFiles = [
    ...(await listFilesRecursive(path.join(root, "objects"), (file) => file.endsWith(".md"))),
    ...(await listFilesRecursive(path.join(root, "views"), (file) => file.endsWith(".md")))
  ];
  await rewriteMarkdownFiles(markdownFiles.filter((file, index, list) => list.indexOf(file) === index), oldName, newName);

  await fs.mkdir(path.join(root, ".atlas"), { recursive: true });
  const aliasesPath = path.join(root, ".atlas", "aliases.yml");
  const aliases = (await pathExists(aliasesPath)) ? await readYamlFile<Record<string, unknown>>(aliasesPath) : {};
  aliases[oldName] = object.uid;
  await writeYamlFile(aliasesPath, aliases);

  if (!options.keepDir) {
    const oldDir = path.join(root, object.dir);
    const newDir = path.join(root, "objects", newName);
    if (path.resolve(oldDir) !== path.resolve(newDir)) {
      if (await pathExists(newDir)) cliError(`Target directory already exists: ${newDir}`, 1);
      await fs.rename(oldDir, newDir);
    }
  }

  console.log(`Renamed ${oldName} -> ${newName}`);
}

function collectOption(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

function parseAssignments(values: string[] | undefined, label: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const value of values ?? []) {
    const index = value.indexOf("=");
    if (index <= 0 || index === value.length - 1) cliError(`${label} must use name=value syntax: ${value}`, 2);
    out[value.slice(0, index)] = value.slice(index + 1);
  }
  return out;
}

function parseRepresentation(values: string[] | undefined): Record<string, RepresentationMode> {
  const raw = parseAssignments(values, "representation");
  const allowed = new Set(["full", "statement", "summary", "reference", "omit"]);
  const out: Record<string, RepresentationMode> = {};
  for (const [name, mode] of Object.entries(raw)) {
    if (!allowed.has(mode)) cliError(`Invalid representation mode ${mode}; expected full, statement, summary, reference, or omit.`, 2);
    out[name] = mode as RepresentationMode;
  }
  return out;
}

function parseProfile(value: string | undefined): RouteProfile {
  const profile = value ?? "proof";
  if (profile !== "proof") {
    cliError(`Invalid profile ${profile}; expected proof.`, 2);
  }
  return profile as RouteProfile;
}

function parseFormat(value: string | undefined): ExportFormat {
  const format = value ?? "markdown";
  if (!["markdown", "manifest", "json"].includes(format)) {
    cliError(`Invalid export format ${format}; expected markdown, manifest, or json.`, 2);
  }
  return format as ExportFormat;
}

function routePathFromInput(root: string, input: string): string {
  const expanded = expandHome(input);
  if (path.isAbsolute(expanded)) return path.normalize(expanded);
  return path.resolve(root, expanded);
}

function relativeRoutePath(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}

function generateRouteUid(): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `view_${date}_${crypto.randomBytes(3).toString("hex")}`;
}

function routeTitleForTarget(targetName: string): string {
  return `Route for ${targetName}`;
}

function routeRecipeFromTarget(
  target: string,
  profile: RouteProfile,
  proofChoices: Record<string, string>,
  boundaries: string[],
  representation: Record<string, RepresentationMode>
): RouteView {
  return {
    schema_version: "0.1",
    uid: generateRouteUid(),
    type: "route",
    title: routeTitleForTarget(target),
    target,
    profile,
    proof_choices: proofChoices,
    boundaries,
    representation,
    render: {
      order: "prerequisites_first"
    }
  };
}

async function loadRouteRecipe(graph: Awaited<ReturnType<typeof buildGraph>>, routeFile: string): Promise<RouteView> {
  const full = routePathFromInput(graph.root, routeFile);
  const rel = relativeRoutePath(graph.root, full);
  const loaded = graph.routeViews.find((view) => path.resolve(graph.root, view.path) === full || view.path === rel);
  if (!loaded) cliError(`Route file not found or invalid: ${routeFile}`, 1);
  return loaded.route;
}

function printRouteSummary(route: ResolvedRoute, graph: Awaited<ReturnType<typeof buildGraph>>): void {
  console.log(`Route target: ${route.target.name}`);
  console.log(`Profile: ${route.profile}`);
  console.log(`Route status: ${routeStatusLine(route.status)}`);
  console.log(`Objects: ${route.nodes.length}`);
  if (Object.keys(route.selectedProofs).length) {
    console.log("Selected proofs:");
    for (const [claim, proof] of Object.entries(route.selectedProofs)) console.log(`  ${claim} -> ${proof}`);
  }
  if (route.boundaries.length) {
    console.log(`Boundaries: ${route.boundaries.join(", ")}`);
  }
  const openBlockers = route.nodes
    .flatMap((node) => (node.object.reverseEdges.blocked_by ?? []).map((name) => graph.objectsByName[name]))
    .filter((object): object is NonNullable<typeof object> => Boolean(object) && object.status === "open")
    .filter((object, index, list) => list.findIndex((item) => item.uid === object.uid) === index);
  if (openBlockers.length) {
    console.log("Open blockers:");
    for (const blocker of openBlockers) console.log(`  ${blocker.name}: ${blocker.title}`);
  }
  const unresolved = route.nodes.filter((node) => node.decision === "unresolved").map((node) => node.object.name);
  if (unresolved.length) console.log(`Unresolved: ${unresolved.join(", ")}`);
  if (route.diagnostics.length) {
    console.log("Diagnostics:");
    for (const item of route.diagnostics) console.log(`  [${item.severity}] ${item.code}: ${item.message}`);
  }
  console.log("Nodes:");
  for (const node of route.nodes) {
    console.log(`  ${node.object.name} ${node.decision} ${node.representation} depth=${node.depth} hard=${node.hardness}`);
    if (node.witnessPaths.length) {
      console.log(`    why: ${node.witnessPaths[0].join(" -> ")}`);
      for (const witness of node.witnessPaths.slice(1, 3)) console.log(`    also: ${witness.join(" -> ")}`);
      if (node.witnessPaths.length > 3) console.log(`    also: ${node.witnessPaths.length - 3} more witness path(s)`);
    }
  }
}

export async function commandRoute(targetOrRoute: string, project: string | undefined, options: {
  profile?: string;
  save?: string;
  proofChoice?: string[];
  boundary?: string[];
  representation?: string[];
}): Promise<void> {
  const graph = await buildGraph(project);
  const proofChoices = parseAssignments(options.proofChoice, "proof-choice");
  const boundaries = options.boundary ?? [];
  const representation = parseRepresentation(options.representation);
  const isRouteFile = /\.route\.ya?ml$/.test(targetOrRoute);
  const recipe = isRouteFile
    ? await loadRouteRecipe(graph, targetOrRoute)
    : routeRecipeFromTarget(targetOrRoute, parseProfile(options.profile), proofChoices, boundaries, representation);
  const route = resolveRoute(graph, recipe);
  printRouteSummary(route, graph);

  if (options.save) {
    const savePath = routePathFromInput(graph.root, options.save);
    await fs.mkdir(path.dirname(savePath), { recursive: true });
    const frozenRecipe: RouteView = {
      ...recipe,
      title: recipe.title === routeTitleForTarget(recipe.target) ? routeTitleForTarget(route.target.name) : recipe.title,
      target: route.target.name,
      proof_choices: { ...recipe.proof_choices, ...route.selectedProofs },
      boundaries: route.boundaries,
      representation: Object.fromEntries(route.nodes.map((node) => [node.object.name, node.representation]))
    };
    await writeYamlFile(savePath, frozenRecipe);
    console.log(`Saved route: ${relativeRoutePath(graph.root, savePath)}`);
  }
}

export async function commandExport(routeFile: string, project: string | undefined, options: {
  format?: string;
  output?: string;
  snapshot?: string;
  requireClean?: boolean;
}): Promise<void> {
  const graph = await buildGraph(project);
  const recipe = await loadRouteRecipe(graph, routeFile);
  const resolved = resolveRoute(graph, recipe);
  const result = await exportRoute(graph, resolved, parseFormat(options.format));
  if (options.output) {
    const outputPath = path.isAbsolute(expandHome(options.output))
      ? path.normalize(expandHome(options.output))
      : path.resolve(process.cwd(), expandHome(options.output));
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, result.content, "utf8");
    console.log(`Wrote ${outputPath}`);
  } else {
    process.stdout.write(result.content);
  }
  if (options.snapshot) {
    const snapshotPath = path.isAbsolute(expandHome(options.snapshot))
      ? path.normalize(expandHome(options.snapshot))
      : path.resolve(graph.root, expandHome(options.snapshot));
    await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
    await writeYamlFile(snapshotPath, await createSnapshot(graph, recipe, resolved, { requireClean: Boolean(options.requireClean) }));
    console.log(`Wrote snapshot ${snapshotPath}`);
  }
  if (result.diagnostics.length && options.output) {
    console.log(`Diagnostics: ${result.diagnostics.length}`);
  }
}

function compactDemoPath(repoRoot: string, value: string): string {
  if (!path.isAbsolute(value)) return value.split(path.sep).join("/");
  const relative = path.relative(repoRoot, value);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) return relative.split(path.sep).join("/");
  if (!relative) return ".";
  return value.split(path.sep).join("/");
}

function isWithinDirectory(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function realpathIfPossible(filePath: string): Promise<string> {
  try {
    return await fs.realpath(filePath);
  } catch {
    return filePath;
  }
}

async function assertDemoMountPolicy(graph: Awaited<ReturnType<typeof buildGraph>>, repoRoot: string, includeMounted: boolean): Promise<void> {
  const mounted = graph.referenceMounts.filter((mount) => mount.status === "mounted" && mount.root);
  if (mounted.length === 0) return;
  if (!includeMounted) {
    throw new Error("demo-data refuses mounted Reference Atlas data by default; pass --include-mounted for public example mounts.");
  }
  const allowedRoots = [await realpathIfPossible(path.join(repoRoot, "examples", "reference-atlas", "ProofAtlas"))];
  for (const mount of mounted) {
    const realRoot = await realpathIfPossible(mount.root as string);
    if (!allowedRoots.some((allowed) => isWithinDirectory(allowed, realRoot))) {
      throw new Error(`Mounted atlas ${mount.id} is not in the demo-data public allowlist.`);
    }
  }
}

type DemoGraph = Awaited<ReturnType<typeof buildGraph>>;
type DemoProjectPayload = {
  source_project: string;
  graph: DemoGraph;
  bodies: Record<string, Awaited<ReturnType<typeof buildBodyFiles>>>;
};

async function buildDemoProjectPayload(graph: DemoGraph, repoRoot: string): Promise<DemoProjectPayload> {
  const bodies = Object.fromEntries(await Promise.all(graph.objects.map(async (object) => [
    object.uid,
    await buildBodyFiles(graph, object)
  ] as const)));
  return {
    source_project: compactDemoPath(repoRoot, graph.atlasRoot),
    graph: compactDemoGraphPaths(graph, repoRoot),
    bodies
  };
}

function demoProjectListItem(graph: DemoGraph, repoRoot: string, generatedAt: string): RegistryProjectListItem {
  return {
    id: graph.config.project,
    title: graph.config.title,
    atlas_root: compactDemoPath(repoRoot, graph.atlasRoot),
    workspace_root: graph.workspaceRoot ? compactDemoPath(repoRoot, graph.workspaceRoot) : null,
    last_opened: generatedAt,
    missing: false
  };
}

function compactDemoGraphPaths(graph: Awaited<ReturnType<typeof buildGraph>>, repoRoot: string): Awaited<ReturnType<typeof buildGraph>> {
  const demoGraph = JSON.parse(JSON.stringify(graph)) as Awaited<ReturnType<typeof buildGraph>>;
  const compact = (value: string) => compactDemoPath(repoRoot, value);
  const compactNullable = (value: string | null) => value === null ? null : compact(value);

  demoGraph.root = compact(demoGraph.root);
  demoGraph.atlasRoot = compact(demoGraph.atlasRoot);
  demoGraph.workspaceRoot = compactNullable(demoGraph.workspaceRoot);
  demoGraph.configPath = compact(demoGraph.configPath);
  demoGraph.localConfigPath = compactNullable(demoGraph.localConfigPath);
  demoGraph.workspace.root = compactNullable(demoGraph.workspace.root);
  demoGraph.workspace.texMain = compactNullable(demoGraph.workspace.texMain);
  demoGraph.workspace.bib = demoGraph.workspace.bib.map((item) => compact(item));

  const compactObject = (object: typeof demoGraph.objects[number]) => {
    object.origin.atlasRoot = compact(object.origin.atlasRoot);
    if (object.citation?.bibfile) object.citation.bibfile = compact(object.citation.bibfile);
  };
  for (const object of demoGraph.objects) compactObject(object);
  for (const object of Object.values(demoGraph.objectsByUid)) compactObject(object);
  for (const object of Object.values(demoGraph.objectsByName)) compactObject(object);

  for (const mount of demoGraph.referenceMounts) {
    mount.root = compactNullable(mount.root);
    mount.realRoot = compactNullable(mount.realRoot);
  }
  for (const registry of Object.values(demoGraph.bibRegistriesByOwner)) {
    registry.registryPath = compactNullable(registry.registryPath);
    for (const file of registry.files) file.file = compact(file.file);
    for (const entry of Object.values(registry.entriesByKey)) {
      entry.file = compact(entry.file);
      entry.sourceFile = compact(entry.sourceFile);
      entry.registryPath = compact(entry.registryPath);
    }
  }
  demoGraph.bibRegistry.registryPath = compactNullable(demoGraph.bibRegistry.registryPath);
  for (const file of demoGraph.bibRegistry.files) file.file = compact(file.file);
  for (const entry of Object.values(demoGraph.bibRegistry.entriesByKey)) {
    entry.file = compact(entry.file);
    entry.sourceFile = compact(entry.sourceFile);
    entry.registryPath = compact(entry.registryPath);
  }

  return demoGraph;
}

function collectUnsafeAbsoluteStrings(value: unknown, repoRoot: string, out: string[] = []): string[] {
  if (typeof value === "string") {
    if (path.isAbsolute(value) && !isWithinDirectory(repoRoot, value)) out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUnsafeAbsoluteStrings(item, repoRoot, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectUnsafeAbsoluteStrings(item, repoRoot, out);
  }
  return out;
}

export async function commandDemoData(project: string | undefined, options: {
  output?: string;
  includeMounted?: boolean;
}): Promise<void> {
  const defaultGraph = await buildGraph(project);
  const repoRoot = await realpathIfPossible(process.cwd());
  await assertDemoMountPolicy(defaultGraph, repoRoot, Boolean(options.includeMounted));
  const generatedAt = new Date().toISOString();
  const graphs = [defaultGraph];
  if (options.includeMounted) {
    for (const mount of defaultGraph.referenceMounts) {
      if (mount.status !== "mounted" || !mount.root) continue;
      const mountedGraph = await buildGraph(mount.root);
      await assertDemoMountPolicy(mountedGraph, repoRoot, Boolean(options.includeMounted));
      if (!graphs.some((graph) => graph.config.project === mountedGraph.config.project)) graphs.push(mountedGraph);
    }
  }
  const payload = {
    schema_version: "0.2",
    generated_at: generatedAt,
    default_project: defaultGraph.config.project,
    projects: graphs.map((graph) => demoProjectListItem(graph, repoRoot, generatedAt)),
    payloads: Object.fromEntries(await Promise.all(graphs.map(async (graph) => [
      graph.config.project,
      await buildDemoProjectPayload(graph, repoRoot)
    ] as const)))
  };
  const unsafe = collectUnsafeAbsoluteStrings(payload, repoRoot);
  if (unsafe.length) {
    throw new Error(`demo-data payload contains non-public absolute path(s): ${[...new Set(unsafe)].join(", ")}`);
  }
  const outputPath = options.output
    ? path.resolve(process.cwd(), expandHome(options.output))
    : path.resolve(process.cwd(), "public", "demo-data.json");
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote demo data for ${graphs.map((graph) => graph.config.title).join(", ")}: ${outputPath}`);
}

async function resolveCliProject(input: string | undefined): Promise<ResolvedAtlasProject> {
  if (!input) return resolveAtlasProject(undefined);
  return looksLikeCliPath(input) ? resolveAtlasProject(input) : resolveProjectPathOrId(input);
}

function looksLikeCliPath(value: string): boolean {
  return value.startsWith("/")
    || value.startsWith("~/")
    || value === "~"
    || value === "."
    || value === ".."
    || value.startsWith("./")
    || value.startsWith("../")
    || value.includes("/");
}

function jsonCliError(code: string, message: string): never {
  console.log(JSON.stringify({ error: { code, message } }, null, 2));
  process.exit(1);
}

function normalizedQueryMatch(query: string, values: Array<string | undefined>): boolean {
  const needles = query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = values.filter((item): item is string => Boolean(item)).join(" ").toLowerCase();
  return needles.every((needle) => haystack.includes(needle));
}

export async function commandReferenceFind(query: string, projectInput: string | undefined, options: { json?: boolean }): Promise<void> {
  const resolved = await resolveCliProject(projectInput);
  const graph = await buildGraph(resolved);
  if (graph.config.atlas_type !== "reference" && graph.referenceMounts.length === 0) {
    if (options.json) jsonCliError("reference_atlas_not_mounted", "This project has no registered Reference Atlas mount.");
    cliError("This project has no registered Reference Atlas mount.", 1);
  }
  const unresolved = graph.referenceMounts.find((mount) => mount.status === "missing");
  if (unresolved) {
    if (options.json) jsonCliError("reference_atlas_mount_unresolved", unresolved.message ?? `Reference Atlas ${unresolved.id} is unresolved.`);
    cliError(unresolved.message ?? `Reference Atlas ${unresolved.id} is unresolved.`, 1);
  }
  const sourceRoots = new Map<string, string>();
  const matches: Array<Record<string, unknown>> = [];
  for (const object of graph.objects.filter((item) => item.name.startsWith("source."))) {
    const owner = object.origin.ownerProject;
    if (object.name.split(".").length === 2 && object.citation?.bibkey) sourceRoots.set(`${owner}:${object.citation.bibkey}`, object.name);
    if (!normalizedQueryMatch(query, [object.name, object.title, object.summary, object.citation?.bibkey])) continue;
    matches.push({
      kind: object.source_result ? "source_result" : "source_card",
      name: object.name,
      uid: object.uid,
      bibkey: object.citation?.bibkey,
      trust: object.citation?.trust,
      owner_project: owner
    });
  }
  for (const registry of Object.values(graph.bibRegistriesByOwner)) {
    for (const entry of Object.values(registry.entriesByKey)) {
      if (!normalizedQueryMatch(query, [
        entry.bibkey,
        entry.fields.title,
        entry.fields.author,
        entry.fields.editor,
        entry.year,
        entry.normalizedDoi,
        entry.normalizedArxiv
      ])) continue;
      if (sourceRoots.has(`${entry.ownerProject}:${entry.bibkey}`)) continue;
      matches.push({
        kind: "bib_entry_only",
        bibkey: entry.bibkey,
        trust: entry.trust,
        owner_project: entry.ownerProject,
        entry_type: entry.entryType,
        title: entry.fields.title,
        year: entry.year
      });
    }
  }
  const exactMatches = matches.filter((match) => {
    const name = typeof match.name === "string" ? match.name.toLowerCase() : "";
    const bibkey = typeof match.bibkey === "string" ? match.bibkey.toLowerCase() : "";
    return name === query.toLowerCase() || bibkey === query.toLowerCase();
  });
  const result = { query, ambiguous: exactMatches.length > 1, matches };
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (matches.length === 0) {
    console.log("No reference matches.");
    return;
  }
  for (const match of matches) {
    const name = typeof match.name === "string" ? ` ${match.name}` : "";
    const bibkey = typeof match.bibkey === "string" ? ` [${match.bibkey}]` : "";
    const trust = typeof match.trust === "string" ? ` ${match.trust}` : "";
    console.log(`${match.kind}${name}${bibkey}${trust}`);
  }
}

export async function commandBibCheck(referenceAtlasInput: string | undefined): Promise<void> {
  const resolved = await resolveCliProject(referenceAtlasInput);
  const identity = await readProjectIdentity(resolved);
  const problems: Awaited<ReturnType<typeof buildGraph>>["problems"] = [];
  const registry = await loadBibRegistryForRoot(resolved.atlasRoot, identity.project, problems);
  printProblems(problems);
  for (const entry of Object.values(registry.entriesByKey).sort((a, b) => a.bibkey.localeCompare(b.bibkey))) {
    console.log(`${entry.bibkey}\t${entry.trust}\t${entry.entryType}\t${entry.year ?? ""}\t${entry.fields.title ?? ""}`);
  }
  const failed = hasCheckErrors(problems, true);
  console.log(`${failed ? "FAILED" : "OK"} bib check: ${Object.keys(registry.entriesByKey).length} entr${Object.keys(registry.entriesByKey).length === 1 ? "y" : "ies"}.`);
  process.exit(failed ? 1 : 0);
}

async function ownerProjectForReferenceAtlas(project: ResolvedAtlasProject): Promise<string> {
  const identity = await readProjectIdentity(project);
  return identity.project;
}

export async function commandBibAdd(referenceAtlasInput: string | undefined, options: { raw?: string; file?: string }): Promise<void> {
  if (Boolean(options.raw) === Boolean(options.file)) cliError("bib add requires exactly one of --raw or --file.", 2);
  const resolved = await resolveCliProject(referenceAtlasInput);
  const ownerProject = await ownerProjectForReferenceAtlas(resolved);
  const source = options.raw ?? await fs.readFile(path.resolve(process.cwd(), expandHome(options.file as string)), "utf8");
  try {
    parseSingleBibEntry(source);
    const result = await appendBibEntryToUnverified(resolved.atlasRoot, ownerProject, source);
    for (const warning of result.warnings) {
      console.warn(`warning: normalized title + year matches ${warning.existingBibkey} (${warning.year}).`);
    }
    console.log(`Added ${result.entry.bibkey} to ${result.outputFile}`);
    console.log(`Backup: ${result.backupFile}`);
  } catch (error) {
    if (error instanceof BibError) cliError(error.message, error.exitCode);
    throw error;
  }
}

function normalizeBibkeySlug(bibkey: string): string {
  return bibkey
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function commandReferenceCreate(bibkey: string, referenceAtlasInput: string | undefined, options: { name?: string }): Promise<void> {
  const resolved = await resolveCliProject(referenceAtlasInput);
  const graph = await buildGraph(resolved);
  if (graph.config.atlas_type !== "reference") cliError("reference create must target a Reference Atlas.", 2);
  const registry = graph.bibRegistriesByOwner[graph.config.project];
  const entry = registry?.entriesByKey[bibkey];
  if (!entry) cliError(`BibTeX key not found in this Reference Atlas: ${bibkey}`, 1);
  const name = options.name?.trim() ?? `source.${normalizeBibkeySlug(bibkey)}`;
  if (!/^source\.[a-z][a-z0-9_]*$/.test(name)) cliError(`Invalid source root name ${name}; pass --name source.<work>.`, 2);
  if (graph.objectsByName[name]) cliError(`Object already exists: ${name}`, 1);
  if (graph.objects.some((object) => object.name.startsWith("source.") && object.citation?.bibkey === bibkey)) {
    cliError(`A source object for BibTeX key ${bibkey} already exists.`, 1);
  }
  const uid = generateUid(new Set(graph.objects.map((object) => object.uid)));
  const dir = path.join(resolved.atlasRoot, "objects", name);
  await fs.mkdir(dir, { recursive: true });
  await writeYamlFile(path.join(dir, "object.yml"), {
    uid,
    name,
    kind: "note",
    role: "literature",
    display_as: "literature_note",
    importance: "background",
    status: "draft",
    provenance: "external",
    title: entry.fields.title ?? bibkey,
    body: ["note.md"],
    citation: { bibkey }
  });
  await fs.writeFile(path.join(dir, "note.md"), `# ${entry.fields.title ?? bibkey}\n\nReading notes and verification status.\n`, "utf8");
  console.log(`Created ${name} (${uid})`);
}

async function commandReferenceAddResult(sourceName: string, resultName: string, referenceAtlasInput: string | undefined): Promise<void> {
  const resolved = await resolveCliProject(referenceAtlasInput);
  const graph = await buildGraph(resolved);
  if (graph.config.atlas_type !== "reference") cliError("reference add-result must target a Reference Atlas.", 2);
  const parent = graph.objectsByName[sourceName];
  if (!parent || !/^source\.[a-z][a-z0-9_]*$/.test(parent.name)) cliError(`Source root not found: ${sourceName}`, 1);
  const resultSegment = resultName.startsWith(`${sourceName}.claim.`) ? resultName.slice(`${sourceName}.claim.`.length) : resultName;
  if (!/^[a-z][a-z0-9_]*$/.test(resultSegment)) cliError(`Invalid result name segment: ${resultName}`, 2);
  const name = `${sourceName}.claim.${resultSegment}`;
  if (graph.objectsByName[name]) cliError(`Object already exists: ${name}`, 1);
  const uid = generateUid(new Set(graph.objects.map((object) => object.uid)));
  const dir = path.join(resolved.atlasRoot, "objects", name);
  await fs.mkdir(dir, { recursive: true });
  await writeYamlFile(path.join(dir, "object.yml"), {
    uid,
    name,
    kind: "math",
    role: "claim",
    display_as: "lemma",
    importance: "background",
    provenance: "external",
    status: "needs_check",
    title: resultSegment.replace(/_/g, " "),
    body: ["statement.md"],
    source_result: {
      parent: sourceName
    }
  });
  await fs.writeFile(path.join(dir, "statement.md"), "State the external result here.\n", "utf8");
  console.log(`Created ${name} (${uid})`);
}

export async function commandSuggest(project: string | undefined, options: {
  route?: string;
  output?: string;
}): Promise<void> {
  const graph = await buildGraph(project);
  const suggestionSet = await createSuggestionSet(graph, { routePath: options.route });
  if (options.output) {
    const outputPath = path.isAbsolute(expandHome(options.output))
      ? path.normalize(expandHome(options.output))
      : path.resolve(graph.root, expandHome(options.output));
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await writeYamlFile(outputPath, suggestionSet);
    console.log(`Wrote ${outputPath}`);
    console.log(`Pending suggestions: ${suggestionSet.suggestions.length}`);
    return;
  }
  process.stdout.write(stringifyYaml(suggestionSet));
}

export async function commandApplySuggestions(suggestionFile: string, project: string | undefined, options: {
  accept?: string[];
}): Promise<void> {
  const accepted = new Set(options.accept ?? []);
  if (accepted.size === 0) cliError(`apply-suggestions requires at least one --accept <id> or --accept all.`, 2);
  const graph = await buildGraph(project);
  const filePath = path.isAbsolute(expandHome(suggestionFile))
    ? path.normalize(expandHome(suggestionFile))
    : path.resolve(graph.root, expandHome(suggestionFile));
  const suggestionSet = await readSuggestionSet(filePath);
  const result = await applySuggestionSet(graph, suggestionSet, accepted);
  console.log(`Applied suggestions: ${result.applied.length}`);
  for (const id of result.applied) console.log(`  ${id}`);
  const acceptedButMissing = [...accepted].filter((id) => id !== "all" && !suggestionSet.suggestions.some((suggestion) => suggestion.id === id));
  for (const id of acceptedButMissing) console.log(`Skipped ${id}: not found`);
  if (result.skipped.length) console.log(`Skipped suggestions: ${result.skipped.length}`);
}

export async function commandRegister(input?: string): Promise<void> {
  const project = await resolveAtlasProject(input);
  const identity = await readProjectIdentity(project);
  const result = await registerResolvedProject(project, identity);
  if (result.warning) console.warn(`warning: ${result.warning}`);
  console.log(`Registered ${result.entry.id}: ${result.entry.atlas_root}`);
}

export async function commandProjects(): Promise<void> {
  const projects = await listRegistryProjects();
  if (projects.length === 0) {
    console.log("No registered projects.");
    return;
  }
  const rows = projects.map((project) => ({
    id: project.id,
    title: project.title,
    status: project.missing ? "missing" : "ok",
    last: project.last_opened,
    path: project.missing ? project.atlas_root : shortenHome(project.atlas_root)
  }));
  const widths = {
    id: Math.max("ID".length, ...rows.map((row) => row.id.length)),
    title: Math.max("Title".length, ...rows.map((row) => row.title.length)),
    status: Math.max("Status".length, ...rows.map((row) => row.status.length)),
    last: Math.max("Last opened".length, ...rows.map((row) => row.last.length))
  };
  console.log(`${"ID".padEnd(widths.id)}  ${"Title".padEnd(widths.title)}  ${"Status".padEnd(widths.status)}  ${"Last opened".padEnd(widths.last)}  Path`);
  for (const row of rows) {
    console.log(`${row.id.padEnd(widths.id)}  ${row.title.padEnd(widths.title)}  ${row.status.padEnd(widths.status)}  ${row.last.padEnd(widths.last)}  ${row.path}`);
  }
}

export async function commandUnregister(id: string): Promise<void> {
  if (!(await unregisterProject(id))) cliError(`Project id not found in registry: ${id}`, 1);
  console.log(`Unregistered ${id}`);
}

async function resolveDevProject(input?: string): Promise<ResolvedAtlasProject | undefined> {
  if (input !== undefined) return resolveProjectPathOrId(input);
  try {
    return await resolveAtlasProject(undefined);
  } catch (error) {
    if (error instanceof ProjectError) return undefined;
    throw error;
  }
}

async function main(): Promise<void> {
  const program = new Command();
  program
    .name("atlas")
    .description("Proof Atlas v0.1 local object graph workbench")
    .version("0.1.0");

  program.command("init")
    .argument("[dir]", "directory in which to create ProofAtlas/")
    .action(commandInit);

  program.command("check")
    .argument("[project]", "ProofAtlas directory or workspace directory")
    .option("--strict", "fail on strict-only problems")
    .action((project, options) => commandCheck(project, Boolean(options.strict)));

  program.command("doctor")
    .argument("[project]", "ProofAtlas directory or workspace directory")
    .action(commandDoctor);

  program.command("locate")
    .argument("<name-or-uid>", "object name or uid")
    .argument("[project]", "ProofAtlas directory or workspace directory")
    .action(commandLocate);

  program.command("new")
    .argument("<kind>")
    .argument("<role>")
    .argument("<name>")
    .argument("<title>")
    .argument("[project]", "ProofAtlas directory or workspace directory")
    .option("--project <project>", "ProofAtlas directory or workspace directory")
    .action((kind, role, name, title, project, options) => commandNew(kind, role, name, title, {
      project: options.project ?? project
    }));

  program.command("rename")
    .argument("<old-name>")
    .argument("<new-name>")
    .argument("[project]", "ProofAtlas directory or workspace directory")
    .option("--keep-dir", "do not move the object directory")
    .action((oldName, newName, project, options) => commandRename(oldName, newName, {
      project,
      keepDir: Boolean(options.keepDir)
    }));

  program.command("route")
    .argument("<target-or-route>", "object name/uid or views/*.route.yml")
    .argument("[project]", "ProofAtlas directory or workspace directory")
    .option("--profile <profile>", "proof")
    .option("--save <file>", "save a route recipe under the project")
    .option("--proof-choice <claim=proof>", "explicit claim to proof choice", collectOption, [])
    .option("--boundary <name>", "object boundary; may be repeated", collectOption, [])
    .option("--representation <name=mode>", "representation override; may be repeated", collectOption, [])
    .action((targetOrRoute, project, options) => commandRoute(targetOrRoute, project, options));

  program.command("export")
    .argument("<route-file>", "views/*.route.yml")
    .argument("[project]", "ProofAtlas directory or workspace directory")
    .option("--format <format>", "markdown, manifest, or json", "markdown")
    .option("--output <file>", "write export to a file")
    .option("--snapshot <file>", "write a frozen snapshot YAML")
    .option("--require-clean", "fail snapshot creation if active or mounted git repositories are dirty")
    .action((routeFile, project, options) => commandExport(routeFile, project, options));

  program.command("demo-data")
    .argument("[project]", "ProofAtlas directory or workspace directory")
    .option("--output <file>", "write static demo JSON", "public/demo-data.json")
    .option("--include-mounted", "include mounted Reference Atlas data after public allowlist checks")
    .action((project, options) => commandDemoData(project, {
      output: options.output,
      includeMounted: Boolean(options.includeMounted)
    }));

  const reference = program.command("reference")
    .description("Reference Atlas lookup and skeleton creation");

  reference.command("find")
    .argument("<query>")
    .argument("[project-or-reference-atlas]", "ProofAtlas path, workspace path, or registered project id")
    .option("--json", "print stable JSON")
    .action((query, projectOrReferenceAtlas, options) => commandReferenceFind(query, projectOrReferenceAtlas, {
      json: Boolean(options.json)
    }));

  reference.command("create")
    .argument("<bibkey>")
    .argument("[reference-atlas]", "Reference Atlas path, workspace path, or registered project id")
    .option("--name <name>", "explicit source.<work> object name")
    .action((bibkey, referenceAtlas, options) => commandReferenceCreate(bibkey, referenceAtlas, {
      name: options.name
    }));

  reference.command("add-result")
    .argument("<source-name>")
    .argument("<result-name>")
    .argument("[reference-atlas]", "Reference Atlas path, workspace path, or registered project id")
    .action(commandReferenceAddResult);

  const bib = program.command("bib")
    .description("Reference Atlas BibTeX checks and append-only add workflow");

  bib.command("check")
    .argument("[reference-atlas]", "Reference Atlas path, workspace path, or registered project id")
    .action(commandBibCheck);

  bib.command("add")
    .argument("[reference-atlas]", "Reference Atlas path, workspace path, or registered project id")
    .option("--raw <bibtex>", "single BibTeX entry")
    .option("--file <file>", "file containing a single BibTeX entry")
    .action((referenceAtlas, options) => commandBibAdd(referenceAtlas, options));

  program.command("suggest")
    .argument("[project]", "ProofAtlas directory or workspace directory")
    .option("--route <route-file>", "include route-level order_hints suggestions for a views/*.route.yml file")
    .option("--output <file>", "write pending suggestions YAML")
    .action((project, options) => commandSuggest(project, options));

  program.command("apply-suggestions")
    .argument("<suggestion-file>", "pending suggestion YAML")
    .argument("[project]", "ProofAtlas directory or workspace directory")
    .option("--accept <id>", "accepted suggestion id; use --accept all to apply every non-rejected suggestion", collectOption, [])
    .action((suggestionFile, project, options) => commandApplySuggestions(suggestionFile, project, options));

  program.command("register")
    .argument("[project]", "ProofAtlas directory or workspace directory")
    .action(commandRegister);

  program.command("projects")
    .action(commandProjects);

  program.command("unregister")
    .argument("<project-id>", "registry project id")
    .action(commandUnregister);

  program.command("dev")
    .argument("[project]", "ProofAtlas directory, workspace directory, or registry project id")
    .option("--port <port>", "HTTP port", (value) => Number.parseInt(value, 10), DEFAULT_DEV_SERVER_PORT)
    .action(async (project, options) => {
      await startDevServer(await resolveDevProject(project), { port: options.port });
    });

  await program.parseAsync(process.argv);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    if (error instanceof ProjectError) cliError(error.message, 2);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
