import { EditorView } from "@codemirror/view";

export const customTheme = EditorView.theme(
  {
  "&": {
    outline: "none !important",
    height: "100%",
    backgroundColor: "transparent !important",
    color: "var(--foreground)",
  },
  "&.cm-editor": {
    backgroundColor: "transparent !important",
  },
  "&.cm-focused": {
    outline: "none !important",
  },
  ".cm-content": {
    fontFamily: "var(--font-plex-mono), monospace",
    fontSize: "14px",
    padding: "10px 12px",
  },
  ".cm-scroller": {
    backgroundColor: "transparent !important",
    scrollbarWidth: "thin",
    scrollbarColor: "#3f3f46 transparent",
  },
  ".cm-gutters": {
    backgroundColor: "transparent !important",
    color: "var(--muted-foreground)",
    borderRight: "1px solid var(--border)",
  },
  ".cm-lineNumbers": {
    color: "var(--muted-foreground)",
  },
  ".cm-gutterElement": {
    padding: "0 10px 0 8px",
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    color: "var(--foreground)",
  },
  ".cm-selectionBackground": {
    backgroundColor: "rgba(255, 255, 255, 0.16) !important",
  },
  ".cm-cursor": {
    borderLeftColor: "rgba(255, 255, 255, 0.9)",
  },
  ".cm-tooltip": {
    backgroundColor: "oklch(0.155 0 0)",
    color: "oklch(0.985 0 0)",
    border: "1px solid oklch(1 0 0 / 0.09)",
  },
  ".cm-tooltip-autocomplete": {
    boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
  },
  ".cm-tooltip-autocomplete ul li": {
    padding: "6px 10px",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    color: "oklch(0.985 0 0)",
  },
  ".cm-panels": {
    backgroundColor: "rgba(0,0,0,0.2)",
    color: "oklch(0.985 0 0)",
    borderTop: "1px solid oklch(1 0 0 / 0.09)",
  },
  },
  { dark: true }
);