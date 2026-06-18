import path from "node:path";
import { describe, expect, it } from "vitest";
import { commandRoute } from "../src/cli/atlas";
import { createSnapshot, exportRoute } from "../src/core/contextExporter";
import { buildGraph } from "../src/core/graph";
import { linearizeRoute } from "../src/core/routeLinearizer";
import { resolveRoute } from "../src/core/routeResolver";
import { applySuggestionSet, createSuggestionSet } from "../src/core/suggestions";
import { writeYamlFile } from "../src/core/yaml";
import { baseClaim, tempDir, writeTestProject } from "./helpers";

describe("generated routes", () => {
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
    expect(route.nodes.map((node) => node.object.name)).toContain("main.claim.partial_discrete_lr");
    expect(route.nodes.find((node) => node.object.name === "main.claim.partial_discrete_lr")?.decision).toBe("boundary");
    expect(route.nodes.find((node) => node.object.name === "main.claim.partial_discrete_lr")?.inclusionClass).toBe("boundary");
    expect(route.nodes.find((node) => node.object.name === "main.proof.lr_iteration")?.inclusionClass).toBe("spine");
    expect(route.nodes.find((node) => node.object.name === "main.model.forward_semidiscrete_system")?.inclusionClass).toBe("vocabulary");
    expect(route.nodes.filter((node) => node.inclusionClass === "spine")).toHaveLength(11);
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

  it("resolves proof object targets without proving the proof itself", async () => {
    const graph = await buildGraph("examples/semidiscrete/ProofAtlas");
    const route = resolveRoute(graph, {
      target: "main.proof.lr_iteration",
      profile: "proof"
    });

    expect(route.closed).toBe(true);
    expect(route.contentSufficient).toBe(true);
    expect(route.target.name).toBe("main.proof.lr_iteration");
    expect(route.selectedProofs).not.toHaveProperty("main.claim.null_controllability");
    expect(route.selectedProofs).toMatchObject({
      "main.claim.partial_null_control": "main.proof.partial_null_control",
      "main.claim.observability": "main.proof.observability",
      "main.claim.free_decay": "main.proof.free_decay"
    });
    expect(route.nodes.find((node) => node.object.name === "main.proof.lr_iteration")?.representation).toBe("full");
    expect(route.nodes.map((node) => node.object.name)).toContain("main.claim.null_controllability");
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
      profile: "meaning",
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
      await commandRoute("main.claim.target", project, { profile: "meaning" });
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
      profile: "meaning",
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
