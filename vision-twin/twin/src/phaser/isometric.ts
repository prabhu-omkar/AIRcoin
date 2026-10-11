export const TILE_WIDTH = 128;
export const TILE_HEIGHT = 64;
export const HALF_WIDTH = TILE_WIDTH / 2;
export const HALF_HEIGHT = TILE_HEIGHT / 2;
export const MAP_SIZE = 22;
// The scene tiles the 22x22 map three times in each direction, separated by a
// TILE_GAP-tile gutter so the joining edges read as distinct blocks. The grid
// therefore spans TILE_MIN..TILE_MAX centered on the original map.
export const TILE_GAP = 2;
export const TILE_STEP = MAP_SIZE + TILE_GAP;
export const TILE_MIN = -TILE_STEP;
export const TILE_MAX = TILE_STEP + MAP_SIZE - 1;
export const WORLD_ORIGIN_X = MAP_SIZE * HALF_WIDTH + 260;
export const WORLD_ORIGIN_Y = 170;
export const WORLD_MIN_X = WORLD_ORIGIN_X + (TILE_MIN - TILE_MAX) * HALF_WIDTH;
export const WORLD_MIN_Y = WORLD_ORIGIN_Y + (TILE_MIN + TILE_MIN) * HALF_HEIGHT;
export const WORLD_WIDTH = (TILE_MAX - TILE_MIN) * TILE_WIDTH + 520;
export const WORLD_HEIGHT = (TILE_MAX - TILE_MIN) * TILE_HEIGHT + 620;

export type GridPoint = { col: number; row: number };
export type WorldPoint = { x: number; y: number };

export function gridToWorld(col: number, row: number): WorldPoint {
  return {
    x: WORLD_ORIGIN_X + (col - row) * HALF_WIDTH,
    y: WORLD_ORIGIN_Y + (col + row) * HALF_HEIGHT,
  };
}

export function worldToGrid(x: number, y: number): GridPoint {
  const localX = x - WORLD_ORIGIN_X;
  const localY = y - WORLD_ORIGIN_Y;
  return {
    col: Math.round(((localX / HALF_WIDTH) + (localY / HALF_HEIGHT)) / 2),
    row: Math.round(((localY / HALF_HEIGHT) - (localX / HALF_WIDTH)) / 2),
  };
}

export function depthFor(col: number, row: number, offset = 0): number {
  return (col + row) * 100 + offset;
}

