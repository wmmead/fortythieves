// audio.js — central place for all game sound effects.
// Add new sounds to the `SOUND_FILES` map below and export a small play*()
// wrapper for each.
//
// Playback uses the Web Audio API rather than <audio> elements: each file is
// fetched and decoded into an in-memory AudioBuffer once up front, and each
// play*Sound() call just schedules that already-decoded buffer on a fresh
// AudioBufferSourceNode. HTMLMediaElement.play() has to spin up a new
// playback pipeline every call, which is noticeably laggy for short one-shot
// effects on iOS/iPadOS in particular — starting an already-decoded buffer
// has essentially none of that latency.

const SOUND_FILES = {
    fullDeal: 'sndfx/full-deal.mp3',
    cardMove: 'sndfx/card-sound.mp3',
    undo: 'sndfx/undo.mp3',
};

let audioContext = null;
const buffers = {}; // name -> decoded AudioBuffer, filled in as each file loads

function getAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
}

async function loadBuffer(name, url) {
    const ctx = getAudioContext();
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    buffers[name] = await ctx.decodeAudioData(arrayBuffer);
}

// Kick off fetch+decode for every effect immediately; no user gesture is
// needed for this part, only for actually starting playback (see unlockAudio).
Object.entries(SOUND_FILES).forEach(([name, url]) => {
    loadBuffer(name, url).catch(() => {});
});

// iOS/Safari (and Chrome, to a lesser extent) create the AudioContext
// suspended until a user gesture resumes it. Call this from inside the
// "Play Game" click handler, alongside startMusic().
export function unlockAudio() {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
    }
}

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

// Plays an already-decoded buffer on a fresh source node — cheap and
// disposable, so overlapping/rapid plays (e.g. cards dealt in quick
// succession) don't cut each other off. No-ops quietly if sound effects are
// off, or if this buffer hasn't finished decoding yet.
function playBuffer(name) {
    if (!sfxEnabled) return;
    const buffer = buffers[name];
    if (!buffer) return;

    const ctx = getAudioContext();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
}

export function playFullDealSound() {
    playBuffer('fullDeal');
}

export function playCardMoveSound() {
    playBuffer('cardMove');
}

export function playUndoSound() {
    playBuffer('undo');
}
