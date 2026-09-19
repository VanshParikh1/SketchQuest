import type { DeathCause } from "@sketchquest/shared";
import type { NarratorContext } from "./types";

/**
 * The local line pool. Tone: smug sports commentator roasting the PLAY (the
 * jump, the timing, the route), never the person. PG-13.
 *
 * Placeholders: {attempt} {deathsAtSpot} {coins} {coinsLabel} ("1 coin" /
 * "3 coins") {timeAlive} (seconds, 1 decimal) {levelName} {totalDeaths}
 * {levelDeaths}. Keep lines short: they are spoken aloud and typed into a
 * bubble on a phone screen.
 *
 * Grammar guard: tier 0 (first death here) never uses {deathsAtSpot}; tier 2
 * (3+) may. {coins} lines only appear when coins > 0 (see SITUATIONAL).
 */

/** 0 = light tease (deathsAtSpot 1), 1 = sharper (2), 2 = brutal and specific (3+). */
export type Tier = 0 | 1 | 2;
export const tierFor = (deathsAtSpot: number): Tier => (deathsAtSpot >= 3 ? 2 : deathsAtSpot === 2 ? 1 : 0);

export const DEATH_LINES: Record<DeathCause, [string[], string[], string[]]> = {
  spike: [
    [
      "Ah, the spike. Sharp, stationary, and somehow still a surprise.",
      "That spike has been standing there since the level loaded. Very patient.",
      "Attempt {attempt}, and the spike takes the opening round.",
      "Good news: you found the spike. Bad news: with your whole body.",
      "In fairness, the spike announced itself. Loudly. In red.",
      "Bold choice, landing on the one thing drawn to say ouch.",
      "Spikes are just tiny mountains with opinions.",
    ],
    [
      "Twice on the same spike. It's starting to feel like a hobby.",
      "Same spike, same jump, same result. Change any one of those.",
      "The spike hasn't moved. Statistically, that's on the jump.",
      "Two pokes in one spot. The spike is getting good practice.",
      "Keep landing there and the spike will start charging rent.",
      "Second poke. On the bright side, the spike is consistent.",
      "That spike is a lot like your jump: it does the exact same thing every time.",
    ],
    [
      "{deathsAtSpot} deaths on one patch of spikes. That's not a jump, that's a commitment.",
      "The spike has beaten you {deathsAtSpot} times here and it isn't even trying.",
      "{deathsAtSpot} tries. This spike now has more experience with your jump than you do.",
      "{deathsAtSpot} times! Jump earlier, later, differently. Anything but identically.",
      "You've fed this spike {deathsAtSpot} times. It's full. Go around.",
      "{deathsAtSpot} deaths here. Jump before the edge, not on it, and hold the button.",
      "The spike is undefeated here: {deathsAtSpot} to nothing. Adjust the plan.",
    ],
  ],
  lava: [
    [
      "Lava is hot. You've confirmed it, on behalf of science.",
      "That was less of a swim and more of a sizzle.",
      "The lava says thanks for stopping by.",
      "Attempt {attempt}: the floor was lava. The floor was always lava.",
      "The glowing orange stuff is not a shortcut. Noted for next time.",
      "That went from nice jump to nice toast very quickly.",
      "Medium rare, and the lava wasn't even hungry.",
    ],
    [
      "Back in the lava. It's not a hot tub, and yet here we are.",
      "Second dip. The lava remains unimpressed.",
      "Lava again. Maybe the trick is to be where the lava isn't.",
      "Two dips in the same spot. Bold to assume it cooled off.",
      "The lava is exactly as hot as last time. Science is consistent.",
      "That's the second time the lava got a free sample.",
      "Same puddle, same jump, same smell of burning marker.",
    ],
    [
      "{deathsAtSpot} trips into the same lava. At this point it's a subscription.",
      "The lava is keeping your last {deathsAtSpot} attempts as souvenirs.",
      "{deathsAtSpot} deaths in one puddle. The lava should pay you commission.",
      "Extra crispy, {deathsAtSpot} times over. The platform is the solid thing. Try it.",
      "{deathsAtSpot} visits! Jump over the lava, not into it. Just a thought.",
      "This lava has now seen every version of your jump. All of them well done.",
      "{deathsAtSpot} baked attempts at one spot. Time to try a route with fewer puddles.",
    ],
  ],
  enemy: [
    [
      "Taken out by a stick figure. Its arms are lines. Its legs are lines. Somehow that was enough.",
      "That guy walks back and forth. You walked into him. Both of you committed.",
      "The enemy did its one job: exist in your way. Mission accomplished.",
      "Fun fact: you can jump on those. Or into them, as demonstrated.",
      "Beaten by a scribble. It happens to the best of us.",
      "It patrols. Patrolling is the whole job description. Nobody was surprised except you.",
      "Head-on with a stick figure. It didn't even swing.",
    ],
    [
      "Two hugs from the same stick figure. It's flattered, honestly.",
      "The enemy walks in a straight line. You keep meeting it there.",
      "Second collision. Try landing on top instead of in front.",
      "Same walker, same route, same bonk. The patrol is doing great.",
      "Stomp it. Its whole personality is stompable.",
      "It's not chasing you. You keep arriving. There's a difference.",
      "Twice now. That stick figure is starting to feel confident.",
    ],
    [
      "{deathsAtSpot} losses to a guy who walks between two points. Study the two points.",
      "Its pattern is left, right, left. Yours is die, die, die. {deathsAtSpot} times here.",
      "{deathsAtSpot} deaths to one patrol. Let it turn around, then go. It really is that simple.",
      "That stick figure is {deathsAtSpot} for {deathsAtSpot} against you at this spot.",
      "The enemy isn't even hunting you. You've visited {deathsAtSpot} times.",
      "{deathsAtSpot} collisions. Wait for the gap, then stomp. It's basically choreography.",
      "You've lost to the same stick figure {deathsAtSpot} times. It's made of six lines and it's getting cocky.",
    ],
  ],
  fall: [
    [
      "Gravity: undefeated since forever.",
      "That was a confident jump toward absolutely nothing.",
      "The bottom of the screen says hi.",
      "You found the edge of the level. It's very final.",
      "That's a long way down for a short jump.",
      "Bold strategy: skip the platform entirely.",
      "The floor was optional. Apparently so was the landing.",
    ],
    [
      "Second fall. The gap did not get smaller in the meantime.",
      "The gap is exactly as wide as before. Geometry is like that.",
      "You jumped like the platform would meet you halfway. Platforms are stubborn.",
      "Two falls at the same edge. It's a very well tested edge.",
      "Try jumping a bit earlier. Or later. Or at least differently.",
      "Gravity wins again and barely had to try.",
      "Same gap, same fall. The gap is starting to look smug.",
    ],
    [
      "{deathsAtSpot} falls at the same gap. It has more of your attempts than the platform does.",
      "{deathsAtSpot} times into the void. The void appreciates the company.",
      "Same gap, {deathsAtSpot} falls. Run up, jump at the very edge, hold the button. It's a real option.",
      "This ledge has {deathsAtSpot} of your falls and none of your landings.",
      "{deathsAtSpot} deaths here. Have you considered another way? Any other way?",
      "{deathsAtSpot} falls. The pit is starting to feel like home, and you're the only guest.",
      "The gap has beaten you {deathsAtSpot} times. It's made entirely of nothing.",
    ],
  ],
};

