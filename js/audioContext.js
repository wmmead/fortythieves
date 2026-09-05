// audioContext.js — the one shared Web Audio context for the whole page.
//
// Both the sound effects (audio.js) and the background music (music.js) run
// through this single context. iOS/iPadOS Safari is the platform every audio
// bug in this project has been reported from, and its guidance is
// consistently "one AudioContext per page": each context is a separate
// render pipeline competing for the same hardware output, and the OS is
// happiest when the page presents itself as a single audio session.
//
// The context is created eagerly (sound effects need it at load time to
// decode their buffers, which doesn't require a user gesture) and starts out
// suspended on iOS/Safari and Chrome. unlockAudioContext() resumes it from
// inside a user gesture — main.js calls it in the "Play Game" click handler.
//
// ---------------------------------------------------------------------
// Surviving an iOS audio-session interruption
// ---------------------------------------------------------------------
// Switching to another app on iPadOS interrupts the audio session. WebKit
// reports that as its own non-standard 'interrupted' state, and — this is
// the important part — **the context does not reliably recover.** Calling
// resume() can move it back to 'running', so the tab keeps showing its
// "playing audio" indicator, while the context renders nothing at all: not
// the music, and not a freshly created one-shot buffer source either. From
// the page's side it looks alive and is completely dead. Reloading the page
// fixes it, which is the tell: only a *new* AudioContext recovers.
//
// So an interruption is not something to resume through — it's something to
// rebuild after. ensureAudioContextHealthy() throws the old context away and
// builds a new one, and modules that hold nodes on it re-establish them via
// onAudioContextRebuild(). Sound effects need no special handling: their
// decoded AudioBuffers are not bound to a context, and audio.js asks for the
// current context on every play.
//
// A context is also considered dead if its clock has stopped advancing while
// it claims to be running — the same zombie, caught without a statechange.
//
// Two rules make the handover feel right on the way back:
//
//   * **Retry the resume, don't assume one attempt.** Returning to the app
//     doesn't mean iOS has handed the audio session back yet; the first
//     resume() right after `visibilitychange` usually fails. Retrying over a
//     few seconds gets audio going on its own, without waiting for the user
//     to tap something. The gesture retry stays as the last resort.
//   * **Don't restart anything until audio is confirmed flowing.** Modules
//     are told to rebuild their graphs only once the clock is actually
//     advancing. Starting them against a still-suspended context makes the
//     page claim to be playing music that nobody can hear.

let audioContext = null;
let masterGain = null;
let interrupted = false;
let gestureRetryArmed = false;
let gestureAttempts = 0;
let pendingRestart = false;
let lastRebuildAt = 0;

const rebuildHandlers = new Set(); // { teardown, restart }

// How long to watch the clock before deciding a "running" context is dead.
const CLOCK_CHECK_MS = 350;
// Waits between resume attempts on the way back from an interruption. Each
// attempt is followed by a CLOCK_CHECK_MS verification, so this covers about
// five seconds of trying before falling back to waiting for a user gesture.
const RESUME_BACKOFF_MS = [0, 150, 400, 900, 1600];
// Don't rebuild more often than this, so a genuinely unavailable output
// device can't put the page in a rebuild loop.
const REBUILD_COOLDOWN_MS = 5000;
// How many taps to spend resuming a fresh context before concluding that it,
// too, is dead and rebuilding again.
const MAX_GESTURE_ATTEMPTS = 3;

// Capture-phase and passive, so these run before the game's own handlers and
// never interfere with them.
const GESTURE_EVENTS = ['pointerdown', 'touchend', 'click', 'keydown'];

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function armGestureRetry() {
    if (gestureRetryArmed) return;
    gestureRetryArmed = true;
    gestureAttempts = 0;
    GESTURE_EVENTS.forEach((type) => {
        document.addEventListener(type, retryFromGesture, { capture: true, passive: true });
    });
}

function disarmGestureRetry() {
    if (!gestureRetryArmed) return;
    gestureRetryArmed = false;
    GESTURE_EVENTS.forEach((type) => {
        document.removeEventListener(type, retryFromGesture, { capture: true });
    });
}

// The last resort: iOS may only allow a brand-new context to start from
// inside a real user gesture, so the first tap after coming back tries
// again. It never rebuilds on the first couple of attempts — the context it
// would throw away is the one that tap is in the middle of unlocking, and
// discarding it is what used to restart the music a second time.
function retryFromGesture() {
    const ctx = getAudioContext();
    gestureAttempts += 1;
    ctx.resume().catch(() => {});
    confirmAlive(ctx).then((alive) => {
        if (alive || gestureAttempts < MAX_GESTURE_ATTEMPTS) return;
        rebuildAudioContext();
    });
}

function createContext() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctx.addEventListener('statechange', () => {
        if (ctx !== audioContext) return; // a discarded context closing down
        if (ctx.state !== 'running' && ctx.state !== 'suspended') {
            // 'interrupted' on WebKit — the OS took the audio session away.
            interrupted = true;
        }
    });
    return ctx;
}

export function getAudioContext() {
    if (!audioContext) audioContext = createContext();
    return audioContext;
}

// Every sound on the page — music tracks and one-shot effects alike — runs
// through this single gain node on its way to the speakers, so all of it can
// be cut instantly with one write. That matters because the two places audio
// has to go away RIGHT NOW (throwing a context away, and leaving the page)
// are exactly the places where per-node stop()/disconnect() calls are least
// reliable: on an interrupted iOS context those calls can fail, and the
// failure is invisible. Setting a gain to zero is a value write on a node
// that is already there, so it survives what disconnection doesn't.
export function getMasterGain() {
    const ctx = getAudioContext();
    if (!masterGain || masterGain.context !== ctx) {
        masterGain = ctx.createGain();
        masterGain.gain.value = 1;
        masterGain.connect(ctx.destination);
    }
    return masterGain;
}

