/*
achievements.js — the achievements page.

Opening it slides the whole game (#container) down out of the viewport while
#achievements drops in from the top, both on the same timing, so they read as
one sheet pushing the other. The menu stays where it is, on top of the page:
its sound controls keep working, its "achievements" item closes the page, and
its other buttons are switched off (styles.css and events.js). Escape also
closes the page. There's no close control on the page itself yet.

VISUAL PASS ONLY. renderSampleAchievements() fills the page with a sample
state taken from the Figma mockup (quote 12 showing, 23 of 40 collected) so
the layout can be judged. The real version — quote data, the unlocked list in
localStorage, the arrows and numbers actually switching quotes — replaces it
in the next step (see ROADMAP.md, Phase 1).

FUNCTIONS
- openAchievements(): slide the page in and the game out.
- closeAchievements(): the reverse; no-op if already closed.
- toggleAchievements(): open or close, for the menu item.
- isAchievementsOpen(): true while the page is showing (or sliding in).
- renderSampleAchievements(): fill in the sample quote and number row.
*/

const OPEN_CLASS = 'achievements-open'; // on <html>; styles.css does the sliding
// Also on <html>, from the moment the page opens until it has finished
// sliding away again. styles.css uses it to stack #container above the page
// for the whole slide, so the menu (which stays on screen) can be clicked.
const MOVING_CLASS = 'achievements-moving';
const SLIDE_MS = 700; // matches the transition in styles.css
let movingTimer = null;

let open = false;

export function isAchievementsOpen() {
    return open;
}

// Everything in #container except the menu goes inert while the page is open:
// the game is off screen, so keyboard focus mustn't land there. The menu
// stays live (it stays on screen for the sound controls and to close this
// page). inert can't be undone for one child of an inert parent, which is why
// it's set on #container's children rather than on #container itself.
function setGameInert(inert) {
    for (const el of document.getElementById('container').children) {
        if (el.id !== 'menu') el.inert = inert;
    }
}

export function openAchievements() {
    if (open) return;
    open = true;
    const page = document.getElementById('achievements');
    setGameInert(true);
    page.inert = false;
    clearTimeout(movingTimer); // reopened mid-close: keep the stacking on
    document.documentElement.classList.add(MOVING_CLASS, OPEN_CLASS);
    // Focus the page itself so screen readers announce it.
    page.focus({ preventScroll: true });
}

export function closeAchievements() {
    if (!open) return;
    open = false;
    const page = document.getElementById('achievements');
    // If focus is on the page, take it off before the page goes inert, rather
    // than moving it to the menu button: a focus moved by script after a key
    // press (Escape) gets the browser's focus ring.
    if (page.contains(document.activeElement)) document.activeElement.blur();
    page.inert = true;
    setGameInert(false);
    document.documentElement.classList.remove(OPEN_CLASS);
    // A timer rather than transitionend: with reduced motion there is no
    // transition, so transitionend would never fire.
    movingTimer = setTimeout(() => {
        document.documentElement.classList.remove(MOVING_CLASS);
    }, SLIDE_MS + 50);
}

export function toggleAchievements() {
    if (open) closeAchievements();
    else openAchievements();
}

/* ---------- sample content (temporary) ---------- */

const SAMPLE_QUOTE = {
    text: 'When you know a thing, to hold that you know it; and when you do not know a thing, to allow that you do not know it; this is knowledge.',
    author: 'Confucius',
    source: 'Analects',
    detail: '2.17'
};
const SAMPLE_TOTAL = 40;
const SAMPLE_COLLECTED = 23;
const SAMPLE_CURRENT = 12;

export function renderSampleAchievements() {
    document.getElementById('achievements').inert = true; // starts closed

    const q = SAMPLE_QUOTE;
    document.getElementById('quote-text').textContent = `“${q.text}”`;
    const source = document.getElementById('quote-source');
    source.textContent = `– ${q.author}, `;
    const cite = document.createElement('cite');
    cite.textContent = q.source;
    source.append(cite, ` ${q.detail}`);

    const list = document.querySelector('#quote-numbers ol');
    list.innerHTML = '';
    for (let n = 1; n <= SAMPLE_TOTAL; n++) {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = n;
        if (n > SAMPLE_COLLECTED) {
            // Not collected yet: grey and not clickable.
            btn.disabled = true;
            btn.setAttribute('aria-label', `quote ${n}, not collected yet`);
        } else {
            btn.setAttribute('aria-label', `quote ${n}`);
        }
        if (n === SAMPLE_CURRENT) {
            btn.setAttribute('aria-current', 'true');
        }
        li.append(btn);
        list.append(li);
    }
}
