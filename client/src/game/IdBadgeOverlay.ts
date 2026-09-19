import Phaser from "phaser";

interface BadgeItem {
  id: string;
  container: Phaser.GameObjects.Container;
}

export class IdBadgeOverlay {
  private scene: Phaser.Scene;
  private badges: BadgeItem[] = [];
  private visible: boolean = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  clear(): void {
    this.badges.forEach((b) => b.container.destroy());
    this.badges = [];
  }

  addBadge(id: string, x: number, y: number, bgColor: number = 0x1e293b): void {
    const container = this.scene.add.container(x, y);
    container.setDepth(200);

    const text = this.scene.add
      .text(0, 0, id, {
        fontSize: "12px",
        fontFamily: "monospace",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    const pad = 6;
    const w = Math.max(text.width + pad * 2, 24);
    const h = 18;

    const bg = this.scene.add.graphics();
    bg.fillStyle(bgColor, 0.85);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 4);
    bg.lineStyle(1.5, 0xffffff, 0.9);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 4);

    container.add([bg, text]);
    container.setVisible(this.visible);

    this.badges.push({ id, container });
  }

  updatePosition(id: string, x: number, y: number): void {
    const b = this.badges.find((item) => item.id === id);
    if (b) {
      b.container.setPosition(x, y);
    }
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.badges.forEach((b) => b.container.setVisible(visible));
  }

  toggle(): boolean {
    this.setVisible(!this.visible);
    return this.visible;
  }

  isVisible(): boolean {
    return this.visible;
  }
}
