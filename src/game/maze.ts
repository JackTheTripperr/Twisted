import { mulberry32, hashSeed, type Rng } from './rng';
import type { LevelDef } from './levels';
import type { LevelGeometry, Segment, Vec } from './types';

// wall bits per cell
const N = 1, E = 2, S = 4, W = 8;
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const BIT = [N, E, S, W];

export interface GridMaze {
  cols: number;
  rows: number;
  walls: Uint8Array;
}

/** Iterative recursive-backtracker with a tunable straightness bias. */
function carve(cols: number, rows: number, straightBias: number, rng: Rng): GridMaze {
  const total = cols * rows;
  const walls = new Uint8Array(total).fill(15);
  const visited = new Uint8Array(total);
  const stack: number[] = [];
  const lastDir: number[] = [];

  let cur = Math.floor(rng() * total);
  visited[cur] = 1;
  stack.push(cur);
  lastDir.push(-1);

  while (stack.length) {
    cur = stack[stack.length - 1];
    const prevDir = lastDir[lastDir.length - 1];
    const cx = cur % cols;
    const cy = (cur / cols) | 0;
    const opts: number[] = [];
    for (let d = 0; d < 4; d++) {
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      if (!visited[ny * cols + nx]) opts.push(d);
    }
    if (!opts.length) {
      stack.pop();
      lastDir.pop();
      continue;
    }
    let d: number;
    if (prevDir >= 0 && opts.includes(prevDir) && rng() < straightBias) d = prevDir;
    else d = opts[(rng() * opts.length) | 0];
    const nx = cx + DX[d];
    const ny = cy + DY[d];
    const n = ny * cols + nx;
    walls[cur] &= ~BIT[d];
    walls[n] &= ~BIT[(d + 2) % 4];
    visited[n] = 1;
    stack.push(n);
    lastDir.push(d);
  }
  return { cols, rows, walls };
}

/** BFS distances + parents from a start cell. */
function bfs(m: GridMaze, start: number): { dist: Int32Array; parent: Int32Array } {
  const total = m.cols * m.rows;
  const dist = new Int32Array(total).fill(-1);
  const parent = new Int32Array(total).fill(-1);
  const q: number[] = [start];
  dist[start] = 0;
  let head = 0;
  while (head < q.length) {
    const c = q[head++];
    const cx = c % m.cols;
    const cy = (c / m.cols) | 0;
    for (let d = 0; d < 4; d++) {
      if (m.walls[c] & BIT[d]) continue;
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      const n = ny * m.cols + nx;
      if (dist[n] >= 0) continue;
      dist[n] = dist[c] + 1;
      parent[n] = c;
      q.push(n);
    }
  }
  return { dist, parent };
}

function pathTo(parent: Int32Array, end: number): number[] {
  const path: number[] = [];
  let c = end;
  while (c >= 0) {
    path.push(c);
    c = parent[c];
  }
  return path.reverse();
}

function countTurns(path: number[], cols: number): number {
  let turns = 0;
  let prev = -1;
  for (let i = 1; i < path.length; i++) {
    const dx = (path[i] % cols) - (path[i - 1] % cols);
    const dy = ((path[i] / cols) | 0) - ((path[i - 1] / cols) | 0);
    const dir = dx === 1 ? 1 : dx === -1 ? 3 : dy === 1 ? 2 : 0;
    if (prev >= 0 && dir !== prev) turns++;
    prev = dir;
  }
  return turns;
}

interface Candidate {
  maze: GridMaze;
  start: number;
  end: number;
  path: number[];
  score: number;
}

/** Generate several mazes and keep the one whose left→right solution is the longest and twistiest. */
function bestMaze(def: LevelDef, seed: number, tries: number): Candidate {
  let best: Candidate | null = null;
  for (let t = 0; t < tries; t++) {
    const rng = mulberry32(hashSeed(seed, t, def.level));
    const maze = carve(def.cols, def.rows, def.straightBias, rng);
    const start = Math.floor(rng() * def.rows) * def.cols; // left column
    const { dist, parent } = bfs(maze, start);
    let end = -1;
    let bestD = -1;
    for (let y = 0; y < def.rows; y++) {
      const c = y * def.cols + (def.cols - 1);
      if (dist[c] > bestD) {
        bestD = dist[c];
        end = c;
      }
    }
    const path = pathTo(parent, end);
    const score = path.length + countTurns(path, def.cols) * 1.5;
    if (!best || score > best.score) best = { maze, start, end, path, score };
  }
  return best!;
}

