import { shuffledDeck, setSelectedCard, undoCount, isValidTableauMove, isValidFoundationMove, getRefreshCost, olenMode, canUndo } from './game.js';
import { shakeElement } from './animation.js';
import { getGameStatistics } from './stats.js';
import { renderStatsGraph } from './statsGraph.js';
/* global gsap */ // gsap is loaded as a global via the <script> tag in index.html

/*
================================================================================
UI Utility Module - Function Index and Descriptions
================================================================================

SECTION: DOM UTILITIES
----------------------
- getContainerById(id): Return DOM element by its ID.
- getClassElements(elClass): Return all elements with the specified class.
- moveCardElement(card, targetContainer): Move a card DOM element to a new container.
- createCardElement(suit, value): Create a card DOM element with the given suit and value.
- findCardInContainer(container, cardId): Find a card in a container by cardId.
- clearBoard(): Remove all cards from tableau, foundations, and discard pile.
- restoreDeck(elementId): Reset a given element to be the deck.
- handleEmptyDeckAndDiscard(deckArray, discard): Update deck display if both deck and discard are empty.
- setRefreshToEmpty(): Set the refresh deck area to an empty state.
- setDeckRefresh(deckDiv): Set the deck as refreshable and update its cost.
- getLastDiscard(lastMove): Find cards in the discard pile matching the last move.

SECTION: LAYOUT MANAGER
-----------------------
- setSectionHeights(): Dynamically set tableau section heights based on width and card count.
- updateCardPosition(card, container): Update card position based on its container (e.g., discard pile).
- updateSectionHeights(): Update all tableau section heights.
- setHeightOffset(element): Calculate a vertical offset in pixels for an element.
- stackCards(): Visually stack cards in tableau sections with staggered offsets.
- restackCards(): Re-stack all cards in tableau sections.
- stackDiscard(): Lay out the discard pile as a staggered fan (horizontal desktop / vertical mobile).
- placeCardInDiscard(card): Place a card in the discard pile and set its position.

SECTION: VISUAL FEEDBACK
------------------------
- clearSelection(): Deselect all selected/candidate cards and remove highlights.
- deselectCards(): Remove selection and candidate classes from cards.
- highlightEmptySection(section): Add a temporary candidate card to an empty section.
- highlightCandidateCard(card): Mark a card as a candidate for a move.
- highlightTableauTargets(card, sourceElement): Highlight valid tableau targets for a card.
- highlightFoundationTargets(card, foundations): Highlight valid foundation targets for a card.
- createTempCandidate(parentElement): Create and append a temporary candidate card.
- showError(message): takes a message and shows the error message then hides it after 3 seconds.
- hideErrorMessage(element): private function, hides the error message.
- switchClassAfterTransition(element, theClass): private function, resets the class after message is hidden

SECTION: GAME DISPLAY
---------------------
- updateDeckCounter(): Show or update the deck's remaining card counter.
- updateDeckDisplay(): Update the deck counter display.
- updateUndoButtonText(): Update the undo button text to reflect the next cost.
- updateScoreDisplay(score): Update the displayed score.
- setCardBackgrounds(): Set background images for all cards based on their suit and value.
- updateGameStatsInfo(): Sets the DOM so show the current stats
- updateEndGameStats(): Sets the stats window at the end of the game to show stats + current game.
- resetGameStatsInfo(): resets the stats in the DOM screen

SECTION: SCREEN MANAGER
-----------------------
- showWinScreen(): Display the win overlay.
- hideWinOverlay(): Hide the win overlay.
- blockUserInteraction(): Block user interaction with an invisible overlay.
- unblockUserInteraction(): Remove the interaction blocking overlay.
- handleDOMAfterMove(card, candidate, fromContainer, targetContainer): Update the DOM after a move, including card placement, selection clearing, and layout adjustments.

================================================================================
*/

/* --------- DOM UTILITIES ----------- */

export function getContainerById(id) {
    return document.getElementById(id);
}

export function getClassElements(elClass){
    return document.querySelectorAll(`.${elClass}`);
}

