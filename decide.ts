import {
  coordKey,
  possibleOpponentMoves,
  reachableSquares,
  step,
  turnsUntilFree,
  withOpponentMoves,
} from './board';
import { selectTactic } from './tactics';
import { GameState } from './types';

export interface Decision {
  move: string;
  // The moves that passed the safety checks, which the tactic chose between.
  candidateMoves: string[];
  tactic: string;
  reason: string;
}

// Our one-turn decision logic, from the point of view of `gameState.you`. It
// has no side effects, so the lookahead can also use it to predict opponents
// by passing their snake as `you`.
export function decideMove(gameState: GameState): Decision {

  let isMoveSafe: { [key: string]: boolean; } = {
    up: true,
    down: true,
    left: true,
    right: true
  };

  // We've included code to prevent your Battlesnake from moving backwards
  const myHead = gameState.you.body[0];
  const myNeck = gameState.you.body[1];

  if (myNeck.x < myHead.x) {        // Neck is left of head, don't move left
    isMoveSafe.left = false;

  } else if (myNeck.x > myHead.x) { // Neck is right of head, don't move right
    isMoveSafe.right = false;

  } else if (myNeck.y < myHead.y) { // Neck is below head, don't move down
    isMoveSafe.down = false;

  } else if (myNeck.y > myHead.y) { // Neck is above head, don't move up
    isMoveSafe.up = false;
  }

  // Prevent moving out of bounds. (0,0) is the bottom-left corner.
  const boardWidth = gameState.board.width;
  const boardHeight = gameState.board.height;

  if (myHead.x === 0) {
    isMoveSafe.left = false;
  }
  if (myHead.x === boardWidth - 1) {
    isMoveSafe.right = false;
  }
  if (myHead.y === 0) {
    isMoveSafe.down = false;
  }
  if (myHead.y === boardHeight - 1) {
    isMoveSafe.up = false;
  }

  // Prevent colliding with any snake body, including our own.
  // board.snakes includes us, so this covers both self and opponents.
  const freeAfter = turnsUntilFree(gameState);
  for (const direction of Object.keys(isMoveSafe)) {
    if ((freeAfter.get(coordKey(step(myHead, direction))) ?? 0) > 1) {
      isMoveSafe[direction] = false;
    }
  }

  // Are there any safe moves left?
  const safeMoves = Object.keys(isMoveSafe).filter(key => isMoveSafe[key]);
  if (safeMoves.length == 0) {
    return { move: "down", candidateMoves: [], tactic: 'none', reason: 'no safe moves' };
  }

  // Plan beyond this move as if opponents could be in any square they can
  // reach next turn, so we don't count on space or paths they can cut off.
  const opponentMoves = possibleOpponentMoves(gameState, freeAfter);
  const predictedFreeAfter = withOpponentMoves(gameState, freeAfter, opponentMoves);

  // Our moves can lead into separate areas, e.g. on either side of a gap
  // between bodies. Always go into the largest one, which also keeps us out of
  // dead ends. Two moves share an area if each can reach the other's first
  // square; one-way reachability isn't enough, since a big area can often
  // reach a small one only after our body has moved out of the way.
  const reachable = new Map(safeMoves.map(direction =>
    [direction, reachableSquares(gameState, direction, predictedFreeAfter)]));
  const largest = safeMoves.reduce((best, direction) =>
    reachable.get(direction)!.size > reachable.get(best)!.size ? direction : best);
  const sameArea = (a: string, b: string) =>
    reachable.get(a)!.has(coordKey(step(myHead, b))) && reachable.get(b)!.has(coordKey(step(myHead, a)));
  const openMoves = safeMoves.filter(direction => direction === largest || sameArea(direction, largest));

  // Avoid squares an opponent of equal or greater length could also move into,
  // since we'd lose (or tie) a head-to-head collision. Only a preference, as
  // being boxed in is worse than risking it.
  // Smaller opponents lose a head-to-head, so their squares are fine.
  const contestedSquares = new Set(opponentMoves
    .filter(({ snake }) => snake.length >= gameState.you.length)
    .map(({ position }) => coordKey(position)));
  const preferredMoves = openMoves.filter(direction =>
    !contestedSquares.has(coordKey(step(myHead, direction))));
  const candidateMoves = preferredMoves.length > 0 ? preferredMoves : openMoves;

  // Let the current tactic pick among the candidate moves, or move randomly
  // if it has no preference.
  const tactic = selectTactic(gameState);
  const decision = tactic.chooseMove({ gameState, candidateMoves, freeAfter, predictedFreeAfter });
  const nextMove = decision
    ? decision.move
    : candidateMoves[Math.floor(Math.random() * candidateMoves.length)];

  return {
    move: nextMove,
    candidateMoves,
    tactic: tactic.name,
    reason: decision ? decision.reason : 'random',
  };
}
