import Phaser from "phaser";
import { RUN_SPEED, WORLD_W } from "@sketchquest/shared";
import { BOIL_VARIANTS, DEPTH } from "./palette";
import { seededFor } from "./sketch";
import { drawEnemy } from "./characterArt";
import { enemyDeathBurst } from "./particles";

const ENEMY_SIZE = 32;
/** Invisible physics carrier color; the visible stick figure is the `art` Graphics. */
const ENEMY_COLOR = 0x8a3ffc;
const PATROL_SPEED = RUN_SPEED * 0.5;
const EDGE_PROBE_SIZE = 4;

/** Normalized 0-1000 distance -> world px, matching GameScene's scale. */
const scaleDistance = (v: number) => (v / 1000) * WORLD_W;

/** The stick-figure doodle for one flip-book frame; shared by live enemies and replay ghosts. */
export function redrawEnemy(art: Phaser.GameObjects.Graphics, id: string, tick: number) {
  drawEnemy(art, { tick }, seededFor(id, tick % BOIL_VARIANTS));
}

/**
 * A patrol enemy: a dynamic arcade body affected by gravity, walking back
 * and forth over `patrol` world px centered on its spawn point. It reverses
 * at the ends of that range and before walking off a platform edge.
 */
export class Enemy {
  readonly id: string;
  readonly rect: Phaser.GameObjects.Rectangle;
  readonly body: Phaser.Physics.Arcade.Body;
  alive = true;

  private readonly minX: number;
  private readonly maxX: number;
  private direction: 1 | -1 = 1;
  private readonly scene: Phaser.Scene;
  private readonly art: Phaser.GameObjects.Graphics;
  private lastTick = -1;
  private lastX: number;
  private lastY: number;

  constructor(scene: Phaser.Scene, id: string, x: number, y: number, patrol: number) {
    this.id = id;
    this.scene = scene;
    this.lastX = x;
    this.lastY = y;
    this.rect = scene.add.rectangle(x, y, ENEMY_SIZE, ENEMY_SIZE, ENEMY_COLOR).setAlpha(0);
    this.art = scene.add.graphics().setDepth(DEPTH.enemy);
    this.rect.setData("id", id);

    scene.physics.add.existing(this.rect);
    this.body = this.rect.body as Phaser.Physics.Arcade.Body;
    this.body.setCollideWorldBounds(false);

    const halfRange = scaleDistance(patrol) / 2;
    this.minX = x - halfRange;
    this.maxX = x + halfRange;
    this.body.setVelocityX(PATROL_SPEED * this.direction);
  }

  /** Center position (frozen where it died, once dead), for the run recorder. */
  get x() {
    return this.alive ? this.body.center.x : this.lastX;
  }

  get y() {
    return this.alive ? this.body.center.y : this.lastY;
  }

  get facingLeft() {
    return this.direction < 0;
  }

  /** Y of the enemy's midpoint, for the stomp-vs-side-hit check. */
  get midY() {
    return this.rect.y;
  }

  /** Call every frame while alive, after platform collision has resolved. */
  update(scene: Phaser.Scene, platforms: Phaser.Physics.Arcade.StaticGroup) {
    if (!this.alive) return;

    if (this.rect.x <= this.minX) this.direction = 1;
    else if (this.rect.x >= this.maxX) this.direction = -1;
    else if (this.body.blocked.down && !this.hasGroundAhead(scene, platforms)) {
      this.direction *= -1;
    }

    this.body.setVelocityX(PATROL_SPEED * this.direction);
  }

  /** Follows the body each frame, faces the patrol direction, and redraws the leg swing on boil ticks. */
  draw(tick: number) {
    if (!this.alive) return;
    const { art, body } = this;
    art.setPosition(body.center.x, body.center.y).setScale(this.direction, 1);
    if (tick === this.lastTick) return;
    this.lastTick = tick;
    redrawEnemy(art, this.id, tick);
  }

  /** Replay mode: hide the live enemy (and stop its body) while recorded ghosts play; show it again after. */
  setReplayHidden(hidden: boolean) {
    if (!this.alive) return;
    this.art.setVisible(!hidden);
    this.body.enable = !hidden;
  }

  private hasGroundAhead(scene: Phaser.Scene, platforms: Phaser.Physics.Arcade.StaticGroup): boolean {
    const half = ENEMY_SIZE / 2;
    const probeSize = EDGE_PROBE_SIZE;
    const probeX = this.rect.x + this.direction * (half + probeSize / 2) - probeSize / 2;
    const probeY = this.rect.y + half + 2;

    const bodies = scene.physics.overlapRect(probeX, probeY, probeSize, probeSize, false, true);
    return bodies.some((b) => platforms.contains(b.gameObject as Phaser.GameObjects.GameObject));
  }

  kill() {
    if (!this.alive) return;
    this.alive = false;
    this.lastX = this.rect.x;
    this.lastY = this.rect.y;
    enemyDeathBurst(this.scene, this.rect.x, this.rect.y);
    this.art.destroy();
    this.rect.destroy();
  }
}