/**
 * Extra death lines that only fit some situations. pickLine mixes these in
 * about a quarter of the time when one applies.
 */
export const SITUATIONAL: Array<{ id: string; when: (c: NarratorContext) => boolean; lines: string[] }> = [
  {
    id: "carrying-coins",
    when: (c) => c.coins > 0,
    lines: [
      "You died holding {coinsLabel}. Expensive way to test the terrain.",
      "{coinsLabel} collected, zero survived. Priorities noted.",
      "Those {coinsLabel} were a nice touch. Shame about the rest of the attempt.",
      "You can't spend {coinsLabel} from in there.",
    ],
  },
  {
    id: "too-quick",
    when: (c) => c.timeAlive <= 2.5,
    lines: [
      "{timeAlive} seconds. Blink and you'd have missed it. So did you.",
      "Alive for {timeAlive}s. Speedrun category: dying.",
      "That was quick. The jump button barely warmed up.",
      "{timeAlive} seconds. Impressive commitment to not making progress.",
    ],
  },
  {
    id: "so-close",
    when: (c) => c.timeAlive >= 20,
    lines: [
      "{timeAlive} seconds of solid play, and then that. Painful.",
      "You were doing so well for {timeAlive} seconds. Then physics.",
      "All that progress, then one tiny bad decision. Classic.",
      "{timeAlive}s of survival ruined in a single jump.",
    ],
  },
  {
    id: "grinding",
    when: (c) => c.attempt >= 8,
    lines: [
      "Attempt {attempt}. At this point the level is learning you.",
      "That's attempt {attempt}. {levelName} has a favorite among your mistakes now.",
      "{attempt} attempts in. Same jump, {attempt} times. Try a different one.",
      "Attempt {attempt}. Consider a stretch, a sip of water, and a new route.",
    ],
  },
];

