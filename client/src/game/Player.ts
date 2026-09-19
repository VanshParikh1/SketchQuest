import Phaser from "phaser";
import { JUMP_VELOCITY, PLAYER_H, PLAYER_W, RUN_SPEED } from "@sketchquest/shared";
import { playJump } from "./audio";

const PLAYER_COLOR = 0x2a6df4;
/** Grace window after leaving a platform where a jump still counts. */
const COYOTE_MS = 100;
/** Grace window before landing where an earlier jump press is remembered. */
const JUMP_BUFFER_MS = 100;
/** Releasing jump early clamps the upward speed to this fraction of a full jump. */
const JUMP_CUTOFF_FACTOR = 0.5;
const SQUASH_STRETCH_MS = 120;

export type PlayerKeys = {
  cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  wasd: Record<"W" | "A" | "D", Phaser.Input.Keyboard.Key>;
};

/** The player rectangle plus its arcade body, movement, and jump feel. */
export class Player {
  readonly rect: Phaser.GameObjects.Rectangle;
  readonly body: Phaser.Physics.Arcade.Body;

  private readonly scene: Phaser.Scene;
  private lastGroundedAt = -Infinity;
  private lastJumpPressedAt = -Infinity;
  private wasJumpDown = false;
  private wasGrounded = true;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.rect = scene.add.rectangle(x, y, PLAYER_W, PLAYER_H, PLAYER_COLOR);
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

  handleInput(keys: PlayerKeys, locked: boolean) {
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

    const { cursors, wasd } = keys;
    const left = cursors.left.isDown || wasd.A.isDown;
    const right = cursors.right.isDown || wasd.D.isDown;
    const jumpDown = cursors.up.isDown || cursors.space.isDown || wasd.W.isDown;
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
