# Roadmap

Planned features and the path to selling Forty Thieves in the app stores. Drafted October 21, 2026. `PROGRESS.md` records what has already been built; this file is what comes next. Update each phase's status as work lands, and move settled questions from **Open** to **Decided**.

The live web version is at **fortythieves.meaddesign.net**.

---

## Phase 1 — Quote achievements

**Status:** built and merged to `main` (November 2–7, 2026; see PROGRESS.md). Working: quote data, collecting, the achievements page (with a close arrow) and the redesigned win screen. Remaining: the design and wording items under **Open**.

A player who wins a game (all 728 points) is shown a quote about wisdom (and a few related topics). An achievements page shows which quotes they have unlocked. Repeats are possible, so the full collection is a long-term goal.

**Plan**
- Quotes live in a JS data file: text, author, source (where known), and a stable id.
- Unlocked quote ids are kept in their own `localStorage` key, next to `solitaireGameStats`.
- A win is already defined as `score === 728` (`js/stats.js`). The win screen picks a quote and shows it, marking it "new" if it was just unlocked.
- **Weighted pick, not pure random.** Pure random makes the end of the collection drag: with 40 quotes, collecting all of them averages about 171 wins, and the final quote alone averages about 40. Instead, each win has a set chance (starting at 50%) of being a guaranteed new quote; otherwise any quote can come up, repeats included. Simulated averages for a full collection (4,000 runs each):

  | Quotes | Pure random | 50% guaranteed new |
  |---|---|---|
  | 30 | ~120 wins | ~41 wins |
  | 40 | ~171 wins | ~55 wins (about 145 games at Bill's 38% win rate) |
  | 50 | ~226 wins | ~69 wins |

  The chance is one constant, easy to tune: lower it to make the collection take longer.
- **Achievements page:** a slot for every quote. Locked slots show a blank or "?" card, and the page shows a count such as "12 of 40". Reached from the menu.

**Decided**
- Quotes do **not** survive a stats reset; `deleteAllSolitaireUserData()` clears them too. (Bill may revisit this.)
- **40 quotes**, chosen from Bill's Notion list, in `js/quotes.js` with permanent ids. Guaranteed-new chance is `NEW_QUOTE_CHANCE = 0.4` (lowered from 0.5 on November 7 after Bill's first 10 wins were all new; a full set now averages ~60 wins). Bill is still judging how it feels.
- **Visual design** of the achievements page and win screen follows Bill's Figma designs.

**Open**
- Win-screen reveal animation (still the old `.pop`).
- New game button design, and whether to keep the horizontal divider on the win screen.
- Wording of the repeat-quote heading ("This quote is already in your collection." was a guess).
- Lao Tzu quote: find a public-domain translation for the "thousand miles" wording (TODO in `js/quotes.js`). More generally, double-check attributions before the game is sold.
- Delete the unused `images/club-diamond-characters.png` and `images/spade-heart-characters.png` once the design settles.
- Bill's iPad playtest. Note that Bill's 38% win rate comes from choosing which boards to play, so other players will likely win less and take longer to collect.

---

## Phase 2 — Shareable stats graphic (basic design)

A Wordle-style image of the player's stats (games played, wins, average score), similar to the circular infograph, which they can share by text, social media, copy/paste or download.

**Plan**
- **No library needed.** The image is drawn on a `<canvas>`: Bill's artwork as the background, with the live numbers drawn on top using canvas text, then saved as a PNG with `canvas.toBlob()`. DOM-screenshot libraries (html2canvas and similar) have trouble with the current infograph's curved text, layered SVG/PNG and web fonts, so drawing directly is more reliable.
- **Sharing:**
  - Phones and iPad: the native share sheet via `navigator.share({ files: [png] })`.
  - Desktop, where support varies: **Copy image** (`navigator.clipboard.write`) and **Download** buttons as fallbacks.
  - A short text version alongside the image, like Wordle's, e.g. *"Forty Thieves: 100 games · 23 wins · avg 512 — fortythieves.meaddesign.net"*. Text pastes anywhere.
- **iPad gotcha:** Safari only opens the share sheet straight after a tap, with nothing slow in between. Build the PNG **before** the player taps Share (when the share prompt opens), never inside the tap handler, or it will work on desktop and fail on the iPad.
- **Milestone prompts** at 5, 10, 25, **50**, 75, 100 games, then every 100. The prompt offers to share; dismissing it is fine.
- **Sharing is also always available** from the menu or the stats graphic, so a player who dismisses a prompt doesn't have to wait for the next milestone.
- Every shared image and text includes the web address (later the App Store link). Shares are the game's main way to spread.
- **Image size:** 1080×1080 square works for texts and social posts.
- Placeholder art until Bill's designs are ready.

**Open**
- What exactly the graphic shows besides the three stats (quote count? badge level name?).
- Milestone list: confirm 5, 10, 25, 50, 75, 100, then every 100.

---

## Phase 3 — Badge levels tied to quotes

The share graphic grows more elaborate as the player unlocks quotes: about 6 designs in all.

**Plan**
- Levels are closer together early on, because later quotes come more slowly. Working thresholds with 40 quotes: **0 → 5 → 10 → 20 → 30 → 40 (all)**. The last level marks a complete collection.
- Each level is a piece of art at a fixed size (1080×1080), with spaces left for the numbers. For each design Bill also supplies where each number goes and its font, size and color, so the code can place them. Levels are added as each design is finished.

