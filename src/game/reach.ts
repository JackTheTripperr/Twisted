/**
 * Dev-only sanity check: is the goal (and the reboot core) reachable from the
 * start through the static walls alone, with the cursor's clearance?
 */
import { PLAY, type Course } from './courses';
import { distToSegment } from './maze';

export function checkReachable(course: Course, r: number): { goal: boolean; pickup: boolean | null } {
  const step = 4;
  const cols = Math.ceil(PLAY.w / step) + 1;
  const rows = Math.ceil(PLAY.h / step) + 1;
  const blocked = new Uint8Array(cols * rows);
  const clearance = r + 3;
  for (const s of course.walls) {
    const pad = s.ht + clearance;
    const x0 = Math.max(0, Math.floor((Math.min(s.x1, s.x2) - pad - PLAY.x) / step));
    const x1 = Math.min(cols - 1, Math.ceil((Math.max(s.x1, s.x2) + pad - PLAY.x) / step));
    const y0 = Math.max(0, Math.floor((Math.min(s.y1, s.y2) - pad - PLAY.y) / step));
    const y1 = Math.min(rows - 1, Math.ceil((Math.max(s.y1, s.y2) + pad - PLAY.y) / step));
    for (let j = y0; j <= y1; j++) {
      for (let i = x0; i <= x1; i++) {
        if (blocked[j * cols + i]) continue;
        if (distToSegment(PLAY.x + i * step, PLAY.y + j * step, s) < pad) blocked[j * cols + i] = 1;
      }
    }
  }
  const cell = (x: number, y: number) => {
    const i = Math.round((x - PLAY.x) / step);
    const j = Math.round((y - PLAY.y) / step);
    return j * cols + i;
  };
  const seen = new Uint8Array(cols * rows);
  const q: number[] = [cell(course.start.x, course.start.y)];
  seen[q[0]] = 1;
  let head = 0;
  while (head < q.length) {
    const c = q[head++];
    const i = c % cols;
    const j = (c / cols) | 0;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
      const n = nj * cols + ni;
      if (seen[n] || blocked[n]) continue;
      seen[n] = 1;
      q.push(n);
    }
  }
  const goal = !!seen[cell(course.goal.x, course.goal.y)];
  const pickup = course.pickup ? !!seen[cell(course.pickup.x, course.pickup.y)] : null;
  return { goal, pickup };
}