export function moveCardElement(card, targetContainer) {
    targetContainer.appendChild(card);
}

export function createCardElement(suit, value) {
    const windowWidth = window.innerWidth;
    let directoryName = 'cards';
    if(windowWidth < 850){
        directoryName = 'cards-small';
    }
    const card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('data-suit', suit);
    card.setAttribute('data-value', value);
    card.style.backgroundImage = `url('${directoryName}/${suit}${value}.png')`;
    return card;
}

export function findCardInContainer(container, cardId) {
    const [suit, ...valueArr] = cardId;
    const value = valueArr.join('');
    const cards = container.querySelectorAll(`.card[data-suit="${suit}"][data-value="${value}"]`);
    for (let i = cards.length - 1; i >= 0; i--) {
        if (cards[i].parentElement === container) return cards[i];
    }
    return null;
}

export function clearBoard(){
    document.querySelectorAll('section, .foundation, #discard').forEach(container => {
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }
    });
}

export function restoreDeck(elementId) {
    if (elementId) {
        elementId.id = 'deck';
        elementId.textContent = '';
    }
}

export function handleEmptyDeckAndDiscard(deckArray, discard) {
    if (deckArray.length === 0 && discard.childElementCount === 0) {
        const deckDiv = document.getElementById('deck');
        if (deckDiv) {
            deckDiv.id = 'empty';
            deckDiv.textContent = '';
        }
    }
}

export function setRefreshToEmpty(){
    const refreshDiv = document.getElementById('refresh');
        if (refreshDiv) {
            refreshDiv.id = 'empty';
            refreshDiv.textContent = '';
        }
}

export function setDeckRefresh(deckDiv){
    deckDiv.id = 'refresh';
    const cost = getRefreshCost();
    deckDiv.innerHTML = `<span>reset<br>(${cost} pts)</span>`;
}

export function getLastDiscard(lastMove){
    const discard = document.getElementById('discard');
    const cards = discard.querySelectorAll(
        `.card[data-suit="${lastMove.cardId[0]}"][data-value="${lastMove.cardId.slice(1)}"]`
    );
    return cards;
}

export function updateCardImageDirectory(oldDir, newDir) {
  // Select all card elements
  const cards = document.querySelectorAll('.card');
  cards.forEach(card => {
    const style = card.getAttribute('style');
    if (style && style.includes(`url("` + oldDir + `/`)) {
      // Replace the directory name in the background-image url
      const newStyle = style.replace(
        `url("` + oldDir + `/`,
        `url("` + newDir + `/`
      );
      card.setAttribute('style', newStyle);
    }
  });
}

/* --------- LAYOUT MANAGER ----------- */

// Dynamically set the height of each tableau section based on its width and number of cards
export function setSectionHeights() {
    document.querySelectorAll('section').forEach(section => {
        const sectionWidth = section.offsetWidth;
        const cards = section.querySelectorAll('.card:not(.temp)');
        const numCards = cards.length;
        let height = sectionWidth * 1.452; // Base height for one card
        height += numCards * (sectionWidth * 0.3); // Add extra height for stacked cards
        section.style.height = `${height}px`;
    });
}

export function updateCardPosition(card, container) {
    if (container.id === 'discard') {
        // Card returned to the discard pile (undo of a play). Re-flow the fan.
        stackDiscard();
    }
}

export function updateSectionHeights() {
    setSectionHeights();
}

// Calculate a vertical offset (in pixels) based on the width of a given element
export function setHeightOffset(element) {
    const thisElement = document.querySelector(element);
    const elementWidth = thisElement.offsetWidth;
    const offsetPx = elementWidth * 0.05;
    return offsetPx;
}

// Visually stack cards in each tableau section with a staggered vertical offset
export function stackCards() {
    const stacks = document.querySelectorAll('section');
    const cardEl = document.querySelector('.card');
    if (!cardEl) return;
    const cardHeight = cardEl.offsetHeight;
    const staggerCards = cardHeight / 4;
    stacks.forEach(stack => {
        const cards = stack.querySelectorAll('.card:not(.temp)');
        cards.forEach((card, i) => {
            card.style.top = `${(i * staggerCards) + setHeightOffset('#tableau-container section')}px`;
        });
    });
}

