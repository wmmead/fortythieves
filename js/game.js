// Import UI update functions for card stacking, layout, and deck counter
import { stackCards, setSectionHeights, createCardElement, blockUserInteraction, unblockUserInteraction, setDeckRefresh, setRefreshToEmpty, restoreDeck, clearBoard, updateUndoButtonText, updateDeckCounter, getContainerById, getClassElements, getLastDiscard, findCardInContainer, moveCardElement, updateCardStyle, restackCards, updateSectionHeights, showError, updateScoreDisplay, showWinScreen, resetMain, updateGameStatsInfo } from './ui.js';
import { getCardMoveDelta, animateMove } from './animation.js';
import { setupEventListeners } from './events.js';
import { createNewGameRecord, updateCurrentGameStats, deleteZeroMoveRecords, moveCurrentGameToStats } from './stats.js';

/*
================================================================================
Game Logic Module - Section and Function Index
================================================================================

MODULE-LEVEL VARIABLES & CONSTANTS
----------------------------------
- foundations: NodeList of all foundation containers.
- deckDepleted: Boolean flag indicating if the deck is empty.
- moveHistory: Array tracking all moves made in the game.
- shuffledDeck: Array representing the current shuffled deck.
- selectedCard: Currently selected card (or null).
- score: Current player score.
- undoCount: Number of undo actions taken.
- refreshCount: Number of times the deck has been refreshed.
- cardValues: Array of all card identifiers for two decks.

INITIALIZATION & SETUP
----------------------
- initGame(): Set up the initial game state, deal cards, and attach event listeners.
- setSelectedCard(value): Set the currently selected card.
- startNewGame(): Reset the game state, reshuffle, clear the board, and restart UI.

DECK MANAGEMENT
---------------
- shuffleDeck(deck): Shuffle a deck array using the Fisher-Yates algorithm.
- getShuffledDeck(): Return the current shuffled deck array.
- setDeckDepleted(value): Set the deckDepleted flag.
- distributeCards(deck): Deal 40 cards to tableau sections with animation and update layout.
- getNextCardFromDeck(): Draw and return the next card object from the deck.
- handleDeckDepletion(discard): Handle UI and state when the deck is depleted.
- refillDeckFromDiscard(discard, deckArray): Move all cards from discard back into the deck array.

MOVE HANDLING & VALIDATION
--------------------------
- isValidTableauMove(card, targetCard): Validate if a move to a tableau is legal.
- isValidFoundationMove(card, targetCard): Validate if a move to a foundation is legal.
- recordDrawMove(cardId): Record a move from deck to discard in move history.
- recordMove(card, fromContainer, targetContainer): Record a generic card move in move history.
- handleMoveHistory(action, move): Add, undo, or peek at move history.

UNDO & REDO OPERATIONS
----------------------
- undoBoardMove(): Undo the last board move, animate and update UI.
- undoDiscardMove(): Undo the last discard move, restore card to deck.
- handleUndoCost(): Deduct score for undoing, update undo count and button.
- payUndoCost(): Internal helper to check and pay undo cost.
- popLastMove(): Internal helper to pop the last move from history.

SCORING & GAME PROGRESSION
--------------------------
- handleScoringAndWin(card, fromContainer, targetContainer): Update score for moves and check for win.
- addScore(points): Add points to the score and update display.
- subtractScore(points): Subtract points from the score and update display.
- deductFoundationScore(card): Internal helper to subtract score for foundation undo.
- checkWinCondition(): Check if the win condition is met (all foundations end with a King).

DECK REFRESH & COST MANAGEMENT
------------------------------
- setUndoCount(value): Set the undo count.
- setRefreshCount(value): Set the refresh count.

================================================================================
*/


/* ============================================================================
   MODULE-LEVEL VARIABLES & CONSTANTS
============================================================================ */

