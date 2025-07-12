import { moveCardToCandidate, drawCard, refreshDeck, handleCardClick, handleCardDoubleClick, handleUndoRequest } from './gameActions.js';

import { startNewGame, selectedCard } from './game.js';

import { clearSelection, updateUndoButtonText } from './ui.js';

export function setupEventListeners() {
    window.addEventListener('resize', () => {
        import('./ui.js').then(({ stackCards, setSectionHeights }) => {
            stackCards();
            setSectionHeights();
        });
    });

    document.addEventListener('click', function(e) {
        const card = e.target.closest('.card');
        const candidate = e.target.closest('.candidate');
        const deck = e.target.closest('#deck');
        const refresh = e.target.closest('#refresh');
        const undoBtn = e.target.closest('#undo'); // Add this

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