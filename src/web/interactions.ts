export type ObjectLinkArea = "center" | "detail" | "overlay";
export type ObjectLinkGesture = "single" | "double";
export type ObjectLinkAction = "select" | "openSide" | "preview" | "selectKeepingOverlay";

export const OBJECT_LINK_IGNORE_SELECTOR = "[data-object-link-ignore]";

export function objectLinkAction(area: ObjectLinkArea, gesture: ObjectLinkGesture): ObjectLinkAction {
  if (gesture === "single") {
    if (area === "detail") return "preview";
    if (area === "overlay") return "selectKeepingOverlay";
    return "openSide";
  }
  if (area === "detail") return "select";
  return "preview";
}

export function ignoresObjectLinkTarget(target: Pick<Element, "closest"> | null | undefined): boolean {
  return Boolean(target?.closest(OBJECT_LINK_IGNORE_SELECTOR));
}

export function shouldAutoScrollFocusedObject(previousFocusKey: string | undefined, nextFocusKey: string | undefined): boolean {
  return Boolean(nextFocusKey && previousFocusKey !== nextFocusKey);
}
