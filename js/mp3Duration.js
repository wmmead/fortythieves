// mp3Duration.js — exact duration of an MP3 from its bytes, without decoding.
//
// The music engine streams each track through a WASM decoder in small
// chunks, so it never has the decoded whole to measure — and none of the
// tracks carry a Xing/Info header with a frame count. Walking the frame
// headers instead is cheap (a 4-minute file is ~10,000 frames, a few ms) and
// exact for constant- and variable-bitrate files alike, because every frame
// header states its own bitrate and therefore its own length.
//
// Handles MPEG 1 / 2 / 2.5, Layer III only (all this project's audio), and
// skips a leading ID3v2 tag. Returns seconds, or null if no frames are found.

const SAMPLE_RATES = {
    3: [44100, 48000, 32000], // MPEG 1
    2: [22050, 24000, 16000], // MPEG 2
    0: [11025, 12000, 8000],  // MPEG 2.5
};

// Layer III bitrate tables (kbps), indexed by the header's 4-bit bitrate field.
const BITRATES_MPEG1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const BITRATES_MPEG2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];

export function mp3Duration(bytes) {
    let pos = 0;
    if (bytes.length > 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) { // "ID3"
        const size = (bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9];
        pos = 10 + size + ((bytes[5] & 0x10) ? 10 : 0);
    }

    let seconds = 0;
    let frames = 0;
    while (pos + 4 <= bytes.length) {
        const b1 = bytes[pos + 1];
        if (bytes[pos] !== 0xFF || (b1 & 0xE0) !== 0xE0) { pos += 1; continue; }

        const version = (b1 >> 3) & 3;          // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5, 1 = reserved
        const layer = (b1 >> 1) & 3;            // 1 = Layer III
        const bitrateIndex = bytes[pos + 2] >> 4;
        const sampleRateIndex = (bytes[pos + 2] >> 2) & 3;
        const padding = (bytes[pos + 2] >> 1) & 1;

        if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) {
            pos += 1;
            continue;
        }

        const mpeg1 = version === 3;
        const bitrate = (mpeg1 ? BITRATES_MPEG1 : BITRATES_MPEG2)[bitrateIndex] * 1000;
        const sampleRate = SAMPLE_RATES[version][sampleRateIndex];
        const samplesPerFrame = mpeg1 ? 1152 : 576;
        const frameLength = Math.floor((samplesPerFrame / 8) * bitrate / sampleRate) + padding;

        seconds += samplesPerFrame / sampleRate;
        frames += 1;
        pos += frameLength;
    }
    return frames > 0 ? seconds : null;
}
