/*
achievements.js — the achievements page.

Opening it slides the whole game (#container) down out of the viewport while
#achievements drops in from the top, both on the same timing, so they read as
one sheet pushing the other. The menu stays where it is, on top of the page:
its sound controls keep working, its "achievements" item closes the page, and
its other buttons are switched off (styles.css and events.js). The down arrow
at the bottom of the page (#achievements-close) and Escape also close it.

The quote viewer shows one collected quote at a time. The arrows (and the
left/right arrow keys) step through them, wrapping at either end; the number
row jumps straight to one, with the quote showing in red. Uncollected slots
are grey and disabled.

Collected quotes come from quoteCollection.js (saved in localStorage, in the
order won). With none collected yet, the page says how to earn one. After a
win or a stats reset, refreshAchievements() brings the page up to date.
SHOWCASE (below) can be switched on to treat every quote as collected, for
trying out the viewer.

FUNCTIONS
- openAchievements(): slide the page in and the game out.
- closeAchievements(): the reverse; no-op if already closed.
- toggleAchievements(): open or close, for the menu item.
- isAchievementsOpen(): true while the page is showing (or sliding in).
- initAchievements(): build the number row and wire up the viewer (on load).
- showQuote(index): show collected quote number index (0-based).
- refreshAchievements(showId): re-read the collection, optionally showing
  the quote with id showId (used after a win, to show the quote just won).
- renderSource(el, quote, dash): "— Author, source" into el (also used by
  the win screen).

The number row shows a set of 15 numbers (8 on narrow screens) with small
arrows to move between sets; it also follows along when the quote showing
moves outside the set. A count of collected quotes sits below it.
*/

import { QUOTES } from './quotes.js';
import { getCollectedQuotes } from './quoteCollection.js';

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
    // Re-measure now that the page is actually showing: the bold number font
    // may only have loaded once the numbers were first drawn.
    lockQuoteHeight();
    layoutSet(false);
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

/* ---------- quote viewer ---------- */

// SHOWCASE: set to true to treat every quote as collected (in quotes.js
// order) and try out the whole viewer. Leave false for real play.
const SHOWCASE = false;

const EMPTY_MESSAGE = 'Win at least one game, and get all the points, to earn an achievement.';

// The collection as of the last refreshAchievements(), in the order won.
let collected = [];

function collectedQuotes() {
    return collected;
}

let current = 0; // index into collectedQuotes() of the quote showing
const FADE_MS = 150; // matches #quote's transition in styles.css

// "— Author, source", with *titles* in the source wrapped in <cite>. Used by
// the achievements page and the win screen; pass dash = '' for no dash.
export function renderSource(el, quote, dash = '\u2014') {
    el.textContent = dash ? `${dash} ${quote.author}` : quote.author;
    if (!quote.source) return;
    el.append(', ');
    quote.source.split(/(\*[^*]+\*)/).forEach(part => {
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
            const cite = document.createElement('cite');
            cite.textContent = part.slice(1, -1);
            el.append(cite);
        } else if (part) {
            el.append(part);
        }
    });
}

// No quote (nothing collected yet): the how-to-earn-one message instead.
function fillQuote(quote) {
    const text = document.getElementById('quote-text');
    const source = document.getElementById('quote-source');
    document.getElementById('quote').classList.toggle('empty', !quote);
    if (!quote) {
        text.textContent = EMPTY_MESSAGE;
        source.textContent = '';
        return;
    }
    text.textContent = `“${quote.text}”`;
    renderSource(source, quote);
}

function updateNumbers() {
    const count = collectedQuotes().length;
    document.querySelectorAll('#quote-numbers ol button').forEach((btn, i) => {
        // Nothing is "current" when nothing has been collected yet.
        if (i === current && i < count) btn.setAttribute('aria-current', 'true');
        else btn.removeAttribute('aria-current');
    });
    followCurrent();
}