export const INTRO_LINES = [
  "Welcome to {levelName}. Try to make it look easy. Or possible.",
  "{levelName}. Hand drawn, survived by nobody so far.",
  "Okay, {levelName}. Left, right, jump. That's basically the whole game.",
  "{levelName} looks harmless. So did the last thing that got you.",
  "Rules of {levelName}: stay off the red, stay off the orange, stay off the stick figures.",
  "Here we go, {levelName}. I've already got my notes out.",
  "{levelName} awaits. So does a lot of falling, statistically.",
  "Let's see how far {levelName} lets you get.",
  "Somebody drew this by hand, and I'm about to watch you fall through it.",
  "New page, new mistakes. {levelName}, let's go.",
];

export const FIRST_COIN_LINES = [
  "A coin! Look at you, collecting things.",
  "First coin. The economy is saved.",
  "Shiny. Keep that up and you'll be rich in imaginary money.",
  "One coin down. It's a start.",
  "Ooh, a coin. I believe that's called progress.",
  "Coin number one. The rest are nervous.",
];

export const ALL_COINS_LINES = [
  "Every coin collected. Someone likes shiny things.",
  "All the coins! Now try surviving with them.",
  "Full coin set. That's actual skill, and I'm annoyed.",
  "That's all {coinsLabel}. Now the hard part: not dying on the way out.",
  "Coin collection complete. Greed is working out for you.",
  "Every last coin. Somebody's been paying attention.",
];

export const WIN_LINES = {
  /** No deaths on this level. */
  flawless: [
    "First try. Either you're good or the level is. I'm undecided.",
    "Zero deaths. I had roasts prepared. You wasted my time. Thank you.",
    "Flawless in {timeAlive} seconds. Suspiciously smooth.",
    "No deaths at all. I'm not mad, I'm just unemployed.",
    "{levelName} cleared without a scratch. I'll allow it.",
    "A perfect run. Somewhere, a spike is very confused.",
  ],
  /** 1-3 deaths. */
  few: [
    "Cleared on attempt {attempt}. Some learning was involved.",
    "Done in {timeAlive} seconds after a few detours. That's called character development.",
    "Attempt {attempt}: victory. The early attempts were practice. Officially.",
    "You made it! The mistakes were tasteful and few.",
    "{levelName} survived. A few scuffs, mostly cosmetic.",
    "Not flawless, but I've narrated worse. Today, actually.",
  ],
  /** 4+ deaths. */
  many: [
    "Attempt {attempt}, but you did it. Persistence is a strategy.",
    "That took {attempt} tries. The level is exhausted. So is my material.",
    "Finally. I ran out of roasts around attempt {attempt}, and you kept going anyway.",
    "After {attempt} attempts, {levelName} is yours. Please tell nobody how many.",
    "Victory! And only {attempt} attempts. I'll pretend that's a normal number.",
    "The level is beaten, and so is my patience. Congratulations.",
  ],
};

/** Total deaths this session, keyed by count. */
export const MILESTONE_LINES: Record<number, string[]> = {
  5: [
    "That's death number {totalDeaths}. The night is young.",
    "Five deaths. A nice round number for a nice round mistake.",
    "Five down. I'd say you're warming up, but the lava says otherwise.",
    "Death five. I'd applaud, but my hands are also drawn.",
  ],
  10: [
    "Ten deaths. That's a double-digit commitment to the bit.",
    "Death number ten. The level and I are proud of your dedication.",
    "Ten! We've officially hit the part of the evening with a name: the grind.",
    "Ten deaths. The start point is starting to feel like your second home.",
  ],
};