// Cuts everything to silence immediately, with no ramp.
export function silenceAudio() {
    if (!masterGain) return;
    try {
        masterGain.gain.cancelScheduledValues(0);
        masterGain.gain.value = 0;
    } catch (e) { /* context already gone */ }
}

function unsilenceAudio() {
    if (!masterGain) return;
    try {
        masterGain.gain.cancelScheduledValues(0);
        masterGain.gain.value = 1;
    } catch (e) { /* context already gone */ }
}

// Leaving the page has to take its audio with it. On iOS the audio session
// outlives the document briefly during a reload, and a context left playing
// can bleed a fragment of the old page's music into the new one — heard as a
// split second of some other track just as a fresh game begins. Silencing is
// unconditional; the context is only closed on a real unload, since a
// pagehide with persisted=true means the page is going into the back/forward
// cache and may be restored intact.
window.addEventListener('pagehide', (event) => {
    silenceAudio();
    if (event.persisted) return;
    const outgoing = audioContext;
    audioContext = null;
    masterGain = null;
    if (outgoing) {
        try { outgoing.close().catch(() => {}); } catch (e) { /* already closed */ }
    }
});

// Restored from the back/forward cache: undo the silencing above.
window.addEventListener('pageshow', (event) => {
    if (event.persisted) unsilenceAudio();
});

// Whether audio can actually be heard right now. Anything that would start a
// new sound should check this first: a context that exists but isn't running
// (waiting on a gesture after a rebuild, or suspended for a hidden tab) will
// happily accept scheduled audio and play none of it, which shows up as the
// game claiming to play music that nobody can hear.
export function isAudioRunning() {
    return audioContext !== null && audioContext.state === 'running';
}

// Registers a module that holds nodes on the shared context.
// `teardown()` runs while the outgoing context is still open, so nodes can be
// stopped and disconnected cleanly; `restart(ctx)` runs on the replacement —
// but only once that context is confirmed to be producing audio.
export function onAudioContextRebuild(handler) {
    rebuildHandlers.add(handler);
}

// Resolves true if the context's clock is actually advancing — the practical
// test for "is this thing really rendering", since a zombie context reports
// 'running' but its clock stands still. Also the single place that decides
// audio is flowing again, so it's what releases the gesture retry and tells
// the modules to rebuild what they were playing.
function confirmAlive(ctx) {
    const before = ctx.currentTime;
    return wait(CLOCK_CHECK_MS).then(() => {
        const alive = ctx === audioContext && ctx.state === 'running' && ctx.currentTime > before;
        if (!alive) return false;
        disarmGestureRetry();
        if (pendingRestart) {
            pendingRestart = false;
            rebuildHandlers.forEach((handler) => {
                if (handler.restart) {
                    try { handler.restart(ctx); } catch (e) { /* keep going */ }
                }
            });
        }
        return true;
    });
}

// Resumes the current context, retrying over a few seconds. Returning to the
// app doesn't mean the OS has released the audio session yet, so a single
// attempt at visibilitychange time is usually too early.
function activateContext() {
    const attempt = (index) => {
        const ctx = getAudioContext();
        if (index >= RESUME_BACKOFF_MS.length) {
            armGestureRetry();
            return Promise.resolve(false);
        }
        return wait(RESUME_BACKOFF_MS[index])
            .then(() => {
                if (ctx !== audioContext) return false; // rebuilt underneath us
                return ctx.resume().catch(() => {}).then(() => confirmAlive(ctx));
            })
            .then((alive) => (alive ? true : attempt(index + 1)));
    };
    return attempt(0);
}

// Throws the current context away and builds a fresh one. This is the only
// thing that reliably brings audio back after an iOS interruption. Modules
// are torn down immediately but not restarted until the new context is
// actually rendering (see confirmAlive).
export function rebuildAudioContext() {
    if (Date.now() - lastRebuildAt < REBUILD_COOLDOWN_MS) return Promise.resolve(false);
    lastRebuildAt = Date.now();

    // Cut the outgoing context's output before touching anything else. Its
    // per-node teardown below runs against a context the OS may have
    // interrupted, where stop()/disconnect() can quietly fail — and if the
    // audio session then comes back before close() takes effect, whatever was
    // still scheduled plays. That was audible as a split second of the
    // previous tracks when the resume button was pressed.
    silenceAudio();
    const outgoing = audioContext;
    rebuildHandlers.forEach((handler) => {
        if (handler.teardown) {
            try { handler.teardown(); } catch (e) { /* keep rebuilding */ }
        }
    });
    audioContext = null;
    masterGain = null;
    if (outgoing) {
        try { outgoing.close().catch(() => {}); } catch (e) { /* already closed */ }
    }
    interrupted = false;
    pendingRestart = true;
    getAudioContext();
    return activateContext();
}

// Resumes the context from any non-running state ('suspended' before the
// first gesture, 'interrupted' after an iOS app switch). Resolves true once
// the context reports running.
export function unlockAudioContext() {
    const ctx = getAudioContext();
    if (ctx.state === 'running') return Promise.resolve(true);
    return ctx.resume().then(
        () => ctx.state === 'running',
        () => false
    );
}

// Call this when the page becomes visible again. Rebuilds after an
// interruption, and also catches a context that claims to be running but has
// stopped rendering. Resolves true once audio is confirmed flowing again.
export function ensureAudioContextHealthy() {
    if (interrupted) return rebuildAudioContext();
    return unlockAudioContext()
        .then(() => confirmAlive(getAudioContext()))
        .then((alive) => (alive ? true : rebuildAudioContext()));
}
