import { prepareImageMedia } from './prepareMedia.js';

/**
 * Sends `text` as a link-preview message (title, description and an uploaded
 * thumbnail for `url`), forwarded-from-channel style, quoting `m`.
 *
 * This is the format `.is` uses; unlike text + externalAdReply it shows on
 * regular WhatsApp, not only WA Business. `url` must appear in `text`.
 * Throws if the thumbnail upload or relay fails, so callers can fall back.
 */
export const sendLinkPreviewText = async (
    sock,
    m,
    { text, url, title, description = '', image, mentions = [], newsletterName }
) => {
    const { imageMessage: thumb } = await prepareImageMedia(sock, image, {
        mediaType: 'thumbnail-link',
    });

    return sock.relayMessage(
        m.chat,
        {
            extendedTextMessage: {
                text,
                matchedText: url,
                title,
                description,
                previewType: 0,
                jpegThumbnail: thumb.jpegThumbnail,
                thumbnailDirectPath: thumb.directPath,
                thumbnailSha256: thumb.fileSha256,
                thumbnailEncSha256: thumb.fileEncSha256,
                mediaKey: thumb.mediaKey,
                mediaKeyTimestamp: thumb.mediaKeyTimestamp,
                thumbnailHeight: thumb.height,
                thumbnailWidth: thumb.width,
                contextInfo: {
                    ...(mentions.length ? { mentionedJid: mentions } : {}),
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '120363315101220471@newsletter',
                        serverMessageId: null,
                        newsletterName: newsletterName || title,
                    },
                    stanzaId: m.key.id,
                    participant: m.sender,
                    quotedMessage: m.message,
                },
            },
        },
        {}
    );
};
