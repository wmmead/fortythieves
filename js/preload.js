// preload.js — warms the browser's image cache for every card-face PNG before
// the player can start, so the deal doesn't have to fetch each card's image
// on demand (visible as a per-card loading flash on a cold cache).

const SUITS = ['c', 'd', 'h', 's'];
const VALUES = Array.from({ length: 13 }, (_, i) => i + 1);

// Mirrors the directory choice in ui.js's createCardElement().
function cardImageDirectory() {
    return window.innerWidth < 850 ? 'cards-small' : 'cards';
}

function loadImage(src) {
    return new Promise((resolve) => {
        const img = new Image();
        // Resolve on error too — one missing/broken file shouldn't block the
        // player from ever starting the game.
        img.addEventListener('load', resolve);
        img.addEventListener('error', resolve);
        img.src = src;
    });
}

// Preloads every card-face image for whichever directory the current
// viewport width will use. Returns a promise that resolves once every image
// has settled (loaded or failed).
export function preloadCardImages() {
    const directory = cardImageDirectory();
    const urls = [];
    SUITS.forEach((suit) => {
        VALUES.forEach((value) => {
            urls.push(`${directory}/${suit}${value}.png`);
        });
    });
    return Promise.all(urls.map(loadImage));
}
