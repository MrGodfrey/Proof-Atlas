import MarkdownIt from "markdown-it";
import katex from "katex";
import type StateBlock from "markdown-it/lib/rules_block/state_block.mjs";
import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";
import type Token from "markdown-it/lib/token.mjs";
import { parseMarkdownReferences } from "./markdownRefs";
import type { BodyBlock } from "./types";

export interface MarkdownTokenSnapshot {
  type: string;
  tag: string;
  markup: string;
  content: string;
  block: boolean;
  map: [number, number] | null;
}

interface LinkTargetMeta {
  name: string;
  title?: string;
  display_as?: string;
  role?: string;
}

type LinkResolver = (name: string) => boolean | LinkTargetMeta | undefined;

const md = new MarkdownIt({
  html: true,
  linkify: false,
  typographer: false
});

function renderKatex(source: string, displayMode: boolean): string {
  return katex.renderToString(source.trim(), {
    displayMode,
    throwOnError: false,
    strict: "ignore",
    trust: false,
    output: "htmlAndMathml"
  });
}

function mathInlineRule(state: StateInline, silent: boolean): boolean {
  if (state.src.charCodeAt(state.pos) !== 0x24 /* $ */) return false;
  if (state.src.charCodeAt(state.pos + 1) === 0x24) return false;
  if (state.pos > 0 && state.src.charCodeAt(state.pos - 1) === 0x5c /* \ */) return false;

  let close = state.pos + 1;
  while ((close = state.src.indexOf("$", close)) !== -1) {
    if (state.src.charCodeAt(close - 1) !== 0x5c /* \ */) break;
    close += 1;
  }
  if (close === -1) return false;

  const content = state.src.slice(state.pos + 1, close);
  if (!content.trim() || content.includes("\n")) return false;
  if (!silent) {
    const token = state.push("math_inline", "math", 0);
    token.content = content;
    token.markup = "$";
  }
  state.pos = close + 1;
  return true;
}

function mathBlockRule(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const start = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  const marker = state.src.slice(start, start + 2);
  if (marker !== "$$") return false;

  const firstLineTail = state.src.slice(start + 2, max);
  let nextLine = startLine;
  let content = "";
  const sameLineClose = firstLineTail.indexOf("$$");

  if (sameLineClose !== -1) {
    content = firstLineTail.slice(0, sameLineClose);
  } else {
    const lines: string[] = [firstLineTail];
    while (nextLine + 1 < endLine) {
      nextLine += 1;
      const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
      const lineEnd = state.eMarks[nextLine];
      const line = state.src.slice(lineStart, lineEnd);
      const close = line.indexOf("$$");
      if (close !== -1) {
        lines.push(line.slice(0, close));
        break;
      }
      lines.push(line);
    }
    if (nextLine + 1 >= endLine && !state.src.slice(state.bMarks[nextLine] + state.tShift[nextLine], state.eMarks[nextLine]).includes("$$")) {
      return false;
    }
    content = lines.join("\n");
  }

  if (silent) return true;
  const token = state.push("math_block", "math", 0);
  token.block = true;
  token.content = content;
  token.markup = "$$";
  token.map = [startLine, nextLine + 1];
  state.line = nextLine + 1;
  return true;
}

md.inline.ruler.before("escape", "math_inline", mathInlineRule);
md.block.ruler.before("fence", "math_block", mathBlockRule, {
  alt: ["paragraph", "reference", "blockquote", "list"]
});
md.renderer.rules.math_inline = (tokens: Token[], idx: number) => renderKatex(tokens[idx].content, false);
md.renderer.rules.math_block = (tokens: Token[], idx: number) => `<div class="math-display">${renderKatex(tokens[idx].content, true)}</div>\n`;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function targetMeta(value: boolean | LinkTargetMeta | undefined): LinkTargetMeta | undefined {
  return value && typeof value === "object" ? value : undefined;
}

function targetExists(value: boolean | LinkTargetMeta | undefined): boolean {
  return Boolean(value);
}

function compactName(name: string): string {
  return (name.split(".").at(-1) ?? name)
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .trim();
}

function referenceLabel(meta: LinkTargetMeta): string {
  const short = compactName(meta.name);
  if (meta.role === "model") {
    if (/\badjoint system\b/i.test(short)) return "adjoint system";
    if (/\bforward\b/i.test(short) && /\bsystem\b/i.test(short)) return "forward system";
    return short.replace(/\bsemi discrete\b|\bsemidiscrete\b/gi, "").replace(/\s+/g, " ").trim() || "model";
  }
  if (meta.title && meta.title.length <= 38) return meta.title;
  return short;
}

function linkTextWithContext(text: string, meta?: LinkTargetMeta): string {
  if (!meta) return text;
  if (meta.display_as === "literature_note" || meta.role === "literature") {
    return text.startsWith("[") && text.endsWith("]") ? text : `[${text}]`;
  }
  return text;
}

