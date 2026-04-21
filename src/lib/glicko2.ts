const SCALE = 173.7178;
const DEFAULT_TAU = 0.5;
const DEFAULT_MAX_RD = 350;
const EPSILON = 0.000001;

export interface Glicko2Player {
  rating: number;
  rd: number;
  vol: number;
  tau?: number;
}

export interface Glicko2MatchResult {
  opponent: Glicko2Player;
  score: number;
}

function toMu(rating: number) {
  return (rating - 1500) / SCALE;
}

function toPhi(rd: number) {
  return rd / SCALE;
}

function toRating(mu: number) {
  return mu * SCALE + 1500;
}

function toRd(phi: number) {
  return phi * SCALE;
}

function g(phi: number) {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function expectedScore(mu: number, muJ: number, phiJ: number) {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

function clampRd(rd: number, maxRd: number) {
  if (!Number.isFinite(rd)) {
    return maxRd;
  }
  if (rd < 0) {
    return 0;
  }
  return Math.min(rd, maxRd);
}

function inflatePhi(phi: number, vol: number, inactivityPeriods: number) {
  if (!Number.isFinite(inactivityPeriods) || inactivityPeriods <= 0) {
    return phi;
  }

  const periods = Math.trunc(inactivityPeriods);
  if (periods <= 0) {
    return phi;
  }

  return Math.sqrt(phi * phi + periods * vol * vol);
}

function computeVolatility(phi: number, vol: number, delta: number, v: number, tau: number) {
  const a = Math.log(vol * vol);

  const f = (x: number) => {
    const ex = Math.exp(x);
    const top = ex * (delta * delta - phi * phi - v - ex);
    const bottom = 2 * Math.pow(phi * phi + v + ex, 2);
    return top / bottom - (x - a) / (tau * tau);
  };

  let lower = a;
  let upper: number;

  if (delta * delta > phi * phi + v) {
    upper = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    const MAX_K_STEPS = 100_000;
    while (f(a - k * tau) < 0 && k < MAX_K_STEPS) {
      k += 1;
    }
    if (k >= MAX_K_STEPS) {
      throw new Error("Glicko-2 volatility search: exceeded maximum iterations");
    }
    upper = a - k * tau;
  }

  let fLower = f(lower);
  let fUpper = f(upper);

  while (Math.abs(upper - lower) > EPSILON) {
    const midpoint = lower + ((lower - upper) * fLower) / (fUpper - fLower);
    const fMid = f(midpoint);

    if (fMid * fUpper <= 0) {
      lower = upper;
      fLower = fUpper;
    } else {
      fLower /= 2;
    }

    upper = midpoint;
    fUpper = fMid;
  }

  return Math.exp(lower / 2);
}

export function rateGlicko2Player(
  player: Glicko2Player,
  results: Glicko2MatchResult[],
  options?: { inactivityPeriods?: number; maxRd?: number }
) {
  const tau =
    typeof player.tau === "number" && Number.isFinite(player.tau) && player.tau > 0
      ? player.tau
      : DEFAULT_TAU;
  const maxRd =
    typeof options?.maxRd === "number" && Number.isFinite(options.maxRd) && options.maxRd > 0
      ? options.maxRd
      : DEFAULT_MAX_RD;

  let mu = toMu(player.rating);
  let phi = toPhi(player.rd);
  if (!Number.isFinite(player.vol) || player.vol <= 0) {
    throw new Error("Invalid player volatility: expected a finite positive number");
  }
  const vol = player.vol;

  phi = inflatePhi(phi, vol, options?.inactivityPeriods ?? 0);

  if (!Array.isArray(results) || results.length === 0) {
    return {
      rating: toRating(mu),
      rd: clampRd(toRd(phi), maxRd),
      vol,
      tau,
    };
  }

  const normalizedResults = results.filter((result) => {
    if (!result || typeof result !== "object") {
      return false;
    }
    if (!result.opponent || typeof result.opponent !== "object") {
      return false;
    }
    return Number.isFinite(result.score);
  });

  if (normalizedResults.length === 0) {
    return {
      rating: toRating(mu),
      rd: clampRd(toRd(phi), maxRd),
      vol,
      tau,
    };
  }

  let inverseV = 0;
  let deltaSum = 0;

  for (const result of normalizedResults) {
    const opponentMu = toMu(result.opponent.rating);
    const opponentPhi = toPhi(result.opponent.rd);
    const gPhi = g(opponentPhi);
    const expectation = expectedScore(mu, opponentMu, opponentPhi);

    inverseV += gPhi * gPhi * expectation * (1 - expectation);
    deltaSum += gPhi * (result.score - expectation);
  }

  if (inverseV <= 0) {
    return {
      rating: toRating(mu),
      rd: clampRd(toRd(phi), maxRd),
      vol,
      tau,
    };
  }

  const v = 1 / inverseV;
  const delta = v * deltaSum;
  const updatedVol = computeVolatility(phi, vol, delta, v, tau);
  const phiStar = Math.sqrt(phi * phi + updatedVol * updatedVol);
  const updatedPhi = 1 / Math.sqrt((1 / (phiStar * phiStar)) + (1 / v));
  const updatedMu = mu + updatedPhi * updatedPhi * deltaSum;

  return {
    rating: toRating(updatedMu),
    rd: clampRd(toRd(updatedPhi), maxRd),
    vol: updatedVol,
    tau,
  };
}

export function rateGlicko2HeadToHead(
  playerOne: Glicko2Player,
  playerTwo: Glicko2Player,
  playerOneScore: number,
  options?: { inactivityPeriods?: number; maxRd?: number }
) {
  const boundedScore = Math.max(0, Math.min(1, playerOneScore));

  const updatedPlayerOne = rateGlicko2Player(
    playerOne,
    [
      {
        opponent: playerTwo,
        score: boundedScore,
      },
    ],
    options
  );

  const updatedPlayerTwo = rateGlicko2Player(
    playerTwo,
    [
      {
        opponent: playerOne,
        score: 1 - boundedScore,
      },
    ],
    options
  );

  return {
    playerOne: updatedPlayerOne,
    playerTwo: updatedPlayerTwo,
  };
}
