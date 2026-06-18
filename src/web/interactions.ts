export type ObjectLinkArea = "center" | "detail" | "overlay";
export type ObjectLinkGesture = "single" | "double";
export type ObjectLinkAction = "select" | "openSide" | "preview" | "selectKeepingOverlay";

export function objectLinkAction(area: ObjectLinkArea, gesture: ObjectLinkGesture): ObjectLinkAction {
  if (gesture === "single") {
    if (area === "detail") return "preview";
    if (area === "overlay") return "selectKeepingOverlay";
    return "openSide";
  }
  if (area === "detail") return "select";
  return "preview";
}
