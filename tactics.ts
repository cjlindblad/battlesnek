import { findNearestFood } from './board';
import { GameState } from './types';

// Everything a tactic needs to pick a move. `candidateMoves` have already been
// filtered for safety, so a tactic only decides between them.
export interface TacticContext {
  gameState: GameState;
  candidateMoves: string[];
  freeAfter: Map<string, number>;
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

// We focus on food until we are this long.
const GROW_UNTIL_LENGTH = 16;

function seekFood({ gameState, candidateMoves, freeAfter }: TacticContext): TacticDecision | null {
  const foodPath = findNearestFood(gameState, candidateMoves, freeAfter);
  return foodPath ? { move: foodPath.move, reason: `food ${foodPath.distance} away` } : null;
}

// Early game: eat as much as possible to get long.
const grow: Tactic = {
  name: 'grow',
  chooseMove: seekFood,
};

// Long enough: stop chasing food unless we're getting hungry.
const cruise: Tactic = {
  name: 'cruise',
  chooseMove(context) {
    if (context.gameState.you.health < HUNGRY_HEALTH) {
      return seekFood(context);
    }
    return null;
  },
};

export function selectTactic(gameState: GameState): Tactic {
  if (gameState.you.length < GROW_UNTIL_LENGTH) {
    return grow;
  }
  return cruise;
}
