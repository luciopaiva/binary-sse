
/**
 * @param {Buffer|Uint8Array} buffer
 * @return {String}
 */
export default function debug(buffer) {
    const chars = [];
    for (let i = 0; i < buffer.byteLength; i++) {
        chars.push(buffer[i].toString(16).padStart(2, "0"));
    }
    return chars.join(" ");
}