/* ---------- number row sets ----------
   The row shows SET_SIZE numbers at a time (fewer on narrow screens). All the
   numbers sit on one line inside .numbers-window, which clips them; the line
   slides sideways to show a set, and the numbers outside it fade out (and
   can't be clicked or tabbed to). The window is as wide as the widest set and
   narrower sets are centred in it, so the small arrows either side never
   move. The last set is always full (26–40, not 31–40). */

const SET_SIZE = 15;
const SET_SIZE_NARROW = 8;
const narrowScreen = window.matchMedia('(max-width: 700px)');

let setStart = 0; // index of the first number in the set showing

function setSize() {
    return Math.min(narrowScreen.matches ? SET_SIZE_NARROW : SET_SIZE, QUOTES.length);
}

// First index of every set: 0, 15, 30 → clamped so the last set is full.
function setStarts() {
    const size = setSize();
    const starts = [];
    for (let i = 0; i < QUOTES.length; i += size) {
        starts.push(Math.min(i, QUOTES.length - size));
    }
    return [...new Set(starts)];
}

// Width of a set: from its first number to the end of its last number's
// button (not counting that number's trailing "|", which is hidden).
function measureSet(items, start) {
    const last = items[start + setSize() - 1];
    const left = items[start].offsetLeft;
    const right = last.offsetLeft + last.querySelector('button').offsetWidth;
    return { left, width: right - left };
}

function layoutSet(animate = true) {
    const nav = document.getElementById('quote-numbers');
    const list = nav.querySelector('ol');
    const items = [...list.children];
    if (!items.length) return;
    const size = setSize();
    const starts = setStarts();

    // Window width: the widest set.
    const widest = Math.max(...starts.map(st => measureSet(items, st).width));
    nav.querySelector('.numbers-window').style.width = `${widest}px`;

    const { left, width } = measureSet(items, setStart);
    list.classList.toggle('no-slide', !animate);
    list.style.transform = `translateX(${(widest - width) / 2 - left}px)`;
    items.forEach((li, i) => {
        li.classList.toggle('in-set', i >= setStart && i < setStart + size);
        li.classList.toggle('set-end', i === setStart + size - 1);
    });
    if (!animate) {
        void list.offsetWidth; // apply without transition, then re-enable it
        list.classList.remove('no-slide');
    }

    nav.querySelector('.numbers-shift.prev').classList.toggle('hidden', setStart === starts[0]);
    nav.querySelector('.numbers-shift.next').classList.toggle('hidden', setStart === starts[starts.length - 1]);
}

// Small arrows: the previous/next set, without changing the quote.
function shiftSet(direction) {
    const starts = setStarts();
    const i = starts.indexOf(setStart);
    const target = starts[i + direction];
    if (target === undefined) return;
    setStart = target;
    layoutSet();
}

// When the quote showing is outside the set (big arrows, arrow keys, wrapping
// round), move to the first set that contains it.
function followCurrent() {
    const size = setSize();
    if (current >= setStart && current < setStart + size) return;
    setStart = setStarts().find(st => current >= st && current < st + size) ?? 0;
    layoutSet();
}

function updateCount() {
    document.getElementById('quote-count').textContent =
        `${collectedQuotes().length} of ${QUOTES.length} quotes collected`;
}

// Show collected quote number `index` (0-based), fading the old one out and
// the new one in. Arrows wrap around at either end.
export function showQuote(index) {
    const quotes = collectedQuotes();
    if (!quotes.length) return;
    const next = (index + quotes.length) % quotes.length;
    if (next === current && document.getElementById('quote-text').textContent) return;
    current = next;
    updateNumbers();
    const figure = document.getElementById('quote');
    figure.classList.add('changing');
    setTimeout(() => {
        fillQuote(quotes[current]);
        figure.classList.remove('changing');
    }, FADE_MS);
}

