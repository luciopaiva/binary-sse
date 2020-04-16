
# Sending binary data via server-sent events

This is a proof of concept on how to send binary data via [SSE](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events). SSE was designed to carry only UTF-8 text, so the usual way would be to encode your binary data to base64 before sending. The problem is that the final message will be much bigger than desired. Every 8 bits in the output are encoding 6 bits in the input. That's why it's called base 64, by the way; 6 bits encode 64 different combinations. This 8/6 ratio represents an increase of about 33% in the final size.

One naive approach would be to just get the binary data and send it as it is in the event's data field. The first problem would be that characters 0x0A and 0x0D represent end of data (as per the SSE specification), so any occurrence of these characters would have to be mapped to something else before sending. For instance, 0x0A could be encoded into 0x00 0x01 and 0x0D could be encoded into 0x00 0x02. Of course, now any occurrence of 0x00 in the original input data would need to be escaped, but that can be done by just doubling it (0x00 0x00). The decoder side would look for 0x00 and then know that the byte that follows is always special, designating one of the three possible encoded values (line feed, carriage return or 0x00).

But that won't work, unfortunately. The problem is that not every sequence of bytes represent valid UTF-8 data. For instance, if one of the bytes is 0xC0, in UTF-8 that represents the first of a 2-byte sequence character. In that case, the second character must necessarily begin with bits b10, otherwise it will be considered invalid UTF-8 text. If that happens, the browser will replace the bad sequence with an "invalid character" marker and your original data will get corrupted because of that.

The easiest way to send binary data as UTF-8 and get away with murder is to avoid all bytes greater than 0x7f, i.e., the ones that have the most significant bit set. This can easily be inferred if you check all UTF-8 encoding possibilities. From the [Wikipedia article](https://en.wikipedia.org/wiki/UTF-8):

    1 byte    0xxxxxxx
    2 bytes   110xxxxx 10xxxxxx
    3 bytes   1110xxxx 10xxxxxx 10xxxxxx
    4 bytes   11110xxx 10xxxxxx 10xxxxxx 10xxxxxx

If you choose to encode all of your data in 1-byte symbols, you will lose 1 bit for every 8. This means an increase of 14% (8/7) in size due to the one bit you can't use.

Now let's do the math for 2-byte symbols: 16/5, or 3.2 times the original size; way worse than the 1-byte option. For 3-byte symbols: 24/8, or 3 times the original size. Better than 2 bytes, but still definitely worse than 1 byte. Finally, 4-byte symbols: 32/11, or 2.9 times; not worth it either.

So the math is simple and it shows that the best way to go is to use all 1-byte symbols. The final basic 3 steps are:

1. encode original data to base 128
2. escape special characters 0x0D and 0x0A
3. convert from Buffer to UTF-8 string

To illustrate the idea, I developed this simple client/server application that periodically sends images via [SSE](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events), which are then decoded (i.e., steps 3, 2, 1) and shown in an `img` element.

## Setup

Set up the server:

    nvm install
    npm install
    node --experimental-modules server

I'm using experimental modules so I can reuse server side code on the browser.

## Note about Javascript modules

This project is using modern Javascript and the same modules are being used both on the client and on the server thanks to Node's `--experimental-modules` flag.

## Related

This article [here](https://haacked.com/archive/2012/01/30/hazards-of-converting-binary-data-to-a-string.aspx/) is also relevant to the discussion, although it encourages you to use base 64 (which I disagree).
