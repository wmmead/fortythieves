# Streaming MP3 audio engine — porting notes for meaddesign

Written September 5, 2026, after the fortythieves game's background music was rebuilt and confirmed working on the iPad. This file is meant to be dropped into the `meaddesign` folder so the same fix can be applied to that site's cascading audio player. Everything needed is either in this file or named as a file to copy from `fortythieves`.

## 1. The problem this solves

**iPad Safari will not run a third media-element stream.** Every version of the fortythieves player that used `<audio>` elements — plain ones, and later ones routed through Web Audio with `createMediaElementSource` — either failed to start the third track or stuttered trying, and in the worst case dragged all of Safari down until it was force-quit. Desktop browsers never showed any of this.

The limit is on media elements (each one is a heavyweight system media player under the hood), **not** on Web Audio. Web Audio will happily mix dozens of `AudioBufferSourceNode`s at once — the game's card sound effects have always used that path and never had a problem on the iPad.

meaddesign's `audio.js` uses the same `<audio>`-element approach (`new Audio(src)` → `audioMotion.connectInput(audio)`), so it has the same ceiling. It only reaches its third concurrent track about 2.5 minutes in, which is probably why it hasn't been noticed there.

Two other, smaller problems were found and fixed along the way — worth knowing because the old meaddesign code shares one of them:

- **Finished tracks must be fully torn down.** Dropping the JS reference isn't enough; a source node still wired into the graph keeps its element and pipeline alive and rendered every quantum. (meaddesign already does this right via `audioMotion.disconnectInput(audio)`.)
- **Volume fades should be a single AudioParam ramp, not a GSAP tween.** GSAP writing `audio.volume` (or `gain.value`) ~60×/s from the main thread is fine on desktop, but each write crosses into the audio engine, and it stops entirely in a hidden tab because GSAP runs on `requestAnimationFrame`. A `linearRampToValueAtTime` runs on the audio thread and keeps going while the tab is hidden.

## 2. The fix in one paragraph

Stop using media elements for music. Fetch each mp3 as a normal streamed download, slice the arriving bytes into small chunks, decode each chunk into raw sound with a tiny WebAssembly mp3 decoder (**mpg123-decoder**, one self-contained 79 KB file), gather the decoded sound into ~10-second `AudioBuffer`s, and schedule those as `AudioBufferSourceNode`s so each starts at the exact sample where the previous one ends. Only decode ~20 seconds ahead of the playhead, so memory per track is the compressed file (a few MB) plus ~30 seconds of decoded audio — not the whole decoded track (~85 MB). The tracks become plain buffers in the Web Audio mixer, and the iPad's media-player limit never comes into play.

## 3. What to copy into meaddesign

| Item | From fortythieves | Notes |
|---|---|---|
| `mpg123/mpg123-decoder.min.js` + `mpg123/LICENSE` | copy the folder | v1.0.3, MIT. Fully self-contained: the WASM is embedded in the file; no fetch, no separate `.wasm`, no CDN. Can be re-downloaded from `https://cdn.jsdelivr.net/npm/mpg123-decoder@1.0.3/dist/mpg123-decoder.min.js` if needed. |
| `js/mp3Duration.js` | copy, or paste from §7 | Exact track length by walking mp3 frame headers. Needed because none of the tracks carry a Xing/Info frame count. |
| `js/audioContext.js` | optional — see §5 | fortythieves shares one context between music and sound effects. meaddesign can simply use `audioMotion.audioCtx` instead. |
| `js/music.js` | reference only — full source in §7 | The engine. meaddesign's version needs the UI bits (mute, remix, "Playing:" label, visualizer) re-attached; §5 says where. |

**Script tag** — must declare UTF-8, and load before the code that uses it:

```html
<script src="mpg123/mpg123-decoder.min.js" charset="utf-8" defer></script>
```

> **Gotcha, seen live:** the decoder embeds its WebAssembly as a high-byte string. The first test page had no charset declaration, the string was mangled on load, and every decode failed with `Decode failed crc32 validation`. meaddesign's `index.html` should already have `<meta charset="UTF-8">`; keep the attribute on the tag anyway.

The library exposes a global: `window['mpg123-decoder'].MPEGDecoder`.

```js
const decoder = new MPEGDecoder();
await decoder.ready;                       // WASM compiled
const { channelData, samplesDecoded, sampleRate } = decoder.decode(uint8ArrayChunk);
// channelData: Float32Array per channel; chunks may split mp3 frames anywhere — the decoder is stateful.
decoder.free();                            // when the track is done (own instance method, not on the prototype)
```

Verified in Chrome: decoding a file in 64 KB slices produces output bit-identical to decoding it whole (same sample count, max per-sample difference 0), at roughly 1500× real time.

## 4. How the engine works, step by step