const foundations = getClassElements('foundation');
export let deckDepleted = false;
export const moveHistory = [];
export let shuffledDeck = [];
export let selectedCard = null;
export let score = 0;
export let undoCount = 0;
export let refreshCount = 0;
export let refreshCost = 100;
export let refreshDeckClicks = 0;
// Full list of card identifiers for two standard decks (104 cards)
const cardValues = [
    'c1', 'd1', 'h1', 's1', 
    'c2', 'd2', 'h2', 's2', 
    'c3', 'd3', 'h3', 's3', 
    'c4', 'd4', 'h4', 's4', 
    'c5', 'd5', 'h5', 's5',
    'c6', 'd6', 'h6', 's6',
    'c7', 'd7', 'h7', 's7',
    'c8', 'd8', 'h8', 's8',
    'c9', 'd9', 'h9', 's9',
    'c10', 'd10', 'h10', 's10',
    'c11',  'd11',  'h11',  's11',
    'c12',  'd12',  'h12',  's12',
    'c13',  'd13',  'h13',  's13',
    'c1', 'd1', 'h1', 's1', 
    'c2', 'd2', 'h2', 's2', 
    'c3', 'd3', 'h3', 's3', 
    'c4', 'd4', 'h4', 's4', 
    'c5', 'd5', 'h5', 's5',
    'c6', 'd6', 'h6', 's6',
    'c7', 'd7', 'h7', 's7',
    'c8', 'd8', 'h8', 's8',
    'c9', 'd9', 'h9', 's9',
    'c10', 'd10', 'h10', 's10',
    'c11',  'd11',  'h11',  's11',
    'c12',  'd12',  'h12',  's12',
    'c13',  'd13',  'h13',  's13'
];

/* ============================================================================
   INITIALIZATION & SETUP
============================================================================ */
export async function initGame() {
    await distributeCards(shuffledDeck);
    deleteZeroMoveRecords();
    updateGameStatsInfo();
    createNewGameRecord();
    setupEventListeners();
}

export function setSelectedCard(value) {
    selectedCard = value;
}

export async function startNewGame() {
    // block user interaction while deck is created
    blockUserInteraction();
    resetMain();
    // Clear all tableau sections, foundations, and discard pile
    clearBoard();
    // Create a completely new shuffled deck from the original cardValues
    const newDeck = shuffleDeck(cardValues);
    shuffledDeck.length = 0;
    shuffledDeck.push(...newDeck);
    // Reset deckDepleted flag
    setDeckDepleted(false);
    // Reset deck and discard containers
    const deckDiv = getContainerById('deck') || getContainerById('refresh') || getContainerById('empty');
    restoreDeck(deckDiv)
    // reset refreshCount to zero
    setRefreshCount(0);
    // set resetDeckClicks
    setRefreshDeckClicks(0);
    // reset score to zero
    score = 0;
    // update score display
    updateScoreDisplay(score);
    // Deal new cards and reinitialize UI
    await distributeCards(shuffledDeck);
    unblockUserInteraction();
    deleteZeroMoveRecords();
    moveCurrentGameToStats();
    updateGameStatsInfo();
    createNewGameRecord();
}

/* ============================================================================
   DECK MANAGEMENT
============================================================================ */

