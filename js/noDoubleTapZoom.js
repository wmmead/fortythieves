/*
noDoubleTapZoom.js — stop iOS Safari zooming the page on a fast double tap.

`touch-action: manipulation` (on every element, styles.css) is meant to do
this on its own, but on the iPad it still zoomed now and then during fast
play. iOS works out which parts of the page block zoom in the background,
and that map can lag behind the page: just after a card moves, or a layer
such as the deal blocker comes or goes, a tap can land where it hasn't
caught up yet.

So this blocks the zoom directly. When a tap comes within DOUBLE_TAP_MS of
the previous tap, its touchend is cancelled. That stops the zoom, but also
the click Safari would have sent for that tap, so the click is sent here
instead, to the same element. The game's own click handling (events.js)
then works out single or double taps as usual.

Only plain one-finger taps are touched. Pinches, scrolls and drags (a touch
that moves more than MOVE_PX) are left alone, so pinch zoom and scrolling
still work. Form controls (the volume slider, the sound switch) are left
alone too, so their own tap behaviour is never replaced by a synthetic click.

FUNCTIONS
- preventDoubleTapZoom(): install the listeners (once, at startup).
*/

const DOUBLE_TAP_MS = 400; // a little wider than iOS's own double-tap window
const MOVE_PX = 10;

export function preventDoubleTapZoom() {
    let start = null;   // where and when the current one-finger touch began
    let lastTapEnd = 0; // when the previous tap ended (0: no recent tap)

    document.addEventListener('touchstart', e => {
        start = e.touches.length === 1
            ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
            : null; // a second finger: a pinch, not a tap
    }, { passive: true });

    document.addEventListener('touchend', e => {
        const touch = e.changedTouches[0];
        const isTap = start && e.touches.length === 0 && e.changedTouches.length === 1
            && Math.hypot(touch.clientX - start.x, touch.clientY - start.y) <= MOVE_PX;
        start = null;
        if (!isTap) {
            lastTapEnd = 0;
            return;
        }
        const now = performance.now();
        const quick = now - lastTapEnd < DOUBLE_TAP_MS;
        lastTapEnd = now;
        if (!quick || e.target.closest('input, select, textarea, label')) return;

        e.preventDefault(); // no zoom, and no click from Safari for this tap...
        e.target.dispatchEvent(new MouseEvent('click', { // ...so send it here
            bubbles: true,
            cancelable: true,
            view: window,
            detail: 2,
            clientX: touch.clientX,
            clientY: touch.clientY,
        }));
    }, { passive: false });
}
