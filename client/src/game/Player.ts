import Phaser from "phaser";
import { JUMP_VELOCITY, PLAYER_H, PLAYER_W, RUN_SPEED } from "@sketchquest/shared";
import { playJump } from "./audio";
import { BOIL_VARIANTS, DEPTH } from "./palette";
import { seededFor } from "./sketch";
import { drawPlayer } from "./characterArt";

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

  /**
   * Follows the physics body every frame (so squash/stretch and facing stay
   * smooth) but only redraws the doodle when the boil tick or pose changes.
   */
  draw(tick: number) {
    const { art, body, rect } = this;
    const vx = body.velocity.x;
    if (vx > 5) this.facing = 1;
    else if (vx < -5) this.facing = -1;

    art.setPosition(body.center.x, body.center.y);
    art.setScale(rect.scaleX * this.facing, rect.scaleY);

    const airborne = !this.grounded;
    const running = !airborne && Math.abs(vx) > 10;
    const rising = airborne && body.velocity.y < 0;
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
