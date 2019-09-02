
const BIT_RATIO = 8 / 7;

/**
 * @param {Uint8Array} buffer
 * @return {Uint8Array}
 */
function encode(buffer) {
    const output = new Uint8Array(Math.ceil(buffer.byteLength * BIT_RATIO));
    let outputByteIndex = 0;
    let outputBitIndex = 6;

    for (let i = 0; i < buffer.byteLength; i++) {
        for (let bitMask = 0x80; bitMask; bitMask >>>= 1) {
            const bit = buffer[i] & bitMask ? 1 : 0;

            output[outputByteIndex] |= bit << outputBitIndex--;
            if (outputBitIndex === -1) {
                outputBitIndex = 6;
                outputByteIndex++;
            }
        }
    }

    return output;
}

/**
 * @param {Uint8Array} buffer
 * @return {Uint8Array}
 */
function decode(buffer) {
    const output = new Uint8Array(Math.floor(buffer.byteLength / BIT_RATIO));
    let outputByteIndex = 0;
    let outputBitIndex = 7;

    for (let i = 0; i < buffer.byteLength; i++) {
        for (let bitMask = 0x40; bitMask; bitMask >>>= 1) {
            const bit = buffer[i] & bitMask ? 1 : 0;

            output[outputByteIndex] |= bit << outputBitIndex--;
            if (outputBitIndex === -1) {
                outputBitIndex = 7;
                outputByteIndex++;
            }

            if (outputByteIndex === output.byteLength) {
                break;  // what comes after are just padding bits - ignore them and terminate
            }
        }
    }

    return output;
}

export { encode, decode };
