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
import { decideMove } from './decide';
import { LOOKAHEAD_TURNS, compareOutcomes, lookahead } from './simulate';

// Share of the game's move timeout we spend simulating; the rest is left for
// network latency.
const LOOKAHEAD_BUDGET = 0.4;

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
  const decision = decideMove(gameState);
  let nextMove = decision.move;
  let summary = '';

  // Check the tactic's choice by simulating the next turns for every snake.
  // Only overrule it if another move survives more often.
  if (decision.candidateMoves.length > 1) {
    const budgetMs = (gameState.game.timeout ?? 500) * LOOKAHEAD_BUDGET;
    const outcomes = lookahead(gameState, decision.candidateMoves, budgetMs).sort(compareOutcomes);
    const chosen = outcomes.find(outcome => outcome.move === decision.move)!;
    if (chosen.survivalRate < outcomes[0].survivalRate) {
      nextMove = outcomes[0].move;
    }
    const rates = outcomes.map(outcome => `${outcome.move} ${Math.round(outcome.survivalRate * 100)}%`);
    summary = ` | survives ${LOOKAHEAD_TURNS} turns: ${rates.join(', ')} (${outcomes[0].rollouts} runs/move)`;
    if (nextMove !== decision.move) {
      summary += `, overruling ${decision.move}`;
    }
  }

  console.log(`MOVE ${gameState.turn}: ${nextMove} [${decision.tactic}] (${decision.reason})${summary}`)
  return { move: nextMove };
}

runServer({
  info: info,
  start: start,
  move: move,
  end: end
});