export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function buildGeometry(def: LevelDef, seed: number, area: Area): LevelGeometry {
  const cand = bestMaze(def, seed, 14);
  const m = cand.maze;
  const cell = Math.floor(Math.min(area.w / def.cols, area.h / def.rows));
  const w = cell * def.cols;
  const h = cell * def.rows;
  const ox = Math.round(area.x + (area.w - w) / 2);
  const oy = Math.round(area.y + (area.h - h) / 2);
  const ht = def.wallT / 2;
  const segs: Segment[] = [];

  // Horizontal wall lines (y = 0..rows). Use N walls of row y, S walls for the bottom edge.
  for (let y = 0; y <= def.rows; y++) {
    let runStart = -1;
    for (let x = 0; x <= def.cols; x++) {
      let has = false;
      if (x < def.cols) {
        if (y < def.rows) has = (m.walls[y * def.cols + x] & N) !== 0;
        else has = (m.walls[(y - 1) * def.cols + x] & S) !== 0;
      }
      if (has && runStart < 0) runStart = x;
      if (!has && runStart >= 0) {
        segs.push({ x1: ox + runStart * cell, y1: oy + y * cell, x2: ox + x * cell, y2: oy + y * cell, ht });
        runStart = -1;
      }
    }
  }
  // Vertical wall lines (x = 0..cols). Use W walls of column x, E walls for the right edge.
  for (let x = 0; x <= def.cols; x++) {
    let runStart = -1;
    for (let y = 0; y <= def.rows; y++) {
      let has = false;
      if (y < def.rows) {
        if (x < def.cols) has = (m.walls[y * def.cols + x] & W) !== 0;
        else has = (m.walls[y * def.cols + (x - 1)] & E) !== 0;
      }
      if (has && runStart < 0) runStart = y;
      if (!has && runStart >= 0) {
        segs.push({ x1: ox + x * cell, y1: oy + runStart * cell, x2: ox + x * cell, y2: oy + y * cell, ht });
        runStart = -1;
      }
    }
  }

  const centre = (c: number): Vec => ({
    x: ox + (c % def.cols) * cell + cell / 2,
    y: oy + ((c / def.cols) | 0) * cell + cell / 2,
  });
  const solution = cand.path.map(centre);

  // Chokepoints: pairs of "teeth" that pinch a passage on the solution path.
  if (def.chokepoints > 0 && cand.path.length > 6) {
    const usable = cand.path.length - 4;
    const opening = def.cursorR * 2 + 11; // guaranteed clearance
    const toothLen = Math.min(cell * 0.28, Math.max(0, (cell - def.wallT - opening) / 2));
    if (toothLen > 2) {
      for (let k = 0; k < def.chokepoints; k++) {
        const idx = 2 + Math.floor(((k + 0.5) / def.chokepoints) * usable);
        const a = cand.path[idx];
        const b = cand.path[idx + 1];
        const ax = a % def.cols, ay = (a / def.cols) | 0;
        const bx = b % def.cols, by = (b / def.cols) | 0;
        if (ay === by) {
          // horizontal passage: vertical boundary line between the cells
          const xl = ox + Math.max(ax, bx) * cell;
          const top = oy + ay * cell;
          const bottom = top + cell;
          segs.push({ x1: xl, y1: top, x2: xl, y2: top + toothLen, ht, tooth: true });
          segs.push({ x1: xl, y1: bottom - toothLen, x2: xl, y2: bottom, ht, tooth: true });
        } else {
          const yl = oy + Math.max(ay, by) * cell;
          const left = ox + ax * cell;
          const right = left + cell;
          segs.push({ x1: left, y1: yl, x2: left + toothLen, y2: yl, ht, tooth: true });
          segs.push({ x1: right - toothLen, y1: yl, x2: right, y2: yl, ht, tooth: true });
        }
      }
    }
  }

  return {
    cols: def.cols,
    rows: def.rows,
    cell,
    ox,
    oy,
    w,
    h,
    segs,
    start: centre(cand.start),
    exit: centre(cand.end),
    exitR: Math.max(10, Math.min(cell * 0.3, 34)),
    solution,
  };
}

/** Distance from point to capsule segment axis. */
export function distToSegment(px: number, py: number, s: Segment): number {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 0) t = Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / len2));
  const cx = s.x1 + t * dx;
  const cy = s.y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

export function collides(px: number, py: number, r: number, segs: Segment[]): Segment | null {
  for (const s of segs) {
    if (distToSegment(px, py, s) < s.ht + r) return s;
  }
  return null;
}

export function nearestWall(px: number, py: number, segs: Segment[]): { seg: Segment | null; dist: number } {
  let best: Segment | null = null;
  let bd = Infinity;
  for (const s of segs) {
    const d = distToSegment(px, py, s) - s.ht;
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return { seg: best, dist: bd };
}
