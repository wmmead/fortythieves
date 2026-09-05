// resumeOverlay.js — the "Resume Game" panel shown when the page comes back
// from the background without its audio.
//
// iOS refuses to resume an AudioContext outside a user gesture, so after
// switching to another app and back, the game can be fully visible and
// playable while completely silent — until the player happens to touch
// something, which is an unpredictable moment and gave inconsistent results.
// This puts a deliberate button in front of them instead: the tap on "Resume
// Game" is the gesture that lets audio start again.
//
// It isn't iPad-specific and needs no device detection. The panel only
// appears when audio genuinely hasn't come back shortly after the page
// becomes visible, which on desktop (where the context resumes on its own)
// is essentially never. If the automatic retries in audioContext.js succeed
// while the panel is up, it takes itself away.

import { isAudioRunning, ensureAudioContextHealthy } from './audioContext.js';
import { getMusicVolume } from './music.js';
import { isSfxEnabled } from './audio.js';

// Long enough for the automatic resume retries to win on their own, short
// enough that a silent game doesn't sit there looking broken.
const SHOW_DELAY_MS = 1200;
const POLL_MS = 400;
const FADE_MS = 500; // matches the .fadeout transition in styles.css

let initialized = false;
let showTimerId = null;
let pollTimerId = null;
let hideTimerId = null;

function overlay() {
    return document.getElementById('resume');
}

// Nothing to recover if the player has turned all the sound off — don't put a
// panel in front of a game they're deliberately playing in silence.
function wantsAudio() {
    return getMusicVolume() > 0 || isSfxEnabled();
}

function stopTimers() {
    [showTimerId, hideTimerId].forEach((t) => t && clearTimeout(t));
    if (pollTimerId) clearInterval(pollTimerId);
    showTimerId = hideTimerId = pollTimerId = null;
}

function show() {
    const el = overlay();
    if (!el || !el.hidden) return;
    if (hideTimerId) {
        clearTimeout(hideTimerId);
        hideTimerId = null;
    }
    el.classList.remove('fadeout');
    el.hidden = false;
}

function hide() {
    const el = overlay();
    if (!el || el.hidden || el.classList.contains('fadeout')) return;
    el.classList.add('fadeout');
    hideTimerId = setTimeout(() => {
        hideTimerId = null;
        el.hidden = true;
        el.classList.remove('fadeout');
    }, FADE_MS);
}

function handleVisibilityChange() {
    stopTimers();
    if (document.hidden) {
        // Leaving again: drop the panel so returning re-decides from scratch.
        const el = overlay();
        if (el) {
            el.hidden = true;
            el.classList.remove('fadeout');
        }
        return;
    }

    showTimerId = setTimeout(() => {
        showTimerId = null;
        if (!isAudioRunning() && wantsAudio()) show();
        // Keep watching either way: a retry that lands a moment later should
        // dismiss the panel without the player having to press anything.
        pollTimerId = setInterval(() => {
            if (!isAudioRunning()) return;
            clearInterval(pollTimerId);
            pollTimerId = null;
            hide();
        }, POLL_MS);
    }, SHOW_DELAY_MS);
}

// Called once the game is actually under way (from the "Play Game" handler),
// so the panel can never appear over the intro screen.
export function initResumeOverlay() {
    if (initialized) return;
    initialized = true;

    const button = document.getElementById('resume-game');
    if (button) {
        button.addEventListener('click', () => {
            // This click is the user gesture iOS was waiting for.
            ensureAudioContextHealthy();
            hide();
        });
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
}
