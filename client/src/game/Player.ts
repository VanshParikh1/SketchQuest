import Phaser from "phaser";
import { JUMP_VELOCITY, PLAYER_H, PLAYER_W, RUN_SPEED } from "@sketchquest/shared";
import { playJump } from "./audio";
import { BOIL_VARIANTS, DEPTH } from "./palette";
import { seededFor } from "./sketch";
import { drawPlayer } from "./characterArt";
import { PF_AIRBORNE, PF_FACING_LEFT, PF_LANDING, PF_RISING, PF_RUNNING, type PlayerFrame } from "./RunRecorder";

/** Invisible physics carrier color; the visible doodle is the `art` Graphics. */
const PLAYER_COLOR = 0x2a6df4;
/** Grace window after leaving a platform where a jump still counts. */
const COYOTE_MS = 100;
/** Grace window before landing where an earlier jump press is remembered. */
const JUMP_BUFFER_MS = 100;
/** Releasing jump early clamps the upward speed to this fraction of a full jump. */
const JUMP_CUTOFF_FACTOR = 0.5;
const SQUASH_STRETCH_MS = 120;

/** Held-state of the three player controls, from keyboard and/or touch. */
export type MoveInput = { left: boolean; right: boolean; jump: boolean };

/** The player rectangle plus its arcade body, movement, and jump feel. */
export class Player {
  readonly rect: Phaser.GameObjects.Rectangle;
  readonly body: Phaser.Physics.Arcade.Body;

