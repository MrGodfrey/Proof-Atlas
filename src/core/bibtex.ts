import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { AtlasProblem, BibRegistryEntry, BibTrust, NormalizedBibRegistry } from "./types";
import { isPlainObject, pathExists } from "./pathUtils";
import { problem } from "./problems";
import { expandHome } from "./project";
import { readYamlFile } from "./yaml";

const BIB_TRUST_GROUPS: BibTrust[] = ["trusted", "unverified", "rejected"];

export interface ParsedBibEntry {
  bibkey: string;
  entryType: string;
  fields: Record<string, string>;
  raw: string;
  normalizedDoi?: string;
  normalizedArxiv?: string;
  normalizedTitle?: string;
  year?: string;
}

export interface BibTitleYearWarning {
  bibkey: string;
  existingBibkey: string;
  normalizedTitle: string;
  year: string;
}

export interface BibAddResult {
  entry: ParsedBibEntry;
  outputFile: string;
  backupFile: string;
  warnings: BibTitleYearWarning[];
}

export class BibError extends Error {
  readonly exitCode = 2;
}

function stripBibValue(value: string): string {
  return value
    .replace(/\\[{}]/g, "")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeDoi(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = stripBibValue(value)
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .replace(/[.,;:\s]+$/g, "")
    .toLowerCase();
  return normalized || undefined;
}

export function normalizeArxiv(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = stripBibValue(value)
    .trim()
    .replace(/^https?:\/\/arxiv\.org\/(?:abs|pdf)\//i, "")
    .replace(/^arxiv:\s*/i, "")
    .replace(/\.pdf$/i, "")
    .replace(/v\d+$/i, "")
    .replace(/[.,;:\s]+$/g, "");
  return normalized || undefined;
}

export function normalizeTitle(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = stripBibValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return normalized || undefined;
}

function resolvePathFromAtlas(atlasRoot: string, value: string): string {
  const expanded = expandHome(value);
  return path.isAbsolute(expanded) ? path.normalize(expanded) : path.resolve(atlasRoot, expanded);
}

function findEntryEnd(source: string, openIndex: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    const previous = index > 0 ? source[index - 1] : "";
    if (quote) {
      if (char === quote && previous !== "\\") quote = null;
      continue;
    }
    if (char === "\"") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

function parseFields(entry: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const firstComma = entry.indexOf(",");
  const lastBrace = entry.lastIndexOf("}");
  if (firstComma < 0 || lastBrace < firstComma) return fields;
  const body = entry.slice(firstComma + 1, lastBrace);
  let index = 0;
  while (index < body.length) {
    while (index < body.length && /[\s,]/.test(body[index])) index += 1;
    const nameStart = index;
    while (index < body.length && /[A-Za-z0-9_-]/.test(body[index])) index += 1;
    const name = body.slice(nameStart, index).toLowerCase();
    while (index < body.length && /\s/.test(body[index])) index += 1;
    if (!name || body[index] !== "=") {
      index += 1;
      continue;
    }
    index += 1;
    while (index < body.length && /\s/.test(body[index])) index += 1;
    let value = "";
    if (body[index] === "{") {
      const valueStart = index + 1;
      let depth = 1;
      index += 1;
      while (index < body.length && depth > 0) {
        if (body[index] === "{") depth += 1;
        if (body[index] === "}") depth -= 1;
        index += 1;
      }
      value = body.slice(valueStart, index - 1);
    } else if (body[index] === "\"") {
      const valueStart = index + 1;
      index += 1;
      while (index < body.length && (body[index] !== "\"" || body[index - 1] === "\\")) index += 1;
      value = body.slice(valueStart, index);
      index += 1;
    } else {
      const valueStart = index;
      while (index < body.length && body[index] !== ",") index += 1;
      value = body.slice(valueStart, index);
    }
    fields[name] = stripBibValue(value);
  }
  return fields;
}

function parsedEntry(entryType: string, bibkey: string, raw: string): ParsedBibEntry {
  const fields = parseFields(raw);
  const arxiv = fields.eprint && /arxiv/i.test(fields.archiveprefix ?? fields.eprinttype ?? "")
    ? fields.eprint
    : fields.arxiv ?? fields.eprint;
  const normalizedDoi = normalizeDoi(fields.doi);
  const normalizedArxiv = normalizeArxiv(arxiv);
  const normalizedTitle = normalizeTitle(fields.title);
  const year = fields.year?.trim();
  return {
    bibkey,
    entryType,
    fields,
    raw: raw.trim(),
    ...(normalizedDoi ? { normalizedDoi } : {}),
    ...(normalizedArxiv ? { normalizedArxiv } : {}),
    ...(normalizedTitle ? { normalizedTitle } : {}),
    ...(year ? { year } : {})
  };
}

export function parseBibEntries(source: string): ParsedBibEntry[] {
  const entries: ParsedBibEntry[] = [];
  const pattern = /@([A-Za-z]+)\s*\{\s*([^,\s]+)\s*,/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const open = source.indexOf("{", match.index);
    if (open < 0) continue;
    const end = findEntryEnd(source, open);
    if (end < 0) continue;
    entries.push(parsedEntry(match[1], match[2], source.slice(match.index, end)));
    pattern.lastIndex = end;
  }
  return entries;
}

export function parseSingleBibEntry(source: string): ParsedBibEntry {
  const entries = parseBibEntries(source);
  if (entries.length !== 1) {
    throw new BibError(`Expected exactly one BibTeX entry, found ${entries.length}.`);
  }
  return entries[0];
}

function normalizeBibRegistryFiles(raw: unknown, trust: BibTrust, registryPath: string, problems: AtlasProblem[]): Array<{ id: string; path: string }> {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    problems.push(problem({
      severity: "error",
      code: "invalid_bib_registry_group",
      message: `bib-registry.yml ${trust} must be a list.`,
      path: registryPath,
      strict: true
    }));
    return [];
  }
  return raw.flatMap((item, index) => {
    if (typeof item === "string" && item.trim()) {
      return [{ id: `${trust}-${index + 1}`, path: item.trim() }];
    }
    if (!isPlainObject(item) || typeof item.path !== "string" || !item.path.trim()) {
      problems.push(problem({
        severity: "error",
        code: "invalid_bib_registry_file",
        message: `bib-registry.yml ${trust} entries need a path.`,
        path: registryPath,
        strict: true
      }));
      return [];
    }
    return [{
      id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : `${trust}-${index + 1}`,
      path: item.path.trim()
    }];
  });
}

function registryEntry(ownerProject: string, registryId: string, registryPath: string, filePath: string, trust: BibTrust, entry: ParsedBibEntry): BibRegistryEntry {
  return {
    ownerProject,
    bibkey: entry.bibkey,
    entryType: entry.entryType,
    fields: entry.fields,
    raw: entry.raw,
    sourceFile: filePath,
    trust,
    file: filePath,
    registryId,
    registryPath,
    ...(entry.normalizedDoi ? { normalizedDoi: entry.normalizedDoi } : {}),
    ...(entry.normalizedArxiv ? { normalizedArxiv: entry.normalizedArxiv } : {}),
    ...(entry.normalizedTitle ? { normalizedTitle: entry.normalizedTitle } : {}),
    ...(entry.year ? { year: entry.year } : {})
  };
}

export async function loadBibRegistryForRoot(atlasRoot: string, ownerProject: string, problems: AtlasProblem[]): Promise<NormalizedBibRegistry> {
  const registryPath = path.join(atlasRoot, "bib-registry.yml");
  const entriesByKey: Record<string, BibRegistryEntry> = {};
  const files: NormalizedBibRegistry["files"] = [];
  if (!(await pathExists(registryPath))) return { ownerProject, registryPath: null, entriesByKey, files };
  const raw = await readYamlFile<unknown>(registryPath);
  if (!isPlainObject(raw)) {
    problems.push(problem({
      severity: "error",
      code: "invalid_bib_registry",
      message: "bib-registry.yml must be a YAML mapping.",
      path: registryPath,
      strict: true
    }));
    return { ownerProject, registryPath, entriesByKey, files };
  }
  if (raw.schema_version !== "0.1") {
    problems.push(problem({
      severity: "error",
      code: "invalid_bib_registry_schema_version",
      message: `bib-registry.yml schema_version must be "0.1".`,
      path: registryPath,
      strict: true
    }));
  }
  const doiOwners = new Map<string, BibRegistryEntry>();
  const arxivOwners = new Map<string, BibRegistryEntry>();
  for (const trust of BIB_TRUST_GROUPS) {
    for (const fileRef of normalizeBibRegistryFiles(raw[trust], trust, registryPath, problems)) {
      const filePath = resolvePathFromAtlas(atlasRoot, fileRef.path);
      files.push({ id: fileRef.id, path: fileRef.path, file: filePath, trust });
      if (!(await pathExists(filePath))) {
        problems.push(problem({
          severity: "error",
          code: "missing_bib_registry_file",
          message: `Bib registry file ${fileRef.path} does not exist.`,
          path: registryPath,
          target: fileRef.id,
          strict: true
        }));
        continue;
      }
      const source = await fs.readFile(filePath, "utf8");
      for (const parsed of parseBibEntries(source)) {
        const existing = entriesByKey[parsed.bibkey];
        if (existing) {
          problems.push(problem({
            severity: "error",
            code: "duplicate_bibkey",
            message: `BibTeX key ${parsed.bibkey} appears more than once in owner ${ownerProject}.`,
            path: registryPath,
            target: parsed.bibkey,
            strict: true
          }));
          continue;
        }
        const entry = registryEntry(ownerProject, fileRef.id, registryPath, filePath, trust, parsed);
        entriesByKey[parsed.bibkey] = entry;
        if (entry.normalizedDoi) {
          const duplicate = doiOwners.get(entry.normalizedDoi);
          if (duplicate) {
            problems.push(problem({
              severity: "error",
              code: "duplicate_bib_doi",
              message: `DOI ${entry.normalizedDoi} appears in both ${duplicate.bibkey} and ${entry.bibkey}.`,
              path: registryPath,
              target: entry.normalizedDoi,
              strict: true
            }));
          } else {
            doiOwners.set(entry.normalizedDoi, entry);
          }
        }
        if (entry.normalizedArxiv) {
          const duplicate = arxivOwners.get(entry.normalizedArxiv);
          if (duplicate) {
            problems.push(problem({
              severity: "error",
              code: "duplicate_bib_arxiv",
              message: `arXiv id ${entry.normalizedArxiv} appears in both ${duplicate.bibkey} and ${entry.bibkey}.`,
              path: registryPath,
              target: entry.normalizedArxiv,
              strict: true
            }));
          } else {
            arxivOwners.set(entry.normalizedArxiv, entry);
          }
        }
      }
    }
  }
  return { ownerProject, registryPath, entriesByKey, files };
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function titleYearWarnings(entry: ParsedBibEntry, registry: NormalizedBibRegistry): BibTitleYearWarning[] {
  if (!entry.normalizedTitle || !entry.year) return [];
  return Object.values(registry.entriesByKey)
    .filter((existing) => existing.normalizedTitle === entry.normalizedTitle && existing.year === entry.year)
    .map((existing) => ({
      bibkey: entry.bibkey,
      existingBibkey: existing.bibkey,
      normalizedTitle: entry.normalizedTitle as string,
      year: entry.year as string
    }));
}

function assertNoHardDuplicate(entry: ParsedBibEntry, registry: NormalizedBibRegistry): void {
  if (registry.entriesByKey[entry.bibkey]) {
    throw new BibError(`BibTeX key already exists: ${entry.bibkey}.`);
  }
  if (entry.normalizedDoi) {
    const duplicate = Object.values(registry.entriesByKey).find((existing) => existing.normalizedDoi === entry.normalizedDoi);
    if (duplicate) throw new BibError(`DOI ${entry.normalizedDoi} already exists on ${duplicate.bibkey}.`);
  }
  if (entry.normalizedArxiv) {
    const duplicate = Object.values(registry.entriesByKey).find((existing) => existing.normalizedArxiv === entry.normalizedArxiv);
    if (duplicate) throw new BibError(`arXiv id ${entry.normalizedArxiv} already exists on ${duplicate.bibkey}.`);
  }
}

export async function appendBibEntryToUnverified(atlasRoot: string, ownerProject: string, source: string): Promise<BibAddResult> {
  const entry = parseSingleBibEntry(source);
  const problems: AtlasProblem[] = [];
  const registry = await loadBibRegistryForRoot(atlasRoot, ownerProject, problems);
  const blocking = problems.find((item) => item.severity === "error");
  if (blocking) throw new BibError(blocking.message);
  assertNoHardDuplicate(entry, registry);
  const unverified = registry.files.find((file) => file.trust === "unverified");
  if (!unverified) throw new BibError("bib-registry.yml needs an unverified file for bib add.");
  const before = (await pathExists(unverified.file)) ? await fs.readFile(unverified.file, "utf8") : "";
  const beforeHash = sha256(before);
  const beforeStat = (await pathExists(unverified.file)) ? await fs.stat(unverified.file) : null;
  const backupDir = path.join(atlasRoot, ".atlas", "backups");
  await fs.mkdir(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `bib-add-${Date.now()}-${entry.bibkey}.bib`);
  await fs.writeFile(backupFile, before, "utf8");

  const current = (await pathExists(unverified.file)) ? await fs.readFile(unverified.file, "utf8") : "";
  const currentStat = (await pathExists(unverified.file)) ? await fs.stat(unverified.file) : null;
  if (sha256(current) !== beforeHash || currentStat?.mtimeMs !== beforeStat?.mtimeMs) {
    throw new BibError("Bib file changed while preparing append; retry after reloading the file.");
  }
  const separator = current.length === 0 || current.endsWith("\n") ? "" : "\n";
  const next = `${current}${separator}${entry.raw.trim()}\n`;
  const tempFile = path.join(path.dirname(unverified.file), `.${path.basename(unverified.file)}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tempFile, next, "utf8");
  await fs.rename(tempFile, unverified.file);
  return {
    entry,
    outputFile: unverified.file,
    backupFile,
    warnings: titleYearWarnings(entry, registry)
  };
}