1. **Fetch as a stream.** `fetch(src)` → `response.body.getReader()`. `Content-Length` (same-origin, so it's readable) is kept as `totalBytes` for the duration estimate. Each delivered `Uint8Array` is pushed onto the track's `queue`, sliced to ≤64 KB pieces so a whole file arriving from the cache in one go can't produce one enormous buffer. Every chunk is also kept in `allChunks` until the download finishes.
2. **Decode ahead, but not too far.** `pumpTrack()` runs whenever bytes arrive and on a 500 ms scheduler tick. It decodes queued chunks while `secondsAhead + unflushedSeconds < DECODE_AHEAD` (20 s). Decoded channel arrays are copied (`.slice()` — the decoder reuses its output views) into `pcm`.
3. **Batch and schedule.** When `pcm` holds ≥ `BUFFER_SECONDS` (10 s) of audio, `flushPcm()` builds one `AudioBuffer` (at the mp3's own sample rate — the source node resamples if the context differs), makes an `AudioBufferSourceNode`, connects it to the track's `GainNode`, and starts it at `startTime + scheduledSamples / sampleRate`. That arithmetic (samples, not accumulated float durations) is what keeps every boundary sample-exact. The first buffer starts at `currentTime + 0.1`. If a buffer would be scheduled in the past (network fell behind playback), the track's `startTime` is shifted forward so later buffers stay contiguous instead of overlapping.
4. **Duration.** When the download completes, `allChunks` is concatenated once and `mp3Duration()` walks the frame headers (a 4-minute file is ~10,000 frames, a few ms). Until then `trackProgress()` estimates: `secondsDecoded × totalBytes / bytesConsumed`. The one-third trigger checks `trackProgress()` on each scheduler tick.
5. **End of track.** After the last chunk is decoded the remainder is flushed and `decodeDone` is set. Each source's `onended` removes it from `track.sources`; when `decodeDone` and no sources remain, the track has ended. A file that decodes to zero samples is treated as a failure.
6. **Teardown (`forgetTrack`).** Cancel the reader, `stop()` + `disconnect()` every scheduled source (with `onended` nulled first so it can't fire), disconnect the gain node, `decoder.free()`, drop the queues. Used for a normal end, a prune, and a failure alike. One retry per failure (`handleFailure` guards with a `failed` flag so fetch/decode/empty-file signals can't each retry).
7. **Fades (`fadeGain`).** `cancelScheduledValues(now)` → `setValueAtTime(currentValue, now)` → `linearRampToValueAtTime(target, now + duration)`. The current value is computed from a per-track `gainRamp` record and the context clock, not read from `gain.value` (its mid-automation behavior has varied between engines). An optional `setTimeout` fires the completion callback; starting a new fade cancels a pending one.
8. **Mute.** Ramps every gain to 0; the cascade keeps running silently (decoding is cheap), so the mix is continuous when the volume returns. Nothing starts while muted at startup; raising the volume from 0 with nothing active starts the cascade.
9. **Hidden tab.** `visibilitychange` → ramp every gain to 0 over 3 s → `ctx.suspend()`, but **only if the context is still `'running'`** (see §8). The audio clock stops, so every scheduled buffer holds its place. On return: cancel a pending suspend if the fade hadn't finished (never suspend a visible tab), resume the context, and if an OS interruption occurred, snap the gains to 0 first so the music fades up from silence instead of snapping back at part volume.
10. **Concurrency cap.** `startNextTrack()` refuses to exceed `MAX_CONCURRENT_TRACKS` (3); a trigger that arrives while the cap is full increments a bounded `pendingStarts`, which `forgetTrack()` drains the moment a slot frees. The once-a-minute watchdog only restarts the cascade if it dropped to zero.

## 5. meaddesign-specific porting notes

- **Use audioMotion's context as the one shared context.** audioMotion-analyzer creates its own `AudioContext` (`audioMotion.audioCtx`). Don't create a second one — iOS is happiest with one per page. Wherever the engine calls `getAudioContext()`, use `audioMotion.audioCtx`. The existing `audioMotion.audioCtx.resume()` in the play-button click handler is exactly the gesture unlock the engine needs.
- **Keep the visualizer by feeding it the gain node.** `audioMotion.connectInput()` accepts any `AudioNode`, not just media elements (its source confirms: if the argument isn't an `HTMLMediaElement`, it connects the node directly). So in `createTrack()`, instead of `gainNode.connect(ctx.destination)`, call `audioMotion.connectInput(gainNode)`; in `forgetTrack()`, call `audioMotion.disconnectInput(gainNode)` instead of `gainNode.disconnect()`. The visualizer then sees the mixed music exactly as before. (audioMotion's own output node is already connected to the speakers.)
- **Volume.** Replace every `gsap.to(audio, { volume })` and the manual `fadeAudioVolume()` with `fadeGain(track, …)`. The mute button becomes: `activeTracks.forEach(t => fadeGain(t, isMuted ? 0 : 1, MUTE_FADE_DURATION))`. GSAP is no longer needed for audio at all (still needed for the page's text/UI animation).
- **Remix button.** Same shape as before: `removeRandomActiveTrack(REMIX_FADE_DURATION)` then `playTrack(pickRandomTrack(), REMIX_FADE_DURATION)`. With the cap enforced in `startNextTrack()`, call `playTrack` directly here as the old code does, since the prune has just freed a slot (its fade completes 2 s later, so allow the count to briefly sit at cap + 1, or route through `startNextTrack()` and accept the new track starting when the pruned one finishes fading).
- **"Playing:" label.** Add the label in `playTrack()` and remove it in `forgetTrack()` — the same two points where fortythieves updates its temporary now-playing list.
- **One seed, not two.** meaddesign starts a single track on the play click; fortythieves starts two. Just call `startNextTrack()` once.
- **Classic script vs. module.** meaddesign's `audio.js` is a classic `<script defer>`. `mp3Duration.js` is written as an ES module (`export function`). Either switch `audio.js` to `<script type="module">` and `import { mp3Duration } from './mp3Duration.js'`, or paste the function into `audio.js` without the `export` keyword. The engine code itself has no other imports once the context comes from audioMotion.
- **Hidden tab.** Replace the existing `visibilitychange` handler (manual `setTimeout` fade + `audio.pause()`/`audio.play()`) with the suspend/resume version in §7, and read §8 — the iOS interruption handling there is mandatory, not optional. Note it respects mute on the way back in by ramping to `isMuted ? 0 : 1`.
- **audioMotion's context is the hard part of §8.** meaddesign uses `audioMotion.audioCtx`, so a rebuild means replacing the analyzer's context too — audioMotion owns it and cannot be handed a new one. The practical route is to `destroy()` the `AudioMotionAnalyzer` instance and construct a fresh one (it builds its own new context), then re-run the rebuild's `restart` step against `audioMotion.audioCtx`. Budget time for this: it is the one place where meaddesign's port is genuinely more work than fortythieves', and it should be tested by faking `'interrupted'` per §8 before trusting it on the iPad.
- **Track list.** `AUDIO_TRACKS` stays exactly as it is — a plain array of paths.
- **Hosting.** Both sites are on the same Apache host, which sends `Content-Length` (used for the progress estimate). HTTP Range support no longer matters — the engine downloads whole files as normal streams.

## 6. Tunables

| Constant | Value | What it does |
|---|---|---|
| `DECODE_CHUNK_BYTES` | 64 KB | Compressed bytes per decode call (~3–4 s of audio at these bitrates). |
| `DECODE_AHEAD` | 20 s | How far ahead of the playhead to keep audio scheduled. Bigger = more memory, more tolerance for a network stall. |
| `BUFFER_SECONDS` | 10 s | Decoded audio is batched into buffers about this long. Boundaries are sample-exact, but if a faint tick is ever heard at a boundary on Safari (its `start(when)` accuracy wasn't independently verified), raise this. |
| `SCHEDULER_INTERVAL` | 500 ms | Decode-ahead / trigger check cadence. Throttled to ~1 s in hidden tabs, which `DECODE_AHEAD` easily covers. |
| `START_LEAD` | 0.1 s | Gap between scheduling a track's first buffer and it sounding. |
| `MAX_CONCURRENT_TRACKS` | 3 | Hard cap. Web Audio could do far more; three is the musical choice. |

## 7. Full source (fortythieves versions, for reference)

### `js/mp3Duration.js`

```js
// mp3Duration.js — exact duration of an MP3 from its bytes, without decoding.
//
// The music engine streams each track through a WASM decoder in small
// chunks, so it never has the decoded whole to measure — and none of the
// tracks carry a Xing/Info header with a frame count. Walking the frame
// headers instead is cheap (a 4-minute file is ~10,000 frames, a few ms) and
// exact for constant- and variable-bitrate files alike, because every frame
// header states its own bitrate and therefore its own length.
//
// Handles MPEG 1 / 2 / 2.5, Layer III only (all this project's audio), and
// skips a leading ID3v2 tag. Returns seconds, or null if no frames are found.

const SAMPLE_RATES = {
    3: [44100, 48000, 32000], // MPEG 1
    2: [22050, 24000, 16000], // MPEG 2
    0: [11025, 12000, 8000],  // MPEG 2.5
};

// Layer III bitrate tables (kbps), indexed by the header's 4-bit bitrate field.
const BITRATES_MPEG1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const BITRATES_MPEG2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];

export function mp3Duration(bytes) {
    let pos = 0;
    if (bytes.length > 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) { // "ID3"
        const size = (bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9];
        pos = 10 + size + ((bytes[5] & 0x10) ? 10 : 0);
    }

    let seconds = 0;
    let frames = 0;
    while (pos + 4 <= bytes.length) {
        const b1 = bytes[pos + 1];
        if (bytes[pos] !== 0xFF || (b1 & 0xE0) !== 0xE0) { pos += 1; continue; }

        const version = (b1 >> 3) & 3;          // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5, 1 = reserved
        const layer = (b1 >> 1) & 3;            // 1 = Layer III
        const bitrateIndex = bytes[pos + 2] >> 4;
        const sampleRateIndex = (bytes[pos + 2] >> 2) & 3;
        const padding = (bytes[pos + 2] >> 1) & 1;

        if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) {
            pos += 1;
            continue;
        }

        const mpeg1 = version === 3;
        const bitrate = (mpeg1 ? BITRATES_MPEG1 : BITRATES_MPEG2)[bitrateIndex] * 1000;
        const sampleRate = SAMPLE_RATES[version][sampleRateIndex];
        const samplesPerFrame = mpeg1 ? 1152 : 576;
        const frameLength = Math.floor((samplesPerFrame / 8) * bitrate / sampleRate) + padding;

        seconds += samplesPerFrame / sampleRate;
        frames += 1;
        pos += frameLength;
    }
    return frames > 0 ? seconds : null;
}
```

### `js/audioContext.js` (fortythieves only — meaddesign uses `audioMotion.audioCtx`)

```js
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
```

### `js/music.js`

The fortythieves engine in full. The `#audio-tracks-playing` block is a temporary debugging display and can be dropped; the volume-slider functions at the bottom are fortythieves UI and map onto meaddesign's mute button as described in §5.

```js
// Background music engine, modeled on meaddesign/audio.js: tracks are picked
// at random and layered in a cascade — once a playing track is a third of the
// way through, the next random track fades in alongside it, and so on
// indefinitely. Unlike the meaddesign version there's no skip control exposed,
// only a shared volume slider (see initVolumeSlider below).
//
// How a track is played — and why it isn't an <audio> element:
//
// iPad Safari will not run a third media-element stream. Every earlier
// version of this engine used <audio> elements (plain, then routed through
// Web Audio), and every one of them either failed to start the third track
// or stuttered trying. That limit is on media elements (AVPlayer instances
// under the hood), not on Web Audio itself, which happily mixes dozens of
// buffer sources — the sound effects in audio.js have always used that path
// and have never had a problem on the iPad.
//
// So each track is now streamed through a small WASM mp3 decoder
// (mpg123/mpg123-decoder.min.js, loaded as a global via index.html, fully
// self-contained): the file is fetched progressively, decoded a chunk at a
// time only as far ahead of the playhead as DECODE_AHEAD allows, and each
// decoded stretch is scheduled as an AudioBufferSourceNode on the page's one
// shared AudioContext (audioContext.js) at the exact sample where the last
// one ends. Memory stays at the compressed file (a few MB) plus ~30s of
// decoded audio per track, instead of the whole decoded track (~85MB each).
//
// Because none of the tracks carry a frame-count header, the exact duration
// (needed for the one-third trigger) comes from walking the mp3 frame headers
// once the download finishes (mp3Duration.js); until then a byte-ratio
// estimate stands in.
//
// Every volume fade is a single AudioParam ramp on the audio thread (see
// fadeGain), which keeps working while the tab is hidden. "Pausing" for a
// hidden tab suspends the shared context — the audio clock stops, so every
// scheduled chunk resumes exactly where it left off. Muting just ramps the
// gains to 0; the cascade keeps running silently so the mix is continuous
// when the volume comes back.
import { MUSIC_TRACKS } from './musicTracks.js';
import { getAudioContext, getMasterGain, unlockAudioContext, ensureAudioContextHealthy, onAudioContextRebuild, isAudioRunning } from './audioContext.js';
import { mp3Duration } from './mp3Duration.js';

/* ---------- Tuning constants ---------- */

const FADE_IN_DURATION = 5;         // seconds, a new track's fade-in
const TRIGGER_PROGRESS = 1 / 3;     // start the next track once the current one is this far through
const MAX_CONCURRENT_TRACKS = 3;    // hard cap on simultaneous tracks (see startNextTrack)
const PRUNE_FADE_DURATION = 2;
const PRUNE_CHECK_INTERVAL = 60000;
const VOLUME_CHANGE_DURATION = 0.3; // seconds, re-targeting already-playing tracks to a new volume
const BACKGROUND_FADE_DURATION = 3; // seconds, fading out/in when the tab is hidden/shown
const VOLUME_KEY = 'musicVolume';
const DEFAULT_VOLUME = 0.75;

const DECODE_CHUNK_BYTES = 64 * 1024; // compressed bytes per decode call (~3-4s of audio)
const DECODE_AHEAD = 20;              // seconds of audio to keep scheduled ahead of the playhead
const BUFFER_SECONDS = 10;            // decoded audio is batched into buffers about this long
const SCHEDULER_INTERVAL = 500;       // ms between decode-ahead / trigger checks
const START_LEAD = 0.1;               // seconds between scheduling a track's first buffer and it sounding

/* ---------- Playback state ---------- */

const playingTracks = new Set();  // track src strings currently playing or fading out
const activeTracks = new Set();   // live track objects (see createTrack)
let pendingStarts = 0;            // cascade triggers deferred because the cap was full
let musicStarted = false;
let musicVolume = loadVolume();

/* ---------- Temporary: visible list of tracks in the rotation ---------- */
/* Bill added #audio-tracks-playing to watch which files the random cascade
   picks, to help decide which to keep. Remove this block (and the element in
   index.html) once that testing is done. */

const activeTrackNames = [];

function trackBasename(src) {
    return src.split('/').pop();
}

function renderActiveTrackNames() {
    const el = document.getElementById('audio-tracks-playing');
    if (el) el.textContent = activeTrackNames.join(', ');
}

function addActiveTrackName(src) {
    activeTrackNames.push(trackBasename(src));
    renderActiveTrackNames();
}

function removeActiveTrackName(src) {
    const index = activeTrackNames.indexOf(trackBasename(src));
    if (index !== -1) activeTrackNames.splice(index, 1);
    renderActiveTrackNames();
}

function loadVolume() {
    const stored = localStorage.getItem(VOLUME_KEY);
    if (stored === null) return DEFAULT_VOLUME;
    const parsed = parseFloat(stored);
    return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : DEFAULT_VOLUME;
}

function getDecoderClass() {
    const lib = window['mpg123-decoder'];
    return lib ? lib.MPEGDecoder : null;
}

/* ---------- Gain fades ---------- */
/* One linear ramp per fade, scheduled on the audio thread. The browser's own
   gain.value getter isn't relied on for "where is this fade right now" — its
   behavior mid-automation has varied between engines — so each track
   remembers its current ramp and the value is computed from the context
   clock instead. */

function currentGain(track) {
    const ramp = track.gainRamp;
    const now = getAudioContext().currentTime;
    if (now >= ramp.endTime) return ramp.endValue;
    if (now <= ramp.startTime) return ramp.startValue;
    return ramp.startValue + (ramp.endValue - ramp.startValue) * (now - ramp.startTime) / (ramp.endTime - ramp.startTime);
}

// `startAt` delays the ramp to a future point on the audio clock, holding the
// current value until then. A track's fade-in uses it to begin exactly when
// its first buffer starts sounding rather than when the track object was
// created — see flushPcm.
function fadeGain(track, targetValue, duration, onComplete, startAt) {
    if (track.fadeTimerId) {
        clearTimeout(track.fadeTimerId);
        track.fadeTimerId = null;
    }
    const gain = track.gainNode.gain;
    const now = getAudioContext().currentTime;
    const from = startAt && startAt > now ? startAt : now;
    const startValue = currentGain(track);
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(startValue, now);
    if (from > now) gain.setValueAtTime(startValue, from); // hold, then ramp
    gain.linearRampToValueAtTime(targetValue, from + duration);
    track.gainRamp = { startValue, startTime: from, endValue: targetValue, endTime: from + duration };
    if (onComplete) {
        track.fadeTimerId = setTimeout(() => {
            track.fadeTimerId = null;
            onComplete();
        }, (from - now + duration) * 1000);
    }
}

// A track that hasn't scheduled its first buffer yet is silent and has no
// fade running, so volume changes must leave it alone: its fade-in reads the
// current volume when it finally starts.
function hasStarted(track) {
    return track.startTime !== null;
}

/* ---------- Track selection ---------- */

function pickRandomTrack() {
    const available = MUSIC_TRACKS.filter((track) => !playingTracks.has(track));
    if (available.length === 0) return null;
    return available[Math.floor(Math.random() * available.length)];
}

/* ---------- Track lifecycle ---------- */

function createTrack(src) {
    const ctx = getAudioContext();
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0;
    gainNode.connect(getMasterGain());

    return {
        src,
        gainNode,
        gainRamp: { startValue: 0, startTime: 0, endValue: 0, endTime: 0 },
        fadeTimerId: null,

        decoder: null,
        decoderReady: false,
        reader: null,
        queue: [],            // compressed chunks received but not yet decoded
        allChunks: [],        // every compressed chunk, kept only until the duration is measured
        receivedBytes: 0,
        consumedBytes: 0,
        totalBytes: null,     // from Content-Length, when the server sends it
        downloadDone: false,
        decodeDone: false,

        sampleRate: null,
        channels: null,
        pcm: [],              // decoded channel arrays waiting to be batched into a buffer
        pcmSamples: 0,
        startTime: null,      // audio-clock time the track's first sample sounds
        scheduledSamples: 0,
        sources: new Set(),

        fadeInDuration: FADE_IN_DURATION,
        duration: null,       // exact, once the download finishes
        triggeredNext: false,
        failed: false,
        forgotten: false,
    };
}

// Removes a track's bookkeeping and tears it all the way down: cancels the
// download, stops and disconnects every scheduled buffer, disconnects its
// gain node, and frees the decoder's WASM memory. Used for a normal end, a
// prune, and a failure alike.
// `quiet` skips filling the freed slot — used when the whole cascade is
// being torn down at once (an AudioContext rebuild), where the restart is
// handled in one go afterwards instead of per-track.
function forgetTrack(track, quiet) {
    if (track.forgotten) return;
    track.forgotten = true;

    playingTracks.delete(track.src);
    activeTracks.delete(track);
    removeActiveTrackName(track.src);

    if (track.fadeTimerId) {
        clearTimeout(track.fadeTimerId);
        track.fadeTimerId = null;
    }
    if (track.reader) track.reader.cancel().catch(() => {});
    // Silence first: a value write is the one teardown step that still works
    // on a context the OS has interrupted, where the stop()/disconnect()
    // calls below can fail without saying so.
    try {
        track.gainNode.gain.cancelScheduledValues(0);
        track.gainNode.gain.value = 0;
    } catch (e) { /* context gone */ }
    track.sources.forEach((source) => {
        source.onended = null;
        // These nodes may belong to a context that has already been closed
        // (see the rebuild handler below), where every call throws.
        try { source.stop(); } catch (e) { /* already stopped */ }
        try { source.disconnect(); } catch (e) { /* context gone */ }
    });
    track.sources.clear();
    try { track.gainNode.disconnect(); } catch (e) { /* context gone */ }
    if (track.decoder && track.decoderReady) {
        try { track.decoder.free(); } catch (e) { /* already freed */ }
    }
    track.decoder = null;
    track.queue = [];
    track.allChunks = [];
    track.pcm = [];

    // A slot just opened up — if a cascade trigger was deferred while the
    // cap was full, honor it now rather than waiting on the 60s watchdog.
    if (!quiet && pendingStarts > 0 && musicStarted) {
        pendingStarts -= 1;
        startNextTrack();
    }
}

// One retry per actual failure, regardless of how many signals report it
// (a fetch error, a decode error, a file that produced no audio at all).
function handleFailure(track, reason) {
    if (track.failed || track.forgotten) return;
    track.failed = true;
    console.warn(`Music: ${track.src} failed (${reason}); trying another track.`);
    forgetTrack(track);
    startNextTrack();
}

function handleEnded(track) {
    forgetTrack(track);
}

function playTrack(src, fadeInDuration) {
    playingTracks.add(src);
    const track = createTrack(src);
    activeTracks.add(track);
    addActiveTrackName(src);
    track.fadeInDuration = fadeInDuration || FADE_IN_DURATION;
    startStreaming(track).catch((err) => handleFailure(track, err && err.message ? err.message : String(err)));
}

async function startStreaming(track) {
    const Decoder = getDecoderClass();
    if (!Decoder) throw new Error('mp3 decoder library not loaded');

    track.decoder = new Decoder();
    await track.decoder.ready;
    if (track.forgotten) return;
    track.decoderReady = true;

    const response = await fetch(track.src);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (track.forgotten) return;
    const length = Number(response.headers.get('Content-Length'));
    track.totalBytes = Number.isFinite(length) && length > 0 ? length : null;

    const reader = response.body.getReader();
    track.reader = reader;
    for (;;) {
        const { done, value } = await reader.read();
        if (track.forgotten) return;
        if (done) break;
        track.receivedBytes += value.length;
        track.allChunks.push(value);
        // Slice big deliveries (e.g. a whole file straight out of the cache)
        // so one decode call can't produce a huge buffer.
        for (let offset = 0; offset < value.length; offset += DECODE_CHUNK_BYTES) {
            track.queue.push(value.subarray(offset, Math.min(offset + DECODE_CHUNK_BYTES, value.length)));
        }
        pumpTrack(track);
    }
    track.reader = null;
    track.downloadDone = true;
    if (track.totalBytes === null) track.totalBytes = track.receivedBytes;

    // Exact duration from the frame headers, now that the whole file is here.
    const whole = new Uint8Array(track.receivedBytes);
    let offset = 0;
    track.allChunks.forEach((chunk) => { whole.set(chunk, offset); offset += chunk.length; });
    track.allChunks = [];
    const duration = mp3Duration(whole);
    if (duration) track.duration = duration;
    pumpTrack(track);
}

// Seconds of audio already scheduled beyond the playhead.
function secondsAhead(track) {
    if (track.startTime === null) return 0;
    return track.startTime + track.scheduledSamples / track.sampleRate - getAudioContext().currentTime;
}

// Decodes as far ahead as DECODE_AHEAD allows, batches the decoded audio into
// ~BUFFER_SECONDS buffers, and schedules each one sample-accurately after the
// last. Called whenever new bytes arrive and from the scheduler tick.
function pumpTrack(track) {
    if (track.forgotten || track.failed || !track.decoderReady) return;

    while (track.queue.length > 0 && secondsAhead(track) + track.pcmSamples / (track.sampleRate || 48000) < DECODE_AHEAD) {
        const chunk = track.queue.shift();
        track.consumedBytes += chunk.length;
        let decoded;
        try {
            decoded = track.decoder.decode(chunk);
        } catch (err) {
            handleFailure(track, `decode error: ${err && err.message ? err.message : err}`);
            return;
        }
        if (!decoded || !decoded.samplesDecoded) continue;
        if (track.sampleRate === null) {
            track.sampleRate = decoded.sampleRate;
            track.channels = decoded.channelData.length;
        }
        track.pcm.push(decoded.channelData.map((data) => data.slice()));
        track.pcmSamples += decoded.samplesDecoded;
        if (track.pcmSamples >= BUFFER_SECONDS * track.sampleRate) flushPcm(track);
    }

    if (track.downloadDone && track.queue.length === 0 && !track.decodeDone) {
        track.decodeDone = true;
        flushPcm(track);
        if (track.scheduledSamples === 0) {
            handleFailure(track, 'no audio decoded');
            return;
        }
        if (track.sources.size === 0) handleEnded(track);
    }
}

function flushPcm(track) {
    if (track.pcmSamples === 0) return;
    const ctx = getAudioContext();
    const buffer = ctx.createBuffer(track.channels, track.pcmSamples, track.sampleRate);
    for (let ch = 0; ch < track.channels; ch++) {
        const channel = buffer.getChannelData(ch);
        let offset = 0;
        track.pcm.forEach((piece) => {
            channel.set(piece[ch], offset);
            offset += piece[ch].length;
        });
    }
    track.pcm = [];
    const samples = track.pcmSamples;
    track.pcmSamples = 0;

    if (track.startTime === null) {
        track.startTime = ctx.currentTime + START_LEAD;
        // Start the fade-in exactly when the first sample sounds. Anchoring
        // it to track creation instead meant the gain had already climbed
        // during the download and decode, so the mp3 decoder's first-frames
        // warm-up (a few tens of milliseconds of noise before the bit
        // reservoir is primed) played at audible volume — a split-second
        // burst on the iPad, where fetching a few MB takes real time. On a
        // local desktop server the delay was too short to hear.
        fadeGain(track, musicVolume, track.fadeInDuration, null, track.startTime);
    }
    let when = track.startTime + track.scheduledSamples / track.sampleRate;
    if (when < ctx.currentTime) {
        // Underrun (the network fell behind playback): shift the track's
        // timeline forward so this and every later buffer stay contiguous.
        track.startTime += ctx.currentTime + START_LEAD - when;
        when = ctx.currentTime + START_LEAD;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(track.gainNode);
    source.onended = () => {
        source.disconnect();
        track.sources.delete(source);
        if (track.decodeDone && track.sources.size === 0 && !track.forgotten) handleEnded(track);
    };
    source.start(when);
    track.sources.add(source);
    track.scheduledSamples += samples;
}

// Where the track is, as a fraction of its length: exact once the download
// has finished, otherwise estimated from how many seconds the bytes consumed
// so far decoded to, scaled up to the file size.
function trackProgress(track) {
    if (track.startTime === null || !track.sampleRate) return 0;
    const position = getAudioContext().currentTime - track.startTime;
    let duration = track.duration;
    if (duration === null) {
        if (!track.totalBytes || track.consumedBytes === 0) return 0;
        duration = (track.scheduledSamples + track.pcmSamples) / track.sampleRate * track.totalBytes / track.consumedBytes;
    }
    return duration > 0 ? position / duration : 0;
}

/* ---------- Scheduler ---------- */

setInterval(() => {
    activeTracks.forEach((track) => {
        pumpTrack(track);
        if (!track.triggeredNext && !track.forgotten && trackProgress(track) >= TRIGGER_PROGRESS) {
            track.triggeredNext = true;
            startNextTrack();
        }
    });
}, SCHEDULER_INTERVAL);

/* ---------- Cascade control ---------- */

// The single place the concurrency cap is enforced: when the cap is full,
// the request is queued (bounded, so a burst of triggers can't stack up an
// endless backlog) and forgetTrack() drains it as slots free up.
function startNextTrack() {
    // Never start a track the user can't hear. After a context rebuild the
    // cascade sits empty until iOS lets audio run again, and without this
    // the watchdog below would seed silent phantom tracks into a suspended
    // context — which then showed up alongside the real pair once sound
    // returned (one track listed, then three).
    if (!isAudioRunning()) return;
    if (activeTracks.size >= MAX_CONCURRENT_TRACKS) {
        pendingStarts = Math.min(pendingStarts + 1, MAX_CONCURRENT_TRACKS);
        return;
    }
    const src = pickRandomTrack();
    if (src) playTrack(src);
}

function removeRandomActiveTrack(duration) {
    const activeList = Array.from(activeTracks);
    if (activeList.length === 0) return;
    const track = activeList[Math.floor(Math.random() * activeList.length)];
    fadeGain(track, 0, duration, () => forgetTrack(track));
}

/* ---------- Concurrency watchdog ---------- */
/* Restarts the cascade if it ever dropped to zero. The prune branch is only
   a backstop — startNextTrack() enforces the cap up front, so the count
   shouldn't be able to drift above MAX_CONCURRENT_TRACKS in the first place. */

setInterval(() => {
    if (activeTracks.size > MAX_CONCURRENT_TRACKS) {
        removeRandomActiveTrack(PRUNE_FADE_DURATION);
    } else if (activeTracks.size === 0 && musicStarted && musicVolume > 0) {
        startNextTrack();
    }
}, PRUNE_CHECK_INTERVAL);

/* ---------- Pause while backgrounded ---------- */
/* The Page Visibility API is the standard, reliable signal for "the user can
   no longer see or hear this tab" (tab switches, app switches, minimizing),
   unlike window blur/focus, which also fires for things like clicking the
   address bar while the page stays fully visible. On hide: fade everything
   out, then suspend the shared context so the audio clock stops and every
   scheduled buffer holds its place. On show: resume the context and fade
   back in — but never past the user's own volume setting.

   Switching apps on iPadOS is different from switching tabs: the OS
   interrupts the audio session immediately, so the 3s fade-out gets cut
   short (the audio thread stops before the ramp can finish — nothing here
   can outrun that), and the context never really recovers afterwards. On
   return, ensureAudioContextHealthy() replaces it, which tears this cascade
   down and starts a fresh one; only tracks that survive an ordinary tab
   switch get faded back up here. */

let backgroundedForVisibility = false;
let suspendTimerId = null;

function handleVisibilityChange() {
    if (document.hidden) {
        if (backgroundedForVisibility || !musicStarted) return;
        backgroundedForVisibility = true;
        activeTracks.forEach((track) => {
            if (hasStarted(track)) fadeGain(track, 0, BACKGROUND_FADE_DURATION);
        });
        suspendTimerId = setTimeout(() => {
            suspendTimerId = null;
            // Only suspend a context that's actually running. On iOS the OS
            // has usually already interrupted it by this point, and
            // suspending on top of an interruption is a known way to end up
            // with a context that never resumes again.
            const ctx = getAudioContext();
            if (ctx.state === 'running') ctx.suspend().catch(() => {});
        }, BACKGROUND_FADE_DURATION * 1000);
    } else {
        // The health check runs whenever the page comes back with audio in
        // use — not only when the music was faded out. The sound effects
        // share this context, and an iOS interruption kills them too, so
        // this has to run even if the music is muted or the cascade is
        // empty. (musicStarted is set by the same "Play Game" click that
        // unlocks the context, so before that there's no audio to lose.)
        if (!musicStarted) return;
        const wasBackgrounded = backgroundedForVisibility;
        backgroundedForVisibility = false;
        if (suspendTimerId) { // came back mid-fade: never suspend a visible tab
            clearTimeout(suspendTimerId);
            suspendTimerId = null;
        }
        // Fade the current tracks straight back up. On an ordinary tab
        // switch they're still there and this is all that's needed; after an
        // iOS interruption the health check below discards them and the
        // rebuild handler starts a fresh pair once audio is really flowing.
        if (wasBackgrounded) {
            activeTracks.forEach((track) => {
                if (hasStarted(track)) fadeGain(track, musicVolume, BACKGROUND_FADE_DURATION);
            });
        }
        ensureAudioContextHealthy();
    }
}

document.addEventListener('visibilitychange', handleVisibilityChange);

/* ---------- Recovering from an AudioContext rebuild ---------- */
/* After an iOS interruption the shared context is replaced wholesale (see
   audioContext.js), which invalidates every gain node and scheduled buffer
   the cascade owns. There's nothing to salvage — the tracks are torn down
   and a fresh pair is started on the new context, so coming back from
   another app fades the music in again from the beginning of two new
   tracks. */

onAudioContextRebuild({
    teardown: () => {
        Array.from(activeTracks).forEach((track) => forgetTrack(track, true));
        activeTracks.clear();
        playingTracks.clear();
        activeTrackNames.length = 0;
        renderActiveTrackNames();
        pendingStarts = 0;
    },
    restart: () => {
        if (!musicStarted || musicVolume <= 0) return;
        startNextTrack();
        startNextTrack();
    },
});

/* ---------- Public API ---------- */

// Starts the background music: two tracks begin together (rather than the
// usual one), then the cascade takes over from there. Call this from inside
// a user-gesture handler (e.g. the "Play Game" click) so the browser's
// autoplay policy allows playback — this resumes the shared AudioContext,
// which iOS/Safari otherwise leaves suspended until a user gesture. No-op if
// music is already running; if the stored volume is 0, nothing starts until
// the volume is raised (see setMusicVolume).
export function startMusic() {
    if (musicStarted) return;
    musicStarted = true;
    unlockAudioContext();
    if (!getDecoderClass()) {
        console.error('Music: mpg123-decoder failed to load; background music is unavailable.');
        return;
    }
    if (musicVolume <= 0) return;
    // startNextTrack() refuses to start anything the user can't hear, so
    // wait for the resume this gesture allows before seeding the cascade.
    unlockAudioContext().then(() => {
        startNextTrack();
        startNextTrack();
    });
}

export function getMusicVolume() {
    return musicVolume;
}

// Sets the shared music volume (0-1), persists it, and re-targets whatever's
// currently playing. At 0 the tracks keep running silently so the mix is
// continuous when the volume comes back; if nothing is playing yet (muted
// before "Play Game" was clicked, or the cascade had run dry), raising the
// volume from 0 starts the cascade the same way it began.
export function setMusicVolume(volume) {
    const clamped = Math.min(1, Math.max(0, volume));
    const wasZero = musicVolume <= 0;
    musicVolume = clamped;
    localStorage.setItem(VOLUME_KEY, String(clamped));

    activeTracks.forEach((track) => {
        if (hasStarted(track)) fadeGain(track, clamped, VOLUME_CHANGE_DURATION);
    });

    if (wasZero && clamped > 0 && activeTracks.size === 0 && musicStarted && getDecoderClass()) {
        // Raising the slider is a user gesture, so this is a good moment to
        // get the context running if it isn't.
        unlockAudioContext().then(() => {
            startNextTrack();
            startNextTrack();
        });
    }
}

// Wires the intro and menu volume sliders: syncs both to the stored volume on
// load, and keeps them in lockstep with each other (and with localStorage)
// whenever either one is moved.
export function initVolumeSlider() {
    // Every music slider on the page — the intro overlay, the menu, and the
    // resume overlay — queried by class so a new one is picked up without
    // editing this list.
    const sliders = Array.from(document.querySelectorAll('.volume-slider'));

    sliders.forEach((slider) => {
        slider.value = String(Math.round(musicVolume * 100));
        slider.addEventListener('input', () => {
            setMusicVolume(Number(slider.value) / 100);
            sliders.forEach((other) => {
                if (other !== slider) other.value = slider.value;
            });
        });
    });
}
```

## 8. iOS interruptions — the app-switch bug (read this one carefully)

This was found *after* the streaming engine was already working on the iPad, and it will hit any iOS site that uses Web Audio.

**Symptom.** Switching Safari tabs fades out and back in correctly. Switching to a **different app** cuts the audio abruptly and, on return, *nothing* plays again — not the music, not any other sound sharing the context — until the page is reloaded. The tab's "audio playing" indicator comes back on and stays on, even with the volume control at zero, while total silence continues.

**Cause.** An app switch on iPadOS does not suspend the AudioContext. The OS interrupts the audio session, and WebKit reports that as its own non-standard state:

```
ctx.state === 'interrupted'     // not 'suspended', not 'running'
```

Two separate mistakes follow from this, and the first one hides the second:

1. An unlock helper written as `if (ctx.state === 'suspended') ctx.resume()` never fires at all, because the state is `'interrupted'`.
2. **Fixing that is not enough.** The context can be resumed back to `'running'` and still render nothing, forever. It holds the audio session — hence the stuck tab indicator — and produces no samples, not even from a brand-new one-shot `AudioBufferSourceNode`. Reloading the page is the only cure, which is the tell: **only a new AudioContext recovers.**

The clinching diagnostic, if you ever need to confirm it: play a one-shot sound effect after returning. It builds a fresh source node on the same context, so if it is silent too, the context itself is dead and nothing you do to your source graph will matter.

**Fix — throw the context away and build a new one:**

1. **Detect it.** On returning to visibility, rebuild if an interruption was recorded (set a flag from a `statechange` listener when the state is neither `'running'` nor `'suspended'`). Also catch the case where no `statechange` arrived, by checking that the context's clock is actually advancing:
   ```js
   const before = ctx.currentTime;
   setTimeout(() => { const alive = ctx.state === 'running' && ctx.currentTime > before; }, 350);
   ```
2. **Rebuild.** Tear down every node your modules hold *while the outgoing context is still open*, then `close()` it (iOS allows only a handful of contexts per page, so the old one must genuinely be released), build a new one, resume it, and let each module re-establish what it was playing. Give it a cooldown (~5 s) so a genuinely unavailable output device can't cause a rebuild loop.
3. **Fall back to a user gesture.** iOS does not reliably grant a resume outside a gesture. If recovery doesn't take, arm one-shot capture-phase, passive listeners on `pointerdown`, `touchend`, `click` and `keydown` that retry and, if a real tap still can't get sound out, rebuild. Disarm from a `statechange` listener once the state reaches `'running'`.
4. **Never suspend an already-interrupted context.** Guard any deferred hide-suspend with `if (ctx.state === 'running')`.
5. **Run the health check whenever the page returns with audio in use**, not only when music was playing. Anything sharing the context — sound effects especially — dies with it.

Full implementation in the `audioContext.js` source in §7, with the music engine's `onAudioContextRebuild` handler showing how a module re-establishes itself.

**Anchor a track's fade-in to the moment its audio actually starts**, not to when you create the track object. With a streaming decoder there are seconds between the two — the fetch plus the first decode — and the fade is what masks the mp3 decoder's warm-up, the few tens of milliseconds of garbage every mp3 decoder emits before its bit reservoir is primed. Start the ramp early and that warm-up plays at whatever volume the fade has already reached: an audible burst of noise at the start of every track on a real network, and completely invisible when testing against a local server. Schedule the ramp with a future start time (`setValueAtTime` at now, again at the start time, then `linearRampToValueAtTime`) and hold the gain at zero until then.

**Never start a sound while the context isn't running.** Anything that can start audio on a timer — a watchdog that restarts an empty cascade, a retry, a volume change — must check first. A suspended or not-yet-unlocked context accepts scheduled audio and plays none of it, so these paths quietly accumulate silent tracks that then appear alongside the real ones when sound finally returns. This bit twice here: once through the rebuild's restart handler, once through the 60-second watchdog.

**Two details that decide whether the handover feels right:**

* **Retry the resume; don't assume one attempt.** Coming back to the app doesn't mean iOS has released the audio session yet, so a single `resume()` at `visibilitychange` time usually fails and the page sits silent until the user happens to tap something. Retrying on a short backoff (0/150/400/900/1600 ms, each followed by the clock verification above) gets audio going on its own in most cases. Keep the gesture retry as the last resort.
* **Don't restart anything until audio is confirmed flowing.** Tell modules to rebuild their graphs only once the clock is actually advancing. Starting them against a still-suspended context makes the page claim to be playing music nobody can hear — and if your gesture retry also rebuilds on a failed state check, the first tap discards the context it was in the middle of unlocking and restarts everything a second time. Both of those were real bugs here, visible as a now-playing list showing tracks during total silence and then showing a different pair once sound arrived.

**One consequence to accept:** you cannot resume tracks that lived on the destroyed context, so returning from another app restarts the music with fresh tracks. An ordinary tab switch still resumes exactly where it was. For meaddesign this means the cascade begins again with a new random pick, which for ambient background music is unobjectionable.

**Route everything through one master gain, and cut it with a value write.** On an interrupted iOS context, `source.stop()` and `disconnect()` can fail — and if you have wrapped them in `try`/`catch` because the context might be closed (you should), the failure is invisible. `close()` on an interrupted context also doesn't take effect until the audio session comes back, so the moment it does, everything still scheduled gets one last chance to play: heard as a split second of the previous tracks the instant the user does whatever restores audio. Writing `masterGain.gain.value = 0` is a value write on a node that is already in the graph, and it survives what disconnection doesn't. Silence first, then tear down, then close.

**Take the audio with you when the page unloads.** The iOS audio session outlives the document briefly during a reload, so a context left playing can bleed a fragment of the old page's music into the new one. Add a `pagehide` listener that silences unconditionally and closes the context — but skip the close when `event.persisted` is true, since that means the page is entering the back/forward cache and may be restored intact; un-silence from `pageshow` in that case.

**Consider a "resume" button rather than relying on the automatic retries.** In practice, on a real iPad, the ungestured resume never succeeded once across many rounds of testing — the retries are worth keeping as a free win, but the reliable path is a deliberate user gesture. fortythieves shows a small overlay (styled like its intro panel, carrying the sound and volume controls too) when the page has been visible for ~1.2 s and audio still isn't running; its button's click is the gesture. It polls and dismisses itself if audio returns on its own, and because the condition is "audio isn't running", it never appears on desktop and needs no device detection. See `js/resumeOverlay.js` in the fortythieves project.

**What can't be fixed: the abrupt fade-out on app switch.** iPadOS interrupts the session essentially the moment Safari backgrounds, which stops the audio thread, so a 3-second `linearRampToValueAtTime` cannot finish and no JS can outrun it. Media elements *do* fade out here, because they get their own AVAudioSession that keeps running briefly into the background — the one thing the old `<audio>` approach did better. Keeping it would mean putting a media element back in the picture (a silent looping `<audio>` keep-alive is the usual trick), which reintroduces exactly the object that caused the original iPad failures. A clean fade-in on return makes the cut read as intentional.

**Testing it without an iPad.** Chrome has no `'interrupted'` state, so shadow the instance getters and drive the events by hand:

```js
const sDesc = Object.getOwnPropertyDescriptor(AudioContext.prototype, 'state');
const tDesc = Object.getOwnPropertyDescriptor(AudioContext.prototype, 'currentTime');
Object.defineProperty(ctx, 'state', { configurable: true, get: () => window.__fakeState || sDesc.get.call(ctx) });
Object.defineProperty(ctx, 'currentTime', { configurable: true, get: () => window.__frozen ?? tDesc.get.call(ctx) });
window.__fakeState = 'interrupted';
ctx.dispatchEvent(new Event('statechange'));
document.dispatchEvent(new Event('visibilitychange'));   // with document.hidden faked
```

Then assert that a *new* context was constructed, that the old one was closed, and — the real proof — that a sound effect played afterwards creates its source node on the new context. **Scope the shims to one specific context instance**, not "whichever is newest": a shim that follows the newest context will leak onto the rebuilt one and make a healthy result look like a stalled fade.

## 9. How it was tested (so meaddesign can be tested the same way)

Headless Chrome driven over the DevTools Protocol (see fortythieves `PROGRESS.md` for the harness). The useful tricks:

- Wrap `window.Audio` to count constructions — the engine must create **zero**.
- Wrap `AudioBufferSourceNode.prototype.start` to record `(when, buffer.duration)` for every buffer, then check that every non-head buffer's `when` equals some earlier buffer's `when + duration` within 1 µs.
- `import('/audio.js')`-style dynamic import of the page's own module returns the same module instance, so an exported track array can be spliced down to the three shortest files (61 s, 63 s, 82 s) to fit a whole cascade cycle — start, one-third trigger, natural end, replacement — into about 100 seconds.
- Fake `document.hidden` and dispatch `visibilitychange` to exercise the suspend/resume path; check `ctx.state`.
- Clear `localStorage` in a pre-navigation injected script, or a muted setting from one run leaks into the next.

Confirmed on the iPad after deploying: three tracks, no stutter, no hang. The app-switch interruption bug in §8 was found afterwards and is fixed in the source above.
