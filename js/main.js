// Import the game initialization function from game.js
import { initGame } from './game.js';
import { closeIntro } from './ui.js';

// Wait for the DOM to be fully loaded, then wait for the player to click
// "Play Game" on the intro overlay before starting the game. Gating the deal
// behind this click (rather than dealing on page load) means the first sound
// effect plays in response to a user gesture instead of being autoplay-blocked.
window.addEventListener('DOMContentLoaded', () => {
    const playButton = document.getElementById('play-game');
    if (!playButton) return;
    playButton.addEventListener('click', async () => {
        await closeIntro();
        // Initialize the game, which sets the board and adds event listeners
        await initGame();
    }, { once: true });
});
