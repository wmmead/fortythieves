import { moveCardToCandidate, drawCard, refreshDeck, handleCardClick, handleCardDoubleClick, handleUndoRequest } from './gameActions.js';

import { startNewGame, selectedCard } from './game.js';

import { clearSelection, updateUndoButtonText, resetGameStatsInfo } from './ui.js';

import { deleteAllSolitaireUserData } from './stats.js';


export function setupEventListeners() {
    window.addEventListener('resize', () => {
        import('./ui.js').then(({ stackCards, setSectionHeights, updateCardImageDirectory }) => {
            stackCards();
            setSectionHeights();
            const windowSize = window.innerWidth;
            if(windowSize < 850){
                updateCardImageDirectory('cards', 'cards-small');
            } else {
                updateCardImageDirectory('cards-small', 'cards');
            }
        });
    });

    document.addEventListener('click', function(e) {
        const card = e.target.closest('.card');
        const candidate = e.target.closest('.candidate');
        const deck = e.target.closest('#deck');
        const refresh = e.target.closest('#refresh');
        const undoBtn = e.target.closest('#undo');
        const resetStats = e.target.closest('#resetstats');

        if (undoBtn) {
            handleUndoRequest();
            updateUndoButtonText();
            return;
        }
        if (deck) {
            drawCard();
            return;
        }
        if (refresh) {
            refreshDeck();
            return;
        }
        if (resetStats) {
            deleteAllSolitaireUserData();
            resetGameStatsInfo();
            startNewGame();
        }
        if (candidate && selectedCard) {
            moveCardToCandidate(candidate, selectedCard);
        } else if (card && !card.classList.contains('temp') && !card.classList.contains('candidate')) {
            handleCardClick(card);
        } else {
            clearSelection();
        }
    });

    // Add double-click event for auto-move
    document.addEventListener('dblclick', function(e) {
        const card = e.target.closest('.card');
        if (card && !card.classList.contains('temp') && !card.classList.contains('candidate')) {
            handleCardDoubleClick(card);
        }
    });

    document.querySelectorAll('.newgame').forEach(btn => {
        btn.addEventListener('click', () => {
            startNewGame();
        });
    });
}