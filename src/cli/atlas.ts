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
import { buildBodyFiles, buildGraph, findObject } from "../core/graph";
import { exportRoute, createSnapshot, type ExportFormat } from "../core/contextExporter";
import { edgeTargets } from "../core/edgeUtils";
import { parseMarkdownReferences, rewriteMarkdownObjectNames } from "../core/markdownRefs";
import { pathExists, listFilesRecursive } from "../core/pathUtils";
import { hasCheckErrors } from "../core/problems";
import { expandHome, ProjectError, resolveAtlasProject } from "../core/project";
import { formatLocalReference } from "../core/reference";
import { resolveRoute, type ResolvedRoute } from "../core/routeResolver";
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
  if (graph.objectsByName[newName]) cliError(`Target object name already exists: ${newName}`, 1);

  const objectFiles = graph.objects.map((item) => path.join(root, item.objectPath));
  for (const file of objectFiles) await rewriteObjectYaml(file, oldName, newName);
  const routeFiles = await listFilesRecursive(path.join(root, "views"), (file) => /\.route\.ya?ml$/.test(file));
  for (const file of routeFiles) await rewriteRouteYaml(file, oldName, newName);

  const markdownFiles = [
    ...graph.objects.flatMap((item) => item.body.map((body) => path.join(root, item.dir, body))),
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
  if (!["meaning", "proof", "audit", "history"].includes(profile)) {
    cliError(`Invalid profile ${profile}; expected meaning, proof, audit, or history.`, 2);
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
      order: "prerequisites_first",
      show_graph: true,
      show_status: true
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

function formatMarginalCost(node: ResolvedRoute["nodes"][number]): string {
  const parts: string[] = [];
  if (node.marginalCost.downgrade_to_statement !== undefined) {
    parts.push(`to statement ${node.marginalCost.downgrade_to_statement >= 0 ? "saves" : "adds"} ${Math.abs(node.marginalCost.downgrade_to_statement)}`);
  }
  if (node.marginalCost.downgrade_to_summary !== undefined) {
    parts.push(`to summary ${node.marginalCost.downgrade_to_summary >= 0 ? "saves" : "adds"} ${Math.abs(node.marginalCost.downgrade_to_summary)}`);
  }
  if (node.marginalCost.downgrade_to_reference !== undefined) {
    parts.push(`to reference ${node.marginalCost.downgrade_to_reference >= 0 ? "saves" : "adds"} ${Math.abs(node.marginalCost.downgrade_to_reference)}`);
  }
  if (node.marginalCost.upgrade_to_full !== undefined) {
    parts.push(`to full adds ${node.marginalCost.upgrade_to_full}`);
  }
  return parts.join("; ");
}

function printRouteSummary(route: ResolvedRoute, graph: Awaited<ReturnType<typeof buildGraph>>): void {
  console.log(`Route target: ${route.target.name}`);
  console.log(`Profile: ${route.profile}`);
  console.log(`Closed: ${route.closed ? "yes" : "no"}`);
  console.log(`Cloud context sufficient: ${route.contentSufficient ? "yes" : "no"}`);
  console.log(`Objects: ${route.nodes.length}`);
  console.log(`Estimated tokens: ${route.totalTokens}`);
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
    const tokens = node.tokenEstimates;
    console.log(`  ${node.object.name} ${node.decision} ${node.representation} depth=${node.depth} hard=${node.hardness} tokens=${node.marginalCost.current} [full=${tokens.full}, statement=${tokens.statement}, summary=${tokens.summary}, reference=${tokens.reference}]`);
    if (node.witnessPaths.length) {
      console.log(`    why: ${node.witnessPaths[0].join(" -> ")}`);
      for (const witness of node.witnessPaths.slice(1, 3)) console.log(`    also: ${witness.join(" -> ")}`);
      if (node.witnessPaths.length > 3) console.log(`    also: ${node.witnessPaths.length - 3} more witness path(s)`);
    }
    const marginal = formatMarginalCost(node);
    if (marginal) console.log(`    marginal: ${marginal}`);
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
    await writeYamlFile(snapshotPath, await createSnapshot(graph, recipe, resolved));
    console.log(`Wrote snapshot ${snapshotPath}`);
  }
  if (result.diagnostics.length && options.output) {
    console.log(`Diagnostics: ${result.diagnostics.length}`);
  }
}

function compactDemoPath(repoRoot: string, value: string): string {
  if (!path.isAbsolute(value)) return value.split(path.sep).join("/");
  const relative = path.relative(repoRoot, value);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) return relative ? relative.split(path.sep).join("/") : ".";
  return value.split(path.sep).join("/");
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
    object.origin.atlasRoot = compact(object.origin.atlasRoot) ?? object.origin.atlasRoot;
  };
  for (const object of demoGraph.objects) compactObject(object);
  for (const object of Object.values(demoGraph.objectsByUid)) compactObject(object);
  for (const object of Object.values(demoGraph.objectsByName)) compactObject(object);

  for (const mount of demoGraph.referenceMounts) {
    mount.root = compactNullable(mount.root);
    mount.realRoot = compactNullable(mount.realRoot);
  }
  for (const entry of Object.values(demoGraph.bibRegistry.entriesByKey)) {
    entry.file = compact(entry.file);
    entry.registryPath = compact(entry.registryPath);
  }

  return demoGraph;
}

export async function commandDemoData(project: string | undefined, options: {
  output?: string;
}): Promise<void> {
  const graph = await buildGraph(project);
  const bodies = Object.fromEntries(await Promise.all(graph.objects.map(async (object) => [
    object.uid,
    await buildBodyFiles(graph, object)
  ] as const)));
  const repoRoot = process.cwd();
  const payload = {
    schema_version: "0.1",
    generated_at: new Date().toISOString(),
    source_project: compactDemoPath(repoRoot, graph.atlasRoot),
    graph: compactDemoGraphPaths(graph, repoRoot),
    bodies
  };
  const outputPath = options.output
    ? path.resolve(process.cwd(), expandHome(options.output))
    : path.resolve(process.cwd(), "public", "demo-data.json");
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote demo data for ${graph.config.title}: ${outputPath}`);
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
    .option("--profile <profile>", "meaning, proof, audit, or history")
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
    .action((routeFile, project, options) => commandExport(routeFile, project, options));

  program.command("demo-data")
    .argument("[project]", "ProofAtlas directory or workspace directory")
    .option("--output <file>", "write static demo JSON", "public/demo-data.json")
    .action((project, options) => commandDemoData(project, options));

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
