import { moveCardToCandidate, drawCard, refreshDeck, handleCardClick, handleCardDoubleClick, handleUndoRequest } from './gameActions.js';

import { startNewGame, isDealing, selectedCard, setStatsDisplayFlag, setOlenMode, canUndo } from './game.js';

import { clearSelection, updateUndoButtonText, resetGameStatsInfo, updateDeckCounter, toggleMenu, closeMenu, olenModeDisplay, openInstructions, closeInstructions, openConfirmDialog, closeConfirmDialog, stackCards, setSectionHeights, stackDiscard, updateCardImageDirectory } from './ui.js';

import { deleteAllSolitaireUserData } from './stats.js';

import { playNewGameSound } from './audio.js';


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
        const confirmOk = e.target.closest('#confirm-ok');
        const confirmCancel = e.target.closest('#confirm-cancel');
        const hamburgermenu = e.target.closest('#hamburgermenu');
        const newGame = e.target.closest('.newgame');
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
            closeMenu();
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
            // opens the confirmation dialog instead of resetting immediately
            closeMenu();
            openConfirmDialog();
            return;
        }
        if (confirmOk) {
            closeConfirmDialog();
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
        if (confirmCancel) {
            closeConfirmDialog();
            return;
        }
        if (newGame) {
            e.preventDefault(); // they're <a href="#">; don't jump to the top of the page
            // startNewGame() refuses to run mid-deal on its own, but the sound
            // is played here, so it needs the same check or a press during a
            // deal would still be audible with nothing behind it.
            if (isDealing()) return;
            playNewGameSound();
            startNewGame(); // closes the menu itself
            return;
        }
        if (candidate && selectedCard) {
            moveCardToCandidate(candidate, selectedCard);
        } else if (card && !card.classList.contains('temp') && !card.classList.contains('candidate')) {
            // A double-click fires two 'click' events (detail 1, then 2) before
            // 'dblclick' — skip the second one so it doesn't also select/play
            // the single-tap sound right on top of the double-click handling.
            if (e.detail > 1) return;
            handleCardClick(card);
        } else {
            clearSelection();
        }
    });

    // Close the instructions popup / reset-stats confirmation on Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeInstructions();
            closeConfirmDialog();
        }
        // Cmd+Z (Mac) / Ctrl+Z (Windows) triggers undo, same as the menu button
        if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
            e.preventDefault(); // keep the browser from undoing text edits instead
            if (!canUndo()) return;
            handleUndoRequest();
            updateUndoButtonText();
        }
        // Cmd+Option+G (Mac) / Ctrl+Alt+G (Windows) starts a new game, same as
        // every .newgame button.
        //
        // Cmd/Ctrl+N is the browser's own new-window shortcut and isn't ours to
        // take; Cmd/Ctrl+Shift+N opens a private window in Chrome and Edge.
        // Cmd+Option+N was the first choice and does work on macOS, but Safari
        // on iPadOS claims it for its own window handling, so an iPad with a
        // Magic Keyboard never saw it. G is free on both. That matters for more
        // than the iPad: one combination that works everywhere means one hint
        // that's correct everywhere, with no need to tell an iPad apart from a
        // Mac — a distinction that is about to stop being reliable anyway, since
        // a touchscreen MacBook would report touch points exactly as an iPad does.
        //
        // Matched on e.code, not e.key: holding Option on macOS rewrites the
        // character the browser reports (Option+G gives the copyright sign), so
        // e.key is never 'g' here. e.code names the physical key and is
        // unaffected by modifiers or layout. (The undo shortcut above can safely
        // use e.key because Option isn't part of it.)
        if ((e.metaKey || e.ctrlKey) && e.altKey && !e.shiftKey && e.code === 'KeyG') {
            e.preventDefault();
            // Same check as the button route above. This is the path the bug
            // came in by: the interaction blocker stops clicks during a deal,
            // but a keydown listener on document never sees it.
            if (isDealing()) return;
            playNewGameSound();
            startNewGame(); // closes the menu itself
        }
    });

    // Add double-click event for auto-move
    document.addEventListener('dblclick', function(e) {
        const card = e.target.closest('.card');
        if (card && !card.classList.contains('temp') && !card.classList.contains('candidate')) {
            handleCardDoubleClick(card);
        }
    });

    // --- HOLD HEADER FOR 2 SECONDS HANDLER ---
    // Scoped to main's h1 specifically — the page now has other <h1>s too
    // (the intro overlay's title, the instructions popup's title), and a
    // bare 'h1' selector grabs whichever comes first in document order
    // (the intro's, which is hidden by the time the game is playable),
    // silently binding this to an inert element.
    const header = document.querySelector('main h1');
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