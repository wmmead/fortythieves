// Import UI utilities for positioning, stacking, layout, and deck counter updates
import { handleDOMAfterMove, clearSelection, deselectCards, createCardElement, placeCardInDiscard, highlightTableauTargets, highlightFoundationTargets, createTempCandidate, updateDeckCounter, updateScoreDisplay, restoreDeck, handleEmptyDeckAndDiscard, getContainerById, getClassElements, showError, stackDiscard, blockUserInteraction, unblockUserInteraction } from './ui.js';
// Import the current shuffled deck from game state
import { getShuffledDeck, setSelectedCard, setDeckDepleted, getNextCardFromDeck, handleMoveHistory, recordMove, recordDrawMove, handleDeckDepletion, refillDeckFromDiscard, handleScoringAndWin, undoBoardMove, undoDiscardMove, score, getCurrentScore, setScore,  getRefreshCost, setStatsDisplayFlag, olenMode, canAutoComplete } from './game.js';
// Import animations
import { animateCardMove, animateDiscardCard } from './animation.js';
import { playSingleTapSound, playDoubleTapSound, playCardDownSound } from './audio.js';
/* global gsap */ // gsap is loaded as a global via the <script> tag in index.html

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

AUTO-COMPLETE (TAP THE EMPTY DECK)
----------------------------------
- autoCompleteToFoundations(): Play the rest of a finishable board out, one animated card at a time.
- isAutoCompleting(): True while that sequence is running.
- playNextAutoMove(): Internal; plays one move and schedules the next from its completion.
- findNextFoundationMove(): Internal; the next tableau card that a foundation will take, with its target.

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

================================================================================
*/


/* ============================================================================
   MODULE-LEVEL VARIABLES & CACHING
============================================================================ */
const foundations = getClassElements('foundation');


/* ============================================================================
   CARD SELECTION & MOVE TARGETING
============================================================================ */
// Moving a card off a foundation back to the tableau costs its value in points;
// foundation-to-foundation moves are free. Olen mode skips the rule entirely.
function canAffordFoundationMove(card, fromContainer, targetIsSection) {
    if (olenMode) return true;
    if (!fromContainer.classList.contains('foundation') || !targetIsSection) return true;
    return score >= getCardValue(card);
}

export function showCandidateTargets(card) {
    const sourceElement = card.parentElement;
    // Assumes 'foundations' is available in scope
    if (canAffordFoundationMove(card, sourceElement, true)) {
        highlightTableauTargets(card, sourceElement);
    }
    highlightFoundationTargets(card, foundations);
}

export function handleCardClick(card) {
    clearSelection();

    if(!olenMode){
        const legalMove = checkCardPosition(card);
        if(!legalMove){
            return;
        }
    }
    // Passed all checks; now select this card
    card.classList.add('selected');
    setSelectedCard(card);
    playSingleTapSound();
    gsap.to(card, { scale: 1.05, duration: 0.2, ease: "power1.out" });
    showCandidateTargets(card);
}

function checkCardPosition(card){
    let legalMove = true;
    const parent = card.parentElement;
    // Tableau: Only bottom card can be selected
    if (parent.tagName === 'SECTION') {
    const cards = parent.querySelectorAll('.card:not(.temp)');
        if (cards[cards.length - 1] !== card){
            legalMove = false;
        } // Not the bottom card
    } 
    // Foundation: Only top card can be selected
    else if (parent.classList.contains('foundation')) {
    const cards = parent.querySelectorAll('.card:not(.temp)');
        if (cards[cards.length - 1] !== card){
            legalMove = false;
        } // Not the top card
    }
    // Deck or Discard: Only top card selectable
    else if (parent.id === 'deck' || parent.id === 'discard') {
    const cards = parent.querySelectorAll('.card:not(.temp)');
        if (cards.length === 0 || cards[cards.length - 1] !== card){
            legalMove = false;
        } // Not top card
    }
    return legalMove;
}



/* ============================================================================
   CARD MOVEMENT & ANIMATION
============================================================================ */
/**
 * @param {HTMLElement} candidate - the card (or temp placeholder) being landed on.
 * @param {HTMLElement} card - the card to move.
 * @param {Function} [onComplete] - run once the move has fully landed and been
 *   scored. Only the auto-complete sequence uses it, to chain the next move.
 */
export function moveCardToCandidate(candidate, card, onComplete) {
    // The move (DOM reparenting, scoring, history) is applied in the animation's
    // onComplete, so the selection and candidate highlights stay live while the
    // card is in flight. A second click during that window would replay the whole
    // move — double-scoring it — so ignore clicks on a card already in motion.
    if (card.dataset.moving === 'true') return false;

    const targetContainer = candidate.parentNode;
    const fromContainer = card.parentElement;

    if (!canAffordFoundationMove(card, fromContainer, targetContainer.tagName === 'SECTION')) {
        if (candidate.classList.contains('temp')) candidate.remove();
        showError('You need more points to move this card off the foundation.');
        return false;
    }

    card.dataset.moving = 'true';
    const selectedRect = card.getBoundingClientRect();
    const candidateRect = candidate.getBoundingClientRect();
    const deltaX = candidateRect.left - selectedRect.left;
    const deltaY = candidateRect.top - selectedRect.top;

    animateCardMove(card, deltaX, deltaY, () => {
        delete card.dataset.moving;
        handleDOMAfterMove(card, candidate, fromContainer, targetContainer);
        handleScoringAndWin(card, fromContainer, targetContainer);
        recordMove(card, fromContainer, targetContainer);
        playCardDownSound();
        // Last, so anything chaining off this move sees a fully settled board —
        // including the win screen, if that move was the one that finished it.
        if (onComplete) onComplete();
    });
    return true;
}

