import Phaser from "phaser";
import {
  JUMP_VELOCITY,
  PLAYER_H,
  PLAYER_W,
  RUN_SPEED,
  WORLD_H,
  WORLD_W,
  gameEvents,
  sampleLevel,
  type DeathCause,
  type Level,
} from "@sketchquest/shared";
import { DeathTracker } from "./DeathTracker";
import { IdBadgeOverlay } from "./IdBadgeOverlay";
import { ensureParticleTextures } from "./particles";

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
  private keys!: Record<"W" | "A" | "D" | "R" | "B", Phaser.Input.Keyboard.Key>;

  // Game state
  private deathTracker = new DeathTracker(80);
  private idBadges!: IdBadgeOverlay;
  private coinsCollected: number = 0;
  private isAlive: boolean = true;
  private isWon: boolean = false;
  private wasInAir: boolean = false;

  // HUD
  private hudTextTitle!: Phaser.GameObjects.Text;
  private hudTextStats!: Phaser.GameObjects.Text;
  private winModalContainer?: Phaser.GameObjects.Container;

  // Particle emitters
  private sparkleEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;
  private dustEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;
  private shatterEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() {
    super(GAME_SCENE_KEY);
  }

  init(data: { level?: Level }) {
    this.level = data.level ?? sampleLevel;
    this.deathTracker.reset();
  }

  create() {
    const { level } = this;

    ensureParticleTextures(this);

    // Setup systems
    this.idBadges = new IdBadgeOverlay(this);
    this.isAlive = true;
    this.isWon = false;
    this.coinsCollected = 0;
    this.wasInAir = false;

    // Reset lists
    this.hazards = [];
    this.coins = [];
    this.enemies = [];

    // Setup particles
    this.setupParticles();

    // Platforms
    this.platforms = this.physics.add.staticGroup();
    for (const p of level.platforms) {
      const r = this.rectTopLeft(p, COLORS.platform);
      this.platforms.add(r);
      this.idBadges.addBadge(p.id, sx(p.x) + sx(p.w) / 2, sy(p.y) - 12, 0x1e293b);
    }

    // Hazards (spikes & lava)
    for (const h of level.hazards) {
      const isLava = h.type === "lava";
      const r = this.rectTopLeft(h, isLava ? COLORS.lava : COLORS.spike);
      this.physics.add.existing(r, true);
      r.setData("type", h.type);
      this.hazards.push(r);
      this.idBadges.addBadge(h.id, sx(h.x) + sx(h.w) / 2, sy(h.y) - 12, isLava ? 0xc2410c : 0x991b1b);
    }

    // Goal
    this.goal = this.rectTopLeft(level.goal, COLORS.goal);
    this.physics.add.existing(this.goal, true);
    this.idBadges.addBadge(level.goal.id, sx(level.goal.x) + sx(level.goal.w) / 2, sy(level.goal.y) - 12, 0x166534);

    // Coins
    for (const c of level.coins) {
      const r = this.add.rectangle(sx(c.x), sy(c.y), COIN_SIZE, COIN_SIZE, COLORS.coin);
      r.setData("id", c.id);
      this.physics.add.existing(r, true);
      this.coins.push(r);
      this.idBadges.addBadge(c.id, sx(c.x), sy(c.y) - 16, 0x854d0e);

      // Idle float animation
      this.tweens.add({
        targets: r,
        y: sy(c.y) - 6,
        duration: 700 + Math.random() * 300,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    // Enemies (with horizontal patrol)
    for (const e of level.enemies) {
      const r = this.add.rectangle(sx(e.x), sy(e.y), ENEMY_SIZE, ENEMY_SIZE, COLORS.enemy);
      r.setData("id", e.id);
      this.physics.add.existing(r);

      const body = r.body as Phaser.Physics.Arcade.Body;
      body.setCollideWorldBounds(true);
      const patrolDist = sx(Math.max(e.patrol, 40));
      const minX = Math.max(0, sx(e.x) - patrolDist / 2);
      const maxX = Math.min(WORLD_W, sx(e.x) + patrolDist / 2);
      r.setData("minX", minX);
      r.setData("maxX", maxX);
      r.setData("speed", 90);
      body.setVelocityX(90);

      this.enemies.push(r);
      this.idBadges.addBadge(e.id, sx(e.x), sy(e.y) - 22, 0x581c87);
    }

    // Player
    this.player = this.add.rectangle(
      sx(level.start.x),
      sy(level.start.y),
      PLAYER_W,
      PLAYER_H,
      COLORS.player
    );
    this.physics.add.existing(this.player);
    const pBody = this.player.body as Phaser.Physics.Arcade.Body;
    // Allow falling off bottom of world
    pBody.setCollideWorldBounds(true);
    pBody.checkCollision.down = false;

    // Collisions
    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.collider(this.enemies, this.platforms);

    // Overlaps
    this.hazards.forEach((h) => {
      this.physics.add.overlap(this.player, h, () => {
        this.handleDeath(h.getData("type") as DeathCause);
      });
    });

    this.enemies.forEach((e) => {
      this.physics.add.overlap(this.player, e, () => {
        this.handleDeath("enemy");
      });
    });

    this.coins.forEach((c) => {
      this.physics.add.overlap(this.player, c, () => {
        this.collectCoin(c);
      });
    });

    this.physics.add.overlap(this.player, this.goal, () => {
      this.handleWin();
    });

    // Inputs
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.keys = kb.addKeys("W,A,D,R,B") as typeof this.keys;

    // HUD setup
    this.setupHUD();

    // Hotkey handlers
    this.keys.R.on("down", () => this.respawnPlayer());
    this.keys.B.on("down", () => this.idBadges.toggle());
  }

  private setupParticles(): void {
    this.sparkleEmitter = this.add.particles(0, 0, "particle_star", {
      speed: { min: 40, max: 140 },
      angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0 },
      lifespan: 500,
      gravityY: 200,
      emitting: false,
    });
    this.sparkleEmitter.setDepth(100);

    this.dustEmitter = this.add.particles(0, 0, "particle_dust", {
      speed: { min: 20, max: 60 },
      angle: { min: 200, max: 340 },
      scale: { start: 1, end: 0 },
      alpha: { start: 0.8, end: 0 },
      lifespan: 300,
      emitting: false,
    });
    this.dustEmitter.setDepth(90);

    this.shatterEmitter = this.add.particles(0, 0, "particle_shatter", {
      speed: { min: 80, max: 260 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.2, end: 0.2 },
      rotate: { start: 0, end: 360 },
      lifespan: 600,
      gravityY: 500,
      emitting: false,
    });
    this.shatterEmitter.setDepth(110);
  }

  private setupHUD(): void {
    // HUD background bar
    const bar = this.add.graphics();
    bar.fillStyle(0x0f172a, 0.85);
    bar.fillRoundedRect(16, 12, WORLD_W - 32, 50, 8);
    bar.setDepth(150);

    this.hudTextTitle = this.add.text(32, 24, this.level.name, {
      fontFamily: "system-ui, sans-serif",
      fontSize: "20px",
      color: "#f8fafc",
      fontStyle: "bold",
    }).setDepth(151);

    this.hudTextStats = this.add.text(
      WORLD_W - 32,
      26,
      `Attempt: ${this.deathTracker.getAttempt()}  •  Coins: 0 / ${this.level.coins.length}`,
      {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#fef08a",
      }
    ).setOrigin(1, 0).setDepth(151);

    // Controls hint text
    this.add.text(
      WORLD_W / 2,
      WORLD_H - 18,
      "[WASD / Arrows] Move  •  [W / Space / Up] Jump  •  [R] Respawn  •  [B] Toggle Entity IDs",
      {
        fontFamily: "system-ui, sans-serif",
        fontSize: "13px",
        color: "#64748b",
      }
    ).setOrigin(0.5).setDepth(151);
  }

  private updateHUD(): void {
    this.hudTextStats.setText(
      `Attempt: ${this.deathTracker.getAttempt()}  •  Coins: ${this.coinsCollected} / ${this.level.coins.length}`
    );
  }

  update() {
    if (!this.player || !this.player.body) return;

    // Enemy patrol logic
    for (const e of this.enemies) {
      const body = e.body as Phaser.Physics.Arcade.Body;
      const minX = e.getData("minX") as number;
      const maxX = e.getData("maxX") as number;
      const speed = e.getData("speed") as number;

      if (e.x <= minX || body.blocked.left) {
        body.setVelocityX(speed);
      } else if (e.x >= maxX || body.blocked.right) {
        body.setVelocityX(-speed);
      }

      this.idBadges.updatePosition(e.getData("id"), e.x, e.y - 22);
    }

    if (!this.isAlive) return;

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const onFloor = body.blocked.down || body.touching.down;

    // Detect landing squash
    if (this.wasInAir && onFloor) {
      this.tweens.add({
        targets: this.player,
        scaleX: 1.25,
        scaleY: 0.75,
        duration: 90,
        yoyo: true,
        ease: "Quad.easeOut",
      });
      if (this.dustEmitter) {
        this.dustEmitter.emitParticleAt(this.player.x, this.player.y + PLAYER_H / 2, 4);
      }
    }
    this.wasInAir = !onFloor;

    // Pit fall detection
    if (this.player.y > WORLD_H + 30) {
      this.handleDeath("fall");
      return;
    }

    // Horizontal movement
    const left = this.cursors.left.isDown || this.keys.A.isDown;
    const right = this.cursors.right.isDown || this.keys.D.isDown;
    body.setVelocityX((Number(right) - Number(left)) * RUN_SPEED);

    // Jump
    const jump = this.cursors.up.isDown || this.cursors.space.isDown || this.keys.W.isDown;
    if (jump && onFloor) {
      body.setVelocityY(-JUMP_VELOCITY);

      // Jump squash & stretch
      this.tweens.add({
        targets: this.player,
        scaleX: 0.75,
        scaleY: 1.25,
        duration: 110,
        yoyo: true,
        ease: "Quad.easeOut",
      });

      if (this.dustEmitter) {
        this.dustEmitter.emitParticleAt(this.player.x, this.player.y + PLAYER_H / 2, 6);
      }
    }
  }

  private collectCoin(coin: Phaser.GameObjects.Rectangle): void {
    if (!coin.active) return;
    coin.setActive(false);
    coin.setVisible(false);
    const body = coin.body as Phaser.Physics.Arcade.StaticBody;
    if (body) body.enable = false;

    if (this.sparkleEmitter) {
      this.sparkleEmitter.emitParticleAt(coin.x, coin.y, 14);
    }

    this.coinsCollected += 1;
    this.updateHUD();
  }

  private handleDeath(cause: DeathCause): void {
    if (!this.isAlive || this.isWon) return;
    this.isAlive = false;

    const deathX = this.player.x;
    const deathY = this.player.y;

    // Game feel: camera shake + flash
    this.cameras.main.shake(250, 0.02);
    this.cameras.main.flash(200, 214, 69, 61, false);

    // Death shatter explosion
    if (this.shatterEmitter) {
      this.shatterEmitter.emitParticleAt(deathX, deathY, 24);
    }

    // Hide player
    this.player.setVisible(false);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    body.enable = false;

    // Record death metrics and emit to team's shared event bridge
    const deathEvent = this.deathTracker.recordDeath(
      cause,
      deathX,
      deathY,
      this.coinsCollected
    );
    gameEvents.emit("death", deathEvent);

    this.updateHUD();

    // Auto-respawn after brief pause
    this.time.delayedCall(750, () => {
      this.respawnPlayer();
    });
  }

  private respawnPlayer(): void {
    if (this.isWon) return;

    this.player.setPosition(sx(this.level.start.x), sy(this.level.start.y));
    this.player.setVisible(true);
    this.player.setScale(1, 1);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.enable = true;
    body.setVelocity(0, 0);

    this.isAlive = true;
    this.wasInAir = false;

    // Pop-in animation
    this.tweens.add({
      targets: this.player,
      scaleX: [0.5, 1],
      scaleY: [1.3, 1],
      duration: 200,
      ease: "Back.easeOut",
    });
  }

  private handleWin(): void {
    if (!this.isAlive || this.isWon) return;
    this.isWon = true;

    // Stop player
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, -250);

    // Goal celebration particles
    if (this.sparkleEmitter) {
      this.sparkleEmitter.emitParticleAt(this.goal.x + this.goal.width / 2, this.goal.y, 35);
    }

    // Emit win event to team bridge
    gameEvents.emit("win");

    // Display Win Modal
    this.showWinModal();
  }

  private showWinModal(): void {
    if (this.winModalContainer) {
      this.winModalContainer.destroy();
    }

    this.winModalContainer = this.add.container(WORLD_W / 2, WORLD_H / 2);
    this.winModalContainer.setDepth(250);

    const bg = this.add.graphics();
    bg.fillStyle(0x0f172a, 0.94);
    bg.fillRoundedRect(-220, -140, 440, 280, 16);
    bg.lineStyle(3, 0x2fb457, 1);
    bg.strokeRoundedRect(-220, -140, 440, 280, 16);

    const title = this.add.text(0, -90, "VICTORY!", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "36px",
      color: "#4ade80",
      fontStyle: "bold",
    }).setOrigin(0.5);

    const sub = this.add.text(0, -35, `Level "${this.level.name}" Cleared!`, {
      fontFamily: "system-ui, sans-serif",
      fontSize: "18px",
      color: "#f8fafc",
    }).setOrigin(0.5);

    const stats = this.add.text(
      0,
      15,
      `Attempts: ${this.deathTracker.getAttempt()}   •   Coins: ${this.coinsCollected}/${this.level.coins.length}`,
      {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#cbd5e1",
      }
    ).setOrigin(0.5);

    // Play Again button
    const btnBg = this.add.graphics();
    btnBg.fillStyle(0x2fb457, 1);
    btnBg.fillRoundedRect(-90, 60, 180, 44, 8);

    const btnText = this.add.text(0, 82, "Play Again", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "16px",
      color: "#ffffff",
      fontStyle: "bold",
    }).setOrigin(0.5);

    btnBg.setInteractive(
      new Phaser.Geom.Rectangle(-90, 60, 180, 44),
      Phaser.Geom.Rectangle.Contains
    );
    btnBg.on("pointerdown", () => {
      this.scene.restart({ level: this.level });
    });

    this.winModalContainer.add([bg, title, sub, stats, btnBg, btnText]);

    this.winModalContainer.setScale(0.8);
    this.winModalContainer.setAlpha(0);
    this.tweens.add({
      targets: this.winModalContainer,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      duration: 250,
      ease: "Back.easeOut",
    });
  }

  private rectTopLeft(
    r: { id: string; x: number; y: number; w: number; h: number },
    color: number
  ) {
    const rect = this.add
      .rectangle(sx(r.x), sy(r.y), sx(r.w), sy(r.h), color)
      .setOrigin(0, 0);
    rect.setData("id", r.id);
    return rect;
  }
}
