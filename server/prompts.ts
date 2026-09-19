import { MAX_FLAT_GAP, MAX_JUMP_HEIGHT, WORLD_H, WORLD_W, type Level } from "@sketchquest/shared";

/** Physical limits expressed in level units so the model can reason in its own coordinate space. */
const MAX_JUMP_UNITS = Math.floor((MAX_JUMP_HEIGHT / WORLD_H) * 1000);
const MAX_GAP_UNITS = Math.floor((MAX_FLAT_GAP / WORLD_W) * 1000);

export const LEVEL_SYSTEM_PROMPT = `You turn a photo of a hand-drawn sketch into a 2D platformer level, returned as JSON that matches the provided schema exactly.

MARKER LEGEND
- Black ink: platforms (solid ground, ledges, floating blocks).
- Red ink: hazards. Use type "spike" for jagged/triangular shapes and type "lava" for filled or wavy red areas.
- Green ink: the goal (exactly one).
- Yellow ink: coins.
- Blue circle: the player start point (exactly one).
- Stick figure: an enemy that patrols back and forth.

COORDINATES
- Every number is in the range 0-1000, measured across the photo: x=0 is the left edge, x=1000 the right edge, y=0 the top edge, y=1000 the bottom edge. The photo edges are the level edges.
- Platforms, hazards and the goal: x,y is the TOP-LEFT corner of the shape, w,h is its width and height.
- Start, coins and enemies: x,y is the CENTER of the shape.
- An enemy's "patrol" is the total horizontal distance it walks, in the same 0-1000 units.

PHYSICS (so the level is beatable)
- The player can jump up at most ${MAX_JUMP_UNITS} units and cross a flat gap of at most ${MAX_GAP_UNITS} units. Stay comfortably inside those limits: if a drawn gap or step is larger, shrink it by moving or resizing platforms slightly rather than leaving it impossible.
- The player is about 20 units wide and 53 units tall. Dropping down any height is fine.

DESIGN RULES
- Start should be near the bottom-left, standing just above a platform. Place the start center about 30 units above the top of the platform under it.
- The goal must be reachable from the start by jumping between platforms. Keep it sitting on or just above a platform.
- Ignore paper edges, shadows, folds, table surfaces, pens, and hands. Only draw what is inked on the paper.
- Give every entity a unique id ("p1", "p2", "h1", "c1", "e1", "goal"). Never reuse an id.
- Keep every platform at least 30 units wide and at least 12 units tall. Do not let hazards fully cover a platform.
- If nothing is drawn for a required element, add a sensible default (a ground platform, a start, a goal).

TEXT FIELDS
- "name": a short, punny level title (max 5 words).
- "intro": one sentence introducing the level.
- "quips": exactly 6 short one-line taunts to show when the player fails. PG-13. Roast the level design or the attempt, never the person.`;

export const LEVEL_USER_PROMPT =
  "Here is the photo of the sketch. Return the level JSON.";

export function buildRepairPrompt(level: Level, report: string[]): string {
  return `The level you produced for this sketch is NOT beatable. A validator found these problems:

${report.map((line) => `- ${line}`).join("\n")}

Current level JSON:
${JSON.stringify(level)}

Fix it with the smallest possible changes: nudge, resize or add a platform, or close a gap. Keep everything else (ids, name, intro, quips, coins, enemies, hazards) as it is unless it causes a problem. Stay faithful to the drawing. The player can jump up at most ${MAX_JUMP_UNITS} units and cross a flat gap of at most ${MAX_GAP_UNITS} units. Return the FULL corrected level JSON.`;
}
