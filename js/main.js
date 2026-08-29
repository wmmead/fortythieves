// Import the game initialization function from game.js
import { initGame } from './game.js';
import { closeIntro } from './ui.js';
import { startMusic } from './music.js';
import { initSfxToggle } from './audio.js';

// Wait for the DOM to be fully loaded, then wait for the player to click
// "Play Game" on the intro overlay before starting the game. Gating the deal
// (and the music) behind this click, rather than starting them on page load,
// means they play in response to a user gesture instead of being autoplay-blocked.
window.addEventListener('DOMContentLoaded', () => {
    initSfxToggle(); // live immediately — the intro switch is usable before "Play Game" is clicked
    const playButton = document.getElementById('play-game');
    if (!playButton) return;
    playButton.addEventListener('click', async () => {
        startMusic();
        await closeIntro();
        // Initialize the game, which sets the board and adds event listeners
        await initGame();
    }, { once: true });
});
