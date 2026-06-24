import path from "node:path";
import { fileURLToPath } from "node:url";

export interface RouteExportCommandOptions {
  atlasRoot: string;
  routePath: string;
  toolRoot?: string;
}

export interface RouteExportCommand {
  command: string;
  outputPath: string;
  routePath: string;
}

export function defaultToolRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

export function shellQuote(value: string): string {
  if (value.length === 0) return "''";
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function validateRoutePath(routePath: string): string {
  const normalized = routePath.replaceAll("\\", "/");
  if (
    path.posix.isAbsolute(normalized)
    || /^[A-Za-z]:\//.test(normalized)
    || normalized.split("/").includes("..")
    || !/\.route\.ya?ml$/.test(normalized)
  ) {
    throw new Error(`Invalid route file path: ${routePath}`);
  }
  return normalized;
}

export function routeExportOutputPath(atlasRoot: string, routePath: string): string {
  const normalized = validateRoutePath(routePath);
  const routeRelative = normalized.startsWith("views/") ? normalized.slice("views/".length) : normalized;
  const outputRelative = routeRelative.replace(/\.route\.ya?ml$/, ".context.md");
  return path.join(atlasRoot, ".atlas", "exports", ...outputRelative.split("/"));
}

export function buildRouteExportCommand(options: RouteExportCommandOptions): RouteExportCommand {
  const toolRoot = options.toolRoot ?? defaultToolRoot();
  const routePath = validateRoutePath(options.routePath);
  const outputPath = routeExportOutputPath(options.atlasRoot, routePath);
  const command = [
    `TOOL_ROOT=${shellQuote(toolRoot)}`,
    `ATLAS_ROOT=${shellQuote(options.atlasRoot)}`,
    `ROUTE_FILE=${shellQuote(routePath)}`,
    `OUT=${shellQuote(outputPath)}`,
    "",
    `mkdir -p "$(dirname "$OUT")" &&`,
    `cd "$TOOL_ROOT" &&`,
    `npm run atlas -- export "$ROUTE_FILE" "$ATLAS_ROOT" --format markdown --output "$OUT" &&`,
    "if command -v pbcopy >/dev/null 2>&1; then",
    `  pbcopy < "$OUT"`,
    `  echo "Wrote and copied: $OUT"`,
    "else",
    `  echo "Wrote: $OUT"`,
    "fi"
  ].join("\n");
  return { command, outputPath, routePath };
}
