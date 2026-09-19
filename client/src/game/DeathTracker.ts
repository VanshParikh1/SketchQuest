import type { DeathCause, DeathEvent } from "@sketchquest/shared";

interface DeathSpot {
  x: number;
  y: number;
  cause: DeathCause;
}

export class DeathTracker {
  private attempt: number = 1;
  private deathHistory: DeathSpot[] = [];
  private attemptStartTime: number = Date.now();
  private spotRadius: number = 80;

  constructor(spotRadius: number = 80) {
    this.spotRadius = spotRadius;
    this.resetAttemptTimer();
  }

  reset(): void {
    this.attempt = 1;
    this.deathHistory = [];
    this.resetAttemptTimer();
  }

  resetAttemptTimer(): void {
    this.attemptStartTime = Date.now();
  }

  getAttempt(): number {
    return this.attempt;
  }

  getTimeAliveSeconds(): number {
    const elapsedMs = Date.now() - this.attemptStartTime;
    return Math.max(0.1, Math.round((elapsedMs / 1000) * 10) / 10);
  }

  recordDeath(cause: DeathCause, x: number, y: number, coins: number): DeathEvent {
    // Count previous deaths within proximity radius
    const nearbyDeaths = this.deathHistory.filter((spot) => {
      const dx = spot.x - x;
      const dy = spot.y - y;
      return Math.sqrt(dx * dx + dy * dy) <= this.spotRadius;
    });

    const deathsAtSpot = nearbyDeaths.length + 1; // includes current death
    const timeAlive = this.getTimeAliveSeconds();

    this.deathHistory.push({ x, y, cause });

    const event: DeathEvent = {
      cause,
      x: Math.round(x),
      y: Math.round(y),
      attempt: this.attempt,
      deathsAtSpot,
      coins,
      timeAlive,
    };

    this.attempt += 1;
    this.resetAttemptTimer();

    return event;
  }
}
