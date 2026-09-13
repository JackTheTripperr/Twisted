/**
 * Mouse input. Prefers the Pointer Lock API so we get raw movement deltas
 * (the real cursor is hidden and cannot escape the window). Falls back to
 * clientX/Y deltas when pointer lock is unavailable.
 */
export class Input {
  private dx = 0;
  private dy = 0;
  locked = false;
  fallback = false;
  readonly supported: boolean;
  onLockChange: ((locked: boolean) => void) | null = null;
  private lastX: number | null = null;
  private lastY: number | null = null;
  private el: HTMLElement;
  private lockRequestedAt = 0;

  constructor(el: HTMLElement) {
    this.el = el;
    this.supported = 'requestPointerLock' in el;
    document.addEventListener('mousemove', this.onMove);
    document.addEventListener('pointerlockchange', this.onLockChangeEvt);
    document.addEventListener('pointerlockerror', this.onLockError);
  }

  destroy() {
    document.removeEventListener('mousemove', this.onMove);
    document.removeEventListener('pointerlockchange', this.onLockChangeEvt);
    document.removeEventListener('pointerlockerror', this.onLockError);
  }

  private onMove = (e: MouseEvent) => {
    if (this.locked) {
      let mx = e.movementX;
      let my = e.movementY;
      // ignore the occasional giant jump the browser reports right after locking
      if (Math.abs(mx) > 260 || Math.abs(my) > 260) return;
      this.dx += mx;
      this.dy += my;
    } else {
      if (this.lastX !== null && this.lastY !== null) {
        this.dx += e.clientX - this.lastX;
        this.dy += e.clientY - this.lastY;
      }
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    }
  };

  private onLockChangeEvt = () => {
    const locked = document.pointerLockElement === this.el;
    this.locked = locked;
    if (locked) {
      this.everLocked = true;
      this.fallback = false;
    }
    this.dx = 0;
    this.dy = 0;
    this.lastX = null;
    this.lastY = null;
    this.onLockChange?.(locked);
  };

  private onLockError = () => {
    this.locked = false;
    // Only give up on pointer lock if it has never worked in this session;
    // a transient error (e.g. re-locking too soon after Esc) is retried on click.
    if (!this.everLocked) this.fallback = true;
    this.onLockChange?.(false);
  };

  private everLocked = false;

  async requestLock(): Promise<boolean> {
    if (!this.supported) {
      this.fallback = true;
      return false;
    }
    if (this.locked) return true;
    this.lockRequestedAt = performance.now();
    // Never let a browser that silently ignores the request stall the game.
    const timeout = new Promise<boolean>((r) => setTimeout(() => r(this.locked), 900));
    const result = await Promise.race([this.requestLockInner(), timeout]);
    if (!this.locked && !this.everLocked) this.fallback = true;
    return result;
  }

  private async requestLockInner(): Promise<boolean> {
    try {
      const el = this.el as HTMLElement & {
        requestPointerLock(options?: { unadjustedMovement?: boolean }): Promise<void> | void;
      };
      let p: Promise<void> | void;
      try {
        p = el.requestPointerLock({ unadjustedMovement: true });
      } catch {
        p = el.requestPointerLock();
      }
      if (p && typeof (p as Promise<void>).then === 'function') {
        await (p as Promise<void>).catch(async () => {
          await el.requestPointerLock();
        });
      }
      // wait briefly for the change event
      await new Promise((r) => setTimeout(r, 60));
      if (!this.locked) {
        // Some browsers silently refuse; treat as fallback after a short grace.
        await new Promise((r) => setTimeout(r, 240));
      }
      if (!this.locked && !this.everLocked) this.fallback = true;
      return this.locked;
    } catch {
      if (!this.everLocked) this.fallback = true;
      return false;
    }
  }

  releaseLock() {
    if (document.pointerLockElement === this.el) document.exitPointerLock();
  }

  /** Read and clear accumulated deltas (CSS pixels). */
  consume(): { dx: number; dy: number } {
    const r = { dx: this.dx, dy: this.dy };
    this.dx = 0;
    this.dy = 0;
    return r;
  }

  clear() {
    this.dx = 0;
    this.dy = 0;
  }

  get sinceLockRequest() {
    return performance.now() - this.lockRequestedAt;
  }
}