  private readonly scene: Phaser.Scene;
  private lastGroundedAt = -Infinity;
  private lastJumpPressedAt = -Infinity;
  private wasJumpDown = false;
  private wasGrounded = true;
  private readonly art: Phaser.GameObjects.Graphics;
  private facing: 1 | -1 = 1;
  private artKey = "";
  /** Called on every real (input-driven) jump, for the run recorder. */
  onJump?: () => void;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.rect = scene.add.rectangle(x, y, PLAYER_W, PLAYER_H, PLAYER_COLOR).setAlpha(0);
    this.art = scene.add.graphics().setDepth(DEPTH.player);
    scene.physics.add.existing(this.rect);
    this.body = this.rect.body as Phaser.Physics.Arcade.Body;
    this.body.setCollideWorldBounds(true);
  }

  get x() {
    return this.rect.x;
  }

  get y() {
    return this.rect.y;
  }

  /** Bottom edge of the player's hitbox, in world px. */
  get bottom() {
    return this.rect.y + PLAYER_H / 2;
  }

  /** True while moving downward, used to tell a stomp from a side hit. */
  get isFalling() {
    return this.body.velocity.y > 0;
  }

  private get grounded() {
    return this.body.blocked.down || this.body.touching.down;
  }

  handleInput(input: MoveInput, locked: boolean) {
    const now = this.scene.time.now;
    const grounded = this.grounded;
    if (grounded) this.lastGroundedAt = now;

    if (!this.wasGrounded && grounded) this.playLandSquash();

    if (locked) {
      this.body.setVelocityX(0);
      this.wasJumpDown = false;
      this.wasGrounded = grounded;
      return;
    }

    const { left, right, jump: jumpDown } = input;
    const jumpJustPressed = jumpDown && !this.wasJumpDown;

    this.body.setVelocityX((Number(right) - Number(left)) * RUN_SPEED);

    if (jumpJustPressed) this.lastJumpPressedAt = now;

    const withinCoyote = now - this.lastGroundedAt <= COYOTE_MS;
    const withinBuffer = now - this.lastJumpPressedAt <= JUMP_BUFFER_MS;

    if (withinBuffer && withinCoyote) {
      // Consume both so this single press can't trigger a jump twice.
      this.lastJumpPressedAt = -Infinity;
      this.lastGroundedAt = -Infinity;
      this.body.setVelocityY(-JUMP_VELOCITY);
      this.playJumpSquash();
      playJump();
      this.onJump?.();
    } else if (!jumpDown && this.body.velocity.y < -JUMP_VELOCITY * JUMP_CUTOFF_FACTOR) {
      // Released early: cut the ascent short for a shorter jump.
      this.body.setVelocityY(-JUMP_VELOCITY * JUMP_CUTOFF_FACTOR);
    }

    this.wasJumpDown = jumpDown;
    this.wasGrounded = grounded;
  }

  /** Bounce upward after stomping an enemy. */
  bounce(velocity: number) {
    this.body.setVelocityY(-velocity);
  }

  teleport(x: number, y: number) {
    this.body.reset(x, y);
    this.rect.setScale(1, 1);
  }

  setActive(active: boolean) {
    this.body.enable = active;
    this.rect.setVisible(active);
    this.art.setVisible(active);
  }

  /** Fills `out` with everything a replay needs to redraw this exact frame. */
  snapshot(out: PlayerFrame): PlayerFrame {
    const { body, rect } = this;
    const pose = this.pose();
    let flags = 0;
    if (pose.running) flags |= PF_RUNNING;
    if (pose.airborne) flags |= PF_AIRBORNE;
    if (pose.rising) flags |= PF_RISING;
    if (!pose.airborne && rect.scaleY < 0.97) flags |= PF_LANDING;
    if (this.facingFor(body.velocity.x) < 0) flags |= PF_FACING_LEFT;
    out.x = body.center.x;
    out.y = body.center.y;
    out.scaleX = rect.scaleX;
    out.scaleY = rect.scaleY;
    out.flags = flags;
    return out;
  }

  /** Replay mode: the body is switched off and the doodle is driven from recorded frames (see `drawReplay`). */
  enterReplay() {
    this.body.enable = false;
    this.artKey = "";
  }

  /** Back to live play; the caller teleports the player to the start afterwards. */
  exitReplay() {
    this.scene.tweens.killTweensOf(this.rect);
    this.setActive(true);
    this.artKey = "";
  }

  /**
   * Follows the physics body every frame (so squash/stretch and facing stay
   * smooth) but only redraws the doodle when the boil tick or pose changes.
   */
  draw(tick: number) {
    const { body, rect } = this;
    this.facing = this.facingFor(body.velocity.x);
    this.paint(tick, body.center.x, body.center.y, rect.scaleX, rect.scaleY, this.pose());
  }

  /** Same doodle and cache as `draw`, positioned and posed from a recorded (interpolated) frame. */
  drawReplay(tick: number, f: PlayerFrame) {
    this.facing = f.flags & PF_FACING_LEFT ? -1 : 1;
    this.paint(tick, f.x, f.y, f.scaleX, f.scaleY, {
      running: (f.flags & PF_RUNNING) !== 0,
      airborne: (f.flags & PF_AIRBORNE) !== 0,
      rising: (f.flags & PF_RISING) !== 0,
    });
  }

  private facingFor(vx: number): 1 | -1 {
    if (vx > 5) return 1;
    if (vx < -5) return -1;
    return this.facing;
  }

  private pose() {
    const { body } = this;
    const airborne = !this.grounded;
    return {
      running: !airborne && Math.abs(body.velocity.x) > 10,
      airborne,
      rising: airborne && body.velocity.y < 0,
    };
  }

  private paint(
    tick: number,
    x: number,
    y: number,
    scaleX: number,
    scaleY: number,
    pose: { running: boolean; airborne: boolean; rising: boolean }
  ) {
    const { art } = this;
    art.setPosition(x, y);
    art.setScale(scaleX * this.facing, scaleY);

    const { running, airborne, rising } = pose;
    const key = `${tick}:${running}:${airborne}:${rising}`;
    if (key === this.artKey) return;
    this.artKey = key;
    drawPlayer(art, { tick, running, airborne, rising }, seededFor("player", tick % BOIL_VARIANTS));
  }

  private playJumpSquash() {
    this.scene.tweens.killTweensOf(this.rect);
    this.rect.setScale(0.8, 1.25);
    this.scene.tweens.add({
      targets: this.rect,
      scaleX: 1,
      scaleY: 1,
      duration: SQUASH_STRETCH_MS,
      ease: "Quad.easeOut",
    });
  }

  private playLandSquash() {
    this.scene.tweens.killTweensOf(this.rect);
    this.rect.setScale(1.25, 0.75);
    this.scene.tweens.add({
      targets: this.rect,
      scaleX: 1,
      scaleY: 1,
      duration: SQUASH_STRETCH_MS,
      ease: "Quad.easeOut",
    });
  }
}
