// animation.js
export function animateMove(card, deltaX, deltaY, callback) {
    animateCardMove(card, deltaX, deltaY, callback);
}

export function animateCardDraw(card) {
    animateDiscardCard(card);
}

export function shakeElement(element) {
  gsap.to(element, {
    x: 10,
    duration: 0.05,
    yoyo: true,
    repeat: 9,
    ease: "power1.inOut",
  });
}

/**
 * Animates a card moving to a target position and then resets its transform.
 * @param {HTMLElement} card - The card to animate.
 * @param {number} deltaX - The X distance to move.
 * @param {number} deltaY - The Y distance to move.
 * @param {Function} onComplete - Callback after the animation completes.
 */
export function animateCardMove(card, deltaX, deltaY, onComplete) {
    gsap.to(card, {
        x: deltaX,
        y: deltaY,
        scale: 1,
        duration: 0.3,
        ease: "power1.out",
        onStart: () => {
            card.style.zIndex = "100";
        },
        onComplete: () => {
            // Reset transforms and zIndex after move
            gsap.set(card, {
                x: 0,
                y: 0,
                zIndex: "auto",
                scale: 1
            });
            if (onComplete) onComplete();
        }
    });
}

/**
 * Animates a card being placed on the discard pile:
 * Scales up by 5%, then back to normal over 200ms total.
 * @param {HTMLElement} card - The card element to animate.
 */
export function animateDiscardCard(card) {
    gsap.fromTo(
        card,
        { scale: 1 },
        {
            scale: 1.05,
            duration: 0.1,
            ease: "power1.out",
            onComplete: () => {
                gsap.to(card, {
                    scale: 1,
                    duration: 0.1,
                    ease: "power1.in"
                });
            }
        }
    );
}

export function getCardMoveDelta(card, fromContainer) {
    const cardRect = card.getBoundingClientRect();
    const fromRect = fromContainer.getBoundingClientRect();
    return {
        deltaX: fromRect.left - cardRect.left,
        deltaY: fromRect.top - cardRect.top
    };
}
