// shortcutHints.js — labels the menu's undo and new-game buttons with their
// keyboard shortcuts, formatted for the platform.
//
// Only the menu buttons get a hint. The win screen's "new game" buttons are
// deliberately left plain: that screen is a celebration, not a control panel.
//
// There is no way to ask a browser whether a physical keyboard is attached,
// so the platform stands in for it. Phones are excluded outright; everything
// else is assumed to have (or be able to have) a keyboard. Getting this wrong
// costs nothing — the shortcuts work regardless of what's detected, so a
// missing or superfluous hint is the whole downside.
//
// iPadOS reports itself as a Mac (desktop user agent since iPadOS 13, and a
// navigator.platform of "MacIntel"), and that is deliberately not corrected
// for. An iPad with a Magic Keyboard takes the same shortcuts a Mac does and
// wants the same symbols, so there is nothing to distinguish. Keeping it that
// way is also what makes this durable: the usual way to tell an iPad from a
// Mac is to check for touch points, which a touchscreen MacBook would report
// too, so any code relying on that would misfire on Apple's next laptop.

// Apple's modifier symbols are written as HTML entities rather than pasted in
// literally, so the source stays plain ASCII and nothing depends on the file's
// encoding surviving a round trip through an editor or an FTP client.
const COMMAND = '&#8984;'; // U+2318, the Command key
const OPTION = '&#8997;';  // U+2325, the Option key

// `keys` is what's drawn; `spoken` is what a screen reader says instead. The
// glyphs are useless read aloud — U+2318 announces as "place of interest sign"
// in several screen readers — and even the written-out form fares badly, since
// "Ctrl+Z" tends to come out as an attempt at a word plus "plus". So the
// visible span is hidden from assistive tech and this wording is exposed in
// its place.
const HINTS = [
    // Scoped to #menu so the win screen's .newgame buttons are untouched.
    {
        selector: '#menu #undo',
        mac: { keys: `${COMMAND}Z`, spoken: 'Command Z' },
        pc: { keys: 'Ctrl+Z', spoken: 'Control Z' },
    },
    {
        selector: '#menu .newgame',
        mac: { keys: `${COMMAND}${OPTION}G`, spoken: 'Command Option G' },
        pc: { keys: 'Ctrl+Alt+G', spoken: 'Control Alt G' },
    },
];

// 'touch' means don't show a hint at all; 'mac' and 'pc' pick the wording.
// 'pc' covers Windows, Linux and ChromeOS, which all use Ctrl+Alt.
function detectPlatform() {
    const modern = (navigator.userAgentData && navigator.userAgentData.platform) || '';
    const legacy = navigator.platform || ''; // deprecated, but still the most widely supported
    const haystack = `${modern} ${legacy} ${navigator.userAgent || ''}`;

    // Phones first: an Android tablet or phone reports "Linux" too, and an
    // iPhone reports "Mac OS X", so both would be misread by the tests below.
    if (/iPhone|iPod|Android/i.test(haystack)) return 'touch';
    if (/Mac|iPad/i.test(haystack)) return 'mac';
    return 'pc';
}

export function initShortcutHints() {
    const platform = detectPlatform();
    if (platform === 'touch') return;

    // Also exposed on <html> so the stylesheet can treat the two platforms
    // differently if the symbols ever need their own font or spacing.
    document.documentElement.classList.add(`platform-${platform}`);

    HINTS.forEach(({ selector, mac, pc }) => {
        const button = document.querySelector(selector);
        if (!button || button.querySelector('.shortcut')) return;

        // The button's own text moves into a span of its own. updateUndoButtonText()
        // rewrites the undo button's label on every move and would otherwise
        // wipe the hint out with it; writing into .btn-label leaves this alone.
        const label = document.createElement('span');
        label.className = 'btn-label';
        label.textContent = button.textContent.trim();

        const { keys, spoken } = platform === 'mac' ? mac : pc;

        const hint = document.createElement('span');
        hint.className = 'shortcut';
        hint.innerHTML = keys; // fixed strings from HINTS above
        // Hidden from assistive tech in favour of the spoken wording below.
        hint.setAttribute('aria-hidden', 'true');

        // Off-screen but readable: this is what actually reaches a screen
        // reader, and it lands after the button's own wording, so the button
        // announces as e.g. "new game, keyboard shortcut: Command Option G".
        const spokenHint = document.createElement('span');
        spokenHint.className = 'visually-hidden';
        spokenHint.textContent = `keyboard shortcut: ${spoken}`;

        button.textContent = '';
        button.append(label, hint, spokenHint);
    });
}
