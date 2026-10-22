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

/* ---------- Console log of tracks in the rotation ---------- */
/* Lets Bill watch which files the random cascade picks, to help decide which
   to keep, without anything on screen. */

function trackBasename(src) {
    return src.split('/').pop();
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
    console.log(`Music: removing track ${trackBasename(track.src)}`);

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
    console.log(`Music: starting track ${trackBasename(src)}`);
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
