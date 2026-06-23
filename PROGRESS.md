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

## Session: June 18, 2026

Started the **staggered discard pile** feature. Goal: instead of all discarded cards overlapping (only the top one visible), fan them out so the player can see the cards they've played. This session covers the **desktop layout only** — mobile is the next pass (see below).

### Design decisions (agreed with Bill before coding)

- **Positioning by DOM index, not a stored attribute.** Bill's initial idea was a `data-discard` numeric attribute on each card. We went with recomputing offsets from each card's DOM child index instead, because the discard is a strict **LIFO stack** — cards are only ever added to the end (draw, or undo-of-a-play) and only ever removed from the end (only the last card is playable; un-draw removes the last). So DOM order always equals play order, an attribute would just mirror the index, and recomputing is self-correcting. Mirrors the existing `stackCards()` pattern for the tableau.
- **Capacity computed dynamically** from available space (not a hard-coded 30), so it stays correct at every screen width. Tuned to ~30 slots at full desktop width.
- **Mobile:** deck stays top-left, played cards stagger *vertically* down the left edge, tableau shifts right. (Not built yet.)

### Desktop implementation

- `js/ui.js` — new **`stackDiscard()`**: lays out the discard pile as a staggered fan. Reads `#discard`'s children, measures a reference card size from a real tableau card (fallback: a section's width × 0.9), computes `stagger = cardSize × DISCARD_SLIVER` (`DISCARD_SLIVER = 0.25`) and `capacity` from the container length. Per card at index `i` of `T`: `slot = max(0, i − max(0, T − capacity))`, so the newest `capacity` cards fan out and any older ones pile at slot 0. Sets `left` (desktop) / `top` (mobile, ≤490px via matchMedia) and `z-index = i` so the last card paints on top and is the only exposed/playable one. Also sizes the discard zone to one card tall on desktop.
- `js/ui.js` — `placeCardInDiscard()` now appends + calls `stackDiscard()` (was a single fixed top offset). `updateCardPosition()` calls `stackDiscard()` when a card returns to the discard (undo of a play). `handleDOMAfterMove()` clears the fan's inline sizing (`width`/`height`/`left`/`zIndex`) when a card *leaves* the discard so it resumes normal styling in its new home, then re-flows the fan.
- `js/game.js` — imported `stackDiscard`; called after un-drawing in `undoDiscardMove()`, and after dealing in `initGame()` / `startNewGame()` so the empty zone is sized correctly.
- `js/events.js` — resize handler also calls `stackDiscard()` so the fan re-flows / re-orients on resize.
- `js/gameActions.js` — `checkCardPosition()` unchanged; verified that "only the last discard card is selectable" still holds (DOM order = play order).
- `styles.css` — `#discard` is now a wide container (`grid-column: 2 / 9`, `position: relative`, translucent rounded zone), pulled out of the shared `.foundation, #discard` rule (that rule is now `.foundation` only; it kept the single-card `aspect-ratio`). Height is set in JS. `#error-container` moved from the bottom row to the **top row** (`grid-row: 1; grid-column: 3 / 9`) — it had to move because the discard now occupies the bottom-middle space where the error message used to sit. (Bill: "top row for now, I might change it later.")

### Verified (desktop)

`node --check` on all edited modules, plus headless Chrome at 1200×800 driving a temporary test page (deal → draw 35 cards → trigger an error). Confirmed: exactly 30 fan slots, the 6 oldest cards piled at slot 0, z-indexes ascending (last card on top), the fan rendering cleanly between deck (left) and score (right), and the error message showing in the top row. Temp page deleted after.

### Known minor item (desktop)

- **Undo-of-a-discard-play animation jump:** when you undo a card that was played *out of* the discard, the GSAP move animates it to the discard container's left edge, then `stackDiscard()` snaps it to its (rightmost) slot — a small visual jump. Functionally correct; final position right. Refine later by animating to the actual target slot. (Same spirit as the existing draw animation, which only does a scale bounce.)
- **Discard zone styling:** Bill wants to refine the look of the discard pile's container/space (the translucent rounded `#discard` zone) — to be addressed later.

### Next session — mobile layout

The `stackDiscard()` **vertical branch is already written** and switches at ≤490px via `matchMedia`. Mobile is mainly the remaining **grid/CSS work**: put the deck at top-left, run the discard as a vertical staggered strip down the left edge spanning the foundation+tableau rows, and shift the foundations/tableau right. The existing ≤490px rules (`#deck` col 1, `#discard` col 2, etc. near the bottom of `styles.css`) will need reworking. Reference mockups are the two untracked PNGs in the project root (`fortythieves-discard-design.png`, `fortythieves-discard-design-mobile.png`) — temporary, for design reference.

## Session: June 23, 2026

Finished the staggered discard feature (desktop polish + mobile layout), fixed the undo animation jump, and added an in-game instructions page. Committed in three parts: `c8df0fd` (discard stacking desktop + mobile), `06d6cb4` (styling fixes), `c93476d` (instructions).

### Round 1 — Desktop discard background + undo jump (`c8df0fd`)