export function restackCards() {
    stackCards();
}

// Fraction of a card that stays visible per slot in the staggered discard fan.
// ~0.25 yields room for about 30 cards across a full-width desktop layout.
const DISCARD_SLIVER = 0.25;

/**
 * Lay out the discard pile as a staggered fan so played cards stay visible.
 * Cards are positioned purely by their DOM index (the pile is strict LIFO, so
 * DOM order always equals play order). When the pile exceeds the capacity that
 * fits the available space, the oldest cards pile up at the first slot while the
 * newest `capacity` cards fan out; the last card is always fully exposed and is
 * the only one that paints on top (highest z-index) and is playable.
 * Horizontal (left offset) on desktop, vertical (top offset) on mobile.
 */
export function stackDiscard() {
    const discard = document.getElementById('discard');
    if (!discard) return;

    // Reference card size from a real tableau card (fallback to a section's width).
    let cardWidth, cardHeight;
    const sample = document.querySelector('section .card');
    if (sample) {
        cardWidth = sample.offsetWidth;
        cardHeight = sample.offsetHeight;
    } else {
        const section = document.querySelector('section');
        if (!section) return;
        cardWidth = section.offsetWidth * 0.9;
        cardHeight = cardWidth * 726 / 500;
    }

    const vertical = window.matchMedia('(max-width: 490px)').matches;
    const cards = discard.querySelectorAll('.card');
    const total = cards.length;

    // Size the discard zone to one card tall on desktop so the row reserves space.
    if (!vertical) discard.style.height = cardHeight + 'px';
    if (total === 0) return;

    const cardSize = vertical ? cardHeight : cardWidth;
    const containerLength = vertical ? discard.offsetHeight : discard.offsetWidth;
    const stagger = cardSize * DISCARD_SLIVER;
    const travel = Math.max(0, containerLength - cardSize);
    const capacity = Math.max(1, Math.floor(travel / stagger) + 1);
    const overflow = Math.max(0, total - capacity);

    cards.forEach((card, i) => {
        const slot = Math.max(0, i - overflow);
        const offset = (slot * stagger) + 'px';
        card.style.width = cardWidth + 'px';
        card.style.height = cardHeight + 'px';
        card.style.left = vertical ? '0px' : offset;
        card.style.top = vertical ? offset : '0px';
        card.style.zIndex = i;
    });
}

export function placeCardInDiscard(card) {
    const discard = document.getElementById('discard');
    discard.appendChild(card);
    stackDiscard();
}

/* --------- VISUAL FEEDBACK ----------- */

// Deselects any selected or candidate cards and removes temporary highlights
export function clearSelection() {
    document.querySelectorAll('.card.selected').forEach(card => {
        card.classList.remove('selected');
        gsap.set(card, { scale: 1 });
    });
    document.querySelectorAll('.card.candidate').forEach(card => {
        card.classList.remove('candidate');
    });
    document.querySelectorAll('.card.temp').forEach(card => {
        card.remove();
    });
    setSelectedCard(null);
}

export function deselectCards() {
    document.querySelectorAll('.card.selected, .card.candidate').forEach(card => {
        card.classList.remove('selected', 'candidate');
        card.style.removeProperty("transform");
    });
}

export function highlightEmptySection(section) {
    const tempCard = document.createElement('div');
    tempCard.className = 'card candidate temp';
    section.appendChild(tempCard);
}

export function highlightCandidateCard(card) {
    card.classList.add('candidate');
}

export function highlightTableauTargets(card, sourceElement) {
    const sections = document.querySelectorAll('section');
    sections.forEach(section => {
        if (section === sourceElement) return;
        const cards = section.querySelectorAll('.card:not(.temp)');
        if (cards.length === 0) {
            highlightEmptySection(section);
        } else {
            const lastCard = cards[cards.length - 1];
            if (isValidTableauMove(card, lastCard)) {
                highlightCandidateCard(lastCard);
            }
        }
    });
}

