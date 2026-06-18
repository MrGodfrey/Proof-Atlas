import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { commandRename } from "../src/cli/atlas";
import { buildGraph } from "../src/core/graph";
import { readYamlFile } from "../src/core/yaml";
import { tempDir } from "./helpers";

describe("atlas rename fixture", () => {
  it("rewrites YAML, Markdown links, view embeds, aliases, and moves the directory", async () => {
    const root = await tempDir("pa-rename-");
    const fixture = path.resolve("fixtures/rename/ProofAtlas");
    const project = path.join(root, "ProofAtlas");
    await fs.cp(fixture, project, { recursive: true });

    await commandRename("main.claim.old", "main.claim.new", { project });

    await expect(fs.stat(path.join(project, "objects", "main.claim.old"))).rejects.toThrow();
    await expect(fs.stat(path.join(project, "objects", "main.claim.new"))).resolves.toBeTruthy();

    const objectYaml = await readYamlFile<Record<string, unknown>>(path.join(project, "objects", "main.claim.new", "object.yml"));
    expect(objectYaml.name).toBe("main.claim.new");

    const helperYaml = await readYamlFile<Record<string, unknown>>(path.join(project, "objects", "main.claim.helper", "object.yml"));
    expect(helperYaml).toMatchObject({
      edges: { related_to: [{ target: "main.claim.new" }] }
    });

    const view = await fs.readFile(path.join(project, "views", "paper.md"), "utf8");
    expect(view).toContain("![[main.claim.new]]");
    expect(view).toContain("![[main.claim.new]]{expanded}");

    const route = await readYamlFile<Record<string, unknown>>(path.join(project, "views", "old.route.yml"));
    expect(route.target).toBe("main.claim.new");
    expect(route.boundaries).toEqual(["main.claim.new"]);
    expect(route.representation).toMatchObject({ "main.claim.new": "full" });
    expect(route.render).toMatchObject({ order_hints: ["main.claim.new"] });

    const statement = await fs.readFile(path.join(project, "objects", "main.claim.new", "statement.md"), "utf8");
    expect(statement).toContain("[[main.claim.new|the old claim]]");
    expect(statement).toContain("$[[main.claim.old]]$");
    expect(statement).toContain("`[[main.claim.old]]`");
    expect(statement).toContain("[[main.claim.old]]\n```");

    const aliases = await readYamlFile<Record<string, unknown>>(path.join(project, ".atlas", "aliases.yml"));
    expect(aliases["main.claim.old"]).toBe("obj_20260611_abcd");

    const graph = await buildGraph(project);
    expect(graph.objectsByName["main.claim.new"]).toBeTruthy();
    expect(graph.problems.filter((item) => item.severity === "error")).toEqual([]);
  });
});
