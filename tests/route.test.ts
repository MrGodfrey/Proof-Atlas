import path from "node:path";
import { describe, expect, it } from "vitest";
import { commandRoute } from "../src/cli/atlas";
import { createSnapshot, exportRoute } from "../src/core/contextExporter";
import { buildRouteExportCommand, routeExportOutputPath, shellQuote } from "../src/core/exportCommand";
import { buildGraph } from "../src/core/graph";
import { isProofObligationObject } from "../src/core/proofObjects";
import { linearizeRoute } from "../src/core/routeLinearizer";
import { deriveRouteProofTree } from "../src/core/routeProofTree";
import { resolveRoute } from "../src/core/routeResolver";
import { applySuggestionSet, createSuggestionSet } from "../src/core/suggestions";
import { writeYamlFile } from "../src/core/yaml";
import { baseClaim, tempDir, writeTestProject } from "./helpers";

describe("generated routes", () => {
  it("builds terminal-ready export commands with stable output paths and shell quoting", () => {
    const atlasRoot = "/tmp/Paper's Workspace/ProofAtlas";
    const routePath = "views/sub/null control.route.yml";
    const outputPath = routeExportOutputPath(atlasRoot, routePath);
    const result = buildRouteExportCommand({
      toolRoot: "/tmp/proof atlas tool",
      atlasRoot,
      routePath
    });

    expect(shellQuote("a'b")).toBe(`'a'"'"'b'`);
    expect(outputPath).toBe(path.join(atlasRoot, ".atlas", "exports", "sub", "null control.context.md"));
    expect(result.outputPath).toBe(outputPath);
    expect(result.command).toContain("TOOL_ROOT='/tmp/proof atlas tool'");
    expect(result.command).toContain(`ATLAS_ROOT='/tmp/Paper'"'"'s Workspace/ProofAtlas'`);
    expect(result.command).toContain("ROUTE_FILE='views/sub/null control.route.yml'");
    expect(result.command).toContain("npm run atlas -- export \"$ROUTE_FILE\" \"$ATLAS_ROOT\" --format markdown --output \"$OUT\"");
    expect(result.command).toContain("pbcopy < \"$OUT\"");
    expect(result.command).not.toContain("npm run atlas -- route");
  });

  it("rejects unsafe route paths when building export commands", () => {
    expect(() => routeExportOutputPath("/tmp/project/ProofAtlas", "../outside.route.yml")).toThrow("Invalid route file path");
    expect(() => routeExportOutputPath("/tmp/project/ProofAtlas", "/tmp/absolute.route.yml")).toThrow("Invalid route file path");
    expect(() => routeExportOutputPath("/tmp/project/ProofAtlas", String.raw`C:\tmp\absolute.route.yml`)).toThrow("Invalid route file path");
    expect(() => routeExportOutputPath("/tmp/project/ProofAtlas", String.raw`views\..\outside.route.yml`)).toThrow("Invalid route file path");
    expect(() => routeExportOutputPath("/tmp/project/ProofAtlas", "views/not-a-route.yml")).toThrow("Invalid route file path");
  });

  it("resolves the semidiscrete null controllability proof route", async () => {
    const graph = await buildGraph("examples/semidiscrete/ProofAtlas");
    const routeView = graph.routeViews.find((view) => view.path === "views/null_controllability.route.yml");
    expect(routeView).toBeTruthy();

    const route = resolveRoute(graph, routeView!.route);
    expect(route.closed).toBe(true);
    expect(route.contentSufficient).toBe(true);
    expect(route.selectedProofs).toMatchObject({
      "main.claim.null_controllability": "main.proof.lr_iteration",
      "main.claim.partial_null_control": "main.proof.partial_null_control",
      "main.claim.observability": "main.proof.observability",
      "main.claim.free_decay": "main.proof.free_decay"
    });
    const externalSpectralInput = route.nodes.find((node) => node.object.name === "source.boyer_2010a.claim.partial_discrete_lr");
    expect(externalSpectralInput).toBeTruthy();
    expect(externalSpectralInput?.object.origin.kind).toBe("global_reference");
    expect(externalSpectralInput?.decision).toBe("boundary");
    expect(externalSpectralInput?.inclusionClass).toBe("boundary");
    expect(route.nodes.find((node) => node.object.name === "main.proof.lr_iteration")?.inclusionClass).toBe("spine");
    expect(route.nodes.find((node) => node.object.name === "main.model.forward_semidiscrete_system")?.inclusionClass).toBe("vocabulary");
    expect(route.nodes.filter((node) => node.inclusionClass === "spine")).toHaveLength(11);

    const tree = deriveRouteProofTree(route, graph);
    expect(tree.root.object.name).toBe("main.claim.null_controllability");
    expect(tree.defaultExpandedNodeIds).toEqual([tree.root.id]);
    expect(tree.root.children.map((node) => node.object.name)).toEqual(["main.proof.lr_iteration"]);
    expect(tree.root.children[0].children.map((node) => node.object.name)).toContain("main.claim.partial_null_control");
    expect(tree.foundationNodes.map((node) => node.object.name)).toContain("main.model.forward_semidiscrete_system");
  });

  it("exports cloud markdown without raw Proof Atlas object links", async () => {
    const graph = await buildGraph("examples/semidiscrete/ProofAtlas");
    const routeView = graph.routeViews.find((view) => view.path === "views/null_controllability.route.yml");
    const route = resolveRoute(graph, routeView!.route);
    const result = await exportRoute(graph, route, "markdown");

    expect(result.diagnostics).toEqual([]);
    expect(result.content).toContain("## Selected Proof Route");
    expect(result.content).toContain("Accepted boundary");
    expect(result.content).toContain("uid: obj_");
    expect(result.content).toContain("name: main.claim.null_controllability");
    expect(result.content).toContain("status:");
    expect(result.content).toContain("provenance:");
    expect(result.content).not.toMatch(/!?\[\[/);
  });

  it("rejects proof tree routes whose target is not a proof-obligation claim", async () => {
    const graph = await buildGraph("examples/semidiscrete/ProofAtlas");
    const route = resolveRoute(graph, {
      target: "main.proof.lr_iteration",
      profile: "proof"
    });

    expect(route.closed).toBe(false);
    expect(route.contentSufficient).toBe(false);
    expect(route.target.name).toBe("main.proof.lr_iteration");
    expect(route.selectedProofs).toEqual({});
    expect(route.diagnostics.map((item) => item.code)).toContain("unsupported_proof_tree_target");
    expect(route.nodes.map((node) => node.object.name)).toEqual(["main.proof.lr_iteration"]);
  });

  it("uses the shared proof-obligation predicate for claim display eligibility", async () => {
    const graph = await buildGraph("examples/semidiscrete/ProofAtlas");
    expect(isProofObligationObject(graph.objectsByName["main.claim.null_controllability"])).toBe(true);
    expect(isProofObligationObject(graph.objectsByName["main.eq.partial_control_representation"])).toBe(false);
    expect(isProofObligationObject(graph.objectsByName["main.eq.observability_spectral_bound"])).toBe(false);

    const equationRoute = resolveRoute(graph, {
      target: "main.eq.partial_control_representation",
      profile: "proof"
    });
    expect(equationRoute.diagnostics.map((item) => item.code)).toContain("unsupported_proof_tree_target");
  });

  it("deduplicates route diagnostics reached through multiple witness paths", async () => {
    const root = await tempDir("pa-route-diagnostics-");
    const project = await writeTestProject(root, [
      {
        ...baseClaim("main.claim.target", "obj_20260611_d001"),
        object: {
          uid: "obj_20260611_d001",
          name: "main.claim.target",
          kind: "math",
          role: "claim",
          title: "Target",
          body: ["statement.md"]
        }
      },
      {
        object: {
          uid: "obj_20260611_d002",
          name: "main.proof.target",
          kind: "math",
          role: "proof",
          title: "Proof Target",
          body: ["proof.md"],
          edges: {
            proves: [{ target: "main.claim.target" }],
            uses: [{ target: "main.claim.branch_a" }, { target: "main.claim.branch_b" }]
          }
        },
        bodies: { "proof.md": "Proof target.\n" }
      },
      {
        ...baseClaim("main.claim.branch_a", "obj_20260611_d003"),
        object: {
          uid: "obj_20260611_d003",
          name: "main.claim.branch_a",
          kind: "math",
          role: "claim",
          title: "Branch A",
          body: ["statement.md"]
        }
      },
      {
        object: {
          uid: "obj_20260611_d004",
          name: "main.proof.branch_a",
          kind: "math",
          role: "proof",
          title: "Proof Branch A",
          body: ["proof.md"],
          edges: {
            proves: [{ target: "main.claim.branch_a" }],
            uses: [{ target: "main.claim.leaf" }]
          }
        },
        bodies: { "proof.md": "Proof branch A.\n" }
      },
      {
        ...baseClaim("main.claim.branch_b", "obj_20260611_d005"),
        object: {
          uid: "obj_20260611_d005",
          name: "main.claim.branch_b",
          kind: "math",
          role: "claim",
          title: "Branch B",
          body: ["statement.md"]
        }
      },
      {
        object: {
          uid: "obj_20260611_d006",
          name: "main.proof.branch_b",
          kind: "math",
          role: "proof",
          title: "Proof Branch B",
          body: ["proof.md"],
          edges: {
            proves: [{ target: "main.claim.branch_b" }],
            uses: [{ target: "main.claim.leaf" }]
          }
        },
        bodies: { "proof.md": "Proof branch B.\n" }
      },
      {
        ...baseClaim("main.claim.leaf", "obj_20260611_d007"),
        object: {
          uid: "obj_20260611_d007",
          name: "main.claim.leaf",
          kind: "math",
          role: "claim",
          title: "Leaf",
          body: ["statement.md"]
        }
      }
    ], {
      views: { "paper.md": "# Paper\n\n![[main.claim.target]]\n" }
    });

    const graph = await buildGraph(project);
    const route = resolveRoute(graph, {
      target: "main.claim.target",
      profile: "proof",
      proofChoices: { "main.claim.target": "main.proof.target" }
    });

    const leafDiagnostics = route.diagnostics.filter((item) => item.code === "unresolved_claim" && item.objectName === "main.claim.leaf");
    expect(leafDiagnostics).toHaveLength(1);
    expect(route.nodes.find((node) => node.object.name === "main.claim.leaf")?.witnessPaths).toHaveLength(2);
  });

  it("marks the second proof-tree occurrence of a shared dependency as a shared reference", async () => {
    const root = await tempDir("pa-route-shared-tree-");
    const project = await writeTestProject(root, [
      {
        ...baseClaim("main.claim.target", "obj_20260611_s001"),
        object: {
          uid: "obj_20260611_s001",
          name: "main.claim.target",
          kind: "math",
          role: "claim",
          title: "Target",
          body: ["statement.md"]
        }
      },
      {
        object: {
          uid: "obj_20260611_s002",
          name: "main.proof.target",
          kind: "math",
          role: "proof",
          title: "Proof Target",
          body: ["proof.md"],
          edges: {
            proves: [{ target: "main.claim.target" }],
            uses: [{ target: "main.claim.branch_a" }, { target: "main.claim.branch_b" }]
          }
        },
        bodies: { "proof.md": "Proof target.\n" }
      },
      {
        ...baseClaim("main.claim.branch_a", "obj_20260611_s003"),
        object: {
          uid: "obj_20260611_s003",
          name: "main.claim.branch_a",
          kind: "math",
          role: "claim",
          title: "Branch A",
          body: ["statement.md"]
        }
      },
      {
        object: {
          uid: "obj_20260611_s004",
          name: "main.proof.branch_a",
          kind: "math",
          role: "proof",
          title: "Proof Branch A",
          body: ["proof.md"],
          edges: {
            proves: [{ target: "main.claim.branch_a" }],
            uses: [{ target: "main.claim.leaf" }]
          }
        },
        bodies: { "proof.md": "Proof branch A.\n" }
      },
      {
        ...baseClaim("main.claim.branch_b", "obj_20260611_s005"),
        object: {
          uid: "obj_20260611_s005",
          name: "main.claim.branch_b",
          kind: "math",
          role: "claim",
          title: "Branch B",
          body: ["statement.md"]
        }
      },
      {
        object: {
          uid: "obj_20260611_s006",
          name: "main.proof.branch_b",
          kind: "math",
          role: "proof",
          title: "Proof Branch B",
          body: ["proof.md"],
          edges: {
            proves: [{ target: "main.claim.branch_b" }],
            uses: [{ target: "main.claim.leaf" }]
          }
        },
        bodies: { "proof.md": "Proof branch B.\n" }
      },
      {
        ...baseClaim("main.claim.leaf", "obj_20260611_s007"),
        object: {
          uid: "obj_20260611_s007",
          name: "main.claim.leaf",
          kind: "math",
          role: "claim",
          title: "Leaf",
          body: ["statement.md"]
        }
      },
      {
        object: {
          uid: "obj_20260611_s008",
          name: "main.proof.leaf",
          kind: "math",
          role: "proof",
          title: "Proof Leaf",
          body: ["proof.md"],
          edges: {
            proves: [{ target: "main.claim.leaf" }]
          }
        },
        bodies: { "proof.md": "Proof leaf.\n" }
      }
    ], {
      views: { "paper.md": "# Paper\n\n![[main.claim.target]]\n" }
    });

    const graph = await buildGraph(project);
    const route = resolveRoute(graph, {
      target: "main.claim.target",
      profile: "proof",
      proofChoices: {
        "main.claim.target": "main.proof.target",
        "main.claim.branch_a": "main.proof.branch_a",
        "main.claim.branch_b": "main.proof.branch_b",
        "main.claim.leaf": "main.proof.leaf"
      }
    });
    const tree = deriveRouteProofTree(route, graph);
    const occurrences: Array<{ name: string; role: string }> = [];
    const visit = (node: typeof tree.root) => {
      occurrences.push({ name: node.object.name, role: node.role });
      node.children.forEach(visit);
    };
    visit(tree.root);

    const leafOccurrences = occurrences.filter((item) => item.name === "main.claim.leaf");
    expect(leafOccurrences.map((item) => item.role)).toEqual(["support", "shared_reference"]);
  });

  it("creates snapshots with materialized markdown and route identity", async () => {
    const graph = await buildGraph("examples/semidiscrete/ProofAtlas");
    const routeView = graph.routeViews.find((view) => view.path === "views/null_controllability.route.yml");
    const route = resolveRoute(graph, routeView!.route);
    const snapshot = await createSnapshot(graph, routeView!.route, route);

    expect(snapshot.type).toBe("snapshot");
    expect(snapshot.route.uid).toBe(routeView!.route.uid);
    expect(snapshot.object_names).toEqual(route.nodes.map((node) => node.object.name));
    expect(snapshot.markdown).toContain("# Proof Atlas Cloud Context");
    expect(snapshot.markdown).toContain("uid: obj_");
    expect(snapshot.markdown).not.toMatch(/!?\[\[/);
    expect(snapshot.diagnostics).toEqual([]);
  });

  it("uses route render.order_hints when linearizing same-layer nodes", async () => {
    const root = await tempDir("pa-route-order-");
    const project = await writeTestProject(root, [
      {
        ...baseClaim("main.claim.target", "obj_20260611_aaaa"),
        object: {
          uid: "obj_20260611_aaaa",
          name: "main.claim.target",
          kind: "math",
          role: "claim",
          title: "Target",
          body: ["statement.md"],
          edges: {
            requires: [
              { target: "main.setting.a" },
              { target: "main.setting.b" }
            ]
          }
        }
      },
      {
        object: {
          uid: "obj_20260611_bbbb",
          name: "main.setting.a",
          kind: "math",
          role: "setting",
          title: "Setting A",
          body: ["body.md"]
        },
        bodies: { "body.md": "A.\n" }
      },
      {
        object: {
          uid: "obj_20260611_cccc",
          name: "main.setting.b",
          kind: "math",
          role: "setting",
          title: "Setting B",
          body: ["body.md"]
        },
        bodies: { "body.md": "B.\n" }
      }
    ], {
      views: { "paper.md": "# Paper\n\n![[main.claim.target]]\n" }
    });
    await writeYamlFile(path.join(project, "views", "target.route.yml"), {
      schema_version: "0.1",
      uid: "view_20260618_order",
      type: "route",
      title: "Target Route",
      target: "main.claim.target",
      profile: "proof",
      proof_choices: {},
      boundaries: [],
      representation: {},
      render: {
        order: "prerequisites_first",
        order_hints: ["main.setting.b", "main.setting.a"]
      }
    });

    const graph = await buildGraph(project);
    const routeView = graph.routeViews.find((view) => view.path === "views/target.route.yml");
    expect(routeView?.route.render.order_hints).toEqual(["main.setting.b", "main.setting.a"]);
    const linear = linearizeRoute(resolveRoute(graph, routeView!.route));
    const settingNames = linear.groups.find((group) => group.key === "settings")?.nodes.map((node) => node.object.name);
    expect(settingNames).toEqual(["main.setting.b", "main.setting.a"]);
  });

  it("prints route witness paths and marginal token costs", async () => {
    const root = await tempDir("pa-route-summary-");
    const project = await writeTestProject(root, [
      {
        ...baseClaim("main.claim.target", "obj_20260611_dddd"),
        object: {
          uid: "obj_20260611_dddd",
          name: "main.claim.target",
          kind: "math",
          role: "claim",
          title: "Target",
          body: ["statement.md"],
          edges: {
            requires: [{ target: "main.setting.context", reason: "needed to parse the target" }]
          }
        }
      },
      {
        object: {
          uid: "obj_20260611_eeee",
          name: "main.setting.context",
          kind: "math",
          role: "setting",
          title: "Context",
          body: ["body.md"]
        },
        bodies: { "body.md": "Context.\n" }
      }
    ], {
      views: { "paper.md": "# Paper\n\n![[main.claim.target]]\n" }
    });

    const originalLog = console.log;
    const lines: string[] = [];
    console.log = (...items: unknown[]) => {
      lines.push(items.map(String).join(" "));
    };
    try {
      await commandRoute("main.claim.target", project, { profile: "proof" });
    } finally {
      console.log = originalLog;
    }

    const output = lines.join("\n");
    expect(output).toContain("Route target: main.claim.target");
    expect(output).toContain("why: main.claim.target -> main.setting.context");
    expect(output).toContain("marginal:");
  });

  it("keeps AI-style suggestions pending until accepted ids are applied", async () => {
    const root = await tempDir("pa-suggestions-");
    const project = await writeTestProject(root, [
      {
        ...baseClaim("main.claim.target", "obj_20260611_f001"),
        bodies: { "statement.md": "This claim is stated using [[main.setting.context]].\n" },
        object: {
          uid: "obj_20260611_f001",
          name: "main.claim.target",
          kind: "math",
          role: "claim",
          title: "Target",
          body: ["statement.md"]
        }
      },
      {
        object: {
          uid: "obj_20260611_f002",
          name: "main.setting.context",
          kind: "math",
          role: "setting",
          title: "Context",
          body: ["body.md"]
        },
        bodies: { "body.md": "A context body for the target.\n" }
      }
    ], {
      views: { "paper.md": "# Paper\n\n![[main.claim.target]]\n" }
    });
    await writeYamlFile(path.join(project, "views", "target.route.yml"), {
      schema_version: "0.1",
      uid: "view_20260618_suggest",
      type: "route",
      title: "Target Route",
      target: "main.claim.target",
      profile: "proof",
      proof_choices: {},
      boundaries: [],
      representation: {},
      render: {
        order: "prerequisites_first"
      }
    });

    const graph = await buildGraph(project);
    const suggestionSet = await createSuggestionSet(graph, { routePath: "views/target.route.yml" });
    expect(suggestionSet.status).toBe("pending_confirmation");
    expect(suggestionSet.suggestions.every((suggestion) => suggestion.status === "pending")).toBe(true);

    const edgeSuggestion = suggestionSet.suggestions.find((suggestion) => suggestion.kind === "missing_edge" && suggestion.object === "main.claim.target");
    const summarySuggestion = suggestionSet.suggestions.find((suggestion) => suggestion.kind === "summary" && suggestion.object === "main.claim.target");
    const orderSuggestion = suggestionSet.suggestions.find((suggestion) => suggestion.kind === "route_order_hints");
    expect(edgeSuggestion).toBeTruthy();
    expect(summarySuggestion).toBeTruthy();
    expect(orderSuggestion).toBeTruthy();

    const skippedOnly = await applySuggestionSet(graph, suggestionSet, new Set());
    expect(skippedOnly.applied).toEqual([]);

    await applySuggestionSet(graph, suggestionSet, new Set([edgeSuggestion!.id, summarySuggestion!.id, orderSuggestion!.id]));
    const updated = await buildGraph(project);
    const target = updated.objectsByName["main.claim.target"];
    expect(target.summary).toBe((summarySuggestion as { summary: string }).summary);
    expect(target.edges.requires?.map((ref) => ref.target)).toContain("main.setting.context");
    expect(updated.routeViews.find((view) => view.path === "views/target.route.yml")?.route.render.order_hints)
      .toContain("main.claim.target");
  });
});
