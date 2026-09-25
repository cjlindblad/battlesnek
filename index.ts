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
import { coordKey, findNearestFood, isAdjacent, step, turnsUntilFree } from './board';

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

  // Avoid squares an opponent of equal or greater length could also move into,
  // since we'd lose (or tie) a head-to-head collision. Only a preference, as
  // being boxed in is worse than risking it.
  const dangerousHeads = gameState.board.snakes
    .filter(snake => snake.id !== gameState.you.id && snake.length >= gameState.you.length)
    .map(snake => snake.head);
  const preferredMoves = safeMoves.filter(direction =>
    !dangerousHeads.some(head => isAdjacent(head, step(myHead, direction))));
  const candidateMoves = preferredMoves.length > 0 ? preferredMoves : safeMoves;

  // Head towards the nearest reachable food, or move randomly if there is none.
  const foodPath = findNearestFood(gameState, candidateMoves, freeAfter);
  const nextMove = foodPath
    ? foodPath.move
    : candidateMoves[Math.floor(Math.random() * candidateMoves.length)];

  const reason = foodPath ? `food ${foodPath.distance} away` : 'no reachable food';
  console.log(`MOVE ${gameState.turn}: ${nextMove} (${reason})`)
  return { move: nextMove };
}

runServer({
  info: info,
  start: start,
  move: move,
  end: end
});
