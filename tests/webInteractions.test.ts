import { describe, expect, it } from "vitest";
import { objectLinkAction } from "../src/web/interactions";

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
});
