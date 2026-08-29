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
const VOLUME_KEY = 'musicVolume';
const DEFAULT_VOLUME = 0.75;

/* ---------- Playback state ---------- */

const playingTracks = new Set();      // track src strings currently playing or fading out
const activeAudioElements = new Set(); // live Audio elements
let musicStarted = false;
let musicVolume = loadVolume();

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

function playTrack(src, fadeInDuration) {
    playingTracks.add(src);

    const audio = new Audio(src);
    audio.trackSrc = src;
    audio.volume = 0;
    activeAudioElements.add(audio);

    let triggeredNext = false;
    audio.addEventListener('timeupdate', () => {
        if (!triggeredNext && audio.duration && audio.currentTime / audio.duration >= TRIGGER_PROGRESS) {
            triggeredNext = true;
            startNextTrack();
        }
    });

    audio.addEventListener('ended', () => {
        playingTracks.delete(src);
        activeAudioElements.delete(audio);
    });

    audio.play().catch(() => {});
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
            playingTracks.delete(src);
            activeAudioElements.delete(audio);
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

function resumeAllTracks(targetVolume) {
    activeAudioElements.forEach((audio) => {
        audio.play().catch(() => {});
        gsap.to(audio, { volume: targetVolume, duration: VOLUME_CHANGE_DURATION });
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
