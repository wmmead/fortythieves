// audioContext.js — the one shared Web Audio context for the whole page.
//
// Both the sound effects (audio.js) and the background music (music.js) used
// to create their own AudioContext. iOS/iPadOS Safari is the platform every
// audio bug so far has been reported from, and its guidance is consistently
// "one AudioContext per page": each context is a separate render pipeline
// competing for the same hardware output, and the OS is happiest when the
// page presents itself as a single audio session. Sharing one context here
// also matches how meaddesign's player works — its visualizer library owns a
// single context that every track and sound runs through.
//
// The context is created eagerly (sound effects need it at load time to
// decode their buffers, which doesn't require a user gesture) and starts out
// suspended on iOS/Safari and Chrome. unlockAudioContext() resumes it from
// inside a user gesture — main.js calls it in the "Play Game" click handler.

let audioContext = null;

export function getAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
}

export function unlockAudioContext() {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
    }
}
