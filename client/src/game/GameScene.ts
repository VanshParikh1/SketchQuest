import Phaser from "phaser";
import {
  JUMP_VELOCITY,
  PLAYER_H,
  PLAYER_W,
  RUN_SPEED,
  WORLD_H,
  WORLD_W,
  sampleLevel,
  type Level,
} from "@sketchquest/shared";

export const GAME_SCENE_KEY = "GameScene";

const COLORS = {
  platform: 0x4a4a4a,
  spike: 0xd6453d,
  lava: 0xff8a1f,
  coin: 0xf2c200,
  goal: 0x2fb457,
  enemy: 0x8a3ffc,
  player: 0x2a6df4,
};

const COIN_SIZE = 20;
const ENEMY_SIZE = 32;

/** Normalized 0-1000 level coords -> world pixels. */
const sx = (v: number) => (v / 1000) * WORLD_W;
const sy = (v: number) => (v / 1000) * WORLD_H;

export class GameScene extends Phaser.Scene {
  level: Level = sampleLevel;

  player!: Phaser.GameObjects.Rectangle;
  platforms!: Phaser.Physics.Arcade.StaticGroup;
  hazards: Phaser.GameObjects.Rectangle[] = [];
  coins: Phaser.GameObjects.Rectangle[] = [];
  enemies: Phaser.GameObjects.Rectangle[] = [];
  goal!: Phaser.GameObjects.Rectangle;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<"W" | "A" | "D", Phaser.Input.Keyboard.Key>;

  constructor() {
    super(GAME_SCENE_KEY);
  }

  init(data: { level?: Level }) {
    this.level = data.level ?? sampleLevel;
  }

  create() {
    const { level } = this;

    // Scene fields survive restarts, so reset the per-level lists.
    this.hazards = [];
    this.coins = [];
    this.enemies = [];

    this.platforms = this.physics.add.staticGroup();
    for (const p of level.platforms) {
      const r = this.rectTopLeft(p, COLORS.platform);
      this.platforms.add(r);
    }

    for (const h of level.hazards) {
      this.hazards.push(this.rectTopLeft(h, h.type === "lava" ? COLORS.lava : COLORS.spike));
    }

    this.goal = this.rectTopLeft(level.goal, COLORS.goal);

    for (const c of level.coins) {
      const r = this.add.rectangle(sx(c.x), sy(c.y), COIN_SIZE, COIN_SIZE, COLORS.coin);
      r.setData("id", c.id);
      this.coins.push(r);
    }

    for (const e of level.enemies) {
      const r = this.add.rectangle(sx(e.x), sy(e.y), ENEMY_SIZE, ENEMY_SIZE, COLORS.enemy);
      r.setData("id", e.id);
      this.enemies.push(r);
    }

    this.player = this.add.rectangle(sx(level.start.x), sy(level.start.y), PLAYER_W, PLAYER_H, COLORS.player);
    this.physics.add.existing(this.player);
    (this.player.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.platforms);

    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.keys = kb.addKeys("W,A,D") as typeof this.keys;
  }

  update() {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const left = this.cursors.left.isDown || this.keys.A.isDown;
    const right = this.cursors.right.isDown || this.keys.D.isDown;
    const jump = this.cursors.up.isDown || this.cursors.space.isDown || this.keys.W.isDown;

    body.setVelocityX((Number(right) - Number(left)) * RUN_SPEED);

    if (jump && (body.blocked.down || body.touching.down)) {
      body.setVelocityY(-JUMP_VELOCITY);
    }
  }

  private rectTopLeft(r: { id: string; x: number; y: number; w: number; h: number }, color: number) {
    const rect = this.add.rectangle(sx(r.x), sy(r.y), sx(r.w), sy(r.h), color).setOrigin(0, 0);
    rect.setData("id", r.id);
    return rect;
  }
}
