// audio.js — central place for all game sound effects.
// Add new sounds to the `sounds` map below and export a small play*() wrapper for each.

const sounds = {
    fullDeal: new Audio('sndfx/full-deal.mp3'),
    cardMove: new Audio('sndfx/card-sound.mp3'),
    undo: new Audio('sndfx/undo.mp3'),
};

// Sound effects on/off, remembered across visits via localStorage. Defaults to
// on (unset) so existing players don't lose sound effects silently.
const SFX_ENABLED_KEY = 'sfxEnabled';
let sfxEnabled = localStorage.getItem(SFX_ENABLED_KEY) !== 'false';

export function isSfxEnabled() {
    return sfxEnabled;
}

export function setSfxEnabled(value) {
    sfxEnabled = value;
    localStorage.setItem(SFX_ENABLED_KEY, value ? 'true' : 'false');
}

// Wires the intro and menu sound-effects switches: syncs both to the stored
// preference on load, and keeps them in lockstep with each other (and with
// localStorage) whenever either one is toggled.
export function initSfxToggle() {
    const toggles = [
        document.getElementById('sfx-toggle-intro'),
        document.getElementById('sfx-toggle-menu'),
    ].filter(Boolean);

    toggles.forEach((toggle) => {
        toggle.checked = sfxEnabled;
        toggle.addEventListener('change', () => {
            setSfxEnabled(toggle.checked);
            toggles.forEach((other) => {
                if (other !== toggle) other.checked = toggle.checked;
            });
        });
    });
}

// Clone the Audio element before playing so overlapping/rapid plays (e.g. cards
// dealt in quick succession) don't cut each other off. Autoplay can be blocked
// by the browser (notably on first page load, before any user interaction), so
// failures are swallowed rather than surfaced as errors.
function playSound(audio) {
    if (!sfxEnabled) return;
    const instance = audio.cloneNode(true);
    instance.play().catch(() => {});
}

export function playFullDealSound() {
    playSound(sounds.fullDeal);
}

export function playCardMoveSound() {
    playSound(sounds.cardMove);
}

export function playUndoSound() {
    playSound(sounds.undo);
}