// Quotes are different lengths, so the quote area is held at the height of
// the longest one at the current width. Otherwise the number row below would
// jump up and down as the player moves between quotes.
function lockQuoteHeight() {
    const quotes = collectedQuotes();
    const figure = document.getElementById('quote');
    figure.style.minHeight = '';
    if (!quotes.length) {
        fillQuote(null);
        return;
    }
    let tallest = 0;
    for (const quote of quotes) {
        fillQuote(quote);
        tallest = Math.max(tallest, figure.offsetHeight);
    }
    fillQuote(quotes[current]);
    figure.style.minHeight = `${tallest}px`;
}

function buildNumbers() {
    const collectedCount = collectedQuotes().length;
    const list = document.querySelector('#quote-numbers ol');
    list.innerHTML = '';
    setStart = 0;
    for (let n = 1; n <= QUOTES.length; n++) {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = n;
        if (n > collectedCount) {
            // Not collected yet: grey and not clickable.
            btn.disabled = true;
            btn.setAttribute('aria-label', `quote ${n}, not collected yet`);
        } else {
            btn.setAttribute('aria-label', `quote ${n}`);
            btn.addEventListener('click', () => showQuote(n - 1));
        }
        li.append(btn);
        list.append(li);
    }
}

export function refreshAchievements(showId) {
    collected = SHOWCASE ? QUOTES : getCollectedQuotes();
    buildNumbers();
    const showIndex = collected.findIndex(q => q.id === showId);
    current = showIndex >= 0 ? showIndex : 0;
    fillQuote(collected[current]);
    updateNumbers();
    updateCount();
    // The big arrows only make sense with two or more quotes to move between.
    document.getElementById('quote-viewer').classList.toggle('no-arrows', collected.length < 2);
    lockQuoteHeight();
    layoutSet(false);
}

export function initAchievements() {
    const page = document.getElementById('achievements');
    page.inert = true; // starts closed
    refreshAchievements();

    page.querySelector('.quote-arrow.prev').addEventListener('click', () => showQuote(current - 1));
    page.querySelector('.quote-arrow.next').addEventListener('click', () => showQuote(current + 1));
    page.querySelector('.numbers-shift.prev').addEventListener('click', () => shiftSet(-1));
    page.querySelector('.numbers-shift.next').addEventListener('click', () => shiftSet(1));
    document.getElementById('achievements-close').addEventListener('click', closeAchievements);

    // A mouse click doesn't give the arrows or numbers focus. Otherwise,
    // pressing an arrow key after clicking one makes the browser switch to
    // keyboard mode and draw its focus ring around the clicked button.
    // Tabbing to them still focuses them, ring included, as it should.
    page.addEventListener('mousedown', e => {
        if (e.target.closest('.quote-arrow, #quote-numbers button, #achievements-close')) e.preventDefault(); // incl. .numbers-shift
    });

    // Left/right arrow keys step through quotes while the page is open.
    document.addEventListener('keydown', e => {
        if (!open || e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.key === 'ArrowLeft') { e.preventDefault(); showQuote(current - 1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); showQuote(current + 1); }
    });

    // The page is laid out even while hidden (visibility, not display), so the
    // height can be measured now, then again whenever the width changes.
    let resizeTimer = null;
    let lastWidth = window.innerWidth;
    window.addEventListener('resize', () => {
        if (window.innerWidth === lastWidth) return;
        lastWidth = window.innerWidth;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            lockQuoteHeight();
            layoutSet(false);
        }, 150);
    });
    // Crossing 700px changes the set size: re-pick the set holding the quote.
    narrowScreen.addEventListener('change', () => {
        setStart = setStarts().find(st => current >= st && current < st + setSize()) ?? 0;
        layoutSet(false);
    });
    // Fonts change the text's size, so measure once they've loaded, and again
    // whenever another font finishes loading (the bold one used by the
    // numbers can arrive after fonts.ready has already resolved).
    const remeasure = () => {
        lockQuoteHeight();
        layoutSet(false);
    };
    document.fonts.ready.then(remeasure);
    document.fonts.addEventListener('loadingdone', remeasure);
}