- **Discard zone background now matches the tableau and grows to fit.** The translucent zone was split off `#discard` into a `#discard::before` pseudo-element so it can be sized independently. `#discard` stays full-width (so `stackDiscard()` can still measure the available space for the fan); `::before` is sized via CSS custom properties (`--fan-w` / `--fan-h`) that JS sets to hug the fan, with `transition: width/height 0.3s ease` so it animates like the tableau sections. Padding now matches the tableau exactly: cards are inset by `sectionWidth × 0.05` (the same 5% the tableau uses), and the background grows from a one-card slot (empty) outward as cards are added. Cards paint above the background (`z-index = i + 1`; `::before` at `z-index: 0`). This also resolved the **discard zone styling** item.
- **New-game / reset-deck now shrink the fan immediately.** `startNewGame()` (after `clearBoard()`) and `refreshDeck()` (after `refillDeckFromDiscard()`) now call `stackDiscard()` right away, so the background animates down to one card instead of staying full-width through the ~8s deal. (`stackDiscard` imported into `js/gameActions.js`.)
- **Undo-of-a-discard-play animation jump fixed (FLIP).** New `animateMoveFrom(card, fromX, fromY)` in `js/animation.js`. `undoBoardMove()` now special-cases an undo back into the discard: it places the card in its real fan slot first, measures it, then flies it in from its old spot so it lands exactly on the slot (no post-move snap). The card's slot `z-index` is preserved (bumped to 100 during flight, restored after). The generic tableau/foundation undo path is unchanged. Verified the card interpolates straight from the played position to the slot, never to the container's left edge.

### Round 2 — Mobile discard layout (`c8df0fd`, refined in `06d6cb4`)

- **≤490px layout.** `main` becomes a 3-zone grid: left strip (`1.3fr`) | divider column (`8px`) | 5-column play area. Deck sits at the top of the strip (next to the first foundation, `align-self: start`); discard spans the foundation+tableau rows below it; foundations and tableau shift into the play area (`grid-column: 3 / -1`). Score/error moved to the bottom of the play area.
- **`stackDiscard()` vertical branch.** Cards stack downward, centered in the strip; the `::before` background grows vertically. A `--fan-top` offset (measured from the deck's bottom) starts the fan just below the deck so there's no gap. Card top = `fanTop + pad + slot × stagger`.
- **Fan height cap.** The fan runs down to the bottom of `#container`, but never past the viewport bottom: `bottomLimit = min(container.bottom, innerHeight)` (added in `06d6cb4`). Because the cards are absolutely positioned they don't feed back into the container height, so no circular sizing.
- **Divider (`06d6cb4` — simplified from the first pass).** First implemented as an absolutely-positioned element sized in JS to track the full fan; **switched to a plain grid item** (`grid-column: 2; grid-row: 2 / 4; align-self: stretch`) per Bill's preference for simplicity. Tradeoff: it's a stable border spanning the foundation+tableau rows rather than tracking the exact fan length (a long fan extends a bit past it). All the divider-positioning JS was removed.

### Round 3 — In-game instructions / "How To Play" (`c93476d`)

- Bill added the `<article id="instructions">` markup (already styled), a "How To Play" menu item, and `images/close.svg`.
- **Behavior:** hidden by default (`display: none; opacity: 0`). `openInstructions()` sets `display:block`, forces a reflow, then adds `.show` (opacity fades in via transition, then a `pop-instructions` keyframe bounces it). A **dedicated** `pop-instructions` keyframe is used instead of the shared `.pop` because `.pop`'s `transform: scale()` would wipe out the popup's `translateX(-50%)` centering — `pop-instructions` keeps the translate in every step.
- **Open/close:** "How To Play" menu item (`#howtoplay`) closes the menu and opens it; the close button (`#closeinstructions`) and the **Escape** key close it. `closeInstructions()` only acts if open.
- **First-visit auto-open via localStorage.** `maybeAutoShowInstructions()` (called at the end of `initGame()`, after the deal) opens the popup 2s after the deal **only if** `localStorage.instructionsSeen` is unset. `closeInstructions()` sets that flag, so it never auto-opens again — it only opens from the menu thereafter.

## How changes were verified

No build/test tooling — verified via `node --check --input-type=module < file` for syntax, plus headless Chrome against `python3 -m http.server`:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --virtual-time-budget=12000 --dump-dom http://localhost:8742/
```

(12s virtual time budget lets the full 8s card-deal animation finish before the DOM dump. Add `--window-size=480,900` to exercise the ≤ 660px mobile branch, `--screenshot=out.png` for visual checks.)

**Testing the ≤490px mobile branch:** headless Chrome on macOS clamps `innerWidth` to a 500px minimum, so `--window-size=460` still reports 500 and the ≤490 media query won't match. To get a true sub-490 viewport, drive the DevTools protocol directly (Node ≥21 has a global `WebSocket`): launch Chrome with `--remote-debugging-port`, create a target, and call `Emulation.setDeviceMetricsOverride { width: 460, mobile: true }` before navigating, then `Page.captureScreenshot` / `Runtime.evaluate`. (A reusable `shot.mjs` driver was used this session, in scratch — not committed.) Note the deal animation runs slower under emulation, so programmatic `drawCard()` calls timed off a fixed delay can fire before the deck is ready; trigger draws after confirming the deal finished, or inject cards directly for layout-only checks.

## Remaining known issues / possible next steps

- **Mobile divider vs. long fan** (minor, cosmetic) — the ≤490px divider is a stable grid border spanning the foundation+tableau rows; a discard fan long enough to overflow that area extends slightly past the bottom of the border. Chosen tradeoff (grid-only, no JS) over the fan-tracking absolute-positioned version. Revisit if it bothers.
- No other tracked items. (Done June 23: mobile discard layout, discard zone styling, undo-of-a-discard-play jump.)
