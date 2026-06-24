import { describe, expect, it } from "vitest";
import { isObjectCardExpanded, nextObjectExpansionState } from "../src/web/cardExpansion";
import { ignoresObjectLinkTarget, objectLinkAction, shouldAutoScrollFocusedObject } from "../src/web/interactions";
import { relationDisplayRank, sortRelationRows } from "../src/web/relations";

describe("object link interaction routing", () => {
  it("routes simulated single clicks by pane", () => {
    expect(objectLinkAction("center", "single")).toBe("openSide");
    expect(objectLinkAction("detail", "single")).toBe("preview");
    expect(objectLinkAction("overlay", "single")).toBe("selectKeepingOverlay");
  });

  it("routes simulated double clicks by pane", () => {
    expect(objectLinkAction("center", "double")).toBe("preview");
    expect(objectLinkAction("detail", "double")).toBe("select");
    expect(objectLinkAction("overlay", "double")).toBe("preview");
  });

  it("ignores internal controls inside object link hit areas", () => {
    const ignoredTarget = {
      closest: (selector: string) => (selector === "[data-object-link-ignore]" ? {} as Element : null)
    };
    const ordinaryTarget = {
      closest: () => null
    };

    expect(ignoresObjectLinkTarget(ignoredTarget)).toBe(true);
    expect(ignoresObjectLinkTarget(ordinaryTarget)).toBe(false);
  });

  it("does not retrigger center focus scrolling for side-only navigation", () => {
    expect(shouldAutoScrollFocusedObject(undefined, "proof_map:target")).toBe(true);
    expect(shouldAutoScrollFocusedObject("proof_map:target", "proof_map:target")).toBe(false);
    expect(shouldAutoScrollFocusedObject("proof_map:target", "proof_map:other")).toBe(true);
    expect(shouldAutoScrollFocusedObject("proof_map:target", undefined)).toBe(false);
  });

  it("orders detail relations by proof-reading importance", () => {
    const rows = [
      { label: "requires", target: "context" },
      { label: "related_to", target: "note" },
      { label: "used_by", target: "downstream proof" },
      { label: "cited_by", target: "citation" },
      { label: "proved_by", target: "proof" },
      { label: "proves", target: "claim" }
    ];

    expect(sortRelationRows(rows).map((row) => row.label)).toEqual([
      "proved_by",
      "used_by",
      "proves",
      "requires",
      "cited_by",
      "related_to"
    ]);
    expect(relationDisplayRank("proved_by")).toBeLessThan(relationDisplayRank("used_by"));
  });

  it("allows default-expanded object cards to be temporarily collapsed", () => {
    const uid = "main.claim.target";
    const initial = { collapsed: new Set<string>(), expanded: new Set<string>() };
    expect(isObjectCardExpanded({ ...initial, defaultExpanded: true, uid })).toBe(true);

    const afterCollapse = nextObjectExpansionState(uid, true, initial.expanded, initial.collapsed);
    expect(isObjectCardExpanded({ ...afterCollapse, defaultExpanded: true, uid })).toBe(false);

    const afterExpand = nextObjectExpansionState(uid, false, afterCollapse.expanded, afterCollapse.collapsed);
    expect(isObjectCardExpanded({ ...afterExpand, defaultExpanded: true, uid })).toBe(true);
  });
});
