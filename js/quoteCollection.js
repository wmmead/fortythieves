/*
quoteCollection.js — which quotes the player has collected, and picking one
when they win (see ROADMAP.md, Phase 1). No DOM code here; the achievements
page (achievements.js) and the win screen (ui.js) display what this returns.

Collected quote ids are saved in localStorage under COLLECTION_KEY, in the
order they were collected, which is also the order they fill the slots on
the achievements page. They're cleared along with the rest of the player's
data on a stats reset (stats.js, deleteAllSolitaireUserData()).

FUNCTIONS
- getCollectedQuotes(): the collected quotes, in the order collected.
- awardQuote(): pick a quote for a win, save it if new; returns { quote, isNew }.
- clearCollection(): forget every collected quote.
*/

import { QUOTES } from './quotes.js';

const COLLECTION_KEY = 'collectedQuotes';

// The chance that a win is guaranteed a quote the player doesn't have yet.
// Otherwise any quote can come up, repeats included. Pure random makes the
// end of the collection drag (the last quote alone would take ~40 wins on
// average); at 0.5 a full set of 40 takes ~55 wins. Lower it to make the
// collection take longer. See the table in ROADMAP.md.
const NEW_QUOTE_CHANCE = 0.5;

function readIds() {
    try {
        const ids = JSON.parse(localStorage.getItem(COLLECTION_KEY) || '[]');
        return Array.isArray(ids) ? ids : [];
    } catch {
        return []; // unreadable data: start the collection over rather than break
    }
}

// Ids for quotes that are no longer in quotes.js are skipped, so retiring a
// quote can't leave an empty slot or a broken page.
export function getCollectedQuotes() {
    const byId = new Map(QUOTES.map(q => [q.id, q]));
    return readIds().map(id => byId.get(id)).filter(Boolean);
}

function randomFrom(list) {
    return list[Math.floor(Math.random() * list.length)];
}

export function awardQuote() {
    const collectedIds = new Set(getCollectedQuotes().map(q => q.id));
    const uncollected = QUOTES.filter(q => !collectedIds.has(q.id));

    const quote = uncollected.length && Math.random() < NEW_QUOTE_CHANCE
        ? randomFrom(uncollected)
        : randomFrom(QUOTES);

    const isNew = !collectedIds.has(quote.id);
    if (isNew) {
        localStorage.setItem(COLLECTION_KEY, JSON.stringify([...readIds(), quote.id]));
    }
    return { quote, isNew };
}

export function clearCollection() {
    localStorage.removeItem(COLLECTION_KEY);
}