// Shuffle the provided deck using Fisher-Yates algorithm and return a new array
export function shuffleDeck(deck) {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Initialize the shuffledDeck at module load
shuffledDeck = shuffleDeck(cardValues);

export function getShuffledDeck(){
    return shuffledDeck;
}

export function setDeckDepleted(value) {
    deckDepleted = value;
}

// Deal 40 cards to the tableau sections, updating UI after each card (with animation delay)
export async function distributeCards(deck) {
    const sections = document.querySelectorAll('section');
    const numSections = sections.length;
    for (let i = 0; i < 40; i++) {
        const cardStr = deck.shift();
        if (!cardStr) {
            // Stop dealing if no more cards
            break;
        }
        const suit = cardStr.charAt(0);
        const value = cardStr.substring(1);
        const sectionIndex = i % numSections;
        sections[sectionIndex].appendChild(createCardElement(suit, value));
        stackCards();
        setSectionHeights();
        await new Promise(resolve => setTimeout(resolve, 200));
    }
}

export function getNextCardFromDeck() {
    const cardStr = shuffledDeck.shift();
    if (!cardStr) return null;
    const suit = cardStr.charAt(0);
    const value = cardStr.substring(1);
    return { suit, value, cardStr };
}

export function handleDeckDepletion(discard) {
    const deckDiv = document.getElementById('deck');
    if (deckDiv) {
        setDeckRefresh(deckDiv);
    }
    setDeckDepleted(true);
    // Edge case: discard is empty
    if (discard.childElementCount === 0) {
        setRefreshToEmpty();
    }
}

export function refillDeckFromDiscard(discard, deckArray) {
    const cards = discard.querySelectorAll('.card');
    deckArray.length = 0; // Clear the current deck
    cards.forEach(card => {
        const suit = card.getAttribute('data-suit');
        const value = card.getAttribute('data-value');
        deckArray.push(suit + value);
        card.remove();
    });
}

/* ============================================================================
   MOVE HANDLING & VALIDATION
============================================================================ */
export function isValidTableauMove(card, targetCard) {
    const suit = card.getAttribute('data-suit');
    const value = parseInt(card.getAttribute('data-value'), 10);
    const targetSuit = targetCard.getAttribute('data-suit');
    const targetValue = parseInt(targetCard.getAttribute('data-value'), 10);
    return suit === targetSuit && value === targetValue - 1;
}

export function isValidFoundationMove(card, targetCard) {
    const suit = card.getAttribute('data-suit');
    const value = parseInt(card.getAttribute('data-value'), 10);
    const targetSuit = targetCard.getAttribute('data-suit');
    const targetValue = parseInt(targetCard.getAttribute('data-value'), 10);
    return suit === targetSuit && value === targetValue + 1;
}

export function recordDrawMove(cardId) {
    handleMoveHistory('add', {
        cardId,
        from: 'deck',
        to: 'discard'
    });
}

export function recordMove(card, fromContainer, targetContainer) {
    const move = {
        cardId: card.getAttribute('data-suit') + card.getAttribute('data-value'),
        from: fromContainer.id,
        to: targetContainer.id
    };
    handleMoveHistory('add', move);
    updateCurrentGameStats(score);
}

/**
 * Handles move history updates.
 * @param {'add'|'undo'} action - Whether to add a move or undo the last move.
 * @param {Object} [move] - The move object to add (required if action is 'add').
 * @returns {Object|undefined} The undone move if action is 'undo', otherwise undefined.
 */
export function handleMoveHistory(action, move) {
    if (action === 'add' && move) {
        moveHistory.push(move);
    } else if (action === 'undo') {
        const undoneMove = moveHistory.pop();
        return undoneMove;
    } else if (action === 'peek') {
        return moveHistory.length > 0 ? moveHistory[moveHistory.length - 1] : undefined;
    }
}

/* ============================================================================
   UNDO & REDO OPERATIONS
============================================================================ */
export function undoBoardMove() {
    if (!payUndoCost()) return;
    const lastMove = popLastMove();
    if (!lastMove) return;

    const fromContainer = getContainerById(lastMove.from);
    const toContainer = getContainerById(lastMove.to);
    if (!fromContainer || !toContainer) {
        console.warn('Undo failed: container not found.', lastMove);
        return;
    }

    const card = findCardInContainer(toContainer, lastMove.cardId);
    if (!card) {
        console.warn('Undo failed: card not found in expected container.', lastMove);
        return;
    }

    if (toContainer.classList.contains('foundation')) {
        deductFoundationScore(card);
    }

    const { deltaX, deltaY } = getCardMoveDelta(card, fromContainer);
    animateMove(card, deltaX, deltaY, () => {
        moveCardElement(card, fromContainer);
        updateCardStyle(card, fromContainer);
        restackCards();
        updateSectionHeights();
    });
}

export function undoDiscardMove() {
    if (!handleUndoCost()) return; // Only proceed if cost was paid
    const lastMove = handleMoveHistory('undo');
    if (!lastMove) return;

    const discard = getContainerById('discard');
    if (!discard) {
        console.warn('Undo failed: discard pile not found.', lastMove);
        return;
    }
    // The top card in the discard pile should be the one to move back
    const cards = getLastDiscard(lastMove);
    let card = null;
    for (let i = cards.length - 1; i >= 0; i--) {
        if (cards[i].parentElement === discard) {
            card = cards[i];
            break;
        }
    }
    if (!card) {
        console.warn('Undo failed: card not found in discard pile.', lastMove);
        return;
    }
    // Remove card from discard and put it back on top of the deck (data only, not animated)
    discard.removeChild(card);
    shuffledDeck.unshift(lastMove.cardId); // Put card string back on top of deck

    // --- Edge case fix: If the deck was empty, restore deck element and state ---
    updateRefreshButtonToDeck();
    setDeckDepleted(false);
    updateDeckCounter();
}

export function handleUndoCost() {
    const cost = undoCount + 1;
    //console.log(score);
    if (score < cost) {
        showError('You need more points to undo this move.')
        //alert('Not enough points to undo this move.');
        return false; // Indicate failure
    }
    subtractScore(cost);
    setUndoCount(cost);
    updateUndoButtonText();
    return true; // Indicate success
}

function payUndoCost() {
    // Return true if undo cost is paid, else false
    return handleUndoCost();
}

function popLastMove() {
    // Returns the last move object or null
    return handleMoveHistory('undo');
}

/* ============================================================================
   SCORING & GAME PROGRESSION
============================================================================ */
export function handleScoringAndWin(card, fromContainer, targetContainer) {
    const isFoundation = targetContainer.classList.contains('foundation');
    const isSection = targetContainer.tagName === 'SECTION';
    const fromIsFoundation = fromContainer.classList.contains('foundation');
    const cardValue = parseInt(card.getAttribute('data-value'), 10);

    // Add to score if card is placed on a foundation
    if (isFoundation) {
        addScore(cardValue);
        checkWinCondition();
    }

    // Subtract from score if card is moved FROM a foundation TO a section
    if (fromIsFoundation && isSection) {
        subtractScore(cardValue);
    }
}

export function addScore(points) {
    score += points;
    updateScoreDisplay(score);
}

export function subtractScore(points) {
    score -= points;
    if (score < 0) score = 0;
    updateScoreDisplay(score);
}

export function getCurrentScore(score){
    return score;
}

export function setScore(value){
    score = value;
}

function deductFoundationScore(card) {
    const cardValue = parseInt(card.getAttribute('data-value'), 10);
    subtractScore(cardValue);
}

function checkWinCondition() {
    for (const foundation of foundations) {
        const cards = foundation.querySelectorAll('.card:not(.temp)');
        if (cards.length === 0) return; // Not enough cards
        const lastCard = cards[cards.length - 1];
        if (parseInt(lastCard.getAttribute('data-value')) !== 13) return; // Not a King
    }
    // All foundations end with a King
    let winType;
    if( score == 728 ){
        winType = 'win';
    } else {
        winType = 'clear';
    }
    moveCurrentGameToStats();
    updateGameStatsInfo();
    showWinScreen(winType);
}

/* ============================================================================
   DECK REFRESH & COST MANAGEMENT
============================================================================ */

export function setUndoCount(value) {
    undoCount = value;
}

export function setRefreshCount(value) {
    refreshCount = value;
}

export function getRefreshCost(){
    return refreshCost;
}

export function setRefreshDeckClicks(value){
    refreshDeckClicks = value;
}

export function getRefreshDeckClicks(){
    return refreshDeckClicks;
}