export function highlightFoundationTargets(card, foundations) {
    const value = parseInt(card.getAttribute('data-value'), 10);
    foundations.forEach(foundation => {
        const cards = foundation.querySelectorAll('.card:not(.temp)');
        if (cards.length === 0) {
            if (value === 1) {
                highlightEmptySection(foundation);
            }
        } else {
            const lastCard = cards[cards.length - 1];
            if (isValidFoundationMove(card, lastCard)) {
                highlightCandidateCard(lastCard);
            }
        }
    });
}

export function createTempCandidate(parentElement) {
    const tempCard = document.createElement('div');
    tempCard.className = 'card candidate temp';
    parentElement.appendChild(tempCard);
    return tempCard;
}

export function showError(message){
    const messageContainer = document.querySelector('#error-message');
    messageContainer.textContent = message;
    messageContainer.className = 'show';
    shakeElement(messageContainer);
    setTimeout(function(){
        hideErrorMessage(messageContainer);
    }, 3000);
}

function hideErrorMessage(element){
    element.className = 'hide';
    switchClassAfterTransition(element, 'hide');
}

function switchClassAfterTransition(element, theClass) {
  element.addEventListener('transitionend', function(){
    element.className = theClass;
  }, {once: true});
}

/* --------- GAME DISPLAY ----------- */

// Display or update the counter showing the number of cards left in the deck
export function updateDeckCounter() {
    const deckCounter = document.getElementById('deck-counter');
    const deckDiv = document.getElementById('deck');
    if (!deckDiv) return;

    if (!deckCounter) {
        // Create the counter if it doesn't exist
        const counter = document.createElement('div');
        counter.id = 'deck-counter';
        const deckCount = document.createTextNode(shuffledDeck.length);
        counter.appendChild(deckCount);
        deckDiv.appendChild(counter);
    } else {
        deckCounter.textContent = shuffledDeck.length;
    }
}

export function updateDeckDisplay() {
    updateDeckCounter();
}

export function updateUndoButtonText() {
    const undoBtn = document.getElementById('undo');
    if (undoBtn) {
        const nextCost = undoCount + 1;
        undoBtn.textContent = `Undo (-${nextCost} point${nextCost > 1 ? 's' : ''})`;
        undoBtn.classList.toggle('disabled', !canUndo());
    }
}
export function updateScoreDisplay(score) {
    document.getElementById('score').textContent = score;
}

// Set the background image for each card based on its suit and value
export function setCardBackgrounds() {
    document.querySelectorAll('.card:not(.temp)').forEach(card => {
        const suit = card.getAttribute('data-suit');
        const value = card.getAttribute('data-value');
        const imgPath = `cards/${suit}${value}.png`;
        card.style.backgroundImage = `url('${imgPath}')`;
    });
}

// Most recent stats rendered to the graph; used by the win screen on small viewports
let latestStats = { averageScore: 0, winPercent: 0 };

function refreshStatsGraph(gamesPlayed, averageScore, gamesWon) {
    const winPercent = gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : 0;
    latestStats = { averageScore, winPercent };
    renderStatsGraph(document.getElementById('statsgraph'), latestStats, 'hdr-');
}

export function updateGameStatsInfo(){
    const currentGameStats = getGameStatistics();
    if( currentGameStats.gamesPlayed ){
        document.querySelector('#played').textContent = currentGameStats.gamesPlayed;
        document.querySelector('#average').textContent = currentGameStats.averageScore;
        document.querySelector('#wins').textContent = currentGameStats.gamesWon;
    }
    refreshStatsGraph(currentGameStats.gamesPlayed, currentGameStats.averageScore, currentGameStats.gamesWon);
}

export function updateEndGameStats(numOfGames, numWins, average){
    document.querySelector('#played').textContent = numOfGames;
    document.querySelector('#average').textContent = average;
    document.querySelector('#wins').textContent = numWins;
    refreshStatsGraph(numOfGames, average, numWins);
}

