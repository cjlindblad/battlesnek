import { coordKey, findNearestFood, squareOwners, step, territory } from './board';
import { Battlesnake, GameState } from './types';

// Everything a tactic needs to pick a move. `candidateMoves` have already been
// filtered for safety, so a tactic only decides between them.
export interface TacticContext {
  gameState: GameState;
  candidateMoves: string[];
  // Turns until each snake-covered square is free, from where snakes are now.
  freeAfter: Map<string, number>;
  // Same, but also blocking every square an opponent could move into next
  // turn. Use this for planning our own paths.
  predictedFreeAfter: Map<string, number>;
}

export interface TacticDecision {
  move: string;
  reason: string;
}

export interface Tactic {
  name: string;
  // Returns null when the tactic has no preference; the caller then picks
  // a random candidate move.
  chooseMove(context: TacticContext): TacticDecision | null;
}

// Below this health we go for food even when we don't need to grow.
const HUNGRY_HEALTH = 30;

// We focus on food until we are this long, then go on the attack.
const GROW_UNTIL_LENGTH = 16;

// Go for the nearest food we can reach before any opponent. Only if there is
// none do we race opponents for food they could get to first (or at the same
// time).
function seekFood({ gameState, candidateMoves, freeAfter, predictedFreeAfter }: TacticContext): TacticDecision | null {
  const owners = squareOwners(
    gameState,
    gameState.board.snakes.map(snake => ({ id: snake.id, position: snake.head, distance: 0 })),
    freeAfter,
  );
  const ourFood = gameState.board.food.filter(food => owners.get(coordKey(food)) === gameState.you.id);
  const uncontested = findNearestFood(gameState, candidateMoves, predictedFreeAfter, ourFood);
  if (uncontested) {
    return { move: uncontested.move, reason: `food ${uncontested.distance} away, uncontested` };
  }

  const contested = findNearestFood(gameState, candidateMoves, predictedFreeAfter);
  return contested && { move: contested.move, reason: `food ${contested.distance} away, contested` };
}

// Early game: eat as much as possible to get long.
const grow: Tactic = {
  name: 'grow',
  chooseMove: seekFood,
};

function nearestOpponent(gameState: GameState): Battlesnake | null {
  const { head, id } = gameState.you;
  const distanceTo = (snake: Battlesnake) =>
    Math.abs(snake.head.x - head.x) + Math.abs(snake.head.y - head.y);
  const opponents = gameState.board.snakes.filter(snake => snake.id !== id);
  opponents.sort((a, b) => distanceTo(a) - distanceTo(b));
  return opponents[0] ?? null;
}

// Long enough: box in the nearest opponent. For each move we work out who
// reaches each square first, and pick the move that leaves the opponent the
// fewest squares, preferring more squares for us on a tie. Moving to cut off
// the opponent turns squares it could have reached into ours.
// We still eat when hungry, since starving would end the game.
const attack: Tactic = {
  name: 'attack',
  chooseMove(context) {
    const { gameState, candidateMoves, freeAfter } = context;
    const { you } = gameState;
    if (you.health < HUNGRY_HEALTH) {
      const food = seekFood(context);
      if (food) {
        return food;
      }
    }

    const target = nearestOpponent(gameState);
    if (!target) {
      return null;
    }

    const opponentStarts = gameState.board.snakes
      .filter(snake => snake.id !== you.id)
      .map(snake => ({ id: snake.id, position: snake.head, distance: 0 }));

    let best: { move: string; theirs: number; ours: number } | null = null;
    for (const move of candidateMoves) {
      const counts = territory(gameState, [
        ...opponentStarts,
        { id: you.id, position: step(you.head, move), distance: 1 },
      ], freeAfter);
      const theirs = counts.get(target.id) ?? 0;
      const ours = counts.get(you.id) ?? 0;
      if (!best || theirs < best.theirs || (theirs === best.theirs && ours > best.ours)) {
        best = { move, theirs, ours };
      }
    }

    return best && {
      move: best.move,
      reason: `${target.name} gets ${best.theirs} squares, we get ${best.ours}`,
    };
  },
};

export function selectTactic(gameState: GameState): Tactic {
  if (gameState.you.length < GROW_UNTIL_LENGTH) {
    return grow;
  }
  return attack;
}
