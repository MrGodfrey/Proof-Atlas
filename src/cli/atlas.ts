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
import { buildGraph, findObject } from "../core/graph";
import { parseMarkdownReferences, rewriteMarkdownObjectNames } from "../core/markdownRefs";
import { pathExists, listFilesRecursive } from "../core/pathUtils";
import { hasCheckErrors } from "../core/problems";
import { ProjectError, resolveProjectRoot } from "../core/project";
import { formatLocalReference } from "../core/reference";
import {
  KINDS,
  ROLES_BY_KIND,
  EDGE_TYPES,
  type ObjectKind,
  type ObjectRole
} from "../core/types";
import { readYamlFile, writeYamlFile } from "../core/yaml";
import { agentsTemplate, atlasConfigTemplate, dashboardTemplate } from "./templates";
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

async function writeIfMissing(filePath: string, content: string): Promise<void> {
  if (await pathExists(filePath)) return;
  await fs.writeFile(filePath, content, "utf8");
}

function initTarget(input?: string): string {
  const resolved = path.resolve(process.cwd(), input ?? "ProofAtlas");
  return path.basename(resolved) === "ProofAtlas" ? resolved : path.join(resolved, "ProofAtlas");
}

export async function commandInit(input?: string): Promise<void> {
  const root = initTarget(input);
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
  await fs.writeFile(path.join(root, "AGENTS.md"), agentsTemplate(config), "utf8");
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
  const root = await resolveProjectRoot(options.project);
  const graph = await buildGraph(root);
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
  const root = await resolveProjectRoot(project);
  const graph = await buildGraph(root);
  await fs.mkdir(path.join(root, ".atlas", "cache"), { recursive: true });
  await fs.writeFile(path.join(root, "AGENTS.md"), agentsTemplate(graph.config), "utf8");
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
  }
  printProblems(graph.problems);
  for (const warning of warnings) console.log(`[warning] doctor: ${warning}`);
  console.log(`Updated ${path.join(root, "AGENTS.md")}`);
}

async function rewriteObjectYaml(file: string, oldName: string, newName: string): Promise<void> {
  const raw = await readYamlFile<Record<string, unknown>>(file);
  if (raw.name === oldName) raw.name = newName;
  if (raw.edges && typeof raw.edges === "object" && !Array.isArray(raw.edges)) {
    for (const edge of EDGE_TYPES) {
      const list = (raw.edges as Record<string, unknown>)[edge];
      if (Array.isArray(list)) {
        (raw.edges as Record<string, unknown>)[edge] = list.map((item) => item === oldName ? newName : item);
      }
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
  const root = await resolveProjectRoot(options.project);
  const graph = await buildGraph(root);
  const object = findObject(graph, oldName);
  if (!object) cliError(`Object not found: ${oldName}`, 1);
  if (graph.objectsByName[newName]) cliError(`Target object name already exists: ${newName}`, 1);

  const objectFiles = graph.objects.map((item) => path.join(root, item.objectPath));
  for (const file of objectFiles) await rewriteObjectYaml(file, oldName, newName);

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
    .argument("[project]", "ProofAtlas project root")
    .option("--strict", "fail on strict-only problems")
    .action((project, options) => commandCheck(project, Boolean(options.strict)));

  program.command("doctor")
    .argument("[project]", "ProofAtlas project root")
    .action(commandDoctor);

  program.command("locate")
    .argument("<name-or-uid>", "object name or uid")
    .argument("[project]", "ProofAtlas project root")
    .action(commandLocate);

  program.command("new")
    .argument("<kind>")
    .argument("<role>")
    .argument("<name>")
    .argument("<title>")
    .option("--project <project>", "ProofAtlas project root")
    .action(commandNew);

  program.command("rename")
    .argument("<old-name>")
    .argument("<new-name>")
    .argument("[project]", "ProofAtlas project root")
    .option("--keep-dir", "do not move the object directory")
    .action((oldName, newName, project, options) => commandRename(oldName, newName, {
      project,
      keepDir: Boolean(options.keepDir)
    }));

  program.command("dev")
    .argument("[project]", "ProofAtlas project root")
    .option("--port <port>", "HTTP port", (value) => Number.parseInt(value, 10), 3217)
    .action(async (project, options) => {
      const root = await resolveProjectRoot(project);
      await startDevServer(root, { port: options.port });
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
