import blossom from 'edmonds-blossom-fixed';

export interface SwissPlayer {
	id: string;
	score: number;
	pairedUpDown: boolean;
	receivedBye: boolean;
	avoid: string[];
	rating: number;
	seating?: number[];
	index?: number;
}

export interface SwissMatch {
	noofgames: number;
	match: number;
	player1: string;
	player2: string | null;
}

function shuffle<T>(arr: T[]): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const z = Math.floor(Math.random() * (i + 1));
		[a[i], a[z]] = [a[z], a[i]];
	}
	return a;
}

function swiss(players: SwissPlayer[] | number, noofgames: number, rated = false, seating = false): SwissMatch[] {
	const matches: SwissMatch[] = [];
	let playerArray: SwissPlayer[] = [];

	if (Array.isArray(players)) {
		playerArray = players;
	} else {
		playerArray = [...new Array(players)].map((_, i) => ({
			id: (i + 1).toString(),
			score: 0,
			pairedUpDown: false,
			receivedBye: false,
			avoid: [],
			rating: 0
		}));
	}

	if (rated) {
		playerArray.filter((p) => typeof p.rating !== 'number' || p.rating === null).forEach((p) => (p.rating = 0));
	}

	if (seating) {
		playerArray.filter((p) => !Array.isArray(p.seating)).forEach((p) => (p.seating = []));
	}

	playerArray = shuffle(playerArray);
	playerArray.forEach((p, i) => (p.index = i));

	const scoreGroups = [...new Set(playerArray.map((p) => p.score))].sort((a, b) => a - b);

	const scoreSums = [
		...new Set(
			scoreGroups
				.map((s, i, a) => {
					const sums: number[] = [];
					for (let j = i; j < a.length; j++) {
						sums.push(s + a[j]);
					}
					return sums;
				})
				.flat()
		)
	].sort((a, b) => a - b);

	type Pair = [number, number, number];
	const pairs: Pair[] = [];

	for (let i = 0; i < playerArray.length; i++) {
		const curr = playerArray[i];
		const next = playerArray.slice(i + 1);
		const sorted = rated
			? [...next].sort((a, b) => Math.abs(curr.rating - a.rating) - Math.abs(curr.rating - b.rating))
			: [];

		for (let j = 0; j < next.length; j++) {
			const opp = next[j];

			if (curr.avoid && curr.avoid.includes(opp.id)) {
				continue;
			}

			let wt = 75 - 75 / (scoreGroups.findIndex((s) => s === Math.min(curr.score, opp.score)) + 2);

			wt += 5 - 5 / (scoreSums.findIndex((s) => s === curr.score + opp.score) + 1);

			let scoreGroupDiff = Math.abs(
				scoreGroups.findIndex((s) => s === curr.score) - scoreGroups.findIndex((s) => s === opp.score)
			);

			if (scoreGroupDiff === 1 && curr.pairedUpDown === false && opp.pairedUpDown === false) {
				scoreGroupDiff -= 0.65;
			} else if (scoreGroupDiff > 0 && (curr.pairedUpDown === true || opp.pairedUpDown === true)) {
				scoreGroupDiff += 0.2;
			}

			wt += 23 / (2 * (scoreGroupDiff + 2));

			if (rated) {
				wt += 4 / (sorted.findIndex((p) => p.id === opp.id) + 2);
			}

			if (seating && curr.seating && opp.seating) {
				let seatingDiff = Math.abs(
					curr.seating.reduce((sum, seat) => sum + seat, 0) - opp.seating.reduce((sum, seat) => sum + seat, 0)
				);

				if (curr.seating.slice(-1)[0] !== opp.seating.slice(-1)[0]) {
					seatingDiff += 0.5;
				}

				wt += Math.pow(2, seatingDiff - 1);
			}

			if (curr.receivedBye || opp.receivedBye) {
				wt += 40;
			}

			pairs.push([curr.index!, opp.index!, wt]);
		}
	}

	const blossomPairs: number[] = blossom(pairs, true);
	const playerCopy = [...playerArray];
	let byeArray: SwissPlayer[] = [];
	let match = 1;

	do {
		const indexA = playerCopy[0].index!;
		const indexB = blossomPairs[indexA];

		if (indexB === -1) {
			byeArray.push(playerCopy.splice(0, 1)[0]);
			continue;
		}

		playerCopy.splice(0, 1);
		playerCopy.splice(
			playerCopy.findIndex((p) => p.index === indexB),
			1
		);

		let playerA = playerArray.find((p) => p.index === indexA)!;
		let playerB = playerArray.find((p) => p.index === indexB)!;

		if (seating && playerA.seating && playerB.seating) {
			const aScore = playerA.seating.reduce((sum, seat) => sum + seat, 0);
			const bScore = playerB.seating.reduce((sum, seat) => sum + seat, 0);

			if (
				JSON.stringify(playerB.seating.slice(-2)) === '[-1,-1]' ||
				JSON.stringify(playerA.seating.slice(-2)) === '[1,1]' ||
				(playerB.seating.slice(-1)[0] === -1 && playerA.seating.slice(-1)[0] === 1) ||
				bScore < aScore
			) {
				[playerA, playerB] = [playerB, playerA];
			}
		}

		matches.push({
			noofgames: noofgames,
			match: match++,
			player1: playerA.id,
			player2: playerB.id
		});
	} while (playerCopy.length > blossomPairs.reduce((sum, idx) => (idx === -1 ? sum + 1 : sum), 0));

	byeArray = [...byeArray, ...playerCopy];

	for (let i = 0; i < byeArray.length; i++) {
		matches.push({
			noofgames: noofgames,
			match: match++,
			player1: byeArray[i].id,
			player2: null
		});
	}

	return matches;
}

export default swiss;
