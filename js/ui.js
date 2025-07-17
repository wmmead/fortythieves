import { shuffledDeck, setSelectedCard, undoCount, isValidTableauMove, isValidFoundationMove, refreshCount, getRefreshCost } from './game.js';
import { shakeElement } from './animation.js';
import { getGameStatistics } from './stats.js';

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
- updateCardStyle(card, container): Update card style based on its container (e.g., discard pile).
- updateSectionHeights(): Update all tableau section heights.
- setHeightOffset(element): Calculate a vertical offset in pixels for an element.
- stackCards(): Visually stack cards in tableau sections with staggered offsets.
- restackCards(): Re-stack all cards in tableau sections.
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
    const cost = (refreshCount + 1 ) * getRefreshCost();
    deckDiv.textContent = `reset (${cost} pts)`;
}

export function getLastDiscard(lastMove){
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

// todo -> rename this function
export function updateCardStyle(card, container) {
    if (container.id === 'discard') {
        card.style.top = setHeightOffset('#discard') + 'px';
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
            card.style.top = `${(i * staggerCards) + setHeightOffset('main section')}px`;
        });
    });
}

export function restackCards() {
    stackCards();
}

export function placeCardInDiscard(card) {
    const discard = document.getElementById('discard');
    discard.appendChild(card);
    card.style.top = setHeightOffset('#discard') + 'px';
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

    // Log the number of cards left in the deck
    console.log('Cards left in deck:', shuffledDeck.length);

    if (!deckCounter) {
        // Create the counter if it doesn't exist
        const counter = document.createElement('div');
        counter.id = 'deck-counter';
        counter.textContent = deckDiv.shuffledDeck ? deckDiv.shuffledDeck.length : '';
        counter.style.position = 'absolute';
        counter.style.top = '50%';
        counter.style.left = '50%';
        counter.style.transform = 'translate(-50%, -50%)';
        counter.style.color = 'white';
        counter.style.fontSize = '24px';
        counter.style.fontWeight = 'bold';
        deckDiv.appendChild(counter);
    } else {
        // Update the counter if it exists
        deckCounter.textContent = deckDiv.shuffledDeck ? deckDiv.shuffledDeck.length : '';
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

export function updateGameStatsInfo(){
    const currentGameStats = getGameStatistics();
    console.log('current games played: ' + currentGameStats.gamesPlayed);
    if( currentGameStats.gamesPlayed ){
        document.querySelector('#played').textContent = currentGameStats.gamesPlayed;
        document.querySelector('#average').textContent = currentGameStats.averageScore;
        document.querySelector('#wins').textContent = currentGameStats.gamesWon;
    }
}

export function resetGameStatsInfo(){
    document.querySelector('#played').textContent = '0';
    document.querySelector('#average').textContent = '0';
    document.querySelector('#wins').textContent = '0';
}

/* --------- SCREEN MANAGER ----------- */

// Shows the win overlay by updating the win div's class.
export function showWinScreen( winType ) {
    let html;
    const mainElement = document.querySelector('main');
    mainElement.className = 'win-container';
    if( winType == 'clear'){
        html = `<div id="win" class="pop">
                <h2>Great!, you cleared cleared the board, but you didn't get all the points.</h2>
                </div>`;
    } else if(winType = 'win') {
        html = `<div id="win" class="pop">
                <h2>Congratulations! you won and scored all the possible points!</h2>
                </div>`;
    }
    mainElement.innerHTML = html;
}

export function resetMain(){
    const mainEl = document.querySelector('main');
    mainEl.removeAttribute('class');
    mainEl.innerHTML = `<section id="s1"></section>
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
        blocker.style.height = '100vh';
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
    if (fromContainer.id === 'discard') {
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

    const isFoundation = targetContainer.classList.contains('foundation');
    const isDiscard = targetContainer.id === 'discard';
    if (isFoundation || isDiscard) {
        card.style.top = setHeightOffset('.foundation') + 'px';
    }

    clearSelection();
    stackCards();
    setSectionHeights();

    if (candidate.classList.contains('temp')) {
        candidate.remove();
    }
}