/*
================================================================================
statsGraph.js - Circular stats infographic
================================================================================

Renders the circular stats graphic: two wedges (average score and win %)
behind the circleGraphic.png overlay, with curved text labels.

- createWedgeSVG(angleDeg, size, fill): Build a clockwise wedge SVG string,
  starting at the left edge and sweeping up over the top.
- createWedgeSVG_CCW(angleDeg, size, fill): Build a counterclockwise wedge SVG
  string, starting at the left edge and sweeping down under the bottom.
- percentageOf180(numerator, denominator): Map a value onto the 180-degree
  sweep of a half circle.
- renderStatsGraph(container, stats, idPrefix): Render the full infographic
  into a container. idPrefix keeps SVG path ids unique when the graphic
  appears more than once in the DOM (header and win screen).

================================================================================
*/

// Maximum possible score in a game; used to scale the average-score wedge
const TOTAL_POSSIBLE_SCORE = 728;

function createWedgeSVG(angleDeg, size = 200, fill = '#0a133b') {
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2;

    if (angleDeg <= 0) {
        return `<svg width="100%" height="100%" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"></svg>`;
    }

    // Start angle at 180 degrees (left edge), sweep clockwise
    const startAngle = Math.PI;
    const endAngle = startAngle + (angleDeg * Math.PI / 180);

    const x0 = cx + radius * Math.cos(startAngle);
    const y0 = cy + radius * Math.sin(startAngle);
    const x1 = cx + radius * Math.cos(endAngle);
    const y1 = cy + radius * Math.sin(endAngle);

    const largeArcFlag = angleDeg > 180 ? 1 : 0;
    const sweepFlag = 1;

    const path = `M ${cx} ${cy} L ${x0} ${y0} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${x1} ${y1} Z`;

    return `<svg width="100%" height="100%" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
        <path d="${path}" fill="${fill}" />
    </svg>`;
}

function createWedgeSVG_CCW(angleDeg, size = 200, fill = 'red') {
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2;

    if (angleDeg <= 0) {
        return `<svg width="100%" height="100%" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"></svg>`;
    }

    // Start at 180 degrees (left edge), sweep counterclockwise
    const startAngle = Math.PI;
    const endAngle = startAngle - (angleDeg * Math.PI / 180);

    const x0 = cx + radius * Math.cos(startAngle);
    const y0 = cy + radius * Math.sin(startAngle);
    const x1 = cx + radius * Math.cos(endAngle);
    const y1 = cy + radius * Math.sin(endAngle);

    const largeArcFlag = angleDeg > 180 ? 1 : 0;
    const sweepFlag = 0;

    const path = `M ${cx} ${cy} L ${x0} ${y0} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${x1} ${y1} Z`;

    return `<svg width="100%" height="100%" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
        <path d="${path}" fill="${fill}" />
    </svg>`;
}

function percentageOf180(numerator, denominator) {
    if (!denominator) return 0;
    const percent = numerator / denominator;
    const result = percent * 180;
    return Math.round(result * 100) / 100;
}

export function renderStatsGraph(container, { averageScore = 0, winPercent = 0 } = {}, idPrefix = '') {
    if (!container) return;

    const topAngle = percentageOf180(averageScore, TOTAL_POSSIBLE_SCORE);
    const bottomAngle = percentageOf180(winPercent, 100);

    container.innerHTML = `
        <div class="infograph-container">
            <div class="wedge">${createWedgeSVG(topAngle)}</div>
            <div class="wedge">${createWedgeSVG_CCW(bottomAngle)}</div>
            <img src="images/circleGraphic.png" alt="game statistics graphic" class="graphic">

            <div class="wedge">
                <svg width="100%" height="100%" viewBox="0 0 100 100">
                    <defs>
                        <path id="${idPrefix}circlePath"
                        d="M 50,13
                            a 37,37 0 1,1 0,74
                            a 37,37 0 1,1 0,-74" />
                    </defs>
                    <g transform="rotate(-80,50,50)">
                        <text class="circle-text">
                        <textPath href="#${idPrefix}circlePath" startOffset="0%">
                            ave: ${averageScore} pts
                        </textPath>
                        </text>
                    </g>
                </svg>
            </div>

            <div class="wedge">
                <svg width="100%" height="100%" viewBox="0 0 100 100">
                    <defs>
                        <path id="${idPrefix}innerCirclePath"
                        d="M 50,10
                            a 40,40 0 1,0 0,80
                            a 40,40 0 1,0 0,-80" />
                    </defs>
                    <g transform="rotate(-100,50,50)">
                        <text class="circle-text" style="dominant-baseline: middle;">
                        <textPath href="#${idPrefix}innerCirclePath" startOffset="0%">
                            win %: ${winPercent}
                        </textPath>
                        </text>
                    </g>
                </svg>
            </div>
        </div>`;
}
