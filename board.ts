import { Coord, GameState } from './types';

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

export interface FoodPath {
  move: string;
  distance: number;
}

// Breadth-first search from our head to the nearest reachable food. Every step
// costs the same, so BFS finds shortest paths (Dijkstra would give the same
// result, just slower), and the first food dequeued is the closest one.
// Squares blocked by snakes are only avoided while they are still occupied at
// the turn we would arrive. Only `firstMoves` are considered for the first step.
export function findNearestFood(
  gameState: GameState,
  firstMoves: string[],
  freeAfter: Map<string, number>,
): FoodPath | null {
  const food = new Set(gameState.board.food.map(coordKey));
  const head = gameState.you.head;
  const visited = new Set<string>([coordKey(head)]);
  const queue: { position: Coord; distance: number; firstMove: string }[] = [];

  for (const direction of firstMoves) {
    const position = step(head, direction);
    visited.add(coordKey(position));
    queue.push({ position, distance: 1, firstMove: direction });
  }

  for (let i = 0; i < queue.length; i++) {
    const { position, distance, firstMove } = queue[i];
    if (food.has(coordKey(position))) {
      return { move: firstMove, distance };
    }

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

  return null;
}
