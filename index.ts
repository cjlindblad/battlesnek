// Welcome to
// __________         __    __  .__                               __
// \______   \_____ _/  |__/  |_|  |   ____   ______ ____ _____  |  | __ ____
//  |    |  _/\__  \\   __\   __\  | _/ __ \ /  ___//    \\__  \ |  |/ // __ \
//  |    |   \ / __ \|  |  |  | |  |_\  ___/ \___ \|   |  \/ __ \|    <\  ___/
//  |________/(______/__|  |__| |____/\_____>______>___|__(______/__|__\\_____>
//
// This file can be a nice home for your Battlesnake logic and helper functions.
//
// To get you started we've included code to prevent your Battlesnake from moving backwards.
// For more info see docs.battlesnake.com

import runServer from './server';
import { GameState, InfoResponse, MoveResponse } from './types';
import {
  coordKey,
  possibleOpponentMoves,
  reachableSpace,
  step,
  turnsUntilFree,
  withOpponentMoves,
} from './board';
import { selectTactic } from './tactics';

// info is called when you create your Battlesnake on play.battlesnake.com
// and controls your Battlesnake's appearance
// TIP: If you open your Battlesnake URL in a browser you should see this data
function info(): InfoResponse {
  console.log("INFO");

  return {
    apiversion: "1",
    author: "Tomas otroliga battlesnake",       // TODO: Your Battlesnake Username
    color: "#ff5555", // TODO: Choose color
    head: "smile",  // TODO: Choose head
    tail: "bolt",  // TODO: Choose tail
  };
}

// start is called when your Battlesnake begins a game
function start(gameState: GameState): void {
  console.log("GAME START");
}

// end is called when your Battlesnake finishes a game
function end(gameState: GameState): void {
  console.log("GAME OVER\n");
}

// move is called on every turn and returns your next move
// Valid moves are "up", "down", "left", or "right"
// See https://docs.battlesnake.com/api/example-move for available data
function move(gameState: GameState): MoveResponse {

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
    console.log(`MOVE ${gameState.turn}: No safe moves detected! Moving down`);
    return { move: "down" };
  }

  // Plan beyond this move as if opponents could be in any square they can
  // reach next turn, so we don't count on space or paths they can cut off.
  const opponentMoves = possibleOpponentMoves(gameState, freeAfter);
  const predictedFreeAfter = withOpponentMoves(gameState, freeAfter, opponentMoves);

  // Avoid dead ends: moves that leave us less room than our own length. If every
  // move is a dead end, take the one(s) with the most room and hope it opens up.
  const space: { [direction: string]: number } = {};
  for (const direction of safeMoves) {
    space[direction] = reachableSpace(gameState, direction, predictedFreeAfter);
  }
  const roomyMoves = safeMoves.filter(direction => space[direction] >= gameState.you.length);
  const mostSpace = Math.max(...safeMoves.map(direction => space[direction]));
  const openMoves = roomyMoves.length > 0
    ? roomyMoves
    : safeMoves.filter(direction => space[direction] === mostSpace);

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
  const decision = tactic.chooseMove({ gameState, candidateMoves, freeAfter: predictedFreeAfter });
  const nextMove = decision
    ? decision.move
    : candidateMoves[Math.floor(Math.random() * candidateMoves.length)];

  const reason = decision ? decision.reason : 'random';
  console.log(`MOVE ${gameState.turn}: ${nextMove} [${tactic.name}] (${reason})`)
  return { move: nextMove };
}

runServer({
  info: info,
  start: start,
  move: move,
  end: end
});
