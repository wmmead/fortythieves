# Progress Log

## Session: June 11, 2026

Work resumed after a pause since last summer. Three rounds of changes, each committed and pushed separately.

### Round 1 — Bug fixes + stats graphic integration

**Bugs fixed:**
- `getLastDiscard()` in `js/ui.js` referenced a bare `discard` variable that was never defined, throwing a ReferenceError when undoing a deck→discard draw. Added the missing `document.getElementById('discard')` lookup.
- `showWinScreen()` in `js/ui.js` used assignment (`winType = 'win'`) instead of comparison in its `else if`, so the "cleared the board" message could never display. Fixed to `===` and corrected the "cleared cleared" typo.
- Removed leftover `console.log` calls in `js/game.js` and `js/ui.js`.

**Stats graphic (the circular infographic) is now live:**
- New module `js/statsGraph.js` — ported `createWedgeSVG` (clockwise grey wedge = average score / 728), `createWedgeSVG_CCW` (counterclockwise red wedge = win % / 100), and `percentageOf180` from the `wedge test/` prototype folder. Exports `renderStatsGraph(container, {averageScore, winPercent}, idPrefix)` which builds the entire infographic (wedges + circleGraphic.png overlay + curved SVG text labels).
- `index.html` — the hardcoded infograph markup (fake "ave: 625.33 pts" / "win %: 22" values) was replaced with an empty `<div id="statsgraph"></div>` that JS fills.
- `js/ui.js` — `refreshStatsGraph()` helper renders into the header `#statsgraph`. Hooked into `updateGameStatsInfo()` (page load / new game), `updateEndGameStats()` (game end), and `resetGameStatsInfo()` (stats reset). Win % is computed as `gamesWon / gamesPlayed`, rounded.
- **Mobile (≤ 660px):** the header graphic is hidden by CSS at this width, so `showWinScreen()` injects a second copy into the win overlay (`#win-statsgraph` inside `#tableau-container`). SVG path ids use prefixes (`hdr-` / `win-`) so the two DOM copies never collide.
- `styles.css` — `#infograph-container`/`#graphic` id selectors became `.infograph-container`/`.graphic` classes (needed for two copies); added win-screen layout styles in the 660px media query (`.win-container` becomes block/auto-height, `#win` static, graph centered at 70% width capped at 300px).

### Round 2 — Disable the undo button when unusable

- `js/game.js`:
  - New `gameOver` module flag — set in `checkWinCondition()`, cleared in `startNewGame()`.
  - New exported `canUndo()` — true only when `moveHistory.length > 0`, `score >= undoCount + 1`, and `!gameOver`.
  - **Fixed latent bugs:** `startNewGame()` was never clearing `moveHistory` or resetting `undoCount`, so undo cost escalated across games and old-game moves could leak onto a fresh board. Both now reset.
  - `updateUndoButtonText()` is now called from `recordMove`, `recordDrawMove`, `addScore`, `subtractScore`, `checkWinCondition`, `startNewGame`, and `initGame` so button state tracks every relevant state change.
- `js/ui.js` — `updateUndoButtonText()` also toggles a `.disabled` class on `#undo` based on `canUndo()`.
- `js/events.js` — click handler returns early if the undo button has `.disabled` (no error toast; the "need more points" toast remains as a fallback deeper in the logic).
- `styles.css` — `.action-bttn.disabled`: 45% opacity, default cursor, press-down effect suppressed.

Behavior: disabled at game start, at game end (win screen), and any time the player can't afford the next undo; enables/disables dynamically during play.

### Round 3 — Menu closes immediately on "new game"

- Problem: `startNewGame()` raises an invisible full-screen interaction blocker while ~8s of card dealing animates, trapping the menu open.
- `js/ui.js` — new `closeMenu()` (idempotent, unlike `toggleMenu()`).
- `js/game.js` — `startNewGame()` calls `closeMenu()` as its first action, before the blocker goes up. Covers both the "new game" and "reset your stats" menu paths.

## Session: June 12, 2026

Cleared the remaining TODO list from June 11, plus one visual change.

### Stats graphic color change

- `js/statsGraph.js` — the average-score wedge default fill changed from grey `#666` to dark navy `#0a133b` (grey lacked contrast against the background). Applies to both the header graphic and the mobile win-screen copy.

### TODO cleanup

1. **`wedge test/` folder** — already deleted before this session; nothing to do.
2. **Dead code in `js/game.js`** — removed the unused `export let refreshCost = 0;` variable (never read anywhere; `getRefreshCost()` computes fresh via `calcullateDeckRefreshCost()` and stays). Removed the phantom `refreshCount` / `setRefreshCount` entries from the module index comment and documented `getRefreshCost()` there instead.
3. **GSAP implicit global** — now documented with a `/* global gsap */` comment (noting it comes from the `<script>` tag in index.html) at the top of the three modules that use it: `js/animation.js`, `js/gameActions.js`, `js/ui.js`. Still a global by design (no build system).
4. **`updateCardStyle` rename** — renamed to `updateCardPosition` (it repositions a card's top offset in the discard pile, doesn't style it). Updated: definition + module index comment in `js/ui.js`, import + call site in `js/game.js`. TODO comment removed.
5. **Mobile win-screen graph verified** — built a temporary test page (copy of index.html + module script calling `updateEndGameStats(12, 3, 512.25)` then `showWinScreen('win')` after the deal), ran headless Chrome at 480×900. Confirmed via DOM dump and screenshot: `#win-statsgraph` renders inside the win overlay, both wedges draw (navy + red), curved labels show "ave: 512.25 pts" / "win %: 25", and the `win-`/`hdr-` id prefixes keep the two copies collision-free. Test page deleted after.
6. **Mobile design note** — no action needed; win-screen placement at ≤ 660px stands as the chosen approach.

Also in the working tree: `.card` `top: 0` → `top: 5%` in `styles.css` (Bill's manual tweak, vertically centering cards in their slots to match the existing `left: 5%`).

## How changes were verified

No build/test tooling — verified via `node --check --input-type=module < file` for syntax, plus headless Chrome against `python3 -m http.server`:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --virtual-time-budget=12000 --dump-dom http://localhost:8742/
```

(12s virtual time budget lets the full 8s card-deal animation finish before the DOM dump. Add `--window-size=480,900` to exercise the ≤ 660px mobile branch, `--screenshot=out.png` for visual checks.)

## Remaining known issues / possible next steps

- None tracked. The June 11 TODO list is fully cleared as of June 12.
