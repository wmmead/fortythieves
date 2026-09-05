// Background music engine, modeled on meaddesign/audio.js: tracks are picked
// at random and layered in a cascade — once a playing track is a third of the
// way through, the next random track fades in alongside it, and so on
// indefinitely. Unlike the meaddesign version there's no skip control exposed,
// only a shared volume slider (see initVolumeSlider below).
import { MUSIC_TRACKS } from './musicTracks.js';
/* global gsap */ // gsap is loaded as a global via the <script> tag in index.html

/* ---------- Tuning constants ---------- */

const FADE_IN_DURATION = 5;         // seconds, a new track's fade-in
const TRIGGER_PROGRESS = 1 / 3;     // start the next track once the current one is this far through
const MAX_CONCURRENT_TRACKS = 3;    // safety cap so the cascade can't stack indefinitely
const PRUNE_FADE_DURATION = 2;
const PRUNE_CHECK_INTERVAL = 60000;
const VOLUME_CHANGE_DURATION = 0.3; // seconds, re-targeting already-playing tracks to a new volume
const BACKGROUND_FADE_DURATION = 3; // seconds, fading out/in when the tab is hidden/shown
const VOLUME_KEY = 'musicVolume';
const DEFAULT_VOLUME = 0.75;

/* ---------- Playback state ---------- */

const playingTracks = new Set();      // track src strings currently playing or fading out
const activeAudioElements = new Set(); // live Audio elements
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

/* ---------- Track selection / playback core ---------- */

function pickRandomTrack() {
    const available = MUSIC_TRACKS.filter((track) => !playingTracks.has(track));
    if (available.length === 0) return null;
    return available[Math.floor(Math.random() * available.length)];
}

// Removes a track's bookkeeping (used for both a normal end-of-track and a
// failed one — see playTrack's error handling below).
function forgetTrack(src, audio) {
    playingTracks.delete(src);
    activeAudioElements.delete(audio);
    removeActiveTrackName(src);
}

function playTrack(src, fadeInDuration) {
    playingTracks.add(src);

    const audio = new Audio(src);
    audio.trackSrc = src;
    audio.volume = 0;
    activeAudioElements.add(audio);
    addActiveTrackName(src);

    let triggeredNext = false;
    audio.addEventListener('timeupdate', () => {
        if (!triggeredNext && audio.duration && audio.currentTime / audio.duration >= TRIGGER_PROGRESS) {
            triggeredNext = true;
            startNextTrack();
        }
    });

    audio.addEventListener('ended', () => {
        forgetTrack(src, audio);
    });

    // A track that fails to play (rejected play() promise, or a genuine
    // media 'error' event — a network hiccup, a decode failure, anything)
    // used to just sit there silently forever: it was never removed from
    // playingTracks/activeAudioElements, so it permanently occupied a slot.
    // Once the other real tracks finished naturally, activeAudioElements
    // never dropped back to 0, so the watchdog below never noticed the
    // cascade had effectively died and never restarted it — music went
    // silent for the rest of the game. Cleaning up here, and immediately
    // trying a replacement, closes that gap.
    audio.addEventListener('error', () => {
        forgetTrack(src, audio);
        startNextTrack();
    });

    audio.play().catch(() => {
        forgetTrack(src, audio);
        startNextTrack();
    });
    gsap.to(audio, { volume: musicVolume, duration: fadeInDuration || FADE_IN_DURATION });
}

// No-ops when muted (volume 0) — the single choke point every track start
// goes through, so the cascade trigger, the watchdog restart, and startMusic()
// all automatically stay silent without each needing its own volume check.
function startNextTrack() {
    if (musicVolume <= 0) return;
    const track = pickRandomTrack();
    if (track) playTrack(track);
}

function removeRandomActiveTrack(duration) {
    const activeList = Array.from(activeAudioElements);
    if (activeList.length === 0) return;

    const audio = activeList[Math.floor(Math.random() * activeList.length)];
    const src = audio.trackSrc;
    gsap.to(audio, {
        volume: 0,
        duration,
        onComplete: () => {
            audio.pause();
            forgetTrack(src, audio);
        }
    });
}

// Pauses every currently-active track in place (rather than discarding it) so
// unmuting can simply resume the same elements. Resuming an element that has
// already played once is reliably allowed by the browser's autoplay policy;
// creating and playing brand-new Audio elements on unmute was not always —
// that's what made the music intermittently fail to come back.
function pauseAllTracks() {
    activeAudioElements.forEach((audio) => {
        gsap.killTweensOf(audio);
        audio.pause();
    });
}

function resumeAllTracks(targetVolume, duration = VOLUME_CHANGE_DURATION) {
    activeAudioElements.forEach((audio) => {
        audio.play().catch(() => {});
        gsap.to(audio, { volume: targetVolume, duration });
    });
}

