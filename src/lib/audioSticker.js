import { randomBytes } from 'node:crypto';
import { proto } from 'zapo-js';

// zapo-js 1.12's proto doesn't know these fields yet, so they ride along as
// raw bytes in `$unknowns`, which every zapo proto encoder writes verbatim.
const TAG_STICKER_AUDIO = (26 << 3) | 2; // StickerMessage.audioMessage
const TAG_AUDIO_STICKER = (134 << 3) | 2; // Message.audioStickerMessage (FutureProofMessage)

const varint = (n) => {
    const out = [];
    while (n > 127) {
        out.push((n & 127) | 128);
        n >>>= 7;
    }
    out.push(n);
    return out;
};

export const lengthDelimited = (tag, bytes) =>
    Buffer.concat([Buffer.from([...varint(tag), ...varint(bytes.length)]), Buffer.from(bytes)]);

export const buildAudioStickerMessage = (stickerMessage, audioMessage) => {
    const audioBytes = proto.Message.AudioMessage.encode(audioMessage).finish();
    const sticker = {
        ...stickerMessage,
        $unknowns: [lengthDelimited(TAG_STICKER_AUDIO, audioBytes)],
    };
    const futureProof = proto.Message.FutureProofMessage.encode({
        message: { stickerMessage: sticker },
    }).finish();
    return {
        messageContextInfo: { messageSecret: randomBytes(32) },
        $unknowns: [lengthDelimited(TAG_AUDIO_STICKER, futureProof)],
    };
};
