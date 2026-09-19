import Phaser from "phaser";
import { JUMP_VELOCITY, PLAYER_H, PLAYER_W, RUN_SPEED } from "@sketchquest/shared";

const PLAYER_COLOR = 0x2a6df4;

export type PlayerKeys = {
  cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  wasd: Record<"W" | "A" | "D", Phaser.Input.Keyboard.Key>;
};

/** The player rectangle plus its arcade body and movement. */
export class Player {
  readonly rect: Phaser.GameObjects.Rectangle;
  readonly body: Phaser.Physics.Arcade.Body;

  constructor(scene: Phaser.Scene, x: number, y: number) {
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

  handleInput(keys: PlayerKeys, locked: boolean) {
    if (locked) {
      this.body.setVelocityX(0);
      return;
    }

    const { cursors, wasd } = keys;
    const left = cursors.left.isDown || wasd.A.isDown;
    const right = cursors.right.isDown || wasd.D.isDown;
    const jump = cursors.up.isDown || cursors.space.isDown || wasd.W.isDown;

    this.body.setVelocityX((Number(right) - Number(left)) * RUN_SPEED);

    if (jump && (this.body.blocked.down || this.body.touching.down)) {
      this.body.setVelocityY(-JUMP_VELOCITY);
    }
  }

  /** Bounce upward after stomping an enemy. */
  bounce(velocity: number) {
    this.body.setVelocityY(-velocity);
  }

  teleport(x: number, y: number) {
    this.body.reset(x, y);
  }

  setActive(active: boolean) {
    this.body.enable = active;
    this.rect.setVisible(active);
  }
}
