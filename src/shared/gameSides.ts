/** Resolve tournament game sides from `side1` and `side2`. */
export function getGameSides<T extends { players?: unknown[] }>(game: {
  side1?: T | null;
  side2?: T | null;
}): [T, T] | null {
  if (game.side1 != null && game.side2 != null) {
    return [game.side1, game.side2];
  }
  return null;
}
