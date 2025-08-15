import { moveCardToCandidate, drawCard, refreshDeck, handleCardClick, handleCardDoubleClick, handleUndoRequest } from './gameActions.js';

import { startNewGame, selectedCard, setStatsDisplayFlag, setOlenMode } from './game.js';

import { clearSelection, updateUndoButtonText, resetGameStatsInfo, updateDeckDisplay, olenModeDisplay } from './ui.js';

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
            updateDeckDisplay();
            return;
        }
        if (refresh) {
            refreshDeck();
            return;
        }
        if (resetStats) {
            // deletes all data
            deleteAllSolitaireUserData();
            // sets the data in the stats window
            resetGameStatsInfo();
            // this flag is used in the startNewGame function to determine what is shown in the stats window
            setStatsDisplayFlag(false);
            // starts a new game
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

    // --- HOLD HEADER FOR 2 SECONDS HANDLER ---
    const header = document.querySelector('h1');
    let holdTimer = null;
    const holdDuration = 2000;

    function handleHoldHeader() {
        const mode = prompt('type "true" to enable Olen mode, "false" to disable Olen mode');
        if(mode === 'true'){
            const convertToBoolean = Boolean(mode);
            setOlenMode(convertToBoolean);
        } else {
            setOlenMode(false);
        }
        olenModeDisplay();
    }

    if (header) {
        // Mouse events for desktop
        header.addEventListener("mousedown", () => {
            holdTimer = setTimeout(handleHoldHeader, holdDuration);
        });
        header.addEventListener("mouseup", () => {
            clearTimeout(holdTimer);
        });
        header.addEventListener("mouseleave", () => {
            clearTimeout(holdTimer);
        });

        // Touch events for mobile
        header.addEventListener("touchstart", () => {
            holdTimer = setTimeout(handleHoldHeader, holdDuration);
        });
        header.addEventListener("touchend", () => {
            clearTimeout(holdTimer);
        });
        header.addEventListener("touchmove", () => {
            clearTimeout(holdTimer);
        });
    }
}