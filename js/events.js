import { moveCardToCandidate, drawCard, refreshDeck, handleCardClick, handleCardDoubleClick, handleUndoRequest, autoCompleteToFoundations, whenBoardSettled } from './gameActions.js';

import { startNewGame, isDealing, selectedCard, setStatsDisplayFlag, setOlenMode, canUndo } from './game.js';

import { clearSelection, updateUndoButtonText, resetGameStatsInfo, updateDeckCounter, toggleMenu, closeMenu, olenModeDisplay, openInstructions, closeInstructions, openConfirmDialog, closeConfirmDialog, stackCards, setSectionHeights, stackDiscard, updateCardImageDirectory } from './ui.js';

import { deleteAllSolitaireUserData } from './stats.js';

import { playNewGameSound } from './audio.js';

import { toggleAchievements, closeAchievements, isAchievementsOpen, refreshAchievements } from './achievements.js';


/* ---------- taps on the board: single or double ----------
   Double taps are worked out here from the click events, not from the
   browser's 'dblclick' event. The browser's click count (e.detail) can keep
   counting across clicks made close together in quick succession, even on
   different cards: after a double tap moved a card, a quick tap on the next
   card up the same column (only a few pixels away) can arrive as click 3,
   and its second tap as click 4. The old code skipped every click with a
   count above 1, and 'dblclick' is tied to the count reaching 2, so both
   taps could be lost until the player paused.

   The rule now: a tap is the second half of a double tap if it lands on the
   same card as the tap before, that earlier tap selected the card, and it
   came quickly (the browser counted it as a repeat click, or, on the iPad,
   where that count isn't reliable, within DOUBLE_TAP_MS). Any other tap is a
   single tap, whatever its click count. */
const DOUBLE_TAP_MS = 400;
let lastTap = { card: null, kind: null, time: 0 };

function handleBoardTap(e, card, candidate) {
    const now = performance.now();
    const isCard = card && !card.classList.contains('temp');
    let kind;
    if (candidate && selectedCard) {
        kind = 'candidate';
    } else if (isCard && !card.classList.contains('candidate')) {
        const repeat = card === lastTap.card && (e.detail > 1 || now - lastTap.time < DOUBLE_TAP_MS);
        if (repeat && lastTap.kind === 'select') kind = 'double';
        // The second tap of a double tap on a card just moved, or on a target
        // just played onto: ignore it, as before.
        else if (repeat) kind = 'ignore';
        else kind = 'select';
    } else {
        kind = 'clear';
    }
    lastTap = { card: isCard ? card : null, kind, time: now };
    if (kind === 'ignore') return;

    // While a card is flying, wait for it to land (see whenBoardSettled()).
    whenBoardSettled(() => {
        if (kind === 'candidate') {
            // Re-checked: the highlight may have been cleared by a landing.
            if (candidate.classList.contains('candidate') && selectedCard) {
                moveCardToCandidate(candidate, selectedCard);
            } else if (isCard) {
                handleCardClick(card);
            }
        } else if (kind === 'double') {
            handleCardDoubleClick(card);
        } else if (kind === 'select') {
            handleCardClick(card);
        } else {
            clearSelection();
        }
    });
}

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
        const emptyDeck = e.target.closest('#empty');
        const undoBtn = e.target.closest('#undo');
        const resetStats = e.target.closest('#resetstats');
        const confirmOk = e.target.closest('#confirm-ok');
        const confirmCancel = e.target.closest('#confirm-cancel');
        const hamburgermenu = e.target.closest('#hamburgermenu');
        const newGame = e.target.closest('.newgame');
        const howToPlay = e.target.closest('#howtoplay');
        const closeInstr = e.target.closest('#closeinstructions');
        // The menu item, or the button on the win screen
        const achievementsBtn = e.target.closest('#achievements-btn, .achievements-link');

        if (achievementsBtn) {
            e.preventDefault(); // it's an <a href="#">
            closeMenu();
            toggleAchievements(); // closes the page if it's already open
            return;
        }
        // While the achievements page is open the menu stays on top of it, but
        // only its sound controls and the achievements item work; the game
        // buttons are greyed out (styles.css) and ignored here.
        if (isAchievementsOpen() && (undoBtn || howToPlay || newGame || resetStats)) {
            e.preventDefault();
            return;
        }
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
        if (emptyDeck) {
            // Deck and discard are both gone; the slot offers to finish the game.
            autoCompleteToFoundations();
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
            // deletes all data, collected quotes included
            deleteAllSolitaireUserData();
            refreshAchievements(); // back to the "win a game to earn one" message
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
        handleBoardTap(e, card, candidate);
    });

    // Close the instructions popup / reset-stats confirmation / achievements page on Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeInstructions();
            closeConfirmDialog();
            closeAchievements();
        }
        // The game is off screen while the achievements page is open, so its
        // shortcuts (undo, new game) would act on a board the player can't see.
        if (isAchievementsOpen()) return;
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