/**
 * Preview width of the « Ordinateur » screen. Like Webflow's base breakpoint, it fills the room of the
 * canvas, so the page shows at (nearly) its real size: never under 1024 px (the tablet layout starts at
 * 1023 px, `BREAKPOINT_MAX_WIDTH`), never over 1280 px. Measured by the editor bar (`FluidDesktop`).
 */
export const DESKTOP_MIN = 1024;
export const DESKTOP_MAX = 1280;

let fitted = DESKTOP_MAX;

/** Width to give the desktop preview now. */
export function desktopWidth(): number {
  return fitted;
}

/** Records the room of the canvas; returns the desktop preview width it allows. */
export function fitDesktop(room: number): number {
  fitted = Math.max(DESKTOP_MIN, Math.min(DESKTOP_MAX, Math.floor(room)));
  return fitted;
}

/** True for a preview width that shows the desktop layout. */
export function isDesktop(width: number | string | undefined): boolean {
  return typeof width !== "number" || width >= DESKTOP_MIN;
}
