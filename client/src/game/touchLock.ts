/**
 * Stops the browser from scrolling, pinch-zooming, selecting text or
 * opening a long-press context menu when the player touches the canvas.
 */
export function lockTouchBehavior(canvas: HTMLCanvasElement) {
  const style = canvas.style;
  style.touchAction = "none";
  style.userSelect = "none";
  style.setProperty("-webkit-user-select", "none");
  style.setProperty("-webkit-touch-callout", "none");
  style.setProperty("-webkit-tap-highlight-color", "transparent");

  const prevent = (e: Event) => {
    if (e.cancelable) e.preventDefault();
  };
  for (const type of ["touchstart", "touchmove", "touchend", "touchcancel"]) {
    canvas.addEventListener(type, prevent, { passive: false });
  }
  canvas.addEventListener("contextmenu", prevent);
}