export function resetGameStatsInfo(){
    document.querySelector('#played').textContent = '0';
    document.querySelector('#average').textContent = '0';
    document.querySelector('#wins').textContent = '0';
    refreshStatsGraph(0, 0, 0);
}

/* --------- SCREEN MANAGER ----------- */

// Shows the win overlay by updating the win div's class.
export function showWinScreen( winType ) {
    let message;
    const tableau = document.querySelector('#tableau-container');
    tableau.className = 'win-container';
    if( winType === 'clear'){
        message = `Great! You cleared the board, but you didn't get all the points.`;
    } else {
        message = `Congratulations! You won and scored all the possible points!`;
    }
    tableau.innerHTML = `<div id="win" class="pop">
                <h2>${message}</h2>
                </div>`;
    // On small screens the header stats graphic is hidden, so show it in the win screen instead
    if (window.matchMedia('(max-width: 660px)').matches) {
        const graphDiv = document.createElement('div');
        graphDiv.id = 'win-statsgraph';
        document.getElementById('win').appendChild(graphDiv);
        renderStatsGraph(graphDiv, latestStats, 'win-');
    }
}

export function resetMain(){
    const tableau = document.querySelector('#tableau-container');
    tableau.removeAttribute('class');
    tableau.innerHTML = `<section id="s1"></section>
            <section id="s2"></section>
            <section id="s3"></section>
            <section id="s4"></section>
            <section id="s5"></section>
            <section id="s6"></section>
            <section id="s7"></section>
            <section id="s8"></section>
            <section id="s9"></section>
            <section id="s10"></section>`;
}

// Call this before dealing
export function blockUserInteraction() {
    let blocker = document.getElementById('interaction-blocker');
    if (!blocker) {
        blocker = document.createElement('div');
        blocker.id = 'interaction-blocker';
        blocker.style.position = 'fixed';
        blocker.style.top = '0';
        blocker.style.left = '0';
        blocker.style.width = '100vw';
        blocker.style.height = '200vh';
        blocker.style.zIndex = '9999';
        blocker.style.background = 'rgba(0,0,0,0)'; // invisible
        blocker.style.pointerEvents = 'all';
        document.body.appendChild(blocker);
    }
    blocker.style.display = 'block';
}

export function unblockUserInteraction() {
    const blocker = document.getElementById('interaction-blocker');
    //if (blocker) blocker.style.display = 'none';
    if (blocker){
        document.querySelector('body').removeChild(blocker);
    }
}

export function handleDOMAfterMove(card, candidate, fromContainer, targetContainer) {
    // Handle discard pile and refresh deck
    const leavingDiscard = fromContainer.id === 'discard';
    if (leavingDiscard) {
        const discard = document.getElementById('discard');
        if (discard.childElementCount === 1) {
            const deckDiv = document.getElementById('refresh');
            if (deckDiv) {
                deckDiv.id = 'empty';
                deckDiv.textContent = '';
            }
        }
    }

    targetContainer.appendChild(card);

    // Clear the discard fan's inline sizing so the card resumes normal styling in its new home.
    if (leavingDiscard) {
        card.style.width = '';
        card.style.height = '';
        card.style.left = '';
        card.style.zIndex = '';
    }

    const isFoundation = targetContainer.classList.contains('foundation');
    const isDiscard = targetContainer.id === 'discard';
    if (isFoundation || isDiscard) {
        card.style.top = setHeightOffset('.foundation') + 'px';
    }

    clearSelection();
    stackCards();
    setSectionHeights();
    if (leavingDiscard) {
        stackDiscard();
    }

    if (candidate.classList.contains('temp')) {
        candidate.remove();
    }
}

export function toggleMenu() {
    const menu = document.querySelector('#menu');
    if(menu.className == 'open'){
        menu.className = 'close';
    } else {
        menu.className = 'open';
    }
}

export function closeMenu() {
    const menu = document.querySelector('#menu');
    menu.className = 'close';
}

export function olenModeDisplay(){
    if(olenMode){
        document.querySelector('#olenmode').textContent = "Olen mode";
    } else {
        document.querySelector('#olenmode').textContent = "";
    }
}