import {
  coordKey,
  findNearestFood,
  possibleOpponentMoves,
  squareOwners,
  step,
  territory,
} from './board';
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

// While attacking, food at most this many moves away is grabbed on the way.
const GRAB_FOOD_DISTANCE = 2;

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
//
// Safety first: we only consider moves that leave us at least our own length
// in territory, so we can't be squeezed ourselves while attacking. Eating (when
// hungry, or grabbing food close by) is also limited to those moves.
const attack: Tactic = {
  name: 'attack',
  chooseMove(context) {
    const { gameState, candidateMoves, freeAfter, predictedFreeAfter } = context;
    const { you } = gameState;

    const opponentStarts = gameState.board.snakes
      .filter(snake => snake.id !== you.id)
      .map(snake => ({ id: snake.id, position: snake.head, distance: 0 }));
    const options = candidateMoves.map(move => {
      const counts = territory(gameState, [
        ...opponentStarts,
        { id: you.id, position: step(you.head, move), distance: 1 },
      ], freeAfter);
      return { move, counts, ours: counts.get(you.id) ?? 0 };
    });

    // If no move gives us enough room, take the one(s) giving the most.
    const roomy = options.filter(option => option.ours >= you.length);
    const mostRoom = Math.max(...options.map(option => option.ours));
    const safeOptions = roomy.length > 0 ? roomy : options.filter(option => option.ours === mostRoom);
    const safeMoves = safeOptions.map(option => option.move);

    if (you.health < HUNGRY_HEALTH) {
      const food = seekFood({ ...context, candidateMoves: safeMoves });
      if (food) {
        return food;
      }
    }

    // Food right next to us is worth a short detour from the attack.
    const nearbyFood = findNearestFood(gameState, safeMoves, predictedFreeAfter);
    if (nearbyFood && nearbyFood.distance <= GRAB_FOOD_DISTANCE) {
      return { move: nearbyFood.move, reason: `grabbing food ${nearbyFood.distance} away` };
    }

    const target = nearestOpponent(gameState);
    if (!target) {
      const move = safeMoves[Math.floor(Math.random() * safeMoves.length)];
      return { move, reason: 'no opponents, random' };
    }

    let best: { move: string; theirs: number; ours: number } | null = null;
    for (const { move, counts, ours } of safeOptions) {
      const theirs = counts.get(target.id) ?? 0;
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

// Hunt for a head-on collision when the opponent's head is at most this far.
const HUNT_DISTANCE = 4;

function headDistance(a: Battlesnake, b: Battlesnake): number {
  return Math.abs(a.head.x - b.head.x) + Math.abs(a.head.y - b.head.y);
}

// Of `moves`, the one leaving `target` the fewest squares of territory.
function mostConfining(context: TacticContext, moves: string[], target: Battlesnake): string {
  const { gameState, freeAfter } = context;
  const { you } = gameState;
  const theirTerritory = (move: string) => territory(gameState, [
    { id: target.id, position: target.head, distance: 0 },
    { id: you.id, position: step(you.head, move), distance: 1 },
  ], freeAfter).get(target.id) ?? 0;
  return moves
    .map(move => ({ move, theirs: theirTerritory(move) }))
    .sort((a, b) => a.theirs - b.theirs)[0].move;
}

// One opponent left and we're longer: a head-on collision kills it and wins the
// game. Both heads move every turn, so the distance between them stays even or
// odd forever; only at an even distance can they land on the same square
// (at distance 1 they'd swap places and hit each other's necks, killing both).
//
// At distance 2 we move onto a square the opponent could also move into, and
// further away we close in. Either way we pick the move that leaves it the
// least room to get away. If no move does that, the regular tactic decides.
function shouldHunt(gameState: GameState): boolean {
  const opponents = gameState.board.snakes.filter(snake => snake.id !== gameState.you.id);
  if (opponents.length !== 1) {
    return false;
  }
  const distance = headDistance(gameState.you, opponents[0]);
  return gameState.you.length > opponents[0].length &&
    distance % 2 === 0 && distance <= HUNT_DISTANCE;
}

const hunt: Tactic = {
  name: 'hunt',
  chooseMove(context) {
    const { gameState, candidateMoves, freeAfter } = context;
    const { you } = gameState;
    const target = gameState.board.snakes.find(snake => snake.id !== you.id)!;
    const distance = headDistance(you, target);

    const theirSquares = new Set(possibleOpponentMoves(gameState, freeAfter).map(({ position }) => coordKey(position)));
    const strikes = candidateMoves.filter(move => theirSquares.has(coordKey(step(you.head, move))));
    if (strikes.length > 0) {
      return { move: mostConfining(context, strikes, target), reason: `going head-on with ${target.name}` };
    }

    const closer = candidateMoves.filter(move => {
      const next = step(you.head, move);
      return Math.abs(next.x - target.head.x) + Math.abs(next.y - target.head.y) < distance;
    });
    if (closer.length > 0) {
      return { move: mostConfining(context, closer, target), reason: `closing in on ${target.name}, ${distance} away` };
    }

    return phaseTactic(gameState).chooseMove(context);
  },
};

function phaseTactic(gameState: GameState): Tactic {
  return gameState.you.length < GROW_UNTIL_LENGTH ? grow : attack;
}

export function selectTactic(gameState: GameState): Tactic {
  return shouldHunt(gameState) ? hunt : phaseTactic(gameState);
}
