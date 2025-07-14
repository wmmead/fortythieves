// Import UI utilities for positioning, stacking, layout, and deck counter updates
import { handleDOMAfterMove, clearSelection, deselectCards, createCardElement, placeCardInDiscard, highlightTableauTargets, highlightFoundationTargets, createTempCandidate, updateDeckDisplay, updateScoreDisplay, restoreDeck, handleEmptyDeckAndDiscard, getContainerById, getClassElements, showError } from './ui.js';
// Import the current shuffled deck from game state
import { getShuffledDeck, setSelectedCard, setDeckDepleted, getNextCardFromDeck, handleMoveHistory, recordMove, recordDrawMove, handleDeckDepletion, refillDeckFromDiscard, handleScoringAndWin, undoBoardMove, undoDiscardMove, score, getCurrentScore, setScore, refreshCount, setRefreshCount, getRefreshCost, setRefreshDeckClicks, getRefreshDeckClicks } from './game.js';
// Import animations
import { animateMove, animateCardDraw } from './animation.js';

/*
================================================================================
gameAction.js - Section and Function Index
================================================================================

MODULE-LEVEL VARIABLES & CACHING
--------------------------------
- foundations: Cache of all foundation pile elements for move validation and targeting.

CARD SELECTION & MOVE TARGETING
-------------------------------
- showCandidateTargets(card): Highlights valid move targets for the selected card (tableau or foundation).
- handleCardClick(card): Handles user clicking a card—selects it, highlights, and shows possible move targets.

CARD MOVEMENT & ANIMATION
-------------------------
- moveCardToCandidate(candidate, card): Moves a card to the chosen candidate target, animates the move, and updates game state.
- moveCardToTarget(target, card): Internal utility to move a card to a specific target (calls moveCardToCandidate).

AUTOMATIC MOVE HANDLING (DOUBLE-CLICK)
--------------------------------------
- handleCardDoubleClick(card): Handles double-clicking a card, auto-moving it to the best valid target (foundation, tableau, or empty section).

UNDO & REDO OPERATIONS
----------------------
- handleUndoRequest(): Handles undo requests by determining the last move type and reverting it (board or discard).

DECK & DISCARD MANAGEMENT
-------------------------
- drawCard(): Draws the next card from the deck, places it in the discard pile, updates UI, and handles deck depletion.
- refreshDeck(): Refreshes the deck from the discard pile, resets UI and state, and updates all related elements.

MOVE VALIDATION HELPERS
-----------------------
- isAce(card): Returns true if the card is an Ace.
- getCardSuit(card): Gets the suit of a card element.
- getCardValue(card): Gets the numeric value of a card element.
- isFoundationAccepting(card, foundation): Returns true if the foundation can accept the card.
- isTableauAccepting(card, targetCard): Returns true if the tableau target can accept the card.

DECK STATE & UI HELPERS
-----------------------
- setDeckAsNotDepleted(): Sets the deck as not depleted (resets state).
- updateDeckUI(): Updates the deck UI display.

================================================================================
*/


/* ============================================================================
   MODULE-LEVEL VARIABLES & CACHING
============================================================================ */
const foundations = getClassElements('foundation');


/* ============================================================================
   CARD SELECTION & MOVE TARGETING
============================================================================ */
export function showCandidateTargets(card) {
    const sourceElement = card.parentElement;
    // Assumes 'foundations' is available in scope
    highlightTableauTargets(card, sourceElement);
    highlightFoundationTargets(card, foundations);
}

export function handleCardClick(card) {
    clearSelection();
    card.classList.add('selected');
    setSelectedCard(card);
    gsap.to(card, {
        scale: 1.05,
        duration: 0.2,
        ease: "power1.out"
    });
    showCandidateTargets(card);
}

/* ============================================================================
   CARD MOVEMENT & ANIMATION
============================================================================ */
export function moveCardToCandidate(candidate, card) {
    const targetContainer = candidate.parentNode;
    const fromContainer = card.parentElement;
    const selectedRect = card.getBoundingClientRect();
    const candidateRect = candidate.getBoundingClientRect();
    const deltaX = candidateRect.left - selectedRect.left;
    const deltaY = candidateRect.top - selectedRect.top;

    animateMove(card, deltaX, deltaY, () => {
        handleDOMAfterMove(card, candidate, fromContainer, targetContainer);
        handleScoringAndWin(card, fromContainer, targetContainer);
        recordMove(card, fromContainer, targetContainer);
    });
}

function moveCardToTarget(target, card) {
    moveCardToCandidate(target, card);
}

