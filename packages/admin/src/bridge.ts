import type { Data } from "@puckeditor/core";

/**
 * Bridge with the open editor: an assistant working in the browser (WebMCP) edits the page being
 * edited through Puck, so the owner sees the change, can undo it, and autosave stays consistent.
 */
export interface EditorBridge {
  pageId: string;
  getData: () => Data;
  setData: (data: Data) => void;
  /** Undoes the last change (Puck's history), as ⌘Z. */
  undo: () => void;
}

let bridge: EditorBridge | null = null;

export function setEditorBridge(next: EditorBridge | null) {
  bridge = next;
}

export function getEditorBridge(): EditorBridge | null {
  return bridge;
}
