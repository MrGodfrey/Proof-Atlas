export interface MarkdownReference {
  kind: "link" | "embed";
  target: string;
  displayText?: string;
  option?: string;
  start: number;
  end: number;
  targetStart: number;
  targetEnd: number;
  raw: string;
  hasPipe: boolean;
  invalid?: string;
}

export interface InvalidEmbedOptionSpacing {
  target: string;
  option: string;
  start: number;
  end: number;
  raw: string;
}

interface Range {
  start: number;
  end: number;
}

function addRegexRanges(source: string, ranges: Range[], regex: RegExp): void {
  regex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source))) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
}

function protectedRanges(source: string, includeMath: boolean): Range[] {
  const ranges: Range[] = [];
  addRegexRanges(source, ranges, /(^|\n)(```|~~~)[^\n]*\n[\s\S]*?\n\2(?=\n|$)/g);
  addRegexRanges(source, ranges, /`+[^`\n]*`+/g);
  if (includeMath) {
    addRegexRanges(source, ranges, /\$\$[\s\S]*?\$\$/g);
    addRegexRanges(source, ranges, /(?<!\\)\$(?!\$)[\s\S]*?(?<!\\)\$/g);
  }
  ranges.sort((a, b) => a.start - b.start);
  return ranges;
}

function isProtected(index: number, ranges: Range[]): boolean {
  return ranges.some((range) => index >= range.start && index < range.end);
}

export function parseMarkdownReferences(source: string): MarkdownReference[] {
  const ranges = protectedRanges(source, true);
  const refs: MarkdownReference[] = [];
  const regex = /(!)?\[\[([^\]\n]+)\]\](\{[^}\n]+\})?/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source))) {
    if (isProtected(match.index, ranges)) continue;
    const isEmbed = Boolean(match[1]);
    const fullTarget = match[2];
    const rawTarget = fullTarget.trim();
    const pipeIndex = rawTarget.indexOf("|");
    const hasPipe = pipeIndex !== -1;
    const target = hasPipe ? rawTarget.slice(0, pipeIndex).trim() : rawTarget;
    const displayText = !isEmbed && hasPipe ? rawTarget.slice(pipeIndex + 1).trim() : undefined;
    const option = match[3] ? match[3].slice(1, -1).trim() : undefined;
    const groupStart = match.index + (isEmbed ? 3 : 2);
    const targetStart = groupStart + fullTarget.indexOf(target);
    let invalid: string | undefined;
    if (isEmbed && hasPipe) invalid = "embed_pipe_forbidden";
    if (isEmbed && option && option !== "expanded") invalid = "unknown_embed_option";
    refs.push({
      kind: isEmbed ? "embed" : "link",
      target,
      displayText,
      option,
      start: match.index,
      end: match.index + match[0].length,
      targetStart,
      targetEnd: targetStart + target.length,
      raw: match[0],
      hasPipe,
      invalid
    });
  }
  return refs;
}

export function parseInvalidEmbedOptionSpacing(source: string): InvalidEmbedOptionSpacing[] {
  const ranges = protectedRanges(source, true);
  const out: InvalidEmbedOptionSpacing[] = [];
  const regex = /!\[\[([^\]\n]+)\]\]\s+\{([^}\n]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source))) {
    if (isProtected(match.index, ranges)) continue;
    out.push({
      target: match[1].trim(),
      option: match[2].trim(),
      start: match.index,
      end: match.index + match[0].length,
      raw: match[0]
    });
  }
  return out;
}

export function findForbiddenTexMacros(source: string): Array<{ command: string; index: number }> {
  const ranges = protectedRanges(source, false);
  const out: Array<{ command: string; index: number }> = [];
  const regex = /\\(newcommand|renewcommand|def)\b/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source))) {
    if (isProtected(match.index, ranges)) continue;
    out.push({ command: `\\${match[1]}`, index: match.index });
  }
  return out;
}

export function rewriteMarkdownObjectNames(source: string, oldName: string, newName: string): string {
  const refs = parseMarkdownReferences(source)
    .filter((ref) => ref.target === oldName)
    .sort((a, b) => b.targetStart - a.targetStart);
  let next = source;
  for (const ref of refs) {
    next = `${next.slice(0, ref.targetStart)}${newName}${next.slice(ref.targetEnd)}`;
  }
  return next;
}
