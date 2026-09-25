import { coordKey, step } from './board';
import { decideMove } from './decide';
import { Battlesnake, GameState } from './types';

// How many turns ahead the lookahead simulates, including our first move.
export const LOOKAHEAD_TURNS = 5;

// Upper limit on simulated games per candidate move; the time budget usually
// decides first.
const MAX_ROLLOUTS_PER_MOVE = 10;

// Advances the game one turn following the standard rules: every snake moves at
// the same time and loses 1 health, eats if its head lands on food (back to
// full health, grows by one), and is eliminated by leaving the board, starving,
// hitting a body, or losing a head-on collision (the shorter snake dies, both
// on equal length). No new food is spawned, since we can't predict where.
export function applyMoves(gameState: GameState, moves: Map<string, string>): GameState {
  const { width, height } = gameState.board;

  const moved: Battlesnake[] = gameState.board.snakes.map(snake => {
    const head = step(snake.head, moves.get(snake.id) ?? 'up');
    return { ...snake, head, body: [head, ...snake.body.slice(0, -1)], health: snake.health - 1 };
  });

  const eaten = new Set<string>();
  const food = new Set(gameState.board.food.map(coordKey));
  for (const snake of moved) {
    if (food.has(coordKey(snake.head))) {
      eaten.add(coordKey(snake.head));
      snake.health = 100;
      snake.body.push(snake.body[snake.body.length - 1]);
    }
    snake.length = snake.body.length;
  }

  // Everything except heads, including snakes eliminated this turn.
  const bodies = new Set(moved.flatMap(snake => snake.body.slice(1).map(coordKey)));
  const survivors = moved.filter(snake => {
    const { head } = snake;
    if (head.x < 0 || head.x >= width || head.y < 0 || head.y >= height) {
      return false;
    }
    if (snake.health <= 0 || bodies.has(coordKey(head))) {
      return false;
    }
    return !moved.some(other => other.id !== snake.id &&
      coordKey(other.head) === coordKey(head) && other.length >= snake.length);
  });

  return {
    ...gameState,
    turn: gameState.turn + 1,
    board: {
      ...gameState.board,
      food: gameState.board.food.filter(item => !eaten.has(coordKey(item))),
      snakes: survivors,
    },
    you: survivors.find(snake => snake.id === gameState.you.id) ?? gameState.you,
  };
}

interface RolloutResult {
  alive: boolean;
  turnsSurvived: number;
  opponentsEliminated: number;
  length: number;
}

// Plays out LOOKAHEAD_TURNS turns: we make `firstMove`, and from then on every
// snake, us included, moves the way our own decision logic would in its place.
function rollout(gameState: GameState, firstMove: string): RolloutResult {
  const id = gameState.you.id;
  const opponentsAtStart = gameState.board.snakes.length - 1;
  let state = gameState;

  for (let turn = 0; turn < LOOKAHEAD_TURNS; turn++) {
    const moves = new Map<string, string>();
    for (const snake of state.board.snakes) {
      const move = snake.id === id && turn === 0
        ? firstMove
        : decideMove({ ...state, you: snake }).move;
      moves.set(snake.id, move);
    }
    state = applyMoves(state, moves);

    if (!state.board.snakes.some(snake => snake.id === id)) {
      return { alive: false, turnsSurvived: turn, opponentsEliminated: 0, length: 0 };
    }
  }

  return {
    alive: true,
    turnsSurvived: LOOKAHEAD_TURNS,
    opponentsEliminated: opponentsAtStart - (state.board.snakes.length - 1),
    length: state.you.length,
  };
}

export interface MoveOutcome {
  move: string;
  rollouts: number;
  // Averages over the rollouts.
  survivalRate: number;
  turnsSurvived: number;
  opponentsEliminated: number;
  length: number;
}

// Simulates each of `moves` several times (our logic makes some random
// choices, so outcomes vary), round-robin until `budgetMs` has passed. Every
// move gets at least one rollout.
export function lookahead(gameState: GameState, moves: string[], budgetMs: number): MoveOutcome[] {
  const deadline = Date.now() + budgetMs;
  const results = new Map<string, RolloutResult[]>(moves.map(move => [move, []]));

  rounds:
  for (let round = 0; round < MAX_ROLLOUTS_PER_MOVE; round++) {
    for (const move of moves) {
      if (round > 0 && Date.now() > deadline) {
        break rounds;
      }
      results.get(move)!.push(rollout(gameState, move));
    }
  }

  return moves.map(move => {
    const runs = results.get(move)!;
    const average = (value: (run: RolloutResult) => number) =>
      runs.reduce((sum, run) => sum + value(run), 0) / runs.length;
    return {
      move,
      rollouts: runs.length,
      survivalRate: average(run => run.alive ? 1 : 0),
      turnsSurvived: average(run => run.turnsSurvived),
      opponentsEliminated: average(run => run.opponentsEliminated),
      length: average(run => run.length),
    };
  });
}

// Best first: survive most often, then longest, then eliminate the most
// opponents, then be longest.
export function compareOutcomes(a: MoveOutcome, b: MoveOutcome): number {
  return b.survivalRate - a.survivalRate ||
    b.turnsSurvived - a.turnsSurvived ||
    b.opponentsEliminated - a.opponentsEliminated ||
    b.length - a.length;
}
