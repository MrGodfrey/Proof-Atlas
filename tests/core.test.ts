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
          edges: { proves: [{ target: "main.claim.a" }] }
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
          edges: {
            blocks: [{ target: "main.proof.a" }],
            related_to: [{ target: "main.claim.a" }]
          }
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
    expect(claim.edges.related_to?.map((ref) => ref.target)).toContain("main.issue.blocker");
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
          edges: { uses: [{ target: "main.claim.missing" }] }
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
          body: ["missing.md"],
          edges: { related_to: ["main.claim.a"] }
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
    expect(codes).toContain("invalid_edge_ref");
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

  it("reports Markdown render blockers in object bodies", async () => {
    const root = await tempDir("pa-markdown-render-");
    const project = await writeTestProject(root, [
      {
        object: {
          uid: "obj_20260611_aaaa",
          name: "main.claim.a",
          kind: "math",
          role: "claim",
          title: "A",
          body: ["statement.md"]
        },
        bodies: {
          "statement.md": [
            "This display is valid.",
            "$$",
            "    a=b",
            "$$",
            "",
            "\tThis paragraph will become code with $x$.",
            "",
            "\\[",
            "x=y",
            "\\]",
            "",
            "    $$",
            "\\begin{aligned}",
            "x&=y",
            "\\end{aligned}",
            "$$",
            "",
            "\\begin{aligned}",
            "x&=y",
            "\\end{aligned}"
          ].join("\n")
        }
      }
    ]);
    const graph = await buildGraph(project);
    const codes = graph.problems.map((item) => item.code);
    expect(codes).toContain("markdown_indented_code_block");
    expect(codes).toContain("markdown_indented_math_delimiter");
    expect(codes).toContain("markdown_unsupported_display_delimiter");
    expect(codes).toContain("markdown_tex_environment_outside_math");
    expect(hasCheckErrors(graph.problems, false)).toBe(false);
    expect(hasCheckErrors(graph.problems, true)).toBe(true);
  });

  it("warns on uses edges to proof objects", async () => {
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
          edges: { uses: [{ target: "main.proof.a" }] }
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
          edges: { proves: [{ target: "main.claim.a" }] }
        },
        bodies: { "proof.md": "Proof.\n" }
      }
    ]);
    const graph = await buildGraph(project);
    expect(graph.problems.map((item) => item.code)).toContain("uses_points_to_proof");
    expect(graph.problems.map((item) => item.code)).not.toContain("hard_dependency_cycle");
    expect(hasCheckErrors(graph.problems, false)).toBe(false);
  });

  it("reports strict errors for hard requires/uses cycles", async () => {
    const root = await tempDir("pa-hard-cycle-");
    const project = await writeTestProject(root, [
      {
        object: {
          uid: "obj_20260611_aaaa",
          name: "main.claim.a",
          kind: "math",
          role: "claim",
          title: "A",
          body: ["statement.md"],
          edges: { requires: [{ target: "main.claim.b" }] }
        }
      },
      {
        object: {
          uid: "obj_20260611_bbbb",
          name: "main.claim.b",
          kind: "math",
          role: "claim",
          title: "B",
          body: ["statement.md"],
          edges: { uses: [{ target: "main.claim.a" }] }
        }
      }
    ]);
    const graph = await buildGraph(project);
    expect(graph.problems.map((item) => item.code)).toContain("hard_dependency_cycle");
    expect(hasCheckErrors(graph.problems, true)).toBe(true);
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
    expect(text).not.toContain("origin: project");
    expect(text).not.toContain("origin_atlas_root:");
    expect(text).not.toContain("The proof route is");
  });

  it("mounts reference atlas objects into the project graph with citation trust", async () => {
    const root = await tempDir("pa-reference-mount-");
    const referenceAtlas = await writeTestProject(path.join(root, "reference"), [
      {
        object: {
          uid: "obj_20260618_ref001",
          name: "source.paper",
          kind: "note",
          role: "literature",
          title: "Trusted Paper",
          body: ["note.md"],
          provenance: "external",
          citation: { bibkey: "Trusted2026" }
        },
        bodies: { "note.md": "Reusable reference note.\n" }
      }
    ], {
      atlas: {
        project: "test-reference-atlas",
        title: "Test Reference Atlas",
        atlas_type: "reference"
      },
      views: { "paper.md": "# References\n\n![[source.paper]]\n" }
    });
    await fs.writeFile(path.join(root, "trusted.bib"), "@Article{Trusted2026, title={Trusted Paper}, year={2026}}\n", "utf8");
    await fs.writeFile(path.join(referenceAtlas, "bib-registry.yml"), [
      'schema_version: "0.1"',
      "trusted:",
      "  - id: trusted",
      "    path: ../../trusted.bib",
      ""
    ].join("\n"), "utf8");

    const project = await writeTestProject(root, [
      {
        ...baseClaim("main.claim.a", "obj_20260618_proj01"),
        object: {
          uid: "obj_20260618_proj01",
          name: "main.claim.a",
          kind: "math",
          role: "claim",
          title: "A",
          body: ["statement.md"],
          edges: { cites: [{ target: "source.paper" }] }
        },
        bodies: { "statement.md": "Uses [[source.paper]].\n" }
      }
    ], {
      atlas: {
        references: {
          mounts: [{ id: "test-reference-atlas", mode: "readonly" }]
        }
      }
    });
    await fs.writeFile(path.join(project, ".atlas", "local.yml"), [
      "reference_atlases:",
      "  test-reference-atlas:",
      `    root: ${referenceAtlas}`,
      ""
    ].join("\n"), "utf8");

    const graph = await buildGraph(project);
    const source = graph.objectsByName["source.paper"];
    expect(source).toBeTruthy();
    expect(source.origin.kind).toBe("global_reference");
    expect(source.origin.atlasId).toBe("test-reference-atlas");
    expect(source.origin.readonly).toBe(true);
    expect(source.citation?.trust).toBe("trusted");
    expect(graph.objectsByName["main.claim.a"].edges.cites?.map((ref) => ref.target)).toContain("source.paper");
    expect(graph.objectsByName["source.paper"].reverseEdges.cited_by).toContain("main.claim.a");
    expect(await buildBodyFiles(graph, source)).toHaveLength(1);
    expect(graph.problems.map((item) => item.code)).not.toContain("local_source_namespace_forbidden");
    expect(hasCheckErrors(graph.problems, true)).toBe(false);
  });

  it("reports missing reference atlas mounts without cascading source target errors", async () => {
    const root = await tempDir("pa-missing-reference-mount-");
    const project = await writeTestProject(root, [
      {
        ...baseClaim("main.claim.a", "obj_20260618_miss01"),
        object: {
          uid: "obj_20260618_miss01",
          name: "main.claim.a",
          kind: "math",
          role: "claim",
          title: "A",
          body: ["statement.md"],
          edges: { cites: [{ target: "source.paper" }] }
        },
        bodies: { "statement.md": "Uses [[source.paper]].\n" }
      }
    ], {
      atlas: {
        references: {
          mounts: [{ id: "missing-reference-atlas", mode: "readonly" }]
        }
      },
      views: { "paper.md": "# Paper\n\n![[main.claim.a]]\n\n![[source.paper]]\n" }
    });
    const graph = await buildGraph(project);
    const codes = graph.problems.map((item) => item.code);
    expect(codes).toContain("missing_reference_atlas_mount");
    expect(codes).not.toContain("missing_edge_target");
    expect(codes).not.toContain("missing_markdown_link");
    expect(codes).not.toContain("missing_embed");
  });

  it("forbids local source namespace objects in ordinary projects", async () => {
    const root = await tempDir("pa-local-source-forbidden-");
    const project = await writeTestProject(root, [
      {
        object: {
          uid: "obj_20260618_local1",
          name: "source.paper",
          kind: "note",
          role: "literature",
          title: "Local Source",
          body: ["note.md"],
          provenance: "external",
          citation: { bibkey: "Local2026" }
        },
        bodies: { "note.md": "Local source.\n" }
      }
    ], {
      views: { "paper.md": "# Paper\n\n![[source.paper]]\n" }
    });
    const graph = await buildGraph(project);
    expect(graph.problems.map((item) => item.code)).toContain("local_source_namespace_forbidden");
  });
});
