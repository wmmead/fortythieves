// Generate a unique ID for each game
function generateGameId() {
  return 'game_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
}

// Retrieve all game stats from localStorage
export function getAllGameStats() {
  return JSON.parse(localStorage.getItem('solitaireGameStats') || '[]');
}

// Save all game stats to localStorage
function setAllGameStats(stats) {
  localStorage.setItem('solitaireGameStats', JSON.stringify(stats));
}

// Create a new game record and store it
export function createNewGameRecord() {
  const stats = getAllGameStats();
  const newGame = {
    id: generateGameId(),
    moves: 0,
    score: 0,
    startedAt: new Date().toISOString()
  };
  stats.push(newGame);
  setAllGameStats(stats);
  localStorage.setItem('currentGameId', newGame.id);
  return newGame;
}

// Update the current game's move count and score
export function updateCurrentGameStats(score) {
  const stats = getAllGameStats();
  const currentGameId = localStorage.getItem('currentGameId');
  const game = stats.find(g => g.id === currentGameId);
  if (game) {
    game.moves++;
    if (score !== null) game.score = score;
    setAllGameStats(stats);
    //console.log(stats);
  }
}

export function deleteZeroMoveRecords() {
  // Retrieve all game stats from local storage
  const stats = JSON.parse(localStorage.getItem('solitaireGameStats') || '[]');
  // Filter out records where move count is zero
  const filteredStats = stats.filter(game => game.moves !== 0);
  // Save the filtered stats back to local storage
  localStorage.setItem('solitaireGameStats', JSON.stringify(filteredStats));
}

export function getGameStatistics() {
  // Retrieve all game stats from local storage
  const stats = JSON.parse(localStorage.getItem('solitaireGameStats') || '[]');
  const currentGameId = localStorage.getItem('currentGameId');

  // Filter out the current game and games with zero moves
  const filteredGames = stats.filter(game =>
    game.id !== currentGameId && game.moves > 0
  );

  // Number of games played
  const numGamesPlayed = filteredGames.length;

  // Average score (avoid division by zero)
  const avgScore = numGamesPlayed > 0
    ? parseFloat((filteredGames.reduce((sum, game) => sum + game.score, 0) / numGamesPlayed).toFixed(2))
    : 0;

  // Number of games won (score exactly 728)
  const numGamesWon = filteredGames.filter(game => game.score === 728).length;

  // Return the statistics object
  return {
    gamesPlayed: numGamesPlayed,
    averageScore: avgScore,
    gamesWon: numGamesWon
  };
}

export function deleteAllSolitaireUserData() {
  // Remove all game statistics
  localStorage.removeItem('solitaireGameStats');
  // Remove the current game ID
  localStorage.removeItem('currentGameId');
  // (Optional) Remove any other keys your game uses in localStorage
  // Example: localStorage.removeItem('someOtherKey');
}

export function moveCurrentGameToStats() {
  // Retrieve all game stats from local storage
  const stats = JSON.parse(localStorage.getItem('solitaireGameStats') || '[]');
  // Retrieve the current game ID
  const currentGameId = localStorage.getItem('currentGameId');
  if (!currentGameId) return;

  // Try to find the current game data in stats (to avoid duplicates)
  const alreadyIncluded = stats.some(game => game.id === currentGameId);
  if (alreadyIncluded) {
    // Optionally clear currentGameId if you want
    localStorage.removeItem('currentGameId');
    return;
  }

  // Retrieve the current game data (replace this with your actual game state retrieval)
  // For example, if you store current game data in 'currentGameData':
  const currentGameData = JSON.parse(localStorage.getItem('currentGameData') || 'null');
  if (!currentGameData) return;

  // Add the current game data to the stats array
  stats.push(currentGameData);

  // Save the updated stats back to local storage
  localStorage.setItem('solitaireGameStats', JSON.stringify(stats));

  // Remove the current game references
  localStorage.removeItem('currentGameId');
  localStorage.removeItem('currentGameData');
}
