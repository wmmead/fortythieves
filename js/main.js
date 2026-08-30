// Import the game initialization function from game.js
import { initGame } from './game.js';
import { closeIntro } from './ui.js';
import { startMusic, initVolumeSlider } from './music.js';
import { initSfxToggle, unlockAudio } from './audio.js';
import { preloadCardImages } from './preload.js';

// Wait for the DOM to be fully loaded, then wait for the player to click
// "Play Game" on the intro overlay before starting the game. Gating the deal
// (and the music) behind this click, rather than starting them on page load,
// means they play in response to a user gesture instead of being autoplay-blocked.
window.addEventListener('DOMContentLoaded', () => {
    initSfxToggle(); // live immediately — the intro switch is usable before "Play Game" is clicked
    initVolumeSlider(); // same for the volume slider
    const playButton = document.getElementById('play-game');
    if (!playButton) return;

    // Faded out (the same look/behavior as the greyed-out undo button) until
    // every card image has finished loading, so the deal doesn't have to
    // fetch them on demand — that's what caused the per-card loading lag on
    // a cold cache. The click listener isn't attached until then, either.
    playButton.classList.add('disabled');
    preloadCardImages().then(() => {
        playButton.classList.remove('disabled');
        playButton.addEventListener('click', async () => {
            unlockAudio();
            startMusic();
            await closeIntro();
            // Initialize the game, which sets the board and adds event listeners
            await initGame();
        }, { once: true });
    });
});