function linkWrapperKind(meta?: LinkTargetMeta): "literature" | undefined {
  if (!meta) return undefined;
  if (meta.display_as === "literature_note" || meta.role === "literature") return "literature";
  return undefined;
}

export function linkifyObjectRefs(
  source: string,
  resolve: LinkResolver,
  currentObjectName?: string
): string {
  const refs = parseMarkdownReferences(source)
    .filter((ref) => ref.kind === "link")
    .sort((a, b) => b.start - a.start);
  let out = source;
  for (const ref of refs) {
    const resolved = resolve(ref.target);
    const ok = targetExists(resolved);
    const meta = targetMeta(resolved);
    const label = ref.displayText || (meta ? referenceLabel(meta) : ref.target);
    const text = escapeHtml(linkTextWithContext(label, meta));
    const className = ok ? "pa-link" : "pa-link pa-broken";
    const objectName = meta?.name ?? ref.target;
    const displayAs = meta?.display_as ? ` data-display-as="${escapeHtml(meta.display_as)}"` : "";
    const objectRole = meta?.role ? ` data-object-role="${escapeHtml(meta.role)}"` : "";
    const wrapperKind = linkWrapperKind(meta);
    const linkWrapper = wrapperKind ? ` data-link-wrapper="${wrapperKind}"` : "";
    const current = currentObjectName ? ` data-current-object="${escapeHtml(currentObjectName)}"` : "";
    const html = `<a href="#" class="${className}" data-object-name="${escapeHtml(objectName)}"${displayAs}${objectRole}${linkWrapper}${current} title="${ok ? "Open object" : `Object not found: ${escapeHtml(ref.target)}`}">${text}</a>`;
    out = `${out.slice(0, ref.start)}${html}${out.slice(ref.end)}`;
  }
  return out;
}

export function renderMarkdownBlock(
  source: string,
  resolve: LinkResolver,
  currentObjectName?: string
): string {
  return md.render(linkifyObjectRefs(source, resolve, currentObjectName));
}

export function inspectMarkdownTokens(source: string): MarkdownTokenSnapshot[] {
  return md.parse(source, {}).map((token) => ({
    type: token.type,
    tag: token.tag,
    markup: token.markup,
    content: token.content,
    block: token.block,
    map: token.map as [number, number] | null
  }));
}

function renderDisplayMathBlock(source: string): string {
  const body = source.trim().replace(/^\$\$/, "").replace(/\$\$$/, "").trim();
  return `<div class="math-display">${renderKatex(body, true)}</div>`;
}

function blockKind(raw: string): BodyBlock["kind"] {
  const trimmed = raw.trimStart();
  if (/^#{1,6}\s/.test(trimmed)) return "heading";
  if (/^(```|~~~)/.test(trimmed)) return "code_block";
  if (/^\$\$/.test(trimmed)) return "display_math";
  if (/^[-*+]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) return "list_item";
  return "paragraph";
}

function excerpt(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 120);
}

export function splitMarkdownBlocks(
  source: string,
  file: string,
  resolve: LinkResolver,
  currentObjectName?: string
): BodyBlock[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].trim()) {
      i += 1;
      continue;
    }
    const start = lines[i];
    if (/^(```|~~~)/.test(start.trimStart())) {
      const fence = start.trimStart().slice(0, 3);
      const chunk = [start];
      i += 1;
      while (i < lines.length) {
        chunk.push(lines[i]);
        if (lines[i].trimStart().startsWith(fence)) {
          i += 1;
          break;
        }
        i += 1;
      }
      blocks.push(chunk.join("\n"));
      continue;
    }
    if (start.trimStart().startsWith("$$")) {
      const chunk = [start];
      i += 1;
      while (i < lines.length) {
        chunk.push(lines[i]);
        if (lines[i].trimEnd().endsWith("$$")) {
          i += 1;
          break;
        }
        i += 1;
      }
      blocks.push(chunk.join("\n"));
      continue;
    }
    if (/^#{1,6}\s/.test(start.trimStart())) {
      blocks.push(start);
      i += 1;
      continue;
    }
    const chunk = [start];
    i += 1;
    while (i < lines.length && lines[i].trim()) {
      if (/^#{1,6}\s/.test(lines[i].trimStart())) break;
      if (/^(```|~~~)/.test(lines[i].trimStart())) break;
      if (lines[i].trimStart().startsWith("$$")) break;
      chunk.push(lines[i]);
      i += 1;
    }
    blocks.push(chunk.join("\n"));
  }

  return blocks.map((raw, index) => {
    const kind = blockKind(raw);
    return {
      id: `b${String(index + 1).padStart(3, "0")}`,
      file,
      kind,
      markdown: raw,
      html: kind === "display_math" ? renderDisplayMathBlock(raw) : renderMarkdownBlock(raw, resolve, currentObjectName),
      excerpt: excerpt(raw)
    };
  });
}
