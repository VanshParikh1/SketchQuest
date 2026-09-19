import Phaser from "phaser";
import {
  JUMP_VELOCITY,
  PLAYER_H,
  WORLD_H,
  WORLD_W,
  gameEvents,
  sampleLevel,
  type DeathCause,
  type DeathEvent,
  type Level,
  type Platform,
  type WinEvent,
} from "@sketchquest/shared";
import { Player, type MoveInput } from "./Player";
import { Enemy } from "./Enemy";
import { AttemptState } from "./AttemptState";
import { playDeathEffect } from "./deathEffects";
import { burstParticles, coinBurst, resetParticleBudget } from "./particles";
import { Hud } from "./Hud";
import { WinOverlay } from "./WinOverlay";
import { RunRecorder } from "./RunRecorder";
import { ReplayController } from "./Replay";
import { LevelIntro } from "./LevelIntro";
import { TouchControls, touchControlsEnabled } from "./TouchControls";
import { RotateBanner } from "./RotateBanner";
import { isMuted, playCoin, playDeath, playHelper, playStomp, playWin, toggleMute } from "./audio";
import { DebugOverlay } from "./DebugOverlay";
import { DEBUG } from "./debug";
import { debugTestLevels } from "./testLevels";
import { prepareLevel } from "./prepareLevel";
import { COIN_SIZE, sx, sy } from "./units";
import { addPaper } from "./paper";
import { renderStaticLevel } from "./staticArt";
import { LevelDoodles, boilTick } from "./animatedArt";
import { DEPTH, INK, INK_CSS } from "./palette";
import { narrator } from "./narrator";
import { countAssists, drawAssistPlatform, isAssist, showAssistTag } from "./assistArt";
import { findHelperRect } from "./helperPlatform";
import { StuckHelper, STUCK_DEATHS, STUCK_RADIUS } from "./StuckHelper";
import { floatText } from "./floatingText";

export const GAME_SCENE_KEY = "GameScene";

const COLORS = {
  platform: 0x4a4a4a,
  spike: 0xd6453d,
  lava: 0xff8a1f,
  coin: 0xf2c200,
  goal: 0x2fb457,
};

const DEATH_EFFECT_MS = 600;
const FALL_MARGIN = 100;
/** Stomping an enemy bounces the player at a fraction of a full jump. */
const STOMP_BOUNCE_VELOCITY = JUMP_VELOCITY * 0.8;

export class GameScene extends Phaser.Scene {
  level: Level = sampleLevel;

  player!: Player;
  platforms!: Phaser.Physics.Arcade.StaticGroup;
  hazards: Phaser.GameObjects.Rectangle[] = [];
  coins: Phaser.GameObjects.Rectangle[] = [];
  enemies: Enemy[] = [];
  goal!: Phaser.GameObjects.Rectangle;