function moveCardToTarget(target, card) {
    if (moveCardToCandidate(target, card)) {
        setStatsDisplayFlag(true);
    }
}

/* ============================================================================
   AUTOMATIC MOVE HANDLING (DOUBLE-CLICK)
============================================================================ */
export function handleCardDoubleClick(card) {
    
    if(!olenMode){
        const legalMove = checkCardPosition(card);
        if(!legalMove){
            return;
        }
    }
    // Passed all checks; now select this card
    playDoubleTapSound();
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
   AUTO-COMPLETE (TAP THE EMPTY DECK)
============================================================================ */
// Once the deck and the discard are both gone the deck slot becomes #empty, and
// on a board where every remaining card can reach a foundation there is nothing
// left to decide — only the clicking. Tapping the slot in that state plays the
// rest of the game out, one card at a time, through exactly the same path a
// hand-played move takes: same animation, same landing sound, same scoring, same
// move history. The player sees the game they would have played, without playing it.
let autoCompleting = false;

export function isAutoCompleting() {
    return autoCompleting;
}

export function autoCompleteToFoundations() {
    if (autoCompleting) return;
    // Only ever offered as a finish. A board that would strand partway through is
    // left to the player, because dumping every card a foundation happens to take
    // costs them the tableau targets they need to unbury the rest — and points with them.
    if (!canAutoComplete()) {
        showError('Some cards are still out of order — keep arranging the tableau.');
        return;
    }
    autoCompleting = true;
    clearSelection();
    // The deal already blocks the board while it runs; do the same here, so a tap
    // landing between two cards can't select or move anything mid-sequence.
    blockUserInteraction();
    playNextAutoMove();
}

function playNextAutoMove() {
    const next = findNextFoundationMove();
    // Nothing left to play: either the board is clear (the win screen has already
    // replaced the tableau by now, from the last move's scoring) or a move was
    // refused below. Either way the sequence is over and the board goes back to the player.
    if (!next) {
        autoCompleting = false;
        unblockUserInteraction();
        return;
    }
    if (!moveCardToCandidate(next.target, next.card, playNextAutoMove)) {
        // Shouldn't happen — a move onto a foundation is never refused — but stop
        // rather than re-pick the same card forever if it ever does.
        if (next.target.classList.contains('temp')) next.target.remove();
        autoCompleting = false;
        unblockUserInteraction();
        return;
    }
    setStatsDisplayFlag(true);
}

// The next playable tableau card and the thing it lands on: the foundation's top
// card, or a temp placeholder when the foundation is empty and the card is an ace
// (the same placeholder a double-click uses, so the move animates to a real slot).
function findNextFoundationMove() {
    const sections = document.querySelectorAll('section');
    for (const section of sections) {
        const cards = section.querySelectorAll('.card:not(.temp)');
        if (cards.length === 0) continue;
        const card = cards[cards.length - 1];
        for (const foundation of foundations) {
            const foundationCards = foundation.querySelectorAll('.card:not(.temp)');
            if (foundationCards.length === 0) {
                if (isAce(card)) return { card, target: createTempCandidate(foundation) };
            } else if (isFoundationAccepting(card, foundation)) {
                return { card, target: foundationCards[foundationCards.length - 1] };
            }
        }
    }
    return null;
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
    playCardDownSound();
    animateDiscardCard(card);
    updateDeckCounter();
    const theShuffledDeck = getShuffledDeck();
    if (theShuffledDeck.length === 0) {
        const discard = getContainerById('discard');
        handleDeckDepletion(discard);
    }
}

export function refreshDeck() {
    let refreshFlag = false;
    const cost = getRefreshCost();
    const currentScore = getCurrentScore(score);
    
    if (currentScore >= cost) {
        refreshFlag = true;
        const newScore = currentScore - cost;
        setScore(newScore);
        const discard = getContainerById('discard');
        const theShuffledDeck = getShuffledDeck();
        refillDeckFromDiscard(discard, theShuffledDeck);
        // Shrink the discard background back to the empty (one-card) size now that
        // the fan has been emptied, so it animates down immediately.
        stackDiscard();
        const refresh = getContainerById('refresh');
        restoreDeck(refresh);
        setDeckDepleted(false);
        handleEmptyDeckAndDiscard(theShuffledDeck, discard);
        updateScoreDisplay(newScore);
        updateDeckCounter();

    } else {
        const message = `You need at least ${cost} points to refresh the deck.`;
        showError(message);
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