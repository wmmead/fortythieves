// audio.js — central place for all game sound effects.
// Add new sounds to the `sounds` map below and export a small play*() wrapper for each.

const sounds = {
    fullDeal: new Audio('sndfx/full-deal.mp3'),
    cardMove: new Audio('sndfx/card-sound.mp3'),
    undo: new Audio('sndfx/undo.mp3'),
};

// Clone the Audio element before playing so overlapping/rapid plays (e.g. cards
// dealt in quick succession) don't cut each other off. Autoplay can be blocked
// by the browser (notably on first page load, before any user interaction), so
// failures are swallowed rather than surfaced as errors.
function playSound(audio) {
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