  private attemptState = new AttemptState();
  private doodles!: LevelDoodles;
  private hud!: Hud;
  private winOverlay?: WinOverlay;
  private recorder = new RunRecorder(0);
  /** Set while the winning run loops on screen; play is frozen and physics is not simulated. */
  private replayCtl?: ReplayController;
  /** A win that will enter replay mode at the start of the next update (not inside the physics callback). */
  private pendingReplay?: WinEvent;
  private debugOverlay?: DebugOverlay;
  private stuck!: StuckHelper;
  /** Where the player last stood on something: a fall death has no useful death height. */
  private lastGrounded = { x: 0, feetY: 0 };
  private touchControls?: TouchControls;
  private rotateBanner?: RotateBanner;
  private dead = false;
  private won = false;
  /** True while the level-start title card is up: input and physics are frozen. */
  private intro = false;
  private fallThreshold = WORLD_H + FALL_MARGIN;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<"W" | "A" | "D", Phaser.Input.Keyboard.Key>;
  private restartKey!: Phaser.Input.Keyboard.Key;
  private muteKey!: Phaser.Input.Keyboard.Key;
  private helperKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super(GAME_SCENE_KEY);
  }

  init(data: { level?: Level }) {
    this.level = data.level ?? sampleLevel;
  }

  /** True while death, the win overlay or the level intro should block movement and hazards. */
  private get locked() {
    return this.dead || this.won || this.intro;
  }

  create() {
    const { level } = this;

    // Scene fields survive restarts, so reset all per-level state.
    this.hazards = [];
    this.coins = [];
    this.enemies = [];
    this.dead = false;
    this.won = false;
    this.intro = false;
    this.winOverlay = undefined;
    // Its objects died with the previous scene run; a new level always starts out of replay mode.
    this.replayCtl = undefined;
    this.pendingReplay = undefined;
    this.physics.world.resume();
    this.attemptState.reset(this);
    this.recorder = new RunRecorder(level.enemies.length);
    this.recorder.clear(this.time.now);
    resetParticleBudget(this);
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H + FALL_MARGIN + 50);

    // Visual layers: paper, then all static geometry baked once. The colored
    // rectangles below are invisible physics carriers (alpha 0, same hitboxes).
    addPaper(this);
    renderStaticLevel(this, level);
    // Arcade's ?debug=1 hitbox renderer would otherwise sit under all the art.
    this.physics.world.debugGraphic?.setDepth(DEPTH.debugHitboxes);

    this.platforms = this.physics.add.staticGroup();
    for (const p of level.platforms) {
      this.platforms.add(this.rectTopLeft(p, COLORS.platform));
    }

    for (const h of level.hazards) {
      const r = this.rectTopLeft(h, h.type === "lava" ? COLORS.lava : COLORS.spike);
      r.setData("hazardType", h.type);
      this.physics.add.existing(r, true);
      this.hazards.push(r);
    }

    this.goal = this.rectTopLeft(level.goal, COLORS.goal);
    this.physics.add.existing(this.goal, true);

    for (const c of level.coins) {
      const r = this.add.rectangle(sx(c.x), sy(c.y), COIN_SIZE, COIN_SIZE, COLORS.coin).setAlpha(0);
      r.setData("id", c.id);
      this.physics.add.existing(r, true);
      this.coins.push(r);
    }

    this.doodles = new LevelDoodles(this, level, this.coins);

    for (const e of level.enemies) {
      const enemy = new Enemy(this, e.id, sx(e.x), sy(e.y), e.patrol);
      this.physics.add.collider(enemy.rect, this.platforms);
      this.enemies.push(enemy);
    }

    this.player = new Player(this, sx(level.start.x), sy(level.start.y));
    this.player.onJump = () => this.recorder.addJump(this.time.now);
    this.physics.add.collider(this.player.rect, this.platforms);
    this.physics.add.overlap(this.player.rect, this.hazards, (_p, hazard) => {
      const type = (hazard as Phaser.GameObjects.Rectangle).getData("hazardType") as DeathCause;
      this.triggerDeath(type, this.player.x, this.player.y);
    });
    this.physics.add.overlap(this.player.rect, this.coins, (_p, coin) => {
      this.collectCoin(coin as Phaser.GameObjects.Rectangle);
    });
    this.physics.add.overlap(this.player.rect, this.goal, () => this.triggerWin());
    for (const enemy of this.enemies) {
      this.physics.add.overlap(this.player.rect, enemy.rect, () => this.handleEnemyOverlap(enemy));
    }

    this.hud = new Hud(this);

    const touch = touchControlsEnabled(this);
    this.touchControls = touch ? new TouchControls(this) : undefined;
    this.rotateBanner = touch ? new RotateBanner(this) : undefined;
    this.stuck = new StuckHelper(this, touch, () => this.useHelper());
    this.lastGrounded = { x: sx(level.start.x), feetY: sy(level.start.y) + PLAYER_H / 2 };

    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.keys = kb.addKeys("W,A,D") as typeof this.keys;
    this.restartKey = kb.addKey("R");
    this.muteKey = kb.addKey("M");
    this.helperKey = kb.addKey("H");
    this.hud.setMuted(isMuted());
    this.hud.setNarrator(narrator.voiceActive());

    if (DEBUG) {
      this.debugOverlay = new DebugOverlay(this);
      kb.on("keydown-ONE", () => this.loadDebugLevel(1));
      kb.on("keydown-TWO", () => this.loadDebugLevel(2));
      kb.on("keydown-THREE", () => this.loadDebugLevel(3));
      // Plain D is "move right", so copying needs Shift.
      kb.on("keydown-D", (e: KeyboardEvent) => {
        if (e.shiftKey) this.copyLevelJson();
      });
    }

    narrator.bind(this, level, () => ({ x: this.player.x, y: this.player.y }));
    this.startIntro();
  }

  update(_time: number, delta: number) {
    if (Phaser.Input.Keyboard.JustDown(this.muteKey)) {
      this.hud.setMuted(toggleMute());
      // M silences the narrator's voice too; its captions stay.
      narrator.onMuteChanged();
      this.hud.setNarrator(narrator.voiceActive());
    }
    narrator.update();
    this.stuck.suppress(this.won || this.intro);

    if (Phaser.Input.Keyboard.JustDown(this.restartKey) && !this.dead && !this.intro) {
      this.restartLevel();
      return;
    }

    if (this.pendingReplay) this.beginReplay(this.pendingReplay);
    if (this.replayCtl) {
      this.replayCtl.update(delta);
      this.rotateBanner?.update();
      this.doodles.update(this);
      this.hud.setCoins(this.replayCtl.coinsCollected);
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.helperKey)) this.useHelper();
    this.player.handleInput(this.readInput(), this.locked);
    if (!this.locked && this.player.body.blocked.down) {
      this.lastGrounded = { x: this.player.x, feetY: this.player.bottom };
    }
    this.rotateBanner?.update();
    if (!this.locked) this.recorder.update(this.time.now, this.player, this.enemies);

    if (!this.locked && this.player.y > this.fallThreshold) {
      this.triggerDeath("fall", this.player.x, this.player.y);
    }

    const tick = boilTick(this);
    this.player.draw(tick);
    for (const enemy of this.enemies) {
      enemy.update(this, this.platforms);
      enemy.draw(tick);
    }

    this.doodles.update(this);
    this.hud.setCoins(this.attemptState.coins);
    this.debugOverlay?.update(
      this.attemptState.attempt,
      this.attemptState.lastDeathsAtSpot,
      this.attemptState.timeAlive(this),
      countAssists(this.level.platforms) + this.stuck.used
    );
  }

  /** Keyboard and touch buttons feed the same held-state, so jump feel behaves identically. */
  private readInput(): MoveInput {
    const { cursors, keys } = this;
    const touch = this.touchControls?.read();
    return {
      left: cursors.left.isDown || keys.A.isDown || !!touch?.left,
      right: cursors.right.isDown || keys.D.isDown || !!touch?.right,
      jump: cursors.up.isDown || cursors.space.isDown || keys.W.isDown || !!touch?.jump,
    };
  }

  /** New level loaded: show the title card with physics and input frozen, then "GO!" and unlock. */
  private startIntro() {
    this.intro = true;
    this.physics.world.pause();
    narrator.onLevelIntro();
    new LevelIntro(this, this.level.name, () => {
      this.intro = false;
      this.physics.world.resume();
      this.attemptState.restartAttempt(this);
      this.recorder.clear(this.time.now);
      for (const p of this.level.platforms) if (isAssist(p.id)) showAssistTag(this, p);
    });
  }

  /** Debug-only (?debug=1): keys 1/2/3 load a test level through the same prepareLevel pipeline as loadLevel. */
  private loadDebugLevel(n: 1 | 2 | 3) {
    this.scene.restart({ level: prepareLevel(debugTestLevels[n]) });
  }

  private handleEnemyOverlap(enemy: Enemy) {
    if (this.locked || !enemy.alive) return;

    const isStomp = this.player.isFalling && this.player.bottom <= enemy.midY;
    if (isStomp) {
      enemy.kill();
      this.recorder.addStomp(this.time.now, this.enemies.indexOf(enemy));
      this.player.bounce(STOMP_BOUNCE_VELOCITY);
      playStomp();
    } else {
      this.triggerDeath("enemy", this.player.x, this.player.y);
    }
  }

  private collectCoin(coin: Phaser.GameObjects.Rectangle) {
    if (!coin.visible) return;
    coin.setVisible(false);
    (coin.body as Phaser.Physics.Arcade.Body).enable = false;
    this.attemptState.collectCoin();
    narrator.onCoin(this.attemptState.coins, this.coins.length);
    this.recorder.addCoin(this.time.now, this.coins.indexOf(coin));
    playCoin();
    coinBurst(this, coin.x, coin.y);
  }

  private resetCoinVisibility() {
    for (const c of this.coins) {
      c.setVisible(true);
      (c.body as Phaser.Physics.Arcade.Body).enable = true;
    }
  }

  /** Fires exactly one "death" event, plays the death effect, then respawns. */
  private triggerDeath(cause: DeathCause, x: number, y: number) {
    if (this.locked) return;
    this.dead = true;

    const deathsAtSpot = this.attemptState.recordDeath(x, y);
    if (this.attemptState.deathsWithin(x, y, STUCK_RADIUS) >= STUCK_DEATHS) {
      this.stuck.arm({ x, feetY: cause === "fall" ? this.lastGrounded.feetY : y + PLAYER_H / 2 });
    }
    const payload: DeathEvent = {
      cause,
      x,
      y,
      attempt: this.attemptState.attempt,
      deathsAtSpot,
      coins: this.attemptState.coins,
      timeAlive: this.attemptState.timeAlive(this),
    };
    gameEvents.emit("death", payload);

    this.player.setActive(false);
    playDeathEffect(this, x, y, cause);
    playDeath();

    this.time.delayedCall(DEATH_EFFECT_MS, () => this.respawn());
  }

  /** H or the bulb: drop one helper platform near where the player keeps dying. */
  private useHelper() {
    const spot = this.stuck.currentSpot;
    if (this.locked || !spot) return;

    const { level, player } = this;
    const goal = level.goal;
    const box = { x: player.body.x, y: player.body.y, w: player.body.width, h: player.body.height };
    const rect = findHelperRect({
      platforms: [...level.platforms, ...this.stuck.live],
      hazards: level.hazards,
      goal,
      deathX: spot.x,
      feetY: spot.feetY,
      player: box,
    });
    if (!rect) {
      floatText(this, "NO ROOM", WORLD_W / 2, 400, INK_CSS.red);
      return;
    }

    const platform: Platform = { id: `assist-live-${this.stuck.used + 1}`, ...rect };
    this.platforms.add(this.rectTopLeft(platform, COLORS.platform));
    const art = this.add.graphics().setDepth(DEPTH.staticLevel + 1).setAlpha(0);
    drawAssistPlatform(art, platform);
    this.tweens.add({ targets: art, alpha: 1, duration: 200 });
    showAssistTag(this, platform);

    const cx = sx(platform.x + platform.w / 2);
    const cy = sy(platform.y + platform.h / 2);
    burstParticles(this, cx, cy, { color: INK.grey, count: 10, speed: [40, 110], size: 7, duration: 450 });
    burstParticles(this, cx, cy, { color: INK.paper, count: 8, speed: [30, 90], size: 6, duration: 400 });
    playHelper();
    this.stuck.commit(platform);
  }

  /** Debug-only (Shift+D): the level as loaded (after sanitize + fix) to the clipboard and the console. */
  private copyLevelJson() {
    const json = JSON.stringify(this.level, null, 2);
    console.log(`[debug] level JSON (${this.level.name}):\n${json}`);
    const done = (ok: boolean) => {
      if (this.sys.isActive()) floatText(this, ok ? "COPIED" : "SEE CONSOLE", WORLD_W / 2, 320, ok ? INK_CSS.green : INK_CSS.red);
    };
    const copy = navigator.clipboard?.writeText(json);
    if (copy) copy.then(() => done(true), () => done(false));
    else done(false);
  }

  private respawn() {
    this.attemptState.nextAttempt(this);
    this.recorder.clear(this.time.now);
    this.resetCoinVisibility();
    this.player.setActive(true);
    this.player.teleport(sx(this.level.start.x), sy(this.level.start.y));
    this.dead = false;
  }

  /** Reaching the goal: fires "win", locks movement, then loops a replay of the run (or shows the full overlay if none was recorded). */
  private triggerWin() {
    if (this.locked) return;
    this.won = true;
    this.recorder.finish(this.time.now, this.player, this.enemies);

    const payload: WinEvent = {
      coins: this.attemptState.coins,
      timeAlive: this.attemptState.timeAlive(this),
    };
    gameEvents.emit("win", payload);
    playWin();
    if (this.recorder.usable) this.pendingReplay = payload;
    else this.winOverlay = new WinOverlay(this, payload, () => this.restartLevel());
  }

  /** Enters REPLAY mode: physics frozen, the win overlay shrunk to a corner panel, the run looping. */
  private beginReplay(payload: WinEvent) {
    this.pendingReplay = undefined;
    this.physics.world.pause();
    this.winOverlay = new WinOverlay(this, payload, () => this.restartLevel(), {
      deaths: this.attemptState.attempt - 1,
      attempt: this.attemptState.attempt,
    });
    this.replayCtl = new ReplayController(this, this.recorder, this.player, this.enemies, this.coins);
  }

  /** R key or tap: restart the level (a manual, non-death restart; also leaves replay mode). */
  private restartLevel() {
    if (this.winOverlay) {
      this.winOverlay.destroy();
      this.winOverlay = undefined;
    }
    this.pendingReplay = undefined;
    if (this.replayCtl) {
      this.replayCtl.destroy();
      this.replayCtl = undefined;
      this.physics.world.resume();
    }
    this.won = false;
    this.attemptState.restartAttempt(this);
    this.recorder.clear(this.time.now);
    this.resetCoinVisibility();
    this.player.teleport(sx(this.level.start.x), sy(this.level.start.y));
  }

  private rectTopLeft(r: { id: string; x: number; y: number; w: number; h: number }, color: number) {
    const rect = this.add.rectangle(sx(r.x), sy(r.y), sx(r.w), sy(r.h), color).setOrigin(0, 0).setAlpha(0);
    rect.setData("id", r.id);
    return rect;
  }
}