**Open**
- Final thresholds (depend on the final quote count).
- Bill's six designs.

---

## Phase 4 — Licensing check (can run alongside Phases 1–3)

Selling the game makes it a commercial product, so every outside asset needs a license that allows that. These notes are a practical summary, not legal advice; for anything unclear, the license holder's support team (or a lawyer, if the game sells well) is the final word.

| Asset | Source | Status |
|---|---|---|
| Music (`audio/`) | Made by Bill | ✅ Owned |
| Sound effects (`sndfx/`) | Splice (one-month membership) | ⏳ Bill to confirm the Splice license covers commercial use of these sounds in a distributed app |
| Fonts (Jomhuria, PT Sans Narrow) | Google Fonts | ✅ SIL Open Font License, which allows commercial use and bundling with an app. Self-hosted since November 2, 2026 (`fonts/`, `fonts.css`), with the OFL license files kept alongside. |
| Card art (`cards/`, `cards-small/`) | Adobe Stock, with all the typography redrawn by Bill | ⏳ Modifying a stock asset doesn't change its license: the Adobe Stock license still applies. The images were properly licensed and downloaded (not watermarked previews). Remaining check: the Standard license's limit on copies (500,000 under Standard) and any clause on products for resale or templates where the asset is the main value. A card deck inside a game is usually fine, but if anything is unclear, an Extended license or a question to Adobe Support settles it. Adobe Stock licenses are perpetual, so they don't lapse if the subscription ends. |
| Other images (`images/`) | Generated in Midjourney, then modified by Bill | ✅ Made on a paid Midjourney plan (Bill has never had a free plan), which allows commercial use. Purely AI-generated material can't be copyrighted in the US, while Bill's own modifications can be. So the images can be used, but Bill may not be able to stop others copying the unmodified AI parts. Steam requires disclosing AI-generated content (see Phase 8); Apple currently doesn't. |
| GSAP | GreenSock | ✅ Free for commercial use (since 2024); keep its license file |
| Granim | MIT license | ✅ Keep its license notice |
| mpg123 (WASM decoder) | LGPL | ⏳ Usually fine; read the LGPL conditions for an app-store build and include the notice and source offer as required |
| Quotes | Various | ⏳ Prefer public-domain sources (see Phase 1) |

**Open**
- **App name.** "Forty Thieves" is a generic game name and already used by other apps. Consider a distinctive name or subtitle so the app can be found.

---

## Phase 5 — iPad / iPhone app (Capacitor)

**Plan**
- **Capacitor, not Electron, for iOS.** Electron only makes desktop apps. Capacitor wraps the existing HTML/CSS/JS in a native iOS app (and later Android) with little code change. It uses Safari's engine, so the iPad audio work carries over; app backgrounding and interruptions still need testing on a real device.
- **Fully offline:** fonts and every asset bundled locally, no external requests.
- **App storage for saved data:** iOS can clear a web view's `localStorage` when the device is low on space. Stats and the quote collection should be saved with Capacitor's Preferences plugin (later perhaps iCloud sync).
- **Feel native:** no links leading out of the app, no web-page behaviors. This also addresses Apple's "minimum functionality" rule, which can reject apps that are just a website in a wrapper.
- **Mac:** the same app can be offered on Apple Silicon Macs ("Designed for iPad"). That may make a separate Mac build unnecessary.

---

## Phase 6 — Launch

- **Landing page:** a simple one-page site with a strategy video and the App Store link.
- **Privacy policy page** (required). The game collects no data, so the App Store privacy label is "Data Not Collected".
- **Apple Developer Program:** $99/year. Apple's Small Business Program cuts its commission to 15%.
- **Price:** $4.99, with sales at $2.99. No ads, no in-app purchases, no tracking — and that is the selling point in a category full of free ad-supported apps.
- **EU distribution** requires a public "trader" address and phone number on the listing. Use a business address, or leave the EU out at first.
- **Marketing:** word of mouth plus the share graphic.

---

## Phase 7 — Free web version

The free version stays on fortythieves.meaddesign.net, limited enough that the app is worth buying.

**Open — choose one**
- **(a) Bill's original idea:** stats reset automatically after 5 games.
- **(b) Alternative:** unlimited play, but stats history, the full quote collection and the higher badge levels are app-only. The web version shows the first few quotes and the basic badge, with a "keep your collection in the app" message. Concern with (a): data disappearing can feel like a punishment if the player doesn't know why.

Either way, the 5-game share milestone falls inside the free version, so the first shared graphics advertise the game. The limit can always be bypassed by clearing browser data. That's acceptable; it's an honor system and not worth hardening.

---

## Phase 8 — Other stores (only if there's demand)

- **Android:** from the same Capacitor project. The Google Play developer fee is a one-time $25.
- **Steam** requires a disclosure of AI-generated content on the store page (it applies to the Midjourney-based images).
- **Windows (and Linux) desktop:** Electron (about 150 MB per app, since each bundles a browser) or a lighter alternative such as Tauri, via the Microsoft Store and/or Steam.

---

## Remaining items from PROGRESS.md

- **Mobile divider vs. long discard fan** (≤490px) — Bill plans to look at this soon.
- **Phone layout slightly wider than the screen** (≤490px) — the score star and background texture extend a few pixels past the right edge, so the page scrolls sideways a little.
- **Auto-complete tap point** — check on a real phone that the auto-complete slot always responds to a tap (one test hit `#instructions` instead, probably a test artefact).
