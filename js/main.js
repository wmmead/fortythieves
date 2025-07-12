// Import the game initialization function from game.js
import { initGame } from './game.js';


// Wait for the DOM to be fully loaded before starting the game
window.addEventListener('DOMContentLoaded', async () => {
    // Initialize the game, which sets the board and adds event listeners
    await initGame();
});