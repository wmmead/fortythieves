// Background music engine, modeled on meaddesign/audio.js: tracks are picked
// at random and layered in a cascade — once a playing track is a third of the
// way through, the next random track fades in alongside it, and so on
// indefinitely. Unlike the meaddesign version there's no player UI; the game
// picks and layers tracks on its own, with no volume/skip controls exposed.
import { MUSIC_TRACKS } from './musicTracks.js';
/* global gsap */ // gsap is loaded as a global via the <script> tag in index.html

/* ---------- Tuning constants ---------- */

const FADE_IN_DURATION = 5;        // seconds, a new track's fade-in
const TRIGGER_PROGRESS = 1 / 3;    // start the next track once the current one is this far through
const MAX_CONCURRENT_TRACKS = 3;   // safety cap so the cascade can't stack indefinitely
const PRUNE_FADE_DURATION = 2;
const PRUNE_CHECK_INTERVAL = 60000;

/* ---------- Playback state ---------- */

const playingTracks = new Set();      // track src strings currently playing or fading out
const activeAudioElements = new Set(); // live Audio elements
let musicStarted = false;

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
    gsap.to(audio, { volume: 1, duration: fadeInDuration || FADE_IN_DURATION });
}

function startNextTrack() {
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

// Starts the background music: two tracks begin together (rather than the
// usual one), then the cascade takes over from there. Call this from inside
// a user-gesture handler (e.g. the "Play Game" click) so the browser's
// autoplay policy allows playback. No-op if music is already running.
export function startMusic() {
    if (musicStarted) return;
    musicStarted = true;
    startNextTrack();
    startNextTrack();
}