// GSAP's ticker runs on requestAnimationFrame, which browsers stop invoking
// entirely while a tab is hidden. A gsap.to() fade started right as the tab
// backgrounds would freeze mid-tween — volume never actually drops, so the
// audio just keeps playing — and then, once the tab is visible again and rAF
// resumes, GSAP sees a huge elapsed-time jump since its last tick and treats
// the tween as instantly finished: it snaps straight to the end value and
// fires its onComplete right away, which sounds like an abrupt cut with no
// fade. setInterval keeps firing (throttled, but not suspended) in a
// background tab, so the two fades tied to backgrounding use this manual,
// real-elapsed-time ramp instead of GSAP.
function manualFadeVolume(audio, targetVolume, duration, onComplete) {
    if (audio.fadeIntervalId) {
        clearInterval(audio.fadeIntervalId);
        audio.fadeIntervalId = null;
    }
    const startVolume = audio.volume;
    const startTime = performance.now();
    const durationMs = duration * 1000;

    audio.fadeIntervalId = setInterval(() => {
        const t = Math.min(1, (performance.now() - startTime) / durationMs);
        audio.volume = startVolume + (targetVolume - startVolume) * t;
        if (t >= 1) {
            clearInterval(audio.fadeIntervalId);
            audio.fadeIntervalId = null;
            if (onComplete) onComplete();
        }
    }, 100);
}

// Gracefully fades every active track to silence, then pauses it in place
// (same "pause, don't discard" reasoning as pauseAllTracks — see above).
function fadeOutAllTracks(duration) {
    activeAudioElements.forEach((audio) => {
        gsap.killTweensOf(audio); // in case a gsap-driven fade was mid-flight
        manualFadeVolume(audio, 0, duration, () => audio.pause());
    });
}

function resumeAllTracksFromBackground(targetVolume, duration) {
    activeAudioElements.forEach((audio) => {
        audio.play().catch(() => {});
        manualFadeVolume(audio, targetVolume, duration, null);
    });
}

/* ---------- Concurrency watchdog ---------- */
/* Keeps the cascade within bounds: trims if it drifted above
   MAX_CONCURRENT_TRACKS, restarts it if it ever dropped to zero. */

setInterval(() => {
    if (activeAudioElements.size > MAX_CONCURRENT_TRACKS) {
        removeRandomActiveTrack(PRUNE_FADE_DURATION);
    } else if (activeAudioElements.size === 0 && musicStarted) {
        startNextTrack();
    }
}, PRUNE_CHECK_INTERVAL);

/* ---------- Pause while backgrounded ---------- */
/* iOS Safari (and other browsers) keep <audio>/Web Audio playing even after
   the user leaves the tab for another app — the Page Visibility API is the
   standard, reliable signal for "the user can no longer see or hear this
   tab" (tab switches, app switches, minimizing), unlike window blur/focus,
   which also fires for things like clicking the address bar while the page
   stays fully visible. Fades out on hide, fades back in on return — but
   never past whatever the user's own volume setting already was. */

let backgroundedForVisibility = false;

function handleVisibilityChange() {
    if (document.hidden) {
        if (backgroundedForVisibility || musicVolume <= 0) return;
        backgroundedForVisibility = true;
        fadeOutAllTracks(BACKGROUND_FADE_DURATION);
    } else {
        if (!backgroundedForVisibility) return;
        backgroundedForVisibility = false;
        if (musicVolume <= 0) return; // respect an explicit mute set elsewhere
        resumeAllTracksFromBackground(musicVolume, BACKGROUND_FADE_DURATION);
    }
}

document.addEventListener('visibilitychange', handleVisibilityChange);

/* ---------- Public API ---------- */

// Starts the background music: two tracks begin together (rather than the
// usual one), then the cascade takes over from there. Call this from inside
// a user-gesture handler (e.g. the "Play Game" click) so the browser's
// autoplay policy allows playback. No-op if music is already running; also a
// no-op (until the volume is raised) if the stored volume is 0.
export function startMusic() {
    if (musicStarted) return;
    musicStarted = true;
    startNextTrack();
    startNextTrack();
}

export function getMusicVolume() {
    return musicVolume;
}

// Sets the shared music volume (0-1), persists it, and re-targets whatever's
// currently playing. Dropping to 0 pauses every track in place (so no
// bandwidth goes to unheard audio) rather than discarding it; raising it back
// up from 0 resumes those same paused tracks, or — if nothing was playing yet
// (e.g. muted before "Play Game" was even clicked) — starts the cascade the
// same way it began, once the game is underway.
export function setMusicVolume(volume) {
    const clamped = Math.min(1, Math.max(0, volume));
    const wasZero = musicVolume <= 0;
    musicVolume = clamped;
    localStorage.setItem(VOLUME_KEY, String(clamped));

    if (clamped <= 0) {
        pauseAllTracks();
        return;
    }

    if (wasZero) {
        resumeAllTracks(clamped);
        if (activeAudioElements.size === 0 && musicStarted) {
            startNextTrack();
            startNextTrack();
        }
        return;
    }

    activeAudioElements.forEach((audio) => {
        gsap.to(audio, { volume: clamped, duration: VOLUME_CHANGE_DURATION });
    });
}

// Wires the intro and menu volume sliders: syncs both to the stored volume on
// load, and keeps them in lockstep with each other (and with localStorage)
// whenever either one is moved.
export function initVolumeSlider() {
    const sliders = [
        document.getElementById('music-volume-intro'),
        document.getElementById('music-volume-menu'),
    ].filter(Boolean);

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
