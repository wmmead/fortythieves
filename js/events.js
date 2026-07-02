import { moveCardToCandidate, drawCard, refreshDeck, handleCardClick, handleCardDoubleClick, handleUndoRequest } from './gameActions.js';

import { startNewGame, selectedCard, setStatsDisplayFlag, setOlenMode } from './game.js';

import { clearSelection, updateUndoButtonText, resetGameStatsInfo, updateDeckCounter, toggleMenu, closeMenu, olenModeDisplay, openInstructions, closeInstructions, stackCards, setSectionHeights, stackDiscard, updateCardImageDirectory } from './ui.js';

import { deleteAllSolitaireUserData } from './stats.js';


export function setupEventListeners() {
    // Debounce so the full restack only runs once the resize settles,
    // not dozens of times per second while the window is being dragged
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            stackCards();
            setSectionHeights();
            stackDiscard();
            const windowSize = window.innerWidth;
            if(windowSize < 850){
                updateCardImageDirectory('cards', 'cards-small');
            } else {
                updateCardImageDirectory('cards-small', 'cards');
            }
        }, 100);
    });

    document.addEventListener('click', function(e) {
        const card = e.target.closest('.card');
        const candidate = e.target.closest('.candidate');
        const deck = e.target.closest('#deck');
        const refresh = e.target.closest('#refresh');
        const undoBtn = e.target.closest('#undo');
        const resetStats = e.target.closest('#resetstats');
        const hamburgermenu = e.target.closest('#hamburgermenu');
        const howToPlay = e.target.closest('#howtoplay');
        const closeInstr = e.target.closest('#closeinstructions');

        if (howToPlay) {
            e.preventDefault();
            closeMenu();
            openInstructions();
            return;
        }
        if (closeInstr) {
            closeInstructions();
            return;
        }
        if (undoBtn) {
            e.preventDefault(); // it's an <a href="#">; don't jump to the top of the page
            if (undoBtn.classList.contains('disabled')) return;
            handleUndoRequest();
            updateUndoButtonText();
            return;
        }
        if (deck) {
            drawCard();
            updateDeckCounter();
            return;
        }
        if (refresh) {
            refreshDeck();
            return;
        }
        if (hamburgermenu){
            toggleMenu();
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

    // Close the instructions popup on Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeInstructions();
    });

    // Add double-click event for auto-move
    document.addEventListener('dblclick', function(e) {
        const card = e.target.closest('.card');
        if (card && !card.classList.contains('temp') && !card.classList.contains('candidate')) {
            handleCardDoubleClick(card);
        }
    });

    document.querySelectorAll('.newgame').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault(); // it's an <a href="#">; don't jump to the top of the page
            startNewGame();
        });
    });

    // --- HOLD HEADER FOR 2 SECONDS HANDLER ---
    const header = document.querySelector('h1');
    let holdTimer = null;
    const holdDuration = 2000;

    function handleHoldHeader() {
        const mode = prompt('type "true" to enable Olen mode, "false" to disable Olen mode');
        setOlenMode(mode === 'true');
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