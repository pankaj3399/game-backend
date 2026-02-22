import { minWeightAssign } from 'munkres-algorithm';

type Player = {
	id: string; // User ID
	name: string; // User name
	elo: number; // Player's ELO ranking or order
};

type Court = {
	name: string;
	_id: string;
	startTime?: Date; // Make sure startTime is a Date, not number
	slot?: number;
};

type Game = {
	player1: Player;
	player2: Player;
	court: Court;
	startTime: Date;
	slot: number;
};

// Define function to format date and time
export const formatDateTime = (
	date: string,
	time: string,
	pauseMinutes: number = 0 // default: no pause
): string => {
	const [hours, minutes] = time.split(':').map(Number);
	const formattedDate = new Date(date);

	// Set UTC time first
	formattedDate.setUTCHours(hours, minutes, 0, 0);

	// Add pause time (in minutes)
	if (pauseMinutes > 0) {
		formattedDate.setUTCMinutes(formattedDate.getUTCMinutes() + pauseMinutes);
	}

	return formattedDate.toISOString();
};

// Helper function to build adjacency matrix for pairings
const buildAdjacencyMatrix = (playerList: Player[], useElo: boolean = true): number[][] => {
	const occupencyMatrix: boolean[][] = new Array(playerList.length)
		.fill(false)
		.map(() => new Array(playerList.length).fill(false));
	const adjacencyMatrix: number[][] = [];

	for (let i = 0; i < playerList.length; i++) {
		adjacencyMatrix[i] = [];
		for (let n = 0; n < playerList.length; n++) {
			if (i === n) {
				adjacencyMatrix[i][n] = Infinity;
			} else if (!occupencyMatrix[i][n] && i !== n) {
				if (!useElo) {
					adjacencyMatrix[i][n] = Math.abs(n - i); // Not using elo
				} else {
					adjacencyMatrix[i][n] = Math.abs(playerList[n].elo - playerList[i].elo); // Using elo
				}
				occupencyMatrix[i][n] = true;
				occupencyMatrix[n][i] = true;
			} else {
				if (!useElo) {
					adjacencyMatrix[i][n] = Math.abs(n - i); // Not using elo
				} else {
					adjacencyMatrix[i][n] = Math.abs(playerList[n].elo - playerList[i].elo); // Using elo
				}
			}
		}
	}

	return adjacencyMatrix;
};

// Helper function for player pairing using munkres algorithm
export const pairPlayers = (playerList: Player[]): [Player, Player][] => {
	const adjacencyMatrix = buildAdjacencyMatrix(playerList);
	const { assignments } = minWeightAssign(adjacencyMatrix);

	const shortList = new Array(playerList.length).fill(false);
	const finalPairing: [Player, Player][] = [];

	// Building pairings
	for (let i = 0; i < assignments.length; i++) {
		const assign = assignments[i];
		if (assign !== null && !shortList[i] && !shortList[assign]) {
			finalPairing.push([playerList[i], playerList[assign]]);
			shortList[i] = true;
			shortList[assign] = true; // TypeScript doesn't need the 'as number' cast here since we are now assured the value is a number.
		}
	}

	// Handling a single remaining pair
	const danglingPair: Player[] = [];
	shortList.forEach((val, idx) => {
		if (val === false) {
			danglingPair.push(playerList[idx]);
		}
	});

	if (danglingPair.length === 2) {
		finalPairing.push(danglingPair as [Player, Player]);
	}

	return finalPairing;
};

// Helper function to assign courts to games
export const assignCourtsToGames = (
	games: [Player, Player][],
	courts: Court[],
	startTime: Date,
	gameTime: number
): Game[] => {
	const _games = [] as Game[]; // Create an array of `Game` type
	let courtNo = 0;
	let slot = 0;

	// console.log('------------courts-------------')
	// console.log(courts)

	for (let i = 0; i < games.length; i++) {
		const crt = courts[courtNo]; //Object.assign({}, courts[courtNo]); // Retrieve the current court
		console.log(crt);
		// Ensure startTime is set based on the initial startTime and game duration
		// crt.startTime = new Date(startTime.getTime() + slot * gameTime * 60 * 1000);
		// crt.slot = slot;

		// Assign the court and players to a new game object
		_games.push({
			player1: games[i][0], // Includes id, name, elo
			player2: games[i][1], // Includes id, name, elo
			court: crt,
			startTime: new Date(startTime.getTime() + slot * gameTime * 60 * 1000), //crt.startTime,
			slot: slot
		});

		courtNo++;

		if (courtNo >= courts.length) {
			courtNo = 0;
			slot++;
		}
	}
	console.log(_games);
	// throw new Error("STOP HERE");
	return _games;
};
