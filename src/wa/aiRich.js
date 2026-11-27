/**
 * AI answers as WhatsApp "AI Rich" messages in Meta AI's current format:
 * richResponseMessage.unifiedResponse.data = JSON { response_id, sections[] }.
 *
 * Verified on phones (2026-11-27, test matrix sent to phones): unsigned unifiedResponse
 * renders when wrapped in botForwardedMessage. Never add a top-level
 * `conversation` next to it; phones then drop the whole message.
 */
import { createHash, randomUUID } from 'node:crypto';

const BOT_JID = '867051314767696@bot';

/** `**bold**` (standard markdown) -> `*bold*` (what Meta's primitives use). */
const toWhatsAppBold = (text) => text.replace(/\*\*(.+?)\*\*/g, '*$1*');

const MARKDOWN_LINK = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;

/** Labels that mean "source chip" (Meta AI style C) rather than link text (D). */
const SOURCE_LABEL = /^(sumber|source|ref|\^|\d{1,2})$/i;

const hostOf = (url) => {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
};

const citation = (key, referenceId, url, title) => ({
    key,
    metadata: {
        __typename: 'GenAISearchCitationItem',
        reference_id: referenceId,
        reference_url: url,
        reference_title: title,
        reference_display_name: hostOf(url),
        sources: [
            {
                source_type: 'THIRD_PARTY',
                source_display_name: hostOf(url),
                source_subtitle: title,
                source_url: url,
            },
        ],
    },
});

/**
 * `[sumber](url)` / `[1](url)` become Meta AI source chips: a citation entity
 * with a short content hash inside its markers (verified on phones).
 * Other `[text](url)` links stay plain markdown; phones already render them
 * as tappable text (case A). Code (``` fences and `inline`) is untouched.
 * `links` numbers entities across the whole message and gives each distinct
 * URL one reference id.
 */
const linkify = (text, links) => {
    const entities = [];
    const parts = text.split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/);
    const out = parts.map((part, i) => {
        if (i % 2 === 1) return part; // code
        return part.replace(MARKDOWN_LINK, (link, label, url) => {
            if (!SOURCE_LABEL.test(label.trim())) return link;
            const key = `IE_${links.count++}`;
            if (!links.ids.has(url)) links.ids.set(url, links.ids.size + 1);
            entities.push(citation(key, links.ids.get(url), url, hostOf(url)));
            const hash = createHash('sha256').update(url).digest('hex').slice(0, 4);
            return `{{${key}}}${hash}{{/${key}}}`;
        });
    });
    return { text: out.join(''), entities };
};

const markdownSection = (body, links) => {
    const { text, entities } = linkify(body, links);
    return {
        view_model: {
            __typename: 'GenAISingleLayoutViewModel',
            primitive: {
                __typename: 'GenAIMarkdownTextUXPrimitive',
                text,
                ...(entities.length && { inline_entities: entities }),
            },
        },
    };
};

const tableSection = (rows) => ({
    view_model: {
        __typename: 'GenAISingleLayoutViewModel',
        primitive: {
            __typename: 'GenATableUXPrimitive',
            rows: rows.map((cells, i) => ({
                is_header: i === 0,
                cells,
                markdown_cells: cells.map((cell) => ({ text: toWhatsAppBold(cell) })),
            })),
        },
    },
});

const isTableLine = (line) => /^\s*\|.*\|\s*$/.test(line);
const isSeparatorLine = (line) => /^\s*\|?(\s*:?-{2,}:?\s*\|)+\s*:?-{0,}:?\s*\|?\s*$/.test(line);

const splitRow = (line) => {
    const cells = line.trim().split('|').map((cell) => cell.trim());
    if (cells[0] === '') cells.shift();
    if (cells[cells.length - 1] === '') cells.pop();
    return cells;
};

/**
 * Splits markdown into Meta AI sections: GFM tables become table primitives,
 * everything else stays markdown. Lines inside ``` fences are never tables.
 */
export const markdownToSections = (markdown = '') => {
    const lines = markdown.replace(/\r\n/g, '\n').split('\n');
    const sections = [];
    const links = { count: 0, ids: new Map() };
    let text = [];
    let inFence = false;

    const flushText = () => {
        const body = text.join('\n').trim();
        if (body) sections.push(markdownSection(toWhatsAppBold(body), links));
        text = [];
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^\s*```/.test(line)) inFence = !inFence;

        if (!inFence && isTableLine(line) && isSeparatorLine(lines[i + 1] || '')) {
            const rows = [splitRow(line)];
            i += 2; // header + separator
            while (i < lines.length && isTableLine(lines[i])) rows.push(splitRow(lines[i++]));
            i--;
            const width = rows[0].length;
            flushText();
            sections.push(
                tableSection(
                    rows.map((row) => Array.from({ length: width }, (_, c) => row[c] ?? ''))
                )
            );
            continue;
        }
        text.push(line);
    }
    flushText();
    return sections;
};

/** Plain-text version for the TEXT submessage (shown by clients without rich support). */
const fallbackText = (markdown) =>
    toWhatsAppBold(markdown.trim()).replace(MARKDOWN_LINK, (_, label, url) =>
        SOURCE_LABEL.test(label.trim()) ? `(${url})` : `${label} (${url})`
    );

/**
 * Builds the full rich message for `markdown`, quoting `m`.
 * Returns { message, responseId } ready for sock.relayMessage.
 */
export const buildAiRichMessage = (markdown, m) => {
    const responseId = randomUUID();
    const data = { response_id: responseId, sections: markdownToSections(markdown) };
    const message = {
        messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2,
            botMetadata: { messageDisclaimerText: '', botResponseId: responseId },
        },
        botForwardedMessage: {
            message: {
                richResponseMessage: {
                    messageType: 1,
                    submessages: [{ messageType: 2, messageText: fallbackText(markdown) }],
                    unifiedResponse: { data: Buffer.from(JSON.stringify(data)) },
                    contextInfo: {
                        forwardingScore: 1,
                        isForwarded: true,
                        forwardedAiBotMessageInfo: { botJid: BOT_JID },
                        forwardOrigin: 4,
                        ...(m?.key?.id && {
                            stanzaId: m.key.id,
                            participant: m.sender,
                            quotedMessage: m.message,
                        }),
                    },
                },
            },
        },
    };
    return { message, responseId };
};

/**
 * Sends an AI answer as a rich message; falls back to a plain text reply if
 * the transport can't relay raw messages or the relay fails.
 */
export const sendAiRichReply = async (sock, m, markdown) => {
    if (typeof sock.relayMessage === 'function') {
        try {
            const { message, responseId } = buildAiRichMessage(markdown, m);
            return await sock.relayMessage(m.chat, message, { messageId: responseId });
        } catch (err) {
            console.error('AI rich reply failed, sending plain text:', err.message);
        }
    }
    return sock.sendMessage(m.chat, { text: fallbackText(markdown) }, { quoted: m });
};

/**
 * Shows "typing…" until `task` settles (WhatsApp clears it after ~10s, so it
 * is refreshed). Rich replies can't be streamed by editing a text message.
 */
export const withTyping = async (sock, jid, task) => {
    const ping = () => sock.sendPresenceUpdate?.('composing', jid).catch?.(() => {});
    ping();
    const timer = setInterval(ping, 8000);
    try {
        return await task();
    } finally {
        clearInterval(timer);
        sock.sendPresenceUpdate?.('paused', jid)?.catch?.(() => {});
    }
};
