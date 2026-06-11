import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildGraph, buildBodyFiles, findObject } from "../src/core/graph";
import { parseMarkdownReferences, rewriteMarkdownObjectNames } from "../src/core/markdownRefs";
import { hasCheckErrors } from "../src/core/problems";
import { formatLocalReference } from "../src/core/reference";
import { renderMarkdownBlock } from "../src/core/render";
import { baseClaim, tempDir, writeTestProject } from "./helpers";

describe("Proof Atlas core", () => {
  it("applies defaults and derived reverse edges", async () => {
    const root = await tempDir("pa-defaults-");
    const project = await writeTestProject(root, [
      baseClaim("main.claim.a", "obj_20260611_aaaa"),
      {
        object: {
          uid: "obj_20260611_bbbb",
          name: "main.proof.a",
          kind: "math",
          role: "proof",
          title: "Proof A",
          body: ["proof.md"],
          edges: { proves: ["main.claim.a"] }
        },
        bodies: { "proof.md": "Proof body.\n" }
      },
      {
        object: {
          uid: "obj_20260611_cccc",
          name: "main.issue.blocker",
          kind: "issue",
          role: "gap",
          title: "Blocker",
          body: ["note.md"],
          edges: { blocks: ["main.proof.a"], related_to: ["main.claim.a"] }
        },
        bodies: { "note.md": "Issue body.\n" }
      }
    ], {
      views: { "paper.md": "# Paper\n\n![[main.claim.a]]\n\n![[main.proof.a]]\n" }
    });
    const graph = await buildGraph(project);
    const claim = graph.objectsByName["main.claim.a"];
    expect(claim.display_as).toBe("theorem");
    expect(claim.importance).toBe("supporting");
    expect(claim.status).toBe("draft");
    expect(claim.provenance).toBe("internal");
    expect(claim.reverseEdges.proved_by).toContain("main.proof.a");
    expect(graph.objectsByName["main.proof.a"].reverseEdges.blocked_by).toContain("main.issue.blocker");
    expect(claim.edges.related_to).toContain("main.issue.blocker");
    expect(hasCheckErrors(graph.problems, true)).toBe(false);
  });

  it("parses Markdown references while skipping math and code", () => {
    const source = [
      "Use [[main.claim.a|A]].",
      "$[[main.claim.math]]$",
      "`[[main.claim.code]]`",
      "```",
      "[[main.claim.fence]]",
      "```",
      "![[main.claim.embed]]{expanded}"
    ].join("\n");
    const refs = parseMarkdownReferences(source).map((ref) => `${ref.kind}:${ref.target}:${ref.displayText ?? ""}:${ref.option ?? ""}`);
    expect(refs).toEqual(["link:main.claim.a:A:", "embed:main.claim.embed::expanded"]);
    const rewritten = rewriteMarkdownObjectNames(source, "main.claim.a", "main.claim.new");
    expect(rewritten).toContain("[[main.claim.new|A]]");
    expect(rewritten).toContain("$[[main.claim.math]]$");
  });

  it("adds visual wrappers for equation and literature links", () => {
    const html = renderMarkdownBlock(
      "Use [[main.eq.energy|energy identity]], cite [[source.paper|Boyer 2010]], and open [[main.claim.a|the claim]].",
      (name) => {
        if (name === "main.eq.energy") return { name, display_as: "equation", role: "claim" };
        if (name === "source.paper") return { name, display_as: "literature_note", role: "literature" };
        if (name === "main.claim.a") return { name, display_as: "theorem", role: "claim" };
        return undefined;
      }
    );
    expect(html).toContain(">(energy identity)</a>");
    expect(html).toContain(">[Boyer 2010]</a>");
    expect(html).toContain(">the claim</a>");
  });

  it("reports strict validation errors for bad protocol data", async () => {
    const root = await tempDir("pa-invalid-");
    const project = await writeTestProject(root, [
      {
        object: {
          uid: "obj_20260611_aaaa",
          name: "main.claim.a",
          kind: "math",
          role: "claim",
          title: "A",
          body: ["statement.md"],
          status: "false",
          display_as: "not_real",
          edges: { uses: ["main.claim.missing"] }
        },
        bodies: {
          "statement.md": "# Duplicate Title\n\nBad link [[main.claim.missing]].\n\n![[main.claim.a]]\n\n$\\newcommand{\\x}{x}$\n"
        }
      },
      {
        object: {
          uid: "obj_20260611_bbbb",
          name: "main.claim.b",
          kind: "math",
          role: "claim",
          title: "B",
          body: ["missing.md"]
        },
        bodies: {}
      }
    ], {
      views: { "paper.md": "# Paper\n\n![[main.claim.a|expanded]]\n\n![[main.claim.missing]]\n" },
      aliases: { "main.claim.a": "obj_20260611_aaaa", "old.missing": "obj_20260611_dead" }
    });
    const graph = await buildGraph(project);
    const codes = graph.problems.map((item) => item.code);
    expect(codes).toContain("status_false_forbidden");
    expect(codes).toContain("invalid_display_as");
    expect(codes).toContain("missing_edge_target");
    expect(codes).toContain("missing_markdown_link");
    expect(codes).toContain("body_embed_forbidden");
    expect(codes).toContain("object_body_h1");
    expect(codes).toContain("tex_macro_forbidden");
    expect(codes).toContain("missing_body");
    expect(codes).toContain("embed_pipe_forbidden");
    expect(codes).toContain("missing_embed");
    expect(codes).toContain("alias_key_conflicts_name");
    expect(codes).toContain("alias_to_missing_uid");
    expect(hasCheckErrors(graph.problems, true)).toBe(true);
  });

  it("allows forbidden TeX macro strings inside code blocks and inline code", async () => {
    const root = await tempDir("pa-code-macro-");
    const project = await writeTestProject(root, [
      {
        ...baseClaim("main.claim.a", "obj_20260611_aaaa"),
        bodies: {
          "statement.md": "Inline code `\\def\\x{x}` is allowed.\n\n```\n\\newcommand{\\x}{x}\n```\n"
        }
      }
    ]);
    const graph = await buildGraph(project);
    expect(graph.problems.find((item) => item.code === "tex_macro_forbidden")).toBeUndefined();
  });

  it("warns on dependency cycles and uses edges to proof objects", async () => {
    const root = await tempDir("pa-cycle-");
    const project = await writeTestProject(root, [
      {
        object: {
          uid: "obj_20260611_aaaa",
          name: "main.claim.a",
          kind: "math",
          role: "claim",
          title: "A",
          body: ["statement.md"],
          edges: { uses: ["main.proof.a"] }
        }
      },
      {
        object: {
          uid: "obj_20260611_bbbb",
          name: "main.proof.a",
          kind: "math",
          role: "proof",
          title: "Proof A",
          body: ["proof.md"],
          edges: { proves: ["main.claim.a"] }
        },
        bodies: { "proof.md": "Proof.\n" }
      }
    ]);
    const graph = await buildGraph(project);
    expect(graph.problems.map((item) => item.code)).toContain("uses_points_to_proof");
    expect(graph.problems.map((item) => item.code)).toContain("dependency_cycle");
    expect(hasCheckErrors(graph.problems, false)).toBe(false);
  });

  it("formats local references and returns block metadata", async () => {
    const graph = await buildGraph("examples/semidiscrete/ProofAtlas");
    const object = findObject(graph, "main.claim.null_controllability");
    expect(object).toBeTruthy();
    const body = await buildBodyFiles(graph, object!);
    const block = body[0].blocks[0];
    expect(block.id).toBe("b001");
    const text = formatLocalReference(graph, object!, {
      file: block.file,
      block: block.id,
      kind: block.kind,
      excerpt: block.excerpt
    });
    expect(text).toContain("ProofAtlas local reference");
    expect(text).toContain("project: semi-discrete-stochastic-control");
    expect(text).toContain("selection:");
    expect(text).toContain("excerpt:");
    expect(text).not.toContain("The proof route is");
  });
});
