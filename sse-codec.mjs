
const DEBUG_MODE = false;

const ESCAPE = 0x7F;  // randomly chosen, for now - find out which byte is the rarest in image data and use it

const ESCAPED_CR_BUFFER = new Uint8Array([ESCAPE, 0x01]);
const ESCAPED_LF_BUFFER = new Uint8Array([ESCAPE, 0x02]);
const ESCAPED_ESC_BUFFER = new Uint8Array([ESCAPE, ESCAPE]);

// keep arrays below symmetrical
const CHARACTERS_TO_ESCAPE = [0x0D, 0x0A, ESCAPE];  // CR, LF and our special escape character
const ESCAPED_BUFFERS = [ESCAPED_CR_BUFFER, ESCAPED_LF_BUFFER, ESCAPED_ESC_BUFFER];

const DECODE_CHAR = new Map();
DECODE_CHAR.set(0x01, 0x0D);
DECODE_CHAR.set(0x02, 0x0A);
DECODE_CHAR.set(ESCAPE, ESCAPE);

/**
 * The idea here is taking some unspecified binary data and turn it into something that we can push into SSE
 * messages. Per the definition, the value of the data field can contain any UTF-8 data, but a CR, LF or CR+LF
 * character combination ends the value and what comes next should be another message field or a final line break
 * to indicate the end of the message.
 *
 * So, to force binary data into that field, we need to avoid CR and LF, simple as that. My idea here is to go
 * through every byte of the binary data looking for CR/LF and replacing them with a placeholder, something we can
 * later undo on the client side to obtain the original data.
 *
 * My approach is to escape CR/LF chars by replacing them with a special escape character plus a code to indicate
 * if it was CR or LF. Of course, we need to escape the very escaping character every time it occurs in the data.
 * So this is the mapping table:
 *
 * CR -> ESC+CR
 * LF -> ESC+LF
 * ESC -> ESC+ESC
 *
 * Any of these three, replace with their escaped version; everything else, keep it the same.
 *
 * Possible future improvement: if there are too many CR/LF/ESC chars, the file may hypothetically double in size.
 * Change the encoding to take that into account somehow (e.g., ESC+CR+COUNT).
 *
 * Reference: https://html.spec.whatwg.org/multipage/server-sent-events.html#the-eventsource-interface
 * @param {Uint8Array} buffer
 * @return Uint8Array
 */
function binaryToSseData(buffer) {
    const chunks = [];
    const charCount = Array.from(CHARACTERS_TO_ESCAPE, () => 0);
    let previousChunkEnd = 0;

    for (let i = 0; i < buffer.byteLength; i++) {
        const charIndex = CHARACTERS_TO_ESCAPE.indexOf(buffer[i]);
        if (charIndex !== -1) {
            chunks.push(buffer.slice(previousChunkEnd, i));  // save bytes before it
            chunks.push(ESCAPED_BUFFERS[charIndex]);
            previousChunkEnd = i + 1;  // skip escaped char
            charCount[charIndex]++;
        }
    }
    chunks.push(buffer.slice(previousChunkEnd, buffer.byteLength));  // add the final chunk

    const finalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);

    const escapedBuffer = new Uint8Array(finalLength);
    let escapedBufferPosition = 0;
    for (const chunk of chunks) {
        escapedBuffer.set(chunk, escapedBufferPosition);
        escapedBufferPosition += chunk.byteLength;
    }
    if (DEBUG_MODE) {
        const increase = ((escapedBuffer.byteLength / buffer.byteLength - 1) * 100).toFixed(1);
        console.info(`Escaped characters occurrence: ${charCount.join(", ")}`);
        console.info(`Original size: ${buffer.byteLength}, escaped size: ${escapedBuffer.byteLength} (increased by ${increase}%)`);
    }
    return escapedBuffer;
}

/**
 * @param {Uint8Array} buffer
 * @return {Uint8Array}
 */
function sseToBinaryData(buffer) {
    const decodedBuffer = new Uint8Array(buffer.byteLength);
    let targetNextFreeIndex = 0;
    let sourceCopyStartIndex = 0;

    for (let i = 0; i < buffer.byteLength; i++) {
        if (CHARACTERS_TO_ESCAPE.includes(buffer[i])) {
            const slice = buffer.slice(sourceCopyStartIndex, i);
            decodedBuffer.set(slice, targetNextFreeIndex);
            targetNextFreeIndex += slice.byteLength;
            decodedBuffer[targetNextFreeIndex++] = DECODE_CHAR.get(buffer[++i]);

            sourceCopyStartIndex = i + 1;  // next chunk to copy will begin here
        }
    }
    const finalSlice = buffer.slice(sourceCopyStartIndex, buffer.byteLength);
    decodedBuffer.set(finalSlice, targetNextFreeIndex);  // copy remaining data
    targetNextFreeIndex += finalSlice.byteLength;

    return decodedBuffer.slice(0, targetNextFreeIndex);  // strip unused remaining space
}

export { binaryToSseData, sseToBinaryData };
