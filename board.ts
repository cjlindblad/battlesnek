import { Battlesnake, Coord, GameState } from './types';

export const DIRECTIONS: { [direction: string]: Coord } = {
  up: { x: 0, y: 1 },
  down: { x: 0, y: -1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export function coordKey(coord: Coord): string {
  return `${coord.x},${coord.y}`;
}

export function isAdjacent(a: Coord, b: Coord): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

export function step(from: Coord, direction: string): Coord {
  const delta = DIRECTIONS[direction];
  return { x: from.x + delta.x, y: from.y + delta.y };
}

function isInBounds(coord: Coord, gameState: GameState): boolean {
  return coord.x >= 0 && coord.x < gameState.board.width &&
    coord.y >= 0 && coord.y < gameState.board.height;
}

// For every square covered by a snake, the number of turns until it is free.
// A square is safe to enter on turn t (1 = our next move) if this is <= t.
//
// Each move a snake drops its tail, so segment i (0 = head) of a snake of
// length L leaves after L - i turns. The tail therefore frees up after 1 turn,
// unless the snake just ate: its tail is stacked on the segment before it, and
// the max over both gives 2. Opponents next to food might eat this turn and
// grow, so all their segments are assumed to linger one turn longer.
export function turnsUntilFree(gameState: GameState): Map<string, number> {
  const freeAfter = new Map<string, number>();
  for (const snake of gameState.board.snakes) {
    const body = snake.body;
    const mightEat = snake.id !== gameState.you.id &&
      gameState.board.food.some(food => isAdjacent(food, snake.head));
    const growth = mightEat ? 1 : 0;
    body.forEach((segment, i) => {
      const key = coordKey(segment);
      const turns = body.length - i + growth;
      freeAfter.set(key, Math.max(freeAfter.get(key) ?? 0, turns));
    });
  }
  return freeAfter;
}

export interface OpponentMove {
  snake: Battlesnake;
  position: Coord;
}

// Every square an opponent could move its head into next turn: on the board
// and not into a body that will still be there.
export function possibleOpponentMoves(
  gameState: GameState,
  freeAfter: Map<string, number>,
): OpponentMove[] {
  const moves: OpponentMove[] = [];
  for (const snake of gameState.board.snakes) {
    if (snake.id === gameState.you.id) {
      continue;
    }
    for (const direction of Object.keys(DIRECTIONS)) {
      const position = step(snake.head, direction);
      if (isInBounds(position, gameState) && (freeAfter.get(coordKey(position)) ?? 0) <= 1) {
        moves.push({ snake, position });
      }
    }
  }
  return moves;
}

// `freeAfter` plus every square an opponent could move into next turn, treated
// as occupied from then on for as long as that snake's body will cover it.
// This is pessimistic, since each opponent only takes one of its options, but
// it keeps our paths and space estimates from relying on squares an opponent
// could take from us.
export function withOpponentMoves(
  gameState: GameState,
  freeAfter: Map<string, number>,
  opponentMoves: OpponentMove[],
): Map<string, number> {
  const predicted = new Map(freeAfter);
  const food = new Set(gameState.board.food.map(coordKey));
  for (const { snake, position } of opponentMoves) {
    const key = coordKey(position);
    const growth = food.has(key) ? 1 : 0;
    const turns = 1 + snake.body.length + growth;
    predicted.set(key, Math.max(predicted.get(key) ?? 0, turns));
  }
  return predicted;
}

interface Visit {
  position: Coord;
  distance: number;
  firstMove: string;
}

// Breadth-first walk from our head, yielding every reachable square in order
// of distance. Every step costs the same, so BFS gives shortest distances
// (Dijkstra would give the same result, just slower). Squares covered by
// snakes are only avoided while they are still occupied at the turn we would
// arrive. Only `firstMoves` are considered for the first step.
function* walk(
  gameState: GameState,
  firstMoves: string[],
  freeAfter: Map<string, number>,
): Generator<Visit> {
  const head = gameState.you.head;
  const visited = new Set<string>([coordKey(head)]);
  const queue: Visit[] = [];

  for (const direction of firstMoves) {
    const position = step(head, direction);
    visited.add(coordKey(position));
    queue.push({ position, distance: 1, firstMove: direction });
  }

  for (let i = 0; i < queue.length; i++) {
    const { position, distance, firstMove } = queue[i];
    yield queue[i];

    for (const direction of Object.keys(DIRECTIONS)) {
      const next = step(position, direction);
      const key = coordKey(next);
      if (visited.has(key) || !isInBounds(next, gameState)) {
        continue;
      }
      if ((freeAfter.get(key) ?? 0) > distance + 1) {
        continue;
      }
      visited.add(key);
      queue.push({ position: next, distance: distance + 1, firstMove });
    }
  }
}

export interface FoodPath {
  move: string;
  distance: number;
}

// The nearest reachable food; the first one the walk reaches is the closest.
export function findNearestFood(
  gameState: GameState,
  firstMoves: string[],
  freeAfter: Map<string, number>,
): FoodPath | null {
  const food = new Set(gameState.board.food.map(coordKey));
  for (const { position, distance, firstMove } of walk(gameState, firstMoves, freeAfter)) {
    if (food.has(coordKey(position))) {
      return { move: firstMove, distance };
    }
  }
  return null;
}

// Flood fill: how many squares we could reach after making `move`, counting
// squares that snakes (including our own tail) will have left by the time we
// get there. If this is less than our length we're heading into a dead end.
export function reachableSpace(
  gameState: GameState,
  move: string,
  freeAfter: Map<string, number>,
): number {
  let count = 0;
  for (const _ of walk(gameState, [move], freeAfter)) {
    count++;
  }
  return count;
}

export interface HeadStart {
  id: string;
  position: Coord;
  // How many moves from now the head is at `position`.
  distance: number;
}

// Territory: each square belongs to the snake whose head can reach it first,
// and squares reached by several snakes at the same time belong to no one.
// Like the walk above, squares covered by bodies can be entered once they will
// have been left. Returns the number of squares per snake id.
export function territory(
  gameState: GameState,
  starts: HeadStart[],
  freeAfter: Map<string, number>,
): Map<string, number> {
  const owner = new Map<string, string | null>();
  const reachedAt = new Map<string, number>();
  const queue = [...starts].sort((a, b) => a.distance - b.distance);
  for (const { id, position, distance } of queue) {
    owner.set(coordKey(position), id);
    reachedAt.set(coordKey(position), distance);
  }

  for (let i = 0; i < queue.length; i++) {
    const { position, distance } = queue[i];
    const id = owner.get(coordKey(position));
    if (!id) {
      continue; // Contested squares don't extend anyone's territory.
    }

    for (const direction of Object.keys(DIRECTIONS)) {
      const next = step(position, direction);
      const key = coordKey(next);
      const nextDistance = distance + 1;
      if (!isInBounds(next, gameState)) {
        continue;
      }
      const seenAt = reachedAt.get(key);
      if (seenAt !== undefined) {
        if (seenAt === nextDistance && owner.get(key) !== id) {
          owner.set(key, null);
        }
        continue;
      }
      if ((freeAfter.get(key) ?? 0) > nextDistance) {
        continue;
      }
      reachedAt.set(key, nextDistance);
      owner.set(key, id);
      queue.push({ id, position: next, distance: nextDistance });
    }
  }

  const counts = new Map<string, number>();
  for (const id of owner.values()) {
    if (id) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}
