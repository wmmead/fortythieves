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

## Session: July 1, 2026

Code-review pass over all the June 2026 work; applied every finding except optimizing `images/circleGraphic.png` (258 KB — Bill is handling that himself). No new features.

### Bug fixes

- **Instructions text (`index.html`):** `&rsaquo;` (renders `›`) corrected to `&rsquo;` in three places (it's / game's / wasn't), plus typos: "a placed" → "are placed", "on card" → "one card", "empty file," → "empty pile", "an go" → "and go".
- **Undo no longer charges for a failed undo.** `undoBoardMove()` now peeks the move and validates containers + card *before* paying the cost and popping history. Previously a lookup failure ate the point and dropped the move silently; now it warns and leaves state untouched.

### Performance

- `stackCards()` computes `setHeightOffset()` once instead of per card (was a `querySelector` + forced layout read for every one of ~40 cards, on every restack and 40× during the deal).
- `setSectionHeights()` batches all `offsetWidth` reads before any `style.height` writes (was interleaving them, forcing a reflow per section).
- The window `resize` handler is debounced (100ms) and uses static imports — the per-event `import('./ui.js')` was unnecessary since `events.js` already imports `ui.js` statically.

### Simplification / dead code

- `statsGraph.js`: `createWedgeSVG` and `createWedgeSVG_CCW` merged into one function with a `{ clockwise, size, fill }` options object.
- `lastGameData()` returns `{ gamesPlayed, averageScore, gamesWon }` instead of a positional array that both call sites consumed out of order.
- Deleted dead/duplicate code: `setCardBackgrounds()` (never called; hardcoded the large `cards/` dir), `getLastDiscard()` + its hand-rolled loop in `undoDiscardMove()` (replaced with the existing `findCardInContainer()`), `highlightEmptySection()` (duplicate of `createTempCandidate()`), and the one-line aliases `restackCards`, `updateSectionHeights`, `updateDeckDisplay`, `payUndoCost`, `popLastMove`, `setDeckAsNotDepleted`, `updateDeckUI`, `animateMove`, `animateCardDraw` (call sites now use the real functions).
- `moveCardToTarget()` sets the stats flag unconditionally; `getStatsDisplayFlagValue()` returns the flag directly; the Olen-mode prompt handler is `setOlenMode(mode === 'true')`.

### Polish

- `preventDefault()` on the undo and new-game `<a href="#">` handlers (no more scroll-to-top); `hamburgermenu`/`resetStats` click branches now `return` like the others.
- `closeInstructions()` lets the 0.4s opacity fade-out finish (hides on `transitionend`, guarded against reopen mid-fade) instead of snapping to `display: none`.
- `#instructions > div` uses `overflow-y: auto` (no permanent scrollbar gutter).

### Verified

`node --check` on all 8 modules; headless-Chrome smoke test (full 40-card deal, deck counter, stats graph render); in-page probe exercising `drawCard()` ×2, a paid undo-of-a-draw (deck/discard/score all correct), and a corrupt-history undo (correctly refuses without charging).

## Session: August 25, 2026

Bill had made graphics/styling updates on his own since the July 1 session (logo swapped `logoBG.png` → `star.png`, new background/divider/cardback images, an optimized then re-swapped `circleGraphic.png`/`circleGraphic2.png`, minor `h1`/`#score-container` spacing tweaks — commits `933aa37`, `8f7778c`, `e574f66`). This session added two small features on top of that.

### Games-played count in the stats graphic

- `js/statsGraph.js` — `renderStatsGraph()` takes a new `gamesPlayed` option and renders a `<div class="game-count">` on top of the star, alongside the existing wedges/labels.
- `js/ui.js` — `latestStats` (used to re-render the graphic on the mobile win screen) now carries `gamesPlayed` too; `refreshStatsGraph()` passes it through.
- `styles.css` — new `.game-count`: a flex-centered circle (`aspect-ratio: 1/1`, `min-width: 1.8em`, `padding: 0 0.3em`) so its width grows with digit count (1, 2, 3+) while height auto-matches via the aspect ratio, always staying a circle rather than an oval. Fill/border colors (`#9a91c4` / `#f8eedb`) were sampled from Bill's reference mockup (`circleGraphic.png`, untracked, root-level — temporary, not used by any code).
- Verified via headless Chrome at 7 / 42 / 123 games played — circle scales correctly and stays round at all three digit counts.

### Error message moved from the grid to a centered overlay

- Bill wanted error messages (`showError()` in `js/ui.js`) out of their fixed grid cell and into a small popup centered on screen instead, with the same look-and-disappear-after-3s behavior.
- `index.html` — `#error-message` no longer sits in a grid-column div; it's wrapped in a new `#error-overlay`.
- `styles.css` — `#error-overlay` is `position: fixed; inset: 0;` and centers its child with flexbox (`z-index: 1500`, above the menu/instructions; `pointer-events: none` so the box — sized even when invisible — never blocks clicks on the board underneath). `#error-message` itself carries only the visual box styling (white background, dashed red border, padding) — deliberately basic since Bill plans to restyle it. Removed the old `#error-container` grid rule and its two now-dead mobile-breakpoint overrides.
- **Found and fixed a GSAP/CSS transform conflict along the way:** the first version centered `#error-message` itself with `position: fixed` + `transform: translate(-50%, -50%)`. `shakeElement()` (see below) animates the element's `transform`/`x`, and GSAP takes full ownership of that property — its final keyframe (`x: 0`) permanently overwrote the `-50%, -50%` centering offset the first time a message shook, leaving the box off-center from then on (this is why it looked fine when toggled manually in devtools but drifted in real gameplay). Fix: centering now lives entirely on the non-animated `#error-overlay` wrapper via flexbox, so `#error-message` has no transform of its own for GSAP to clobber. Verified across two consecutive shakes with different message lengths — no drift.

### Shake animation tuned

- `js/animation.js` — `shakeElement()` was `x: 10` one-directional (0 → 10px), `duration: 0.05`, `repeat: 9` (10 legs, 0.5s total) — Bill found it too fast and too much motion. Changed to a `keyframes` array `[0, -10, 10, -10, 10, -10, 10, -10, 10, 0]` over `duration: 0.9` (same 9-segment count, but each leg now ~0.1s — half the original speed): a real left-right shake spanning −10px to +10px (20px peak-to-peak) that still settles cleanly back to 0.

### Verified

`node --check` on all edited modules; headless-Chrome screenshots of the stats graphic (1/2/3-digit counts) and the error overlay (idle, mid-shake, auto-hidden after 3s, and a second shake with different message length to confirm no positional drift).

## How changes were verified

No build/test tooling — verified via `node --check --input-type=module < file` for syntax, plus headless Chrome against `python3 -m http.server`:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --virtual-time-budget=12000 --dump-dom http://localhost:8742/
```

(12s virtual time budget lets the full 8s card-deal animation finish before the DOM dump. Add `--window-size=480,900` to exercise the ≤ 660px mobile branch, `--screenshot=out.png` for visual checks.)

**Testing the ≤490px mobile branch:** headless Chrome on macOS clamps `innerWidth` to a 500px minimum, so `--window-size=460` still reports 500 and the ≤490 media query won't match. To get a true sub-490 viewport, drive the DevTools protocol directly (Node ≥21 has a global `WebSocket`): launch Chrome with `--remote-debugging-port`, create a target, and call `Emulation.setDeviceMetricsOverride { width: 460, mobile: true }` before navigating, then `Page.captureScreenshot` / `Runtime.evaluate`. (A reusable `shot.mjs` driver was used this session, in scratch — not committed.) Note the deal animation runs slower under emulation, so programmatic `drawCard()` calls timed off a fixed delay can fire before the deck is ready; trigger draws after confirming the deal finished, or inject cards directly for layout-only checks.

## Session: August 26, 2026

Bill won a game (no deck refresh, no undo) that involved a lot of foundation → tableau shuffling, and the win screen reported less than the full possible score. Traced and fixed two scoring bugs, then closed a related exploit.

### Bug 1 — double-scored moves from clicking a target during its move animation (`js/gameActions.js`)

- `moveCardToCandidate()` only applies a move (DOM reparenting, scoring via `handleScoringAndWin()`, and `recordMove()`) inside the 0.3s GSAP animation's `onComplete`. Until then, the source card is still `.selected` and the destination is still a clickable `.candidate` highlight. A second click on the same destination during that window — easy to do when moving cards quickly, e.g. repeated foundation → tableau shuffling — replayed the full move logic a second time, subtracting the card's value from the score again with nothing to offset it, and also wrote a duplicate entry into the undo history. This is almost certainly what cost Bill points during his difficult win.
- Fix: the card is flagged in-flight (`card.dataset.moving = 'true'`) when a move starts and any move request for it is ignored until the animation's `onComplete` clears the flag.

### Bug 2 — foundation → foundation move awarded points without an offsetting subtraction (`js/game.js`)

- With two decks, a foundation's top card can legally move onto the other foundation of the same suit (e.g. 7♥ onto 6♥). `handleScoringAndWin()` only subtracted the card's value when the *destination* was a tableau `SECTION`; a foundation-to-foundation move fell through neither branch's subtract path but still hit the "placed on a foundation" add path, silently inflating the score. Also threatened the exact-728 "perfect win" check.
- Fix: the subtract condition now fires whenever the source is a foundation, regardless of destination (`fromIsFoundation` alone, not `fromIsFoundation && isSection`), so foundation → foundation nets to zero. Reordered the function to add → subtract → win-check, so `checkWinCondition()` always evaluates the fully-settled score for that move.

### Follow-up — block foundation → tableau moves the player can't afford

- Previously, moving a card off a foundation when the score was lower than the card's value clamped the score at 0 (via `subtractScore`'s floor) instead of going negative — a free-points loophole once the two bugs above were fixed and the accounting became exact.
- `js/gameActions.js` — new `canAffordFoundationMove()` gate (skipped in Olen mode, mirrors the existing undo-affordability check): tableau highlights are suppressed for a foundation card the player can't afford to bring down (`showCandidateTargets()`), and `moveCardToCandidate()` — the single choke point every move (click and double-click) goes through — rejects the move outright with `showError('You need more points to move this card off the foundation.')`, cleaning up any temp placeholder candidate first. Foundation → foundation targets are unaffected (always free). `moveCardToCandidate()` now returns `true`/`false` so `moveCardToTarget()` (the double-click path) only sets the stats-commit flag when a move actually happened.
- Tradeoff, same as the pre-existing undo/refresh cost mechanics: this can make a game unwinnable in a narrow spot if the only path forward requires bringing down a card the player can't yet afford.

### Verified

`node --check --input-type=module` on `js/game.js` and `js/gameActions.js`.

## Session: August 27, 2026

Reworked the undo feature: the escalating point cost is gone. Undo is now **free but single-use** — only the very last action (a card move or a deck draw) can be undone, and the button greys out after use until the player draws or moves a card again, which re-arms it. Also added a keyboard shortcut for undo.

### Undo rework

- `js/game.js`:
  - `undoCount` (the escalating cost counter) replaced by an `undoUsed` boolean. `handleUndoCost()` (which deducted 1, 2, 3… points) became `consumeUndo()`: checks the free undo is available, marks it spent, refreshes the button — no score deduction. `setUndoCount()` removed.
  - `canUndo()` is now `moveHistory.length > 0 && !undoUsed && !gameOver` (no affordability check). Button still starts disabled at game start and stays disabled after a win, as before.
  - `recordMove()` and `recordDrawMove()` set `undoUsed = false`, so moving a card or turning over a deck card re-enables undo. (Refreshing the deck deliberately does *not* re-arm it.)
  - `calcullateDeckRefreshCost()` no longer adds back "points spent on undos" — refresh cost is simply `⌈(728 − score) × 0.25⌉`.
  - `undoDiscardMove()` now peeks and validates (discard exists, card found) *before* consuming the undo and popping history, mirroring the July 1 fix to `undoBoardMove()` — a failed undo no longer wastes the free undo or drops the move.
  - Kept intentionally: `deductFoundationScore()` on undoing a foundation placement (that reverses points *earned*, not a fee), and the foundation → tableau affordability gate from Aug 26.
- `js/ui.js` — `updateUndoButtonText()` shows a static "undo last move" label (no cost readout) and toggles the existing `.disabled` class from `canUndo()`.
- `index.html` — menu label "undo move (-1 point)" → "undo last move"; How To Play rewritten: undo paragraph now describes the free single-undo, and the deck-refresh paragraph no longer says the 728 total depends on not undoing.

### Cmd+Z / Ctrl+Z keyboard shortcut

- `js/events.js` — the existing `keydown` listener (Escape → close instructions) also handles Cmd+Z (Mac) / Ctrl+Z (Windows): `preventDefault()`, then the same path as the menu button (`canUndo()` guard → `handleUndoRequest()` → `updateUndoButtonText()`). Silently no-ops when undo is unavailable, matching the greyed button. Shift+Cmd/Ctrl+Z (conventional "redo") is deliberately ignored.

### Verified

`node --check` on `js/game.js`, `js/ui.js`, `js/events.js`; grep confirmed no stale `undoCount` / `setUndoCount` / `handleUndoCost` references. Bill tested the undo flow in the browser (an in-session headless verification was cut short by a Chrome-extension disconnect); Bill is testing the keyboard shortcut himself.

## Session: August 28, 2026

Two small menu-behavior fixes, following up on the undo rework from the day before.

### Menu closes automatically on "undo last move"

- `js/events.js` — the `#undo` click handler now calls `closeMenu()` (before `handleUndoRequest()`), matching how "How To Play" already closes the menu on open. Only fires past the existing disabled-button early return, so a click on a greyed-out undo button still leaves the menu open.

### Reset-stats now asks for confirmation via a dialog instead of an inline warning

- Previously, clicking "reset your stats" in the menu deleted all data immediately; a static warning paragraph sat below the button as the only guard. Replaced with a confirm/cancel dialog, styled like the existing error message.
- `index.html` — removed the inline `<p id="reset">` warning from the menu item. Added `#confirm-overlay` / `#confirm-dialog` (same warning text, plus OK/Cancel buttons) as a new modal alongside the instructions popup.
- `styles.css` — new `#confirm-overlay` / `#confirm-dialog` / `#confirm-buttons` rules: same box styling as `#error-message` (white background, dashed red border, rounded corners), centered as a fixed overlay (hidden via `display: none` until a `.show` class is added); OK/Cancel reuse the existing `.action-bttn` style. The now-dead `#reset` mobile-width override was retargeted to `#confirm-dialog`.
- `js/ui.js` — new `openConfirmDialog()` (shows the overlay and shakes the dialog box via the existing `shakeElement()`, the same effect `showError()` uses) and `closeConfirmDialog()`.
- `js/events.js` — "reset your stats" now closes the menu and calls `openConfirmDialog()` instead of deleting data directly. The deletion sequence (`deleteAllSolitaireUserData()` → `resetGameStatsInfo()` → `setStatsDisplayFlag(false)` → `startNewGame()`) moved to a new `#confirm-ok` handler; `#confirm-cancel` just closes the dialog. Escape now also closes the confirm dialog (alongside its existing instructions-popup behavior).

### Verified

`node --check` on all edited modules. Headless-Chrome probe against a temporary instrumented copy of `index.html` (deleted after): confirmed the overlay is `display: none` by default, opening the menu then clicking "reset your stats" closes the menu and shows the dialog with the correct warning text, Cancel hides it without touching stats, and OK hides it and runs the reset/new-game flow. Bill confirmed both changes working in the browser.

## Session: August 28, 2026 (evening) — sound effects

Added the first sound effects to the game, plus Bill's own follow-on UI/graphics polish.

### New `js/audio.js` module

- New file `js/audio.js` — central place for all game sound effects going forward. Holds a `sounds` map of `Audio` objects (one per effect, loaded from the new `sndfx/` folder) and small `play*()` wrapper exports. `playSound()` clones the `Audio` element before calling `.play()` so rapid/overlapping triggers (e.g. cards animating in quick succession) don't cut each other off, and swallows the rejected promise so a browser autoplay block doesn't throw.
- `sndfx/` (new, untracked folder) — `full-deal.mp3`, `card-sound.mp3`, `undo.mp3`.

### Wiring

- **`full-deal.mp3`** — plays once via `playFullDealSound()` at the top of `distributeCards()` in `js/game.js`, which runs for both the initial deal (`initGame()`) and `startNewGame()`.
- **`card-sound.mp3`** — plays via `playCardMoveSound()` on every regular card move: drawing from the deck (`drawCard()` in `js/gameActions.js`) and moving a card onto a tableau/foundation target (`moveCardToCandidate()`, same file — covers both click and double-click paths).
- **`undo.mp3`** — plays via `playUndoSound()` on both undo paths in `js/game.js`: `undoBoardMove()` (undoing a tableau/foundation move) and `undoDiscardMove()` (un-drawing a card back to the deck). Originally wired to `card-sound.mp3` like other moves, then swapped to its own dedicated sound file per Bill's request.

### Known limitation (deliberate, deferred)

- Chrome (and other browsers) will likely block `full-deal.mp3` from playing on the very first page load, before any user interaction with the page — standard autoplay policy, not a bug. Bill is aware and wants to address it in a future session (e.g. gate the first deal's sound behind the first click, or accept the silent-first-load and rely on `new game` triggering it fine thereafter).

### Bill's own changes (not done by Claude, noted for context)

Committed separately as `8c2e214` "minor ui design updates":
- Win screen (`showWinScreen()` in `js/ui.js`) now shows a decorative image on each side of the message (`images/club-diamond-characters.png` / `images/spade-heart-characters.png`, both new) instead of plain text-only `<h2>`, with matching `styles.css` layout changes (`#win` switched from grid to flex with a gap, centered `<h2>` text, thieves images hidden on the ≤660px mobile win layout).
- Menu/instructions background image swapped from `images/background4.jpg` to a new `images/background7.jpg` (menu panel, hamburger icon, and instructions popup all updated together).

## Session: August 29, 2026 — intro overlay / gate the deal behind "Play Game"

Bill had already added the `#intro` overlay markup and its centered-card styling (`#intro`, `#intro-top`, the `images/introBG.png` art) on his own — a "forty thieves" title card with a "Play Game" button, meant to show before the game board. It wasn't wired up yet: `#container` was still visible immediately and `js/main.js` still dealt the deck straight from `DOMContentLoaded`, same as before. This is also the fix for the **first-load autoplay block** noted back in the Aug 28 evening session — gating the deal behind a real click means `full-deal.mp3` now plays inside a user-gesture context instead of on page load.

### Wiring

- `index.html` — `#container` now starts with `class="pre-game"`.
- `styles.css` — new `#container.pre-game { display: none; }`. Reused the existing (previously-unused) `.fadeout` utility class (`opacity: 0; transition: all 500ms ease-in;`) for the intro's fade — it already matched the requested 500ms timing exactly.
- `js/ui.js` — new `closeIntro()`, following the same fade-then-hide-on-`transitionend` pattern as the existing `closeInstructions()`: adds `.fadeout` to `#intro`, and once the transition ends, sets `#intro` to `display: none` and strips `.pre-game` off `#container` to reveal the board. Returns a Promise so the caller can sequence the deal after it.
- `js/main.js` — rewired: `DOMContentLoaded` no longer calls `initGame()` directly. It now attaches a one-time click listener to `#play-game` that awaits `closeIntro()` and then `initGame()`, which deals the tableau as before.

### Verified

`node --check` on `js/main.js` and `js/ui.js`. Headless Chrome driven via the DevTools Protocol directly (no puppeteer, scripted click dispatch + `Runtime.evaluate` state checks + screenshots — the Chrome extension wasn't connected in this environment, see note below): confirmed pre-click state (`#intro` visible/opaque, `#container` `display: none`, 0 cards dealt), that clicking "Play Game" adds `.fadeout` and reveals `#container`, and that the deal then proceeds through all 40 cards with zero console errors/exceptions. Screenshots confirmed the visual result matches: centered intro card over the background before the click, full board dealing after.

**Environment note:** the `claude-in-chrome` browser extension was not connected this session (`tabs_context_mcp` reported it not installed/running). Fell back to a small Node script driving headless Chrome directly over the DevTools Protocol (`--remote-debugging-port`, `Page.navigate` / `Input.dispatchMouseEvent` / `Runtime.evaluate` / `Page.captureScreenshot` over the raw `chrome-remote-interface`-style WebSocket, no library). Reusable pattern if the extension is unavailable again.

## Session: August 29, 2026 (later) — background music

Bill added an `audio/` folder (70 mp3s) at the project root, plus a temporary `meaddesign/` folder (his personal site, with its own nested `.git` — not touched, just read for reference) containing a working cascading-music engine (`meaddesign/audio.js`) to use as a model. Wanted the same mechanic here: one random track plays, and once it's a third of the way through, another random track fades in alongside it, cascading indefinitely — but with no player UI (no mute/skip controls, unlike meaddesign) and starting with **two** tracks together instead of one.

### Track list

- New `js/musicTracks.js` — exports `MUSIC_TRACKS`, a plain array of paths (`'audio/07-Fluss.mp3'`, etc.), meant to be Bill's single edit point for adding/removing tracks going forward. Per Bill's choice, seeded with the same 59-track curated subset the meaddesign model uses (deliberately excluding the five `28-*`, five `29-*`, and `01-wholepiece.mp3` files that exist in `audio/` but weren't in the model's list — his call to leave those out for now).

### Engine

- New `js/music.js` — ported from `meaddesign/audio.js`, stripped of everything UI-related (audioMotion visualizer, "Playing:" label, mute/remix buttons, parental-gate checkbox): `pickRandomTrack()` (random pick, excluding what's already playing), `playTrack()` (fades volume 0→1 over 5s via GSAP, wires a `timeupdate` listener that fires `startNextTrack()` once `currentTime / duration >= 1/3`), and the same concurrency watchdog as the model (caps at 3 concurrent tracks, restarts the cascade if it ever drops to zero — checked every 60s).
- Exported `startMusic()`: guarded to run once, calls `startNextTrack()` twice back-to-back so two tracks begin together, then the normal cascade takes over.
- `js/main.js` — `startMusic()` is called first thing inside the `#play-game` click handler (before `closeIntro()`/`initGame()`), so playback starts as close to the raw user gesture as possible, same reasoning as the `full-deal.mp3` autoplay fix from earlier this session. Music runs continuously for the rest of the session — it isn't tied to individual games, so `startNewGame()` doesn't touch it.

### Verified

`node --check` on all three files. Headless Chrome over the DevTools Protocol again (see note above), with `window.Audio` monkey-patched (via `Page.addScriptToEvaluateOnNewDocument`) to record every `Audio` instance constructed: confirmed two music tracks start together on the "Play Game" click, both actually playing (`paused: false`, `currentTime` advancing) and fading in (`volume` climbing 0 → ~0.29 → ~0.94 → 1 over ~5s, matching `FADE_IN_DURATION`). Cascade trigger verified without waiting out a real multi-minute track: faked one track's `duration` down to 3s (its real, already-advancing `currentTime` did the rest), and confirmed a third track was constructed and began fading in once it crossed the 1/3 mark. Zero console errors/exceptions throughout. (Note: seeking a track's `currentTime` ahead didn't work against the local `python3 -m http.server` — it doesn't support HTTP Range requests — hence testing the trigger via a faked `duration` instead of a seek.)

## Session: August 29, 2026 (later still) — sound effects on/off switch

Bill added two identical toggle switches (already fully styled in `styles.css` — a checkbox-driven pill/slider showing "ON"/"OFF") to the markup himself: one in the `#intro` overlay, one in the menu. Wired them up.

- `index.html` — gave the two otherwise-identical checkboxes distinguishing ids: `#sfx-toggle-intro` and `#sfx-toggle-menu`.
- `js/audio.js` — new `sfxEnabled` state, persisted via `localStorage` (`sfxEnabled` key; unset reads as `true` so existing players keep hearing sound effects by default). `playSound()` now no-ops when disabled — a single choke point, so every current and future `play*Sound()` export is covered automatically. New `initSfxToggle()` sets both checkboxes to the stored preference on load and wires a `change` listener on each that updates the state/localStorage and syncs the other checkbox's `checked` to match, so either switch always reflects the same one shared setting.
- `js/main.js` — calls `initSfxToggle()` first thing on `DOMContentLoaded` (not gated behind "Play Game," since the intro switch is visible and usable before that click).

### Verified

`node --check` on `js/audio.js` and `js/main.js`. Headless Chrome over the DevTools Protocol (see the environment note earlier in today's log): confirmed both switches start ON by default, toggling the intro switch off syncs the menu switch and writes `localStorage.sfxEnabled = 'false'`, drawing a card with it off produces zero `sndfx/` `play()` calls (instrumented `Audio.prototype.play`), turning it back on via the *menu* switch syncs the intro switch and immediately makes `card-sound.mp3` play again on the next draw, and the ON preference survives a full page reload. Zero console errors throughout.

## Session: August 30, 2026 — music volume slider

Follow-up to the sound-effects switch: Bill added a native `<input type="range">` under each sound-effects switch (intro overlay and menu) and wanted it wired the same way — synced between the two, persisted, defaulting to 75% — plus one extra behavior: dropping to 0 should fully stop the music (not just mute it), to avoid spending bandwidth/memory on unheard audio. Also wanted the slider's control dot to be a properly touch-sized circle, styleable from the stylesheet.

### `js/music.js`

- New volume state: `musicVolume` (0–1), loaded from `localStorage` (`musicVolume` key) defaulting to `0.75` if unset or unparseable.
- `playTrack()`'s fade-in now targets `musicVolume` instead of a hardcoded `1`.
- `startNextTrack()` — the single choke point every track start goes through (cascade trigger, watchdog restart, `startMusic()`) — now no-ops whenever `musicVolume <= 0`, so muting silences the whole engine without needing a volume check at each call site.
- New `setMusicVolume(volume)`: clamps, persists, and re-targets every currently-playing track's volume via a quick 0.3s GSAP tween. Dropping to 0 calls a new `stopAllTracks()` instead — kills any in-flight tweens, `pause()`s and fully discards every `Audio` element (not just silences it). Coming back up from 0 (if the game has already started) restarts the cascade the same way it began: two tracks together.
- New `initVolumeSlider()`, wired the same way as `initSfxToggle()`: sets both `#music-volume-intro`/`#music-volume-menu` sliders to the stored value on load, and an `input` listener on each updates the volume and syncs the other slider's value.
- `js/main.js` — calls `initVolumeSlider()` alongside `initSfxToggle()` on `DOMContentLoaded` (not gated behind "Play Game," so the intro slider is live immediately, though no audio actually plays until `startMusic()` runs on that click).

### Styling (`styles.css`)

- New `.music-volume` row (mirrors `.sndfx-switch`'s flex layout) and `.volume-slider` rules: a native range input restyled cross-browser (`-webkit-appearance: none` + explicit `::-webkit-slider-runnable-track`/`::-webkit-slider-thumb`, plus `::-moz-range-track`/`::-moz-range-thumb`) into a flat pill track with a circular thumb. Thumb size/color are CSS custom properties on `.volume-slider` (`--volume-thumb-size: 28px`, `--volume-thumb-color: rgba(86, 50, 165, 0.8)`, matching the sound-effects switch's accent purple) — Bill can tweak either without touching the rest of the rule. 28px comfortably exceeds the sound-effects switch's 26px knob for a larger touch target.
- `index.html` — added `<div class="music-volume">` (label + `<input type="range" id="music-volume-intro|menu" min="0" max="100" value="75">`) directly under each sound-effects switch, in both the intro overlay and the menu `<li>`.

### Verified

`node --check` on `js/music.js` and `js/main.js`. Headless Chrome over the DevTools Protocol (`Audio` constructor instrumented to track every `audio/`-sourced instance): confirmed both sliders start at 75 with no stored preference; moving the intro slider to 30 synced the menu slider and wrote `localStorage.musicVolume = '0.3'`; clicking "Play Game" started two tracks fading toward 0.3 (not 1) as expected; dragging the *menu* slider to 0 synced the intro slider, wrote `'0'`, and actually paused both `Audio` elements (not just silenced); no new track was created over the following 2s while muted; raising the slider back to 50 immediately created and started two fresh tracks; and the 50% preference survived a full page reload on both sliders. Zero console errors. Also confirmed visually via screenshot: a properly-sized purple circular thumb sitting under the sound-effects switch in the intro card.

## Session: August 30, 2026 (later) — fix: music not always restarting after mute

Bill reported that dragging the volume slider to 0 and back up didn't always bring the music back. Root cause: `setMusicVolume(0)` was calling `stopAllTracks()`, which fully discarded the `Audio` elements (`pause()` + drop the references). Coming back up from 0 then created **brand-new** `Audio` elements and called `.play()` on them — and a fresh element's first `.play()` isn't as reliably granted by the browser's autoplay policy as resuming one that already played successfully earlier in the session. That made the restart intermittent rather than reliable.

- `js/music.js` — `stopAllTracks()` replaced with `pauseAllTracks()` (just `gsap.killTweensOf` + `audio.pause()`, keeping the elements and their `playingTracks`/`activeAudioElements` slots intact) and a new `resumeAllTracks(targetVolume)` (`audio.play()` on the same paused elements + fades to the new volume). `setMusicVolume()` now pauses in place at 0 and resumes those same elements coming back up — only falling back to starting a fresh two-track cascade if there's nothing to resume (volume was muted before "Play Game" was ever clicked, so no tracks exist yet).

### Verified

`node --check`. Headless Chrome over the DevTools Protocol, `Audio` constructor tagged with a creation counter + stable id: ran 5 consecutive mute/unmute cycles via the menu slider — every cycle paused and then resumed the *same two* `Audio` elements (creation count stayed at 2 throughout, ids unchanged) and landed at the correct target volume each time, with zero console errors.

## Session: August 30, 2026 (later still) — fix: sound effects feeling laggy on iPad

Bill noticed the card sound effect felt like it played "just a split second late" on iPad, not snappy. The trigger call itself was already correctly placed before the animation starts (checked `js/gameActions.js` — `playCardMoveSound()` fires before `animateCardMove()`/`animateDiscardCard()`, not after). The actual cause: `js/audio.js` played every effect by `cloneNode(true)`-ing an `<audio>` element and calling `.play()` on the fresh clone. `HTMLMediaElement.play()` has to spin up a new playback pipeline on every call, and that startup latency is much more noticeable on iOS/iPadOS than desktop — especially for `card-sound.mp3`, which is only ~33ms long, so a 100-300ms pipeline delay is a large fraction of (or longer than) the sound itself.

- `js/audio.js` — rewritten to use the Web Audio API instead of `<audio>` elements. Every sound file is fetched and decoded into an in-memory `AudioBuffer` once, up front (`loadBuffer()`, kicked off immediately at module load — decoding doesn't need a user gesture). Each `play*Sound()` call now just schedules that already-decoded buffer on a fresh, disposable `AudioBufferSourceNode` (`playBuffer()`) — no per-play pipeline spin-up, so it starts with essentially no latency. The `sfxEnabled`/`initSfxToggle()` on/off logic is unchanged, just gating `playBuffer()` instead of the old `playSound()`.
- New `unlockAudio()` — iOS (and Chrome, to a lesser degree) create the `AudioContext` in a `suspended` state until a user gesture resumes it, same reasoning as the existing music/deal-sound autoplay gating. `js/main.js` calls it first thing in the `#play-game` click handler, alongside `startMusic()`.

### Verified

`node --check`. Headless Chrome over the DevTools Protocol (`AudioContext.prototype.createBufferSource` instrumented to timestamp every `.start()` call): confirmed a card draw schedules exactly one `AudioBufferSourceNode.start()` within ~3ms of the click event, and that toggling sound effects off correctly suppresses it entirely (0 calls). Zero console errors across a full deal, draw, and toggle. **Not independently verified:** the actual felt-latency improvement on iPad itself — that's a browser/OS media-pipeline behavior difference that can't be measured from this desktop headless-Chrome harness. Worth a quick check on Bill's iPad to confirm it feels snappier now.

## Session: August 30, 2026 (still later) — preload card images before "Play Game"

Bill noticed a lag on a cold cache before card images appeared. Cause: `createCardElement()` in `js/ui.js` only sets a card's `background-image` when that card element is created during the deal (one at a time, ~200ms apart) — so on a first visit, each card's PNG was being fetched on demand mid-deal instead of already being cached.

- New `js/preload.js` — `preloadCardImages()` builds the 52 card-face URLs (4 suits × values 1–13) for whichever directory the current viewport will use (mirrors the `window.innerWidth < 850` check `createCardElement()` already does — `cards` vs `cards-small`), and loads each via a throwaway `Image()`, resolving on either `load` or `error` per file (so one broken/missing file can't block the game forever). Returns a `Promise.all` of all 52.
- `js/main.js` — the `#play-game` button gets the existing `.disabled` class (same greyed-out look the undo button already uses) immediately on `DOMContentLoaded`, and its click listener isn't attached until `preloadCardImages()` resolves — at which point the class is removed and the listener goes on. No separate "still loading" guard needed inside the handler, since the listener simply doesn't exist yet during the loading window.

**Known limitation, not addressed:** if the viewport crosses the 850px breakpoint (e.g. a tablet rotated) between page load and clicking "Play Game," the deal would use the other card-image directory, which wasn't preloaded — reintroducing the on-demand fetch for that one directory. Narrow edge case tied to the brief intro-screen dwell time; revisit only if it comes up.

### Verified

`node --check` on both files. Headless Chrome over the DevTools Protocol, with card-face PNG requests specifically intercepted and held for 1.5s each (`Fetch.enable`/`Fetch.continueRequest` — plain network throttling turned out to also starve the app's own JS/CSS loading, which gave misleading results at first, so this scoped it to only the images): confirmed the button starts disabled with all 52 requests in flight, a click during that window has zero effect (checked immediately and again after a longer wait, ruling out a delayed side effect), the button only re-enables once every request has actually settled, and a real click at that point starts the game normally. Zero console errors throughout.

## Session: August 30, 2026 (yet later) — pause music when the tab is backgrounded

Bill noticed that on iPad, leaving Safari for another app left the music playing until he manually muted it, closed the tab, or force-quit. Wanted it to fade out (over 3s) when the tab loses visibility and, presumably, come back when it returns.

- `js/music.js` — new `handleVisibilityChange()`, listening on `document`'s `visibilitychange` event (the Page Visibility API — the standard, reliable signal for "the user can no longer see or hear this tab": tab switches, app switches, minimizing. Deliberately *not* using `window` `blur`/`focus`, which also fires for things like clicking the browser's address bar while the page stays fully visible — would have caused false-positive fades during normal desktop use). On hide: fades every active track to 0 over a new `BACKGROUND_FADE_DURATION` (3s) via new `fadeOutAllTracks()`, then pauses each in place — same "pause, don't discard" approach as the existing mute-to-zero handling, so it can resume the same elements later rather than creating new ones. On return to visibility: resumes those same tracks and fades back up to `musicVolume`, using the existing `resumeAllTracks()` (now takes an optional `duration` parameter, defaulting to the quick 0.3s used by the volume slider; passes 3s here instead). A `backgroundedForVisibility` flag guards against redundant hide/show handling.
- Explicitly respects an existing mute: if the user already had the volume slider at 0, hiding/showing the tab does nothing (nothing to fade, and returning won't un-mute their explicit choice).

### Verified (initial pass — later found to be a false pass, see follow-up below)

`node --check`. Headless Chrome over the DevTools Protocol, `document.hidden`/`visibilityState` overridden directly and a `visibilitychange` event dispatched manually: confirmed a mid-fade check at ~1.2s of the 3s fade-out showed a partial volume (not an instant cut) and both tracks still playing; after the full 3s both were paused with volume at 0; simulating a return produced a matching partial-then-full fade back up to the original 0.75 volume with playback resumed; and simulating hide+show while already muted via the slider left both tracks untouched (still paused) throughout. Zero console errors.

### Follow-up (same day) — fix: fade didn't actually work on real devices

Bill reported it wasn't working on either Chrome or Safari/iPad: leaving the tab left the music playing (no fade), and coming back cut it off abruptly with no fade at all — the opposite of a false pass, the feature was fully broken in practice.

**Root cause:** GSAP's tween engine ticks via `requestAnimationFrame`, and browsers stop invoking `requestAnimationFrame` callbacks entirely while a tab is hidden. The `gsap.to(audio, {volume: 0, duration: 3, onComplete: ...})` fade-out tween would freeze the instant the tab backgrounded — volume never actually dropped, so the audio just kept playing — and then, once the tab became visible again and rAF resumed, GSAP saw a huge elapsed-time gap since its last tick and treated the tween as instantly finished: it snapped straight to the end value and fired `onComplete` (the pause) immediately. That's an abrupt cut with no visible fade — exactly what Bill saw. (The original verification above missed this because it faked `document.hidden` directly without also blocking `requestAnimationFrame` — headless Chrome kept calling rAF normally under the hood the whole time, so the GSAP tween ticked fine in that test and gave a false pass.)

**Fix:** `js/music.js` — new `manualFadeVolume(audio, targetVolume, duration, onComplete)`, a hand-rolled fade driven by `setInterval` + real elapsed time (`performance.now()`) instead of GSAP. `setInterval` keeps firing (throttled, but not suspended) in a background tab, unlike `requestAnimationFrame`. `fadeOutAllTracks()` and a new `resumeAllTracksFromBackground()` both use it now, replacing their GSAP calls; the other GSAP-based fades in this file (initial track fade-in, slider adjustments, prune) are untouched since those only ever run while the tab is actually visible and foregrounded, where GSAP/rAF works fine.

**Verified for real this time:** same DevTools Protocol approach, but with `window.requestAnimationFrame` monkey-patched into a genuine no-op while "hidden" (never invokes its callback at all, reproducing the actual browser behavior that broke the GSAP version) — confirmed the fade-out still progressed smoothly and correctly under that condition (volume at exactly the expected halfway point 1.5s into the 3s fade, fully paused at 0 by 3.5s, all while rAF calls were completely blocked), and that returning produced a smooth fade-in from a small partial value back up through the halfway point to the full 0.75 — no snap in either direction. Zero console errors.

## Session: August 30, 2026 (yet still later) — split card sound effects: select + landing

Bill added several new sound files to `sndfx/` and asked to wire up the first three: `single-tap.mp3` (tapping/selecting a card), `card-down.mp3` (a card landing in its destination), and `double-tap.mp3` (an alternative to playing `single-tap.mp3` twice for the double-click auto-move gesture — he wasn't sure which made more sense and asked for a recommendation). This replaces the single generic `card-sound.mp3`/`playCardMoveSound()` used everywhere before.

- `js/audio.js` — `SOUND_FILES` swapped `cardMove: 'sndfx/card-sound.mp3'` for `singleTap`, `doubleTap`, and `cardDown` entries; new `playSingleTapSound()` / `playDoubleTapSound()` / `playCardDownSound()` exports, `playCardMoveSound()` removed (no longer used anywhere).
- `js/gameActions.js`:
  - `handleCardClick()` — plays `playSingleTapSound()` right when a card is successfully selected.
  - `moveCardToCandidate()` — no longer plays a sound at the start of the move; `playCardDownSound()` now fires inside `animateCardMove()`'s `onComplete`, alongside the existing DOM-reparent/scoring/history calls, so it's synced to the card actually landing rather than to the click that started the move.
  - `handleCardDoubleClick()` — plays `playDoubleTapSound()` once the card passes the position-legality check (same trigger point `handleCardClick` uses), regardless of whether a legal destination is ultimately found — mirrors how the single-tap sound isn't conditional on a move following either.
  - `drawCard()` — swapped its `playCardMoveSound()` call for `playCardDownSound()`. A drawn card is already placed in the discard pile before its (decorative, non-travel) bounce animation plays, so this is still effectively "on landing," just with no in-flight period to sync to.

### Recommendation on double-tap vs. single-tap-twice

Went with the dedicated `double-tap.mp3`, wired to the native `dblclick` event — but ran into (and fixed) a real complication along the way: a browser double-click fires the `click` event **twice** (once per press, before `dblclick` fires), so `js/events.js`'s click handler was calling `handleCardClick()` on *both* clicks — meaning every double-click was about to produce single-tap ×2 + double-tap ×1 (three overlapping sounds). Fixed by skipping the click handler's card-selection branch when `event.detail > 1` (the browser's own click-count on the event, 2 for the second click of a double-click) — added to `js/events.js`. That leaves one structural limitation: the *first* click of a double-click still can't be distinguished from a genuine single click at the moment it happens (that's only knowable once the second click actually arrives), so it still plays `single-tap.mp3` once, immediately followed by `double-tap.mp3` a few milliseconds later when `dblclick` fires. The alternative — delaying every single click's sound by ~200-300ms so it could be cancelled if a double-click follows — would make ordinary single taps feel laggy, which runs directly against the responsiveness work from earlier this week, so that tradeoff wasn't taken. **Worth Bill listening for himself:** the two sounds land only a few milliseconds apart (measured ~1-3ms in testing), likely perceived as one denser transient rather than two distinct taps, but that's a subjective call about the actual clips only he can make.

### Verified

`node --check` on all three edited files. Headless Chrome over the DevTools Protocol, `AudioContext.prototype.createBufferSource().start()` timestamped on every call: confirmed selecting a card plays exactly one sound within ~5ms; clicking a highlighted candidate plays zero sounds while the 0.3s move animation is still in flight and exactly one at ~303ms (i.e. right as the animation's `onComplete` fires); double-clicking a card produces exactly two sound events a few ms apart (down from three before the `event.detail` fix); and drawing a card plays one sound immediately. Zero console errors throughout.

### Not yet wired (Bill's other new files, for a future session)

`error.mp3`, `finish-no-win.mp3`, `new-game.mp3`, `win.mp3` are all sitting in `sndfx/` but weren't part of this request.

## Session: August 30, 2026 (final) — remaining sound effects: win, finish-no-win, new game, error

Wired up the four sound files left over from the previous session.

- `js/audio.js` — `SOUND_FILES` gained `error`, `newGame`, `win`, `finishNoWin`; new `playErrorSound()` / `playNewGameSound()` / `playWinSound()` / `playFinishNoWinSound()` exports, same `playBuffer()` mechanism as everything else.
- `js/game.js` — `checkWinCondition()` already branches on `winType` (`'win'` when `score === 728`, `'clear'` otherwise — all eight foundations complete but not maxed). `playWinSound()` / `playFinishNoWinSound()` added right alongside each branch.
- `js/events.js` — the `.newgame` menu-item click handler now calls `playNewGameSound()` before `startNewGame()`. Deliberately scoped to just this handler (not inside `startNewGame()` itself), since Bill specifically asked for "new game from the menu" — `startNewGame()` is also called from the reset-stats confirm flow, which shouldn't also trigger it.
- `js/ui.js` — new `playErrorSound()` import; both `showError()` (the general error popup) and `openConfirmDialog()` (the reset-your-stats warning dialog) now play it, since Bill's request named both as error-sound triggers. Same call in both, so the two share one code path.

### Verified

`node --check` on all five edited files. Headless Chrome over the DevTools Protocol: confirmed all four new `sndfx/*.mp3` requests returned 200 (catches filename/format mistakes for `win.mp3`/`finish-no-win.mp3`, which aren't easily reachable in an automated test without actually winning a full game); clicking "reset your stats" played exactly one sound with a duration matching `error.mp3`; clicking "new game" played `new-game.mp3` immediately, alongside the pre-existing `full-deal.mp3` from the subsequent deal (both landed, confirming they don't interfere with each other). `showError()` and `openConfirmDialog()` share the exact same `playErrorSound()` call, so verifying one exercises the shared mechanism for both. Win/finish-no-win weren't separately live-tested (would require completing a full game through legitimate play, impractical to automate) — confirmed via the successful file load plus code review of the branch they sit in. Zero console errors.

## Session: September 4, 2026 — hamburger menu redesign, using meaddesign as a template

Bill re-added the `meaddesign` folder temporarily so its hamburger-menu implementation could serve as a template: there, the toggle button lives *inside* the sliding nav (not as a separate, independently-fixed icon like fortythieves' old `#hamburgermenu`/`#menuiconbg`), uses three `<span>` bars that morph into an X instead of an SVG graphic, and visibly travels as part of the same rigid slide the menu does. Bill wanted the same techniques, adapted to fortythieves' existing top-anchored slide-down (meaddesign's own menu is bottom-anchored and slides up).

### Working out the geometry

Rendered meaddesign's actual open/closed states and measured them (rather than reasoning about the CSS in the abstract) to get this right: the button is the nav's *first* child and sits nearest the bottom-right anchor corner; opening slides the whole rigid box **up**, moving the button *away* from the corner while the list unfurls into the space nearer the corner, below it. Mirrored for a top anchor, that means: the button is the *last* child (nearest the top-right corner when closed), and opening slides the box *down* — the button visibly travels to the bottom of the panel, with the list unfurling above it, into the space nearer the corner. This does mean the close button ends up below the list once open, not conventionally at the top — a real, deliberate consequence of translating meaddesign's specific mechanism rather than just its general "icon moves" idea. Easy to flip back (swap the DOM order, invert the transform) if it doesn't feel right in practice.

### Implementation

- `index.html` — removed the standalone `<div id="menuiconbg">` and `<img id="hamburgermenu">`. `#menu`'s `<ul>` now comes first, followed by a new `<button id="hamburgermenu" class="menu-btn"><span></span><span></span><span></span></button>` as `#menu`'s last child. Keeping the id on the button meant `js/events.js`'s existing `e.target.closest('#hamburgermenu')` click handler needed no changes at all.
- `styles.css`:
  - `#menu` gained `display: flex; flex-direction: column;` (button and list now just stack naturally) and a comment explaining why one shared opaque background needs no seam-hiding trick (unlike meaddesign's translucent glass panels, which need a `clip-path` to stop the button's and list's semi-transparent borders from doubling up into a visible line where they meet — Bill had flagged this would likely be simpler here, and it was: nothing extra was needed).
  - New `.menu-btn` / `.menu-btn span` rules: three bars, no background/border of their own (they share `#menu`'s single panel background). The X-morph is keyed directly off the existing `#menu.open` class (`#menu.open .menu-btn span:nth-child(...)`) rather than a separate JS-toggled `.is-active` class like meaddesign uses — fortythieves' `toggleMenu()`/`closeMenu()` already had one clean class to key off of, so no JS changes were needed there either.
  - **The open/close mechanism changed from animating `top` to animating `transform: translateY()`.** First attempt hardcoded `#menu.close { top: -545px }` (panel height minus button height, measured at desktop width) — this broke on any narrower viewport, where the menu's line-wrapped content is a different total height, so the same fixed offset pushed the *entire* panel (button included) off-screen (confirmed via headless Chrome at 390px width: the button was invisible, not just misaligned). Fixed with `#menu.close { transform: translateY(calc(-100% + 60px)); }` — `translateY(-100%)` is relative to the element's own rendered height (unlike `top` percentages, which are relative to the containing block), so it scales correctly at any content height automatically. The `+60px` is the `.menu-btn`'s 55px height plus `#menu`'s own 5px `border-bottom` (which sits below the button in the box model and needs to stay visible too) — this also needed one round of measurement to get right (an initial `+55px` clipped the button's bottom 5px, i.e. its border, at every width).

### Verified

`node --check` n/a (no JS changed). Headless Chrome over the DevTools Protocol at both 1280px and 390px widths: the button sits at exactly `[0, 55]` (closed) in both cases now (previously invisible entirely at 390px before the `translateY` fix); clicking it opens the menu with the button correctly relocating to the bottom of the now-visible list; clicking it again from that new position closes the menu; and clicking a menu item ("how to play") still closes the menu and opens the instructions popup as before. Screenshots confirmed no visible seam between the button and the list in the closed state, and a clean, fully-rendered open panel at mobile width. Zero console errors throughout.

## Session: September 4, 2026 (later) — clip the hamburger tab's shadow

Bill restyled the menu himself after the previous session, restoring the hamburger button to a distinct floating tab in the top-right corner (its own `#hamburgermenu-container`, own background/border/box-shadow, own `-5px` relative offset overlapping the list's corner) rather than the seamless single-panel look from before — closer to the original pre-redesign appearance he wanted, while keeping the new structure (button still lives inside `#menu` as its last child, still slides/relocates with the panel). The one issue: the tab's own box-shadow was bleeding onto the list panel's surface where the two overlap.

- `styles.css` — `#hamburgermenu-container` gained `clip-path: inset(0 -20px -20px 0)`. The tab overlaps the list on its top and left sides (where the shadow was visibly smudging onto the list's cream background) but floats freely on its right and bottom sides (where the shadow reads as an intentional "raised tab" effect worth keeping). The asymmetric inset crops the shadow off flush on the two overlapping sides while leaving it untouched on the other two — a plain `overflow: hidden` wrapper would have clipped all four sides uniformly, killing the floating-tab look entirely.

### Verified

Headless Chrome screenshot of the exact seam area, before and after: confirmed the dark shadow arc that was visibly smudged across the list panel's bottom-right corner is gone, while the tab itself still shows its shadow on the outer (right/bottom) edges.

## Session: September 4, 2026 (later still) — disable text/element selection globally

Bill noticed elements sometimes getting selected (as if to copy) during play, which shouldn't happen in a game with no text meant to be selected.

- `styles.css` — the global `* { box-sizing: border-box; }` rule gained `user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;`. Doesn't touch click/tap handling at all (that's pointer events, a separate mechanism from selection) — only suppresses drag-to-select and, via `-webkit-touch-callout`, iOS's long-press copy/select callout, which is likely exactly what Bill was seeing on iPad. A handful of narrower `user-select: none` declarations already existed on specific elements elsewhere in the file; they're now redundant under the global rule but harmless, so left alone rather than touching unrelated code.

### Verified

Headless Chrome: confirmed `user-select` computes to `none` globally (checked on `<body>` and a `.card`), and that clicking a card still selects it and clicking the menu button still opens the menu — click/tap behavior is completely unaffected.

## Session: September 4, 2026 (final) — fix: long-press-the-logo for Olen mode was silently dead

Bill reported the 2-second long-press-the-header trick for toggling Olen mode had stopped working.

**Root cause:** `js/events.js`'s hold-header handler bound its listeners with a bare `document.querySelector('h1')`. The page now has three `<h1>` elements (the intro overlay's title, the main game logo header, and the instructions popup's title) — `querySelector('h1')` always returns the *first* one in document order, which is the intro overlay's (`#intro` comes before `#container` in the DOM). That element gets hidden once "Play Game" is clicked, so the long-press listeners were bound to an inert, invisible element the entire time gameplay was actually happening. This was a latent bug from whenever the intro overlay was first added — likely never noticed since Olen mode is an undocumented, rarely-used debug feature.

- `js/events.js` — changed to `document.querySelector('main h1')`, which unambiguously targets the game logo header (the only `h1` inside `<main>`).

### Verified

`node --check`. Headless Chrome over the DevTools Protocol, `window.prompt` stubbed to record calls and auto-answer `'true'`: confirmed a 2.1s mouse hold on the logo now correctly triggers the prompt and sets `#olenmode`'s text to "Olen mode"; a short 0.3s press does not (checked well past the 2s threshold, ruling out a delayed fire); and a 2.1s *touch* hold (via `Input.dispatchTouchEvent` with touch emulation enabled) triggers it too, confirming the fix holds for the actual iPad interaction path, not just mouse. Zero console errors.

## Session: September 5, 2026 — temporary now-playing track display

Bill added `<p id="audio-tracks-playing">` (styled in `styles.css`, bottom-left of `#container`) to watch which mp3s the random music cascade picks while he decides which tracks to keep. Explicitly temporary — he'll remove the element and this wiring once done testing.

- `js/music.js` — new `activeTrackNames` array + `addActiveTrackName()`/`removeActiveTrackName()`/`renderActiveTrackNames()`, hooked into the exact points where a track already enters/leaves `activeAudioElements`: added in `playTrack()` when a track starts, removed in the `ended` listener and in `removeRandomActiveTrack()`'s prune `onComplete`. Renders as filenames only (`audio/07-Fluss.mp3` → `07-Fluss.mp3`), comma-separated, into `#audio-tracks-playing`'s `textContent`. Deliberately doesn't touch the mute/background-pause paths — a paused-but-still-queued track stays listed, since the point is watching which files rotate through, not literal audible-right-now state.

### Verified

`node --check`. Headless Chrome: confirmed the two tracks `startMusic()` begins together both appear in the paragraph immediately, comma-separated in the order they started; forced one to dispatch a real `ended` event and confirmed only that one was removed, leaving the other. Zero console errors.

## Session: September 5, 2026 (later) — regenerated the music track list

Bill swapped a batch of files in `audio/` (removed several, added a new run of `30-`/`32-`/`35-`/`36-`/`37-`/`38-`/`40-`-prefixed tracks) and asked to sync `js/musicTracks.js`'s `MUSIC_TRACKS` array to match — 79 files expected.

- `js/musicTracks.js` — regenerated the array from the actual current contents of `audio/`, alphabetically, replacing the old stale 59-entry list wholesale (many of those files — `07-Fluss.mp3`, `11-soundbox.mp3`, `13-fluss-1/2.mp3`, `18-battlestation.mp3`, etc. — no longer exist in the folder).

### Verified

`diff` between the array's contents and `ls audio/*.mp3` came back empty — exact match, 79 entries both sides. `node --check` on the file.

## Session: September 5, 2026 (still later) — fix: music going permanently silent

Bill reported the music was playing normally, a new track (`32-reverie-harmonic-healing.mp3`) appeared in the (temporary) now-playing list but never actually started, and once the two tracks that *were* playing finished naturally, no music played for the rest of the game. No console access on iPad to see an error directly, but the file itself checked out fine on its own.

**Root cause, found by tracing `playTrack()` in `js/music.js`:** a track that fails to actually play — a rejected `play()` promise, or the browser firing a genuine media `error` event (network hiccup, decode failure, iOS reclaiming a background resource, anything) — was never being cleaned up. `audio.play().catch(() => {})` silently swallowed the failure, and there was no listener at all for the `error` event. A track stuck this way never fires `timeupdate` (no progress → no cascade trigger) and never fires `ended` (no playback → never reaches the end), so it stayed forever in `playingTracks` and `activeAudioElements` — a permanent "phantom" occupying a slot. Once the two real tracks ended and cleaned themselves up normally, `activeAudioElements.size` was `1` (the phantom), never `0` — so the watchdog's `else if (activeAudioElements.size === 0 && musicStarted) startNextTrack();` safety net never saw an empty cascade and never restarted it. Silence for good.

- `js/music.js` — new shared `forgetTrack(src, audio)` helper (the same cleanup `ended` already did, now also reused by the prune path in `removeRandomActiveTrack`). `playTrack()` now also listens for the `error` event, and the `play()` rejection handler calls `forgetTrack()` too — both immediately follow up with `startNextTrack()` so a single failure gets replaced right away rather than waiting on the 60s watchdog (which now also works correctly as a backstop, since it's no longer blocked by a phantom entry).

### Verified

`node --check`. Headless Chrome, `Audio` instances tagged with an id and creation counter: dispatched a real `error` event on one of the two initial tracks and confirmed it was immediately removed from the now-playing list and a replacement track was created and started. Then, mirroring the reported scenario as closely as an automated test can, dispatched `error` on *every* currently-active track at once (the worst case: nothing left to fall back on) and confirmed the engine self-healed with fresh tracks rather than freezing into permanent silence. Zero console errors throughout.

## Session: September 5, 2026 (yet still later) — fix: previous fix caused a retry storm

The previous session's fix (handle a failed track's `error` event and rejected `play()` promise, clean it up, and retry) introduced a new bug of its own: Bill watched `#audio-tracks-playing` rapidly cycle through many different tracks trying to start, then fill up with the entire 79-track list, with nothing actually playing.

**Root cause:** a real media failure commonly fires *both* signals for the same underlying problem — the browser rejects the pending `play()` promise *and* emits an `error` event on the element. `playTrack()` had independent handlers for each, both calling `forgetTrack()` + `startNextTrack()` — so one real failure triggered two retries, and if either of those failed the same way, each spawned two more, and so on: exponential (2, 4, 8, 16, 32, 64...), tearing through and exhausting the entire track list within a handful of generations. That matches exactly what was observed — not a slow-load timing issue (Bill's own hypothesis, reasonable but not what was happening — nothing in the code imposes a premature timeout), but a genuine double-counting bug.

- `js/music.js` — `playTrack()` now guards with a per-instance `failed` boolean so `error` and a rejected `play()` share one `handleFailure()` that only ever runs once per track, regardless of which signal (or both) fires. One retry per actual failure.

### Verified

`node --check`. Headless Chrome: forced a specific track's `play()` to reject *and* dispatch a real `error` event for that same failure (mirroring the real double-signal case) — confirmed exactly one replacement track was created (would have been two under the previous, buggy version), and the display list settled back to a healthy two-tracks-playing state. Zero console errors.

## Session: September 5, 2026 (final) — architecture fix: route music through a shared AudioContext

Bill was watching Safari's Web Inspector on the iPad directly this time: two tracks play fine, but adding the third sends the engine cycling through the whole track list downloading files, ending in silence — and he pointed out meaddesign's own cascading music player, using the same audio files, doesn't have this problem. Asked to diff the two.

**Root cause (structural, not a logic bug this time):** `js/music.js` played each track as an independent, unconnected `<audio>` element (`new Audio(src)`, plain `.play()`/`.volume`). `meaddesign/audio.js` — confirmed by checking its `audioMotion.connectInput(audio)` call — routes every track through a single shared `AudioContext` via `createMediaElementSource`, originally for its visualizer, but with a load-bearing side effect: iOS Safari has a known, low ceiling on how many independent, unconnected `<audio>` elements can play concurrently, silently failing ones beyond it, whereas elements routed into one shared Web Audio graph read as a single audio session instead of several. That's almost certainly why meaddesign reliably sustains 3 concurrent tracks and this project's plain-`<audio>`-element version didn't — it was hitting that ceiling exactly at the third track, and the previous sessions' retry logic (working as designed) dutifully cycled through the entire list trying to find one that could start, none of which could, because the ceiling — not any individual file — was the problem.

- `js/music.js` — every track now gets its own `GainNode` on one shared, lazily-created `AudioContext` (`ctx.createMediaElementSource(audio).connect(gainNode).connect(ctx.destination)`), mirroring meaddesign's structure. `startMusic()` resumes that context from the "Play Game" gesture, same reasoning as `js/audio.js`'s existing `unlockAudio()`. Every volume control point — the initial fade-in, the volume slider, mute/unmute, the background-tab fade, and the prune fade — moved from `audio.volume`/`gsap.to(audio, {volume})` to `audio.gainNode.gain.value`/`gsap.to(audio.gainNode.gain, {value})`, since a media element's own `.volume` is bypassed once it's routed through Web Audio this way.

### Verified

`node --check`. Headless Chrome regression pass covering everything the volume-control refactor could have broken: the Web Audio graph is wired correctly and gain ramps to the right target on fade-in; the cascade still adds a third track at the 1/3 mark; muting pauses all active tracks and unmuting resumes those *same* elements (not new ones) at the correct volume; and the single-retry-per-failure guard from the previous fix still holds. Zero console errors. **Not independently verified:** whether this actually resolves the iOS concurrency ceiling itself — that's the one thing that can only be confirmed on a real iPad, which is exactly the environment this bug was reported from.

## Session: September 5, 2026 (later) — fix: music stuttering on iPad after about a minute

The previous session's shared-AudioContext fix got all three tracks playing on the iPad, but Bill reported that after "a minute or so" the audio starts stuttering — and that meaddesign, playing the same files, doesn't do this. Asked to compare the two engines again.

**Root cause (most likely — see the verification caveat below): the cascade was routinely running 4-6 tracks at once, not 3.** Both engines say "when a track is a third of the way through, start another," and both nominally cap at `MAX_CONCURRENT_TRACKS = 3`. But the cap was only ever enforced by the once-a-minute watchdog, which prunes *one* track per tick — it never stopped a track from starting. And this project seeds **two** tracks together (meaddesign seeds one), so both seeds hit their one-third trigger at about the same moment and the count jumped from 2 straight to 4, then kept compounding (each of those triggers its own successor, etc.) faster than the prune could trim. The average track is ~233s, so a third of the way through is ~78s — which is exactly the "after a minute or so" Bill described, and the first minute (only 2 tracks playing) being clean matches too. A quick Monte-Carlo simulation using the real durations of the 79 files made the gap concrete: at the 90s mark this project averaged ~3.3 concurrent tracks against meaddesign's ~1.6, spent 18% of a 20-minute session above 3 tracks (meaddesign: 8%), and peaked at 7. Four-plus simultaneous mp3 decodes feeding one Web Audio graph is a plausible load for the iPad's audio pipeline to start glitching under, and it's the one thing that changes precisely when the stutter starts.

- `js/music.js` — `startNextTrack()` now enforces the cap up front: if `activeAudioElements.size` is already at `MAX_CONCURRENT_TRACKS`, the request is queued in a new `pendingStarts` counter (bounded at `MAX_CONCURRENT_TRACKS`, so a burst of triggers can't build an endless backlog) instead of starting a track. `forgetTrack()` — the shared cleanup for `ended`, the prune, and the failure path — drains that queue the moment a slot frees, so the cascade never stalls waiting on the 60s watchdog. Simulated with the same harness: max 3 tracks, never fewer than 2, mean 2.9. The watchdog's prune branch is kept as a backstop but should now be dead code in practice.
- **Secondary hardening, same session:** new `js/audioContext.js` exporting one shared `getAudioContext()`/`unlockAudioContext()`, used by both `js/audio.js` (sound effects) and `js/music.js` (music) — previously each module created its own `AudioContext`, so the page ran two. iOS guidance is consistently one context per page, and this also matches meaddesign more closely (its audioMotion library owns the single context everything runs through, created at page load and resumed on the first click — which is now exactly this project's shape too, since the sound-effects module already created its context at load for buffer decoding). `unlockAudio()` in `audio.js` still exists under that name (it's what `main.js` imports) but just delegates. This change isn't supported by the timing evidence the way the cap is — two contexts would presumably have stuttered from the start, not after a minute — but it's low-risk and removes one more difference from the known-good player, so it went in alongside.
- Also corrected a comment in `music.js` from the previous session that claimed an element's `.volume` is bypassed once routed through `createMediaElementSource` — it isn't (meaddesign relies on `.volume` working with exactly that routing); the GainNode approach here is fine, just not *required* for that reason.

### Verified

`node --check` on all three files. Headless Chrome over the DevTools Protocol, `Audio` and `AudioContext` constructors instrumented: after "Play Game," 2 tracks start and exactly **one** `AudioContext` exists (already shared with the deal sound effect that plays at that moment); faking both seeds' `duration` low so both trigger together produced exactly 3 tracks — not 4 — and held there; dispatching `ended` on one seed immediately started a replacement (3 playing again, no wait for the watchdog); ending the other seed with nothing queued correctly dropped to 2; triggering the third track's one-third mark brought it back to 3. Regression pass on everything the cap logic could interact with: muting pauses the same 3 elements in place, unmuting resumes those same 3 (no new elements created), and a track failure (rejected `play()` + `error` event) still yields exactly one replacement while staying at the cap. Zero console errors or exceptions across both runs. (Test-harness gotcha: the mute step persists `musicVolume=0` to `localStorage` in the headless profile, so a *subsequent* run's page loaded muted and started no music — correct app behavior, misleading test. Cleared `localStorage` from the pre-navigation injected script to fix.) **Not independently verified:** the stutter itself, which is an iPad audio-pipeline behavior this desktop harness can't reproduce — needs a real check on the iPad, ideally a full game's length. If it *still* stutters with the count pinned at 3, the next suspects are the GSAP-driven per-frame writes to `gain.value` (could move to `AudioParam.linearRampToValueAtTime`, which runs on the audio thread) and the sheer size of the files themselves (the 305MB `audio/` folder averages ~3.9MB/track streaming over the iPad's connection).

### Follow-up (same day) — still stutters on the iPad; diagnosis only, no code change

Bill tested the deployed build (confirmed it was this code — the live `js/music.js` on fortythieves.meaddesign.net has `pendingStarts` and the shared context import) and still got the stutter after about a minute, with no sound effects involved, and this time reported that **all of Safari lags and has to be force-quit**. That's a browser-wide (shared GPU/media process) symptom, not an audio-thread glitch, which reorders the suspects. Ruled out this session: hosting (both sites are the same Apache host, Range-capable, HTTP/1.1; the mp3 is byte-identical on both), stale deploy, card-image memory (500×727 PNGs, ~75MB decoded for all 52), and any periodic code outside `music.js` (none). Files are all 48kHz VBR mp3s, 45-224kbps.

Concrete differences from meaddesign's player that remain: (1) **finished tracks are never disconnected from the graph** — `forgetTrack()` drops references but the `MediaElementAudioSourceNode`/`GainNode` stay connected to the destination, keeping every ended `<audio>` element and its media pipeline alive and rendered each quantum for the rest of the session; meaddesign calls `audioMotion.disconnectInput(audio)` on every end/prune, and audioMotion's implementation confirms that does a real `source.disconnect()` and drops the reference. (2) Fades write `gain.value` ~60×/s from the main thread via GSAP (each write becomes a scheduled automation event in the audio engine); meaddesign fades `audio.volume`, which the media element handles itself. (3) The premise that meaddesign sustains three concurrent tracks *on the iPad* has never actually been verified — by the simulation it only reaches its third track ~2.5 minutes in, and there's no record of watching it that long on the device. Suggested next steps recorded in the session notes Bill received: verify meaddesign on the iPad at three tracks for 5+ minutes; verify fortythieves with music muted through a full game; then, in order, disconnect-on-end + audio-thread ramps, and if that's not enough, drop to two concurrent plain `<audio>` elements (no Web Audio routing).

## Session: September 5, 2026 (final) — teardown finished tracks + audio-thread fades

Bill picked the first option from the diagnosis above: do the disconnect and the audio-thread ramps before anything more drastic.

- `js/music.js` — `forgetTrack()` now tears a finished (or failed, or pruned) track all the way down instead of just dropping its references: clears any pending fade-completion timer, calls `disconnect()` on both its `MediaElementAudioSourceNode` (now kept as `audio.sourceNode`) and its `GainNode`, then `pause()` + `removeAttribute('src')` + `load()` on the element — the standard incantation for making iOS actually release a media element's pipeline. Previously every ended track stayed wired to the destination forever, keeping its element and media pipeline alive and rendered every quantum for the rest of the session (meaddesign's `audioMotion.disconnectInput()` does the equivalent teardown on every end/prune).
- `js/music.js` — GSAP is gone from this file entirely. New `fadeGain(audio, target, duration, onComplete)` schedules each fade as a single `linearRampToValueAtTime` on the audio thread (after `cancelScheduledValues` + `setValueAtTime` at the current value, so a re-targeted fade starts from wherever it is), with an optional `setTimeout` for the completion callback. New `currentGain(audio)` computes "where is this fade right now" from the context clock and a per-track `audio.gainRamp` record, rather than trusting the browser's `gain.value` getter mid-automation (its behavior there has varied between engines). Every fade — initial fade-in, volume slider, mute/unmute, background hide/show, prune — goes through it. `manualFadeVolume()` (the `setInterval` fade the backgrounding code needed because GSAP/rAF freezes in a hidden tab) is deleted: an audio-thread ramp keeps running in a hidden tab on its own, and only the pause at the end needs a timer. A resume that lands mid-fade-out cancels that pending pause through `fadeGain`, so a stale timer can't pause a track that was just brought back. `resumeAllTracksFromBackground()` also calls `unlockAudioContext()` first, since iOS can leave the context `interrupted` after an app switch and resuming an already-unlocked context doesn't need a fresh gesture.

### Verified

`node --check`. Headless Chrome over the DevTools Protocol, with `AudioParam.prototype.linearRampToValueAtTime`, the `AudioParam.value` setter, and `AudioNode.prototype.disconnect` all instrumented with counters: each track's fade-in schedules exactly one ramp, and the only direct `gain.value` writes across the whole run were the initial `= 0` per track (none per frame — previously ~300 per fade); gains read partway at 2.5s and landed at 0.75 after 5s. Dispatching `ended` on a track produced exactly 2 `disconnect()` calls and cleared its `src`; a queued cascade trigger still filled the freed slot immediately. Mute pinned and paused the live tracks and unmute resumed the same elements. Background fade (`document.hidden` faked + `visibilitychange` dispatched): gain at ~0.37 at 1.5s of the 3s fade, 0 and paused at 3.5s; showing again resumed and ramped back to 0.75; hiding then showing 1s later left the track playing at 0.75 three seconds on — the stale pause timer was correctly cancelled. Failure path (rejected `play()` + `error` event) still yields exactly one replacement, and the failed element was torn down like an ended one (2 more disconnects, `src` cleared). Zero console errors or exceptions. **Still not independently verified:** the iPad itself — same caveat as every audio session; this needs a real full-game test on the device. If it still stutters, the next step from the diagnosis stands: drop to two concurrent plain `<audio>` elements with no Web Audio routing.

## Session: September 5, 2026 (later still) — rebuilt the music engine as a streaming WASM decoder

Bill's iPad result on the previous fix: **the stutter and the Safari-wide lag were gone**, but the third track never started, the two seeds finished into silence, and the tab was unresponsive afterward. Desktop was fine. That third-track failure is the same symptom as the very first iPad report, before any Web Audio routing existed — so the evidence now says iPad Safari will not run a third media-element stream, connected to Web Audio or not; the routing only turned a clean failure into stuttering, and once the stuttering causes were fixed the underlying limit showed through again. Bill didn't want to drop to two streams. Two ways to keep three without media elements were laid out (decode whole tracks into memory — ~85MB each, 256-581MB for three, a jetsam risk on older iPads — vs. streaming decode in chunks), and he chose streaming after confirming the decoder library is fully self-contained (he plans to wrap the project as an app and wants everything inside the repo).

### New dependency

- `mpg123/mpg123-decoder.min.js` (v1.0.3, MIT, from the wasm-audio-decoders project; `mpg123/LICENSE` alongside) — one 79KB file with the mp3 decoder compiled to WebAssembly and embedded inside it as an encoded string. Verified: no `fetch`, no dynamic `import`, no separate `.wasm`, no URLs beyond two GitHub links in comments; it instantiates from embedded bytes, which also works from a local-file/WKWebView context. Loaded as a global (`window['mpg123-decoder'].MPEGDecoder`) via a `<script defer charset="utf-8">` tag in `index.html`, next to GSAP. **The `charset="utf-8"` matters** — the embedded blob is a high-byte string, and the first test loaded it from a page with no charset declaration, which mangled the string and produced `Decode failed crc32 validation`. `index.html` already has `<meta charset="UTF-8">`; the attribute on the tag is belt-and-braces.

### Engine (`js/music.js`, playback core rewritten; public API, cap, watchdog, visibility handling and the temporary now-playing display all kept)

- Each track is fetched progressively with a `ReadableStream` reader, decoded a ≤64KB compressed chunk at a time with its own `MPEGDecoder` instance, batched into ~10-second `AudioBuffer`s, and scheduled as `AudioBufferSourceNode`s at `startTime + scheduledSamples / sampleRate` — sample-exact after the previous buffer. Decoding only runs while less than 20s of audio is scheduled ahead of the playhead, so memory per track is the compressed file (a few MB) plus ~30s of decoded audio, not the ~85MB whole. An underrun (network slower than playback) shifts the track's timeline forward rather than letting later buffers overlap. Ten-second buffers also keep buffer boundaries rare in case Safari's `start(when)` isn't perfectly sample-accurate (unverified there).
- New `js/mp3Duration.js` — exact track duration by walking the mp3 frame headers (none of the 79 files carry a Xing/Info frame count). Validated against `afinfo` for all 79 files: max difference 26ms, 111ms total to walk all 305MB. Used once the download finishes; until then the one-third trigger uses a byte-ratio estimate (seconds decoded so far × file size ÷ bytes consumed).
- Teardown (`forgetTrack`) cancels the reader, stops/disconnects every scheduled source, disconnects the gain node, and calls the decoder's `free()` to release its WASM memory. Same one-retry-per-failure guard as before, now covering fetch errors, decode exceptions, and a file that decodes to nothing.
- **Mute no longer pauses** — it ramps gains to 0 and the cascade keeps running silently (decode cost is negligible), so the mix is continuous when the volume comes back. `startMusic()` still starts nothing while muted, and raising the volume from 0 with nothing active starts the usual two. The watchdog's restart also respects mute.
- **Backgrounding suspends the shared AudioContext** after the 3s fade-out (the audio clock stops, so every scheduled buffer resumes exactly where it was), and `resume()`s it on return before fading back in. A return mid-fade cancels the pending suspend so a visible tab is never suspended.

### Verified

`node --check` on all files. Chunked vs whole-file decoding compared in headless Chrome on two real tracks: identical sample counts and a maximum per-sample difference of exactly 0, ~1500× real time. Full engine in headless Chrome over the DevTools Protocol with `Audio`, `AudioContext`, `createGain`, `AudioBufferSourceNode.start` and the decoder constructor all instrumented, and `MUSIC_TRACKS` spliced (via a dynamic import of the same module) down to the three shortest files (61s/63s/82s) so a whole cascade cycle fit in ~100s: two tracks audible within 1.5s of "Play Game" with **zero** `Audio` elements constructed and one context; fade-in reached 0.75 at 5s; mute → gains 0 with tracks still listed and the context still running (sound effects unaffected); unmute → 0.75; hide → gains 0 and context `suspended` at 3.6s; show → `running` and 0.75; the third track came in at 23.3s on the audio clock (one third of the 61s seed); both seeds ended naturally and were replaced, list settling at three; of 27 scheduled buffers, every one that wasn't a track start (or the deal sound effect) began within 1µs of the exact end of its predecessor; buffer lengths 10-14s plus end-of-file remainders; zero console errors or warnings. Decoder `free()` is an own instance property (not on the prototype), which is why a prototype-level counter in the test read 0 — the engine calls it directly on the instance. **Not verified:** the iPad, as always — but for the first time the music path uses no media elements at all, the same buffer-source path the sound effects have used on the iPad without trouble since August.

### Follow-up — iPad result

Bill tested the streaming engine on the iPad: **working** — three tracks, no stutter, no hang. First iPad-confirmed music build. The one thing still worth listening for over a long session is a faint tick at buffer boundaries (every ~10s per track), which would mean Safari's `start(when)` isn't sample-accurate; the fix would be longer buffers.

## Session: September 5, 2026 (final) — fix: audio never came back after an iPad app switch

Bill's report, after the streaming engine was confirmed working: on the iPad, switching **tabs** fades out and back in correctly, but switching to a **different app** cuts the audio abruptly and, on return, nothing plays again — no music and **no sound effects either** — until a full page reload. Desktop behavior (tab switch, app switch, Spaces, minimize/hide) is all as he wants it and shouldn't change.

**Root cause:** the sound effects dying too was the tell — that's the shared `AudioContext`, not the music engine. Switching apps on iPadOS doesn't suspend the context; the OS interrupts the audio session and WebKit reports that as its own non-standard **`'interrupted'`** state. `unlockAudioContext()` resumed only when `ctx.state === 'suspended'`, so on return the check simply didn't match and `resume()` was never called at all. The context stayed interrupted for the rest of the session, and since `js/audio.js` shares it, every sound effect was silent too. A reload built a fresh context, which is why that was the only cure. (This is a latent bug from the shared-context session on Sept 5 — it was just never exercised, because a plain tab switch does produce `'suspended'`.)

- `js/audioContext.js` — `unlockAudioContext()` now resumes from **any** non-running state rather than only `'suspended'`, and returns a promise resolving to whether the context actually reached `'running'`. iOS also doesn't reliably grant a resume outside a user gesture, so an attempt that doesn't take arms one-shot capture-phase, passive listeners (`pointerdown`/`touchend`/`click`/`keydown`) that retry on the next interaction — the first tap back in the game restores audio without a reload. A `statechange` listener disarms them once the context is running, and records that an interruption happened (new `consumeInterruption()`).
- `js/music.js` — the deferred `ctx.suspend()` on hide now only fires if the context is still `'running'`. On iOS the OS has typically already interrupted it by then, and suspending on top of an interruption is a known way to get a context that never resumes. On return, if an interruption occurred, gains are snapped to 0 (new `setGainNow()`) before the fade-in, so the music fades up from silence rather than snapping back at whatever gain the cut-short ramp froze at.

**Not fixed, and probably not fixable: the abrupt fade-out on app switch.** iPadOS interrupts the audio session essentially the moment Safari backgrounds, which stops the audio thread — the 3s `linearRampToValueAtTime` can't finish, and nothing in JS can outrun it. It worked before this engine because media elements get their own AVAudioSession that keeps running briefly into the background; Web Audio buffer sources don't. Keeping it would mean putting a media element back in the picture (e.g. a silent looping `<audio>` keep-alive), which is exactly the thing that caused every earlier iPad bug — not worth it. The return is now a clean 3s fade-in from silence, which makes the cut read as intentional.

### Verified

`node --check`. Headless Chrome over the DevTools Protocol, with `resume`/`suspend` counted on the prototype, the context's `state` getter shadowed so WebKit's `'interrupted'` could be simulated (Chrome has no such state), and `document.addEventListener` watched to count armed gesture listeners. **App-switch scenario:** with the state faked to `'interrupted'`, hiding for 3.6s left `suspend()` uncalled (0 times — correctly refusing to suspend an interrupted context); returning called `resume()` despite the non-`'suspended'` state, reset the gains to 0 and ramped them back to 0.75 over 3s. **Resume-refused scenario:** with `resume()` forced to reject, returning armed all four gesture listeners; a single click fired a retry, and once the resume was allowed and the state reached `'running'`, the listeners disarmed themselves and the gains reached 0.75. **Control:** the old check (`state === 'suspended'`) evaluates false against `'interrupted'` — confirming it would never have resumed. **Desktop regression:** a normal tab switch still fades to 0 mid-fade at ~0.37, suspends the context at 3s, resumes and returns to 0.75; returning mid-fade still cancels the pending suspend and never suspends a visible tab. Zero console errors throughout.

## Session: September 5, 2026 (later) — fix: the iPad context is a zombie after an app switch, not a suspended one

The previous fix (resume from any non-running state, plus a gesture retry) did not work. Bill's follow-up detail is what cracked it:

- After returning from another app the tab's **"audio playing" indicator comes back on**, but there is no sound at all.
- **Sound effects are dead too**, and toggling them off/on does nothing.
- The volume slider does nothing — and, tellingly, **sliding it to 0 no longer turns the tab indicator off**, though it does on a freshly loaded page.
- A reload fixes everything.

**Root cause:** a sound effect builds a brand-new `AudioBufferSourceNode` and starts it immediately, so if the context were healthy it would make noise regardless of anything the music engine is doing. It doesn't. So the context itself is the problem: after an iOS audio-session interruption it can be `resume()`d back to `'running'` — which is why the tab indicator returns and why the volume slider stops affecting it — while rendering absolutely nothing. It holds the audio session and never produces a sample. That is not a state the page can resume out of; only a **new AudioContext** recovers, which is exactly why reloading works. The previous session's fix was correct as far as it went (the old `state === 'suspended'` check really was wrong) but it was treating a corpse as a patient.

- `js/audioContext.js` — rewritten around replacing the context rather than resuming it. New `ensureAudioContextHealthy()` (called on returning to visibility) rebuilds outright if an interruption was recorded, and otherwise verifies the context is genuinely rendering by checking that **its clock is advancing** over 350ms — a context that claims `'running'` with a frozen clock is the same zombie caught without a `statechange`. New `rebuildAudioContext()` tears down, closes the old context (important: iOS allows only a handful per page, so the old one must actually be released), builds a fresh one, and resumes it. New `onAudioContextRebuild({ teardown, restart })` lets modules holding nodes re-establish them; `teardown` runs while the outgoing context is still open so nodes can be stopped cleanly. A 5s cooldown prevents a rebuild loop if the output device is genuinely unavailable. The gesture retry now escalates to a rebuild when a real user tap still can't get sound out.
- `js/music.js` — registers a rebuild handler: every gain node and scheduled buffer belonged to the dead context, so there's nothing to salvage. It forgets all tracks (new `quiet` flag on `forgetTrack()` so a mass teardown doesn't fire per-track replacements) and starts a fresh pair on the new context. Node teardown is now wrapped in `try`/`catch` throughout, since those nodes may belong to a context that's already closed. The visibility handler runs the health check **whenever the page returns with audio in use, not only when the music was faded out** — the sound effects share the context, so an interruption kills them even when the music is muted or the cascade is empty. `setGainNow()` and `consumeInterruption()` from the previous session are gone: an interruption now rebuilds, so there are no frozen gains left to reset.
- `js/audio.js` — unchanged, and deliberately so: it asks for the current context on every play, and decoded `AudioBuffer`s aren't bound to a context, so sound effects follow the rebuild for free.

**Behavior change:** coming back from another app now restarts the music with two fresh tracks rather than resuming the ones that were playing. Resuming isn't possible when the context they lived on is gone. An ordinary tab switch still resumes exactly where it was.

### Verified

`node --check`. Headless Chrome over the DevTools Protocol, with every `AudioContext` instance tracked, `close()` observed, `createBufferSource`/`createGain` counted per context, and both the `state` and `currentTime` getters shadowed so WebKit's `'interrupted'` state and a frozen clock could be simulated. **Interruption scenario (the reported bug):** hiding with the state faked to `'interrupted'` left `suspend()` uncalled; returning built a second context, closed the first, and started two fresh tracks that ramped to 0.75 — and a sound effect fired afterwards was created on the **new** context, i.e. sound effects are alive again. **Zombie-without-statechange scenario:** returning with the clock frozen while the state read `'running'` also triggered a rebuild, with the music fading up to 0.75 on the new context. (A first run of this case appeared to stall at gain 0; that was the test's freeze shim leaking onto the newly built context, and re-running with the freeze scoped to one context confirmed it.) **Regression:** an ordinary tab switch built no new context at all — the existing tracks survived the suspend/resume and faded back up to 0.75. Zero console errors throughout. **Not verified:** the iPad itself, as always.

## Session: September 5, 2026 (later still) — start the music on return, and stop listing tracks that aren't playing

The rebuild fix worked, but Bill's iPad report showed two rough edges. On returning from another app: no music and no tab audio icon; doing anything that makes a sound effect played the effect and *then* started the music, after which everything behaved. And the temporary now-playing paragraph listed **two tracks while completely silent**, then listed **two different tracks again** once the sound effect kicked things off. He'd like the music to start on return rather than on the next tap, and desktop to keep resuming its existing tracks.

**Three separate causes, all confirmed in the code:**

1. **Phantom listing.** `rebuildAudioContext()` called each module's `restart()` immediately after constructing the new context, without waiting for it to actually run. On iOS a brand-new AudioContext starts suspended until a user gesture, so the cascade dutifully started two tracks, listed them, and streamed them into a context producing no sound.
2. **The second pair of tracks.** `retryFromGesture()` rebuilt the context whenever `unlockAudioContext()` reported not-running. The first tap resumed the context and then, on a racing state check, threw it away and built another — restarting the music a second time with a fresh pair. That's precisely the two-then-two-different tracks Bill saw.
3. **Why it needed a tap at all.** There was exactly one resume attempt, fired the instant `visibilitychange` arrived. Returning to the app doesn't mean iOS has handed the audio session back yet, so that single early attempt fails and nothing tried again until the user touched something.

- `js/audioContext.js` — restructured around two rules. **Retry the resume**: new `activateContext()` attempts `resume()` on a backoff (0/150/400/900/1600 ms, each followed by the 350 ms clock verification, so about five seconds of trying) before falling back to the gesture retry, which means the music usually starts on its own. **Don't restart anything until audio is confirmed flowing**: `confirmAlive()` is now the single place that decides audio is really running — it verifies the clock is advancing, disarms the gesture retry, and only then fires the modules' `restart()` handlers (tracked by a `pendingRestart` flag set during a rebuild). `retryFromGesture()` no longer rebuilds on the first couple of attempts, since the context it would discard is the one that tap is unlocking; it escalates to a rebuild only after `MAX_GESTURE_ATTEMPTS` (3) genuinely fail.
- `js/music.js` — the visibility handler now fades the existing tracks back up **immediately** rather than waiting on the health check, so an ordinary desktop tab switch is unaffected by the new verification delay. After an interruption those tracks are discarded by the rebuild anyway and the fresh pair starts through the restart handler.

**Result:** on return, the music starts by itself as soon as iOS releases the audio session; if iOS insists on a gesture, it starts on the very first interaction with exactly one pair of tracks and no silent phantom listing. Desktop tab switches still resume the same tracks where they left off, as Bill wanted.

### Verified

`node --check`. Headless Chrome over the DevTools Protocol, with the shim upgraded to hold a newly built context at `'suspended'` with a frozen clock — the previous run's shim only blocked `resume()`, and Chrome starts a new context running on its own, so scenario A had silently not been testing anything. **A, iOS refuses until a tap:** two seconds after return, and again at 6.5 s with the retries exhausted, the now-playing paragraph was **empty** (the phantom listing is gone); one tap then produced exactly one pair of tracks with no second context built, and the pair was unchanged three seconds later (no churn). **B, iOS releases the session ~1 s after return with no user input at all:** music started on its own. **C, ordinary tab switch:** no new context, and the same two tracks resumed. Zero console errors. **Not verified:** the iPad itself.

## Session: September 5, 2026 (final) — fix: startup audio glitch, and phantom tracks after an app switch

Two things from Bill's iPad testing. **(1)** On a clean refresh, starting a game produced "a split second of random sound, like a track is starting" before the two tracks came in normally — never on desktop. **(2)** Returning from another app still didn't start the music by itself, and interacting with the page gave inconsistent results: once one track appeared and two more followed later, once three appeared at once.

**Cause of the glitch:** `playTrack()` started the 5-second gain fade the moment the track object was created, but no sound exists until `flushPcm()` schedules the first buffer — which is after fetching *and* decoding ten seconds of audio. On a local desktop server that gap is milliseconds, so the gain is still ~0. On the iPad, fetching a few MB takes seconds, by which time the ramp had climbed well up — and the first thing heard was the mp3 decoder's warm-up, the few tens of milliseconds of garbage every mp3 decoder emits before its bit reservoir is primed, played at audible volume. The fade was supposed to mask exactly that and was simply anchored to the wrong moment.

**Cause of the phantom tracks:** the 60-second watchdog calls `startNextTrack()` whenever `activeTracks.size === 0`, and nothing checked whether audio was actually running. After a context rebuild the cascade sits empty waiting for iOS to allow a resume, so the watchdog seeded a silent track into a suspended context; when a gesture later brought audio back, the restart handler added its own two on top — one track, then three. Same root shape as the phantom listing fixed in the previous session, just reached through a different door.

- `js/music.js` — `fadeGain()` takes an optional `startAt` and holds the current value until then (`setValueAtTime` at now, again at `startAt`, then the ramp). `playTrack()` now only records `fadeInDuration`; `flushPcm()` starts the fade when it first sets `track.startTime`, anchoring it to the moment the first sample sounds. New `hasStarted()` guard so volume-slider and background fades skip tracks that haven't begun — their fade-in reads the current volume when it starts, so nothing is lost.
- `js/music.js` — `startNextTrack()` now returns immediately unless audio is actually running, which covers the watchdog, the cascade trigger and the volume-slider restart in one place. `startMusic()` and the raise-from-zero path in `setMusicVolume()` therefore wait on `unlockAudioContext()` before seeding, since both run inside a user gesture where the resume is allowed.
- `js/audioContext.js` — new `isAudioRunning()` export backing that guard.

### Verified

`node --check`. Headless Chrome over the DevTools Protocol. **Glitch:** with every mp3 fetch stalled 2.5 s via `Fetch.requestPaused` to imitate the iPad's network, `AudioParam.linearRampToValueAtTime` and `AudioBufferSourceNode.start` were recorded with their audio-clock times: both music tracks' gain nodes were created at 3.361 s, their first buffers started at 6.004 s and 6.033 s, and their 5-second fades ended at 11.004 s and 11.033 s — i.e. each fade begins exactly when its own audio begins, removing the 2.6 s of gain climb that used to precede the first sound. **Phantom tracks:** after an interruption with the rebuilt context held suspended, the now-playing list stayed empty at t+5 s, t+30 s, t+62 s and t+70 s — past two full watchdog cycles, where the old code would have seeded a silent track — and a single tap then produced exactly two tracks, unchanged four seconds later. Zero console errors in both runs. **Not verified:** the iPad itself.

## Session: September 5, 2026 (final) — "Resume Game" overlay

Bill's own suggestion, taken up after several rounds of evidence that his iPad never once resumed audio without a user gesture: rather than leaving that gesture to chance (an arbitrary tap, at an arbitrary moment, with the game silent until then), put a deliberate button in front of the player. Styled like the intro overlay, and carrying the sound-effects switch and music-volume slider too, since the player may want to change those before going back in.

- `index.html` — new `#resume` overlay before `#container`: a dimmed full-screen backdrop with a `#resume-panel` holding `#resume-top` (the same art block as the intro), a "Resume Game" `.action-bttn`, and copies of the sound-effects switch and volume slider (`#sfx-toggle-resume`, `#music-volume-resume`). `hidden` by default.
- `styles.css` — `#intro-top` and `#intro-top h1` now also match `#resume-top`, so the art block is shared rather than duplicated. `#resume` is a fixed flex backdrop; `#resume[hidden]` (id + attribute) outranks its own `display: flex`, and `#resume.fadeout` outranks its own `opacity: 1`, which a bare `.fadeout` could not.
- New `js/resumeOverlay.js` — `initResumeOverlay()`, called from the "Play Game" handler so the panel can never appear over the intro. On `visibilitychange` to visible it waits `SHOW_DELAY_MS` (1.2 s) to give audioContext.js's automatic resume retries a chance, then shows the panel only if audio still isn't running **and** the player actually wants sound (`getMusicVolume() > 0 || isSfxEnabled()` — no panel in front of someone deliberately playing in silence). It then polls every 400 ms and dismisses itself if audio returns on its own. The button's click is the gesture: it calls `ensureAudioContextHealthy()` and hides the panel. Going hidden again clears the panel so the next return re-decides from scratch. Not iPad-specific and needs no device detection — on desktop the context resumes well inside 1.2 s, so it simply never appears.
- `js/audio.js` / `js/music.js` — `initSfxToggle()` and `initVolumeSlider()` now find their controls by structure (`.sndfx-switch input[type="checkbox"]`, `.volume-slider`) instead of a hardcoded list of two ids, so the overlay's copies join the existing lockstep sync automatically and any future overlay does too.
- `js/main.js` — imports and calls `initResumeOverlay()` alongside `unlockAudio()`/`startMusic()`.

### Verified

`node --check` on all four JS files. Headless Chrome over the DevTools Protocol: hidden on the intro screen and throughout normal play; **never appeared** across a desktop-style tab switch (checked at +0.7 s, +0.9 s and +1.5 s after returning); after a simulated iOS interruption with the rebuilt context held suspended, still hidden at +0.8 s and showing at +2.0 s; its switch and slider mirrored the stored settings, and moving the overlay's slider to 40 moved the menu's slider to 40 too; pressing "Resume Game" dismissed it and started exactly two fresh tracks; and in a separate run where the audio session was released with no input at all, the panel dismissed itself as the music came back. Zero console errors. Screenshot sent to Bill. **Not verified:** the iPad itself.

**Testing gotcha worth remembering:** the reused headless-Chrome profile served a *cached* `index.html`, so the first run of this test couldn't find `#resume` at all and looked like a markup bug. `Network.enable` + `Network.setCacheDisabled` fixes it; any future test that changes HTML/CSS needs it.

## Session: September 5, 2026 (later) — one master gain, and taking the audio with us on unload

Bill's iPad report: the resume overlay works and desktop is right, but two audio artefacts remain. **(1)** Pressing "Resume Game" gives a split second of the *previous* tracks before the two new ones start. **(2)** The startup glitch persists — a split second of random sound, "like a track is starting," when a game begins after a clean refresh. He also spotted a console 404 for `mpg123-decoder.min.js.map`.

**The 404** is harmless: the minified decoder ends with a `//# sourceMappingURL=` comment, and the package doesn't ship the map. Browsers only request it with devtools open. Removed the comment from the vendored file (noted in `mpg123/LICENSE`) so the console stays clean; no code changed.

**(1) The previous tracks on resume.** `forgetTrack()` tears a track down with `source.stop()` and `disconnect()`, each wrapped in `try`/`catch` because the context may be closed. On an *interrupted* iOS context those calls can fail — and the catch swallows it silently. The old sources therefore stayed scheduled and connected, and `close()` on an interrupted context doesn't take effect until the audio session returns. Pressing the resume button restores that session, so the outgoing context got one last moment to render what was still queued before the close landed. Hence a fragment of the old tracks, right at the button press.

**(2) The startup glitch — a new hypothesis, since the previous fix didn't take.** Last session's fade-anchoring fix was correct in itself (the fade now demonstrably begins with the first sample) but it clearly wasn't the cause. The strong hint is (1): audio can outlive the context that owns it on iOS. The same is true across a page load — the audio session survives the document briefly during a reload, and Bill's test loop is *refresh a page that was playing music*, then start a game. A fragment of the previous page instance's music bleeding into the new one would sound exactly like "a track is starting", and would never happen on desktop, where page audio is torn down promptly.

- `js/audioContext.js` — new `getMasterGain()`: one gain node per context that **all** audio, music and effects alike, routes through on the way to the destination. New `silenceAudio()` cuts everything with a single value write. That is deliberately the mechanism: a write to an existing node's `AudioParam` is the one teardown step that still works on an interrupted context, where `stop()`/`disconnect()` can fail invisibly. `rebuildAudioContext()` now calls `silenceAudio()` **before** any per-node teardown or the `close()`. New `pagehide` listener silences unconditionally and closes the context on a real unload (skipping the close when `event.persisted`, i.e. the page is entering the back/forward cache), with a `pageshow` listener to un-silence if it's restored.
- `js/music.js` — track gains connect to `getMasterGain()` instead of `ctx.destination`; `forgetTrack()` zeroes the track's own gain before attempting the stop/disconnect calls, for the same "a value write survives what disconnection doesn't" reason.
- `js/audio.js` — sound-effect sources connect to `getMasterGain()` too.

### Verified

`node --check`. Headless Chrome over the DevTools Protocol, with the master gain identified by which node actually connects to the destination (a first attempt guessed "the first gain created", which is a *track* gain — `getMasterGain()` is called lazily *inside* `createTrack`, so two of that run's assertions were measuring the wrong node and proved nothing). Corrected run: during play, exactly **one** node connects to the destination, three connect into the master (two track gains plus the deal sound effect), master at 1.0 and tracks at 0.75. Through a simulated interruption and rebuild, the outgoing master received exactly one write — `0` — before teardown, and stayed 0 afterwards while the new context's master came up at 1.0 with two fresh tracks. On `pagehide` with `persisted: false`, the master was silenced to 0 and `close()` was called. No source-map 404. Zero console errors.

**Status: hypothesis (2) confirmed on the iPad.** Bill ran the fresh-tab diagnostic: loading the game in a **brand-new tab gives zero glitch**, while a refresh gives only a tiny remnant, as does the resume button. That's exactly the predicted signature — the glitch was the previous page instance's audio bleeding through, and silencing on unload removed all of it except a residue.

**The residue is the floor, and it's accepted.** What's left in both cases (refresh, and the resume button) is the same thing: audio already handed to the OS output buffer at the moment we set the gain to zero. A gain write takes effect at the next render quantum, but samples already queued for the hardware — on the order of 10-20 ms on iOS — play out regardless. Nothing in JavaScript can flush that buffer, so this is genuinely irreducible without leaving audio playing longer, not shorter. Bill's assessment: "so short, I don't think most people would even notice it." Not worth further work.

## Session: September 6, 2026 — every `.newgame` button works, wherever it comes from

Bill added "new game" buttons to the win screen (`showWinScreen()` in `js/ui.js`, both the `clear` and `win` variants) and asked for them to be wired up — suggesting that everything with the class `newgame` should behave the same way. It should, and now does.

**Why the new buttons did nothing:** `js/events.js` bound them with `document.querySelectorAll('.newgame').forEach(...)` at init time. That only ever sees elements present when the listeners are attached. The win screen's buttons are written into `#tableau-container` with `innerHTML` when a game ends, long after that, so they never got a listener. The menu's button worked purely because it happens to exist in the initial HTML.

- `js/events.js` — the startup-time binding is gone. `.newgame` is now handled in the delegated `document` click handler that already routes the deck, undo, hamburger, reset-stats and card clicks: a `const newGame = e.target.closest('.newgame')` lookup alongside the others, and a branch that calls `playNewGameSound()` then `startNewGame()`. Because it matches on the class at click time, any `.newgame` element works — the menu's, the two win-screen ones, and anything added later — with no wiring step to remember. `startNewGame()` already calls `closeMenu()` itself, so the branch doesn't repeat it.

### Verified

`node --check`. Headless Chrome over the DevTools Protocol: the menu button still works (board redealt, menu auto-closed); the win screen's button works in **both** message variants, each clearing the win screen, rebuilding all 10 tableau sections and dealing 40 cards; a second win screen in the same session works too (confirming delegation rather than a one-shot binding); and `location.hash` is unchanged after clicking, so the `href="#"` doesn't jump the page. Zero console errors.

**Two testing notes, both harness problems that looked like product bugs.** First, clicking by `getBoundingClientRect()` centre without re-checking is unsafe here: the win screen relays out as it appears, and a stale coordinate silently landed on a paragraph, making a working button look dead. The click helper now scrolls the target into view, re-measures, and asserts `document.elementFromPoint()` actually resolves to the element before dispatching — it turns a silent miss into a loud failure. Second, that assertion then failed for a real reason: `maybeAutoShowInstructions()` opens the how-to-play popup two seconds after the deal on a first visit, and since every test run clears `localStorage`, every run *is* a first visit — the popup was covering the win screen. Seeding `localStorage.instructionsSeen = 'true'` in the pre-navigation script suppresses it. Any future UI test in this project should do both.

## Session: September 6, 2026 (later) — keyboard shortcut for a new game

Bill asked which key command to use for starting a new game, ruling out Cmd/Ctrl+N since that's the browser's new-window shortcut. Recommendation given: **F2** is the genre standard (Windows Solitaire, FreeCell, Spider and Minesweeper have used it since the early nineties) but serves Mac laptops poorly, where the function keys default to hardware controls; **Cmd+Option+N / Ctrl+Alt+N** is free in Chrome, Safari and Firefox, matches the existing Cmd+Z/Ctrl+Z undo binding, and behaves identically on both platforms. Cmd/Ctrl+Shift+N was ruled out (private window in Chrome and Edge), and a bare `N` was argued against because abandoning a game mid-play leaves it in the statistics — only zero-move records get cleaned up by `deleteZeroMoveRecords()`. Bill chose the modifier combination and explicitly declined a confirmation dialog, not being worried about accidental presses.

- `js/events.js` — new branch in the existing `keydown` handler, beside the undo shortcut: `(e.metaKey || e.ctrlKey) && e.altKey && !e.shiftKey && e.code === 'KeyN'` → `playNewGameSound()` + `startNewGame()` (which closes the menu itself), with `preventDefault()`.

**Why `e.code` and not `e.key` here:** holding Option on macOS rewrites the character the browser reports, and Option+N specifically is the dead key that composes the tilde in "ñ" — so `e.key` is **never** `'n'` for this combination and a `e.key.toLowerCase() === 'n'` test would silently never fire on the platform Bill uses. `e.code` names the physical key and is unaffected by modifiers or layout. The undo shortcut directly above can keep using `e.key` because Option isn't part of it; the difference is deliberate, not an inconsistency.

### Verified

`node --check`. Headless Chrome over the DevTools Protocol, dispatching real key events with the modifier bitmask (Ctrl 2, Alt 1, Meta 4, Shift 8) and marking the existing cards with a data attribute first, so a genuine re-deal is distinguishable from nothing happening. **macOS case dispatched with `key: '˜'`** — the character the OS actually reports for Option+N, i.e. the exact input that would defeat an `e.key` test — and it started a new game: all 40 marked cards gone, 40 fresh ones dealt. Windows `Ctrl+Alt+N` (reported as `'n'`) likewise. Six negatives all correctly did nothing: Cmd+N alone, Ctrl+N alone, plain N, Option+N alone, Cmd+Option+**Shift**+N, and Cmd+Option+**M**. The shortcut also works from the win screen. Zero console errors.

**Not done (worth considering):** the game documents no keyboard shortcuts anywhere — neither this one nor the existing Cmd+Z undo appears in the how-to-play popup, so both are effectively undiscoverable. A short "keyboard shortcuts" line in the instructions would fix that for both at once.

## Session: September 6, 2026 (final) — keyboard shortcut hints on the menu buttons

Bill asked for the shortcuts to appear in the menu button text, formatted per platform, hidden on mobile, and not on the win screen's buttons. He explicitly said he wasn't worried about the hints appearing on an iPad without a keyboard, asked for HTML entities rather than pasted symbols, and asked for a span around the key text so it can be styled separately.

- New `js/shortcutHints.js` — `initShortcutHints()`, called from `main.js` on `DOMContentLoaded`. `detectPlatform()` returns `touch` / `mac` / `pc` from `navigator.userAgentData.platform`, `navigator.platform` and the user-agent string together. **Phones are tested for first**, because an Android device reports "Linux" and an iPhone reports "Mac OS X", so either would be misread by the later tests. `pc` covers Windows, Linux and ChromeOS, which all use Ctrl+Alt. iPadOS reports as a Mac and is deliberately left that way: an iPad with a Magic Keyboard genuinely takes these shortcuts and Mac symbols are genuinely the right ones there.
- The modifier glyphs are written as HTML entities (`&#8984;` Command, `&#8997;` Option) so the source stays plain ASCII and nothing depends on the file's encoding surviving an editor or FTP round trip.
- Each hint goes in `<span class="shortcut">`, and the button's existing wording is moved into `<span class="btn-label">` beside it. Selectors are scoped to `#menu`, so the win screen's `.newgame` buttons stay plain.
- `js/ui.js` — `updateUndoButtonText()` writes into `.btn-label` when it exists, falling back to the whole button otherwise. **This was a real trap:** that function sets `undoBtn.textContent` on every move, new game and Cmd+Z, which would have silently deleted the hint the first time the undo state changed.
- `styles.css` — `.action-bttn .shortcut` uses `margin-left: auto` to sit at the far edge rather than changing `.action-bttn`'s own layout, which is shared with the intro, win and resume screens. A `.platform-mac` rule bumps the glyph size slightly, since the Command and Option symbols render smaller than the surrounding letters. `initShortcutHints()` also puts `platform-mac` / `platform-pc` on `<html>` so the two can be styled apart later.

### Verified

`node --check`. Headless Chrome over the DevTools Protocol with `Network.setUserAgentOverride` to impersonate each platform: **macOS** → `⌘Z` and `⌘⌥N` with `platform-mac` on `<html>`; **Windows** → `Ctrl+Z` and `Ctrl+Alt+N` with `platform-pc`; **iPhone** and **Android** → no hints at all and no platform class; **iPad** (desktop UA, `MacIntel`) → Mac symbols, as intended. In every case the win screen's buttons had zero hints, and "how to play", "reset your stats" and "Play Game" were untouched. After a full deal and the undo-state refresh that follows it, both hints were still present — the `updateUndoButtonText()` fix holding. Screenshot of the rendered menu sent to Bill; the glyphs render correctly through font fallback. Zero console errors.

**Still open (Bill's call):** the hint styling is deliberately plain — 50% opacity, 85% size — and he mentioned the fonts may need adjusting. `.action-bttn .shortcut` and `.platform-mac .action-bttn .shortcut` are the two hooks.

### Follow-up (same day) — screen-reader wording for the shortcuts

Bill asked for the `aria-hidden` and spoken alternative flagged above.

- `js/shortcutHints.js` — each entry in `HINTS` now carries both `keys` (drawn) and `spoken` (announced): `Command Z` / `Command Option N` on a Mac, `Control Z` / `Control Alt N` elsewhere. The visible `.shortcut` span gets `aria-hidden="true"`, and a `<span class="visually-hidden">keyboard shortcut: …</span>` is appended after it. Both the glyphs and the written form need this — U+2318 announces as "place of interest sign" in several screen readers, and "Ctrl+Z" tends to come out as an attempted word plus "plus".
- `styles.css` — new `.visually-hidden` utility using the 1px-and-clipped pattern rather than `display: none` or `visibility: hidden`, either of which would remove the text from the accessibility tree along with the display.

### Verified

`node --check`. Headless Chrome over the DevTools Protocol, reading the **browser's own computed accessible names** via `Accessibility.queryAXTree` — the actual string a screen reader announces, not just the markup. macOS: `"undo last move keyboard shortcut: Command Z"` and `"new game keyboard shortcut: Command Option N"`. Windows: `"undo last move keyboard shortcut: Control Z"` and `"new game keyboard shortcut: Control Alt N"`. The glyphs appear in neither, confirming the `aria-hidden` takes. "how to play" and "reset your stats" are unchanged. The hidden span measures 1×1 and is absolutely positioned, so it costs no layout.

**Testing note:** the first three attempts at this returned an empty or ignored accessibility tree and looked like a real defect. The cause was the test, not the page: `#container` is `display: none` until "Play Game" is clicked, so nothing in the menu exists in the accessibility tree before the game starts. Any future accessibility query in this project has to deal the game first.

**Incidental finding — since resolved:** at the time of this check `#resetstats` was an `<a>` with no `href`, so it had no `link` role and appeared in the accessibility tree only as static text. Bill added `href="#"` in commit 6afee51 and it now comes through as a link like the other menu items. Noted so the observation above isn't read as still outstanding.

## Session: September 6, 2026 (later) — new-game shortcut moved from N to G

Bill tested the shortcut on an iPad with a Magic Keyboard: **Ctrl+Option+G's predecessor, Ctrl+Option+N, worked, but Cmd+Option+N didn't** — Safari on iPadOS claims that combination for its own window handling and it never reaches the page (it looked like every tab closing; almost certainly a new Safari window taking over the view). Cmd+Option+N does work in Safari on macOS, so only the iPad was affected. The Ctrl variant worked because the handler accepts either modifier, which was meant as cross-platform tolerance rather than an iPad accommodation.

The obvious patch was to detect an iPad and label it differently. **Bill spotted why that's a bad bet:** the standard way to tell an iPad from a Mac is `navigator.maxTouchPoints > 1`, and a touchscreen MacBook — widely rumoured for this year or next — would report touch points exactly as an iPad does. The heuristic wouldn't merely weaken, it would invert, on the precise hardware that's coming.

So the combination changed instead, which removes the need for that detection rather than making it more fragile. Bill confirmed on the device that Cmd+Option+G does nothing in Safari on iPadOS, so one combination is now correct on every Apple platform, one hint is correct everywhere, and a touchscreen MacBook is simply a Mac showing Mac symbols. (`D` was ruled out because Cmd+Option+D toggles the Dock system-wide on macOS, and `R` because the Option and Shift variants of reload are taken by Safari and Chrome.)

- `js/events.js` — `e.code === 'KeyN'` → `'KeyG'`, with the comment rewritten to record why N was abandoned. The `e.code` reasoning still holds and is now more concrete: Option+G on macOS reports the copyright sign, so `e.key` is never `'g'` here.
- `js/shortcutHints.js` — the new-game hint is `⌘⌥G` / `Ctrl+Alt+G`, spoken as "Command Option G" / "Control Alt G". The comment about iPadOS reporting as a Mac now explains that leaving it uncorrected is the durable choice, not a shrug.

**Confirmed clear on all four combinations of platform and browser Bill uses:** Safari on iPadOS (nothing happens on a bare press), Safari on macOS, and Chrome on macOS all leave Cmd+Option+G to the page.

**No permanent guarantee:** any browser can claim any combination in a future version, exactly as iPadOS did with N. What this buys is the removal of a detection we could already predict would break, and a single combination verified on both Apple platforms.

### Verified

`node --check`, and a grep confirming no stale `KeyN` / `Alt+N` / `Option N` references survive anywhere in `js/`. Headless Chrome over the DevTools Protocol: **Cmd+Option+G dispatched with `key: '©'`** — the character macOS actually reports for Option+G, i.e. the exact input that would defeat an `e.key` test — dealt a new game, as did Ctrl+Alt+G. Five negatives were correctly ignored: the retired Cmd+Option+N, Cmd+G (find next), plain G, Option+G alone, and Cmd+Option+Shift+G. Hints read `⌘⌥G` on macOS and on an iPad user agent, `Ctrl+Alt+G` on Windows; the computed accessible names from `Accessibility.queryAXTree` came back as "new game keyboard shortcut: Command Option G" and "…Control Alt G". Zero console errors.

## Remaining known issues / possible next steps

- **A ~10-20 ms audio remnant on reload and on the resume button** (iPad only, accepted) — the OS output buffer drains after the master gain is cut; see the September 5 master-gain session. Irreducible from JavaScript, and below the threshold Bill considers noticeable.

- **Mobile divider vs. long fan** (minor, cosmetic) — the ≤490px divider is a stable grid border spanning the foundation+tableau rows; a discard fan long enough to overflow that area extends slightly past the bottom of the border. Chosen tradeoff (grid-only, no JS) over the fan-tracking absolute-positioned version. Revisit if it bothers.
- **Foundation-move affordability can strand a game** (see August 26 session) — narrow edge case, matches the deck-refresh cost design (the undo cost it also mirrored was removed August 27); revisit only if it proves annoying in practice.
- No other tracked items. (Done June 23: mobile discard layout, discard zone styling, undo-of-a-discard-play jump. Done August 29: first-load autoplay block on `full-deal.mp3`, fixed by gating the initial deal behind the new intro overlay's "Play Game" click.)