/* ============================================================================
   AUTOMATIC MOVE HANDLING (DOUBLE-CLICK)
============================================================================ */
export function handleCardDoubleClick(card) {
    const sourceElement = card.parentElement;
    // Priority 1: Foundation
    for (const foundation of foundations) {
        const cards = foundation.querySelectorAll('.card:not(.temp)');
        if (cards.length === 0 && isAce(card)) {
            const tempCard = createTempCandidate(foundation);
            moveCardToTarget(tempCard, card);
            return;
        } else if (cards.length > 0) {
            const lastCard = cards[cards.length - 1];
            if (isFoundationAccepting(card, foundation)) {
                moveCardToTarget(lastCard, card);
                return;
            }
        }
    }
    // Priority 2: Tableau (on another card)
    const sections = document.querySelectorAll('section');
    for (const section of sections) {
        if (section === sourceElement) continue;
        const cards = section.querySelectorAll('.card:not(.temp)');
        if (cards.length > 0) {
            const lastCard = cards[cards.length - 1];
            if (isTableauAccepting(card, lastCard)) {
                moveCardToTarget(lastCard, card);
                return;
            }
        }
    }
    // Priority 3: Empty tableau section
    for (const section of sections) {
        if (section === sourceElement) continue;
        const cards = section.querySelectorAll('.card:not(.temp)');
        if (cards.length === 0) {
            const tempCard = createTempCandidate(section);
            moveCardToTarget(tempCard, card);
            return;
        }
    }
}

/* ============================================================================
   UNDO & REDO OPERATIONS
============================================================================ */
export function handleUndoRequest() {
    const lastMove = handleMoveHistory('peek'); // Implement 'peek' to look at the last move without removing it
    if (!lastMove) return;

    if (lastMove.from === 'deck' && lastMove.to === 'discard') {
        undoDiscardMove();
    } else {
        undoBoardMove();
    }
}

/* ============================================================================
   DECK & DISCARD MANAGEMENT
============================================================================ */
export function drawCard() {
    deselectCards();

    const next = getNextCardFromDeck();
    if (!next) return;

    const { suit, value, cardStr } = next;
    const card = createCardElement(suit, value);
    placeCardInDiscard(card);
    recordDrawMove(suit + value);
    animateCardDraw(card);
    updateDeckDisplay();
    const theShuffledDeck = getShuffledDeck();
    if (theShuffledDeck.length === 0) {
        const discard = getContainerById('discard');
        handleDeckDepletion(discard);
    }
}

export function refreshDeck() {
    const clicks = getRefreshDeckClicks();
    setRefreshDeckClicks(clicks + 1);
    //refreshDeckClicks++;
    let refreshFlag = false;
    setRefreshCount(refreshCount + 1);
    const cost = (refreshCount) * getRefreshCost();
    const currentScore = getCurrentScore(score);
    
    if (currentScore >= cost) {
        refreshFlag = true;
        setRefreshDeckClicks(0);
        //refreshDeckClicks = 0;
        const newScore = currentScore - cost;
        setScore(newScore);
        const discard = getContainerById('discard');
        const theShuffledDeck = getShuffledDeck();
        refillDeckFromDiscard(discard, theShuffledDeck);
        const refresh = getContainerById('refresh');
        restoreDeck(refresh);
        setDeckAsNotDepleted();
        handleEmptyDeckAndDiscard(theShuffledDeck, discard);
        updateScoreDisplay(newScore);
        updateDeckUI();
        
    } else {
        const updatedClicks = getRefreshDeckClicks();
        if( updatedClicks === 1 && refreshFlag === false ){
            const message = `You need at least ${cost} points to refresh the deck.`;
            showError(message);
            if( updatedClicks > 1 ){
               setRefreshCount(refreshCount - 1); 
            }
        }
    }
} 

/* ============================================================================
   MOVE VALIDATION HELPERS
============================================================================ */
function isAce(card) {
    return parseInt(card.getAttribute('data-value'), 10) === 1;
}

function getCardSuit(card) {
    return card.getAttribute('data-suit');
}

function getCardValue(card) {
    return parseInt(card.getAttribute('data-value'), 10);
}

function isFoundationAccepting(card, foundation) {
    const cards = foundation.querySelectorAll('.card:not(.temp)');
    if (cards.length === 0) return isAce(card);
    const lastCard = cards[cards.length - 1];
    return getCardSuit(card) === getCardSuit(lastCard) && getCardValue(card) === getCardValue(lastCard) + 1;
}

function isTableauAccepting(card, targetCard) {
    return getCardSuit(card) === getCardSuit(targetCard) && getCardValue(card) === getCardValue(targetCard) - 1;
}

/* ============================================================================
   DECK STATE & UI HELPERS
============================================================================ */
function setDeckAsNotDepleted() {
    setDeckDepleted(false);
}

function updateDeckUI() {
    updateDeckDisplay();
}