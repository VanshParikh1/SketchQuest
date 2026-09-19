/** True when the page was loaded with ?debug=1. Gates hitboxes, the debug text, and test-level hotkeys. */
export const DEBUG =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "1";
