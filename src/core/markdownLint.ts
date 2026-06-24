import { inspectMarkdownTokens } from "./render";

export type MarkdownRenderIssueCode =
  | "markdown_indented_code_block"
  | "markdown_indented_math_delimiter"
  | "markdown_unsupported_display_delimiter"
  | "markdown_unclosed_display_math"
  | "markdown_tex_environment_outside_math";

export interface MarkdownRenderIssue {
  code: MarkdownRenderIssueCode;
  line: number;
  message: string;
}

function leadingIndentColumns(line: string): number {
  let columns = 0;
  for (const char of line) {
    if (char === " ") {
      columns += 1;
      continue;
    }
    if (char === "\t") {
      columns += 4 - (columns % 4);
      continue;
    }
    break;
  }
  return columns;
}

function hasSameLineMathClose(trimmed: string): boolean {
  return trimmed.slice(2).includes("$$");
}

function fenceMarker(trimmed: string): string | undefined {
  const match = /^(`{3,}|~{3,})/.exec(trimmed);
  return match?.[1];
}

function isTexMathEnvironmentLine(trimmed: string): boolean {
  return /^\\(?:begin|end)\{(?:align\*?|aligned|equation\*?|gather\*?|multline\*?|split|cases|matrix|pmatrix|bmatrix|array)\}/.test(trimmed);
}

function findDelimiterIssues(source: string): MarkdownRenderIssue[] {
  const issues: MarkdownRenderIssue[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let fence: string | undefined;
  let inDisplayMath = false;
  let displayMathStartLine = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;
    const trimmed = line.trim();
    if (!trimmed) continue;

    const indent = leadingIndentColumns(line);
    const mayOpenMarkdownBlock = indent < 4;

    if (!mayOpenMarkdownBlock && trimmed.startsWith("$$")) {
      issues.push({
        code: "markdown_indented_math_delimiter",
        line: lineNumber,
        message: `Line ${lineNumber} starts a $$ delimiter after a tab or four-space indentation; Markdown will not recognize it as display math.`
      });
      continue;
    }

    if (fence) {
      if (mayOpenMarkdownBlock && line.trimStart().startsWith(fence)) fence = undefined;
      continue;
    }

    if (inDisplayMath) {
      if (trimmed.includes("$$")) inDisplayMath = false;
      continue;
    }

    if (mayOpenMarkdownBlock) {
      const marker = fenceMarker(line.trimStart());
      if (marker) {
        fence = marker;
        continue;
      }
      if (trimmed.startsWith("$$")) {
        if (!hasSameLineMathClose(trimmed)) {
          inDisplayMath = true;
          displayMathStartLine = lineNumber;
        }
        continue;
      }
    }

    if (trimmed === "\\[" || trimmed === "\\]" || trimmed === "[" || trimmed === "]") {
      issues.push({
        code: "markdown_unsupported_display_delimiter",
        line: lineNumber,
        message: `Line ${lineNumber} uses ${trimmed} as a display-math delimiter; Proof Atlas object bodies should use $$ blocks.`
      });
      continue;
    }

    if (isTexMathEnvironmentLine(trimmed)) {
      issues.push({
        code: "markdown_tex_environment_outside_math",
        line: lineNumber,
        message: `Line ${lineNumber} starts a TeX math environment outside a recognized $$ block; the formula will render as text.`
      });
    }
  }

  if (inDisplayMath) {
    issues.push({
      code: "markdown_unclosed_display_math",
      line: displayMathStartLine,
      message: `Line ${displayMathStartLine} opens a $$ display-math block that is not closed.`
    });
  }

  return issues;
}

function findIndentedCodeIssues(source: string): MarkdownRenderIssue[] {
  return inspectMarkdownTokens(source)
    .filter((token) => token.type === "code_block" && token.map)
    .map((token) => {
      const line = token.map![0] + 1;
      return {
        code: "markdown_indented_code_block",
        line,
        message: `Line ${line} is parsed as an indented code block; remove the leading tab/4 spaces or use a fenced code block if code is intended.`
      };
    });
}

export function findMarkdownRenderIssues(source: string): MarkdownRenderIssue[] {
  const issues = [...findIndentedCodeIssues(source), ...findDelimiterIssues(source)];
  const seen = new Set<string>();
  return issues
    .filter((issue) => {
      const key = `${issue.code}:${issue.line}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.line - b.line || a.code.localeCompare(b.code));
}
