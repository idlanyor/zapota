# Dokumentasi Patch Zapo-js: Dukungan Meta AI HTML Canvas & Unified Response

Dokumentasi ini mencatat perubahan yang dilakukan pada engine **`zapo-js`** dan adapter **`zapoAdapter.js`** agar bot dapat mengirim pesan interaktif **Meta AI HTML Canvas** (`GenAIaeacdsnwHtmlPrimitive` / `unifiedResponse`) tanpa harus beralih ke Baileys.

Jika di masa mendatang kamu melakukan `npm update zapo-js` atau install ulang `node_modules`, perubahan pada package `zapo-js` perlu diterapkan kembali mengikuti panduan ini.

---

## Ringkasan Masalah & Solusi

1. **Masalah di `zapo-js` Asli:**
   - Secara default, `zapo-js` hanya mengenali pesan teks biasa (`conversation`, `extendedTextMessage`, dsb).
   - Pesan yang membawa `botForwardedMessage` atau `richResponseMessage` dianggap sebagai pesan `MEDIA` (`<message type="media">`).
   - Karena stanza bertipe `media` tapi tidak memiliki attachment media, WhatsApp server/client menolaknya.

2. **Masalah di `zapoAdapter.js` Asli:**
   - Adapter menyuntikkan teks `conversation: fallbackText` agar pesan dianggap teks oleh zapo-js.
   - Namun, jika ada `conversation` berdampingan dengan `unifiedResponse`, WhatsApp di HP memprioritaskan teks biasa dan **membatalkan render Canvas HTML** (hanya muncul status mengetik lalu hilang).

3. **Solusi yang Diterapkan:**
   - Patch `zapo-js` agar langsung mengklasifikasikan `botForwardedMessage` dan `richResponseMessage` sebagai tipe `TEXT`.
   - Update `zapoAdapter.js` agar tidak menyuntikkan fallback `conversation` jika pesan membawa `unifiedResponse` atau jika opsi `raw: true` diberikan.

---

## Daftar File yang Dimodifikasi

### 1. `node_modules/zapo-js/dist/message/encode/content.js` (CJS)
Cari fungsi `resolveMessageTypeAttrFrom(msg)` (sekitar baris 216 - 220).

**Sebelum:**
```javascript
    if ((msg.conversation !== undefined && msg.conversation !== null) ||
        (msg.extendedTextMessage && !msg.extendedTextMessage.matchedText) ||
        msg.protocolMessage ||
```

**Sesudah:**
```javascript
    if ((msg.conversation !== undefined && msg.conversation !== null) ||
        (msg.extendedTextMessage && !msg.extendedTextMessage.matchedText) ||
        msg.botForwardedMessage ||
        msg.richResponseMessage ||
        msg.protocolMessage ||
```

---

### 2. `node_modules/zapo-js/dist/esm/message/encode/content.js` (ESM)
Cari fungsi `resolveMessageTypeAttrFrom(msg)` (sekitar baris 190 - 195).

**Sebelum:**
```javascript
    if ((msg.conversation !== undefined && msg.conversation !== null) ||
        (msg.extendedTextMessage && !msg.extendedTextMessage.matchedText) ||
        msg.protocolMessage ||
```

**Sesudah:**
```javascript
    if ((msg.conversation !== undefined && msg.conversation !== null) ||
        (msg.extendedTextMessage && !msg.extendedTextMessage.matchedText) ||
        msg.botForwardedMessage ||
        msg.richResponseMessage ||
        msg.protocolMessage ||
```

---

### 3. `src/wa/zapoAdapter.js` (File Project Bot)
*(Catatan: File ini berada di repository kodemu, jadi tidak akan terhapus saat npm update, kecuali kamu sengaja mengubahnya).*

#### A. Pada fungsi `ensureAiRichTextEnvelope`:
Tambahkan parameter `options = {}` dan cegah injeksi `conversation` jika ada `unifiedResponse` atau opsi `raw`:

```javascript
const ensureAiRichTextEnvelope = (message, options = {}) => {
    if (options?.raw || options?.rawMessage) return message;
    const richResponse =
        message?.richResponseMessage ||
        message?.botForwardedMessage?.message?.richResponseMessage;

    if (!richResponse || message?.conversation != null || richResponse?.unifiedResponse)
        return message;

    const fallbackText = (richResponse.submessages || [])
        .flatMap((submessage) => {
            if (submessage?.messageText) return [submessage.messageText];
            const code = submessage?.codeMetadata?.codeBlocks
                ?.map((block) => block.codeContent || '')
                .join('');
            return code ? [`\`\`\`${submessage.codeMetadata.codeLanguage || ''}\n${code}\n\`\`\``] : [];
        })
        .join('\n\n');

    return { conversation: fallbackText || 'AI Rich response', ...message };
};
```

#### B. Pada method `relayMessage`:
Teruskan `options` ke pemanggilan `ensureAiRichTextEnvelope`:

```javascript
relayMessage: async (jid, message, options = {}) => {
    const messageToSend = ensureAiRichTextEnvelope(message, options);
    const result = await zapo.message.send(jid, messageToSend, {
        id: options.messageId,
        customNodes: options.additionalNodes ?? options.customNodes,
        additionalAttributes: options.additionalAttributes,
    });
    return {
        key: { remoteJid: jid, fromMe: true, id: result.id },
        message: messageToSend,
    };
},
```

---

## Cara Penggunaan di Command Plugin

Untuk mengirim pesan Canvas HTML interaktif di command bot:

```javascript
import { randomUUID } from 'node:crypto';

export default {
    name: 'namagame',
    category: 'Games',
    execute: async (sock, m) => {
        const responseId = randomUUID();
        const html = `<html>...</html>`;

        await sock.relayMessage(
            m.chat,
            {
                messageContextInfo: {
                    deviceListMetadata: {},
                    deviceListMetadataVersion: 2,
                    botMetadata: {
                        messageDisclaimerText: '',
                        botResponseId: responseId,
                    },
                },
                botForwardedMessage: {
                    message: {
                        richResponseMessage: {
                            messageType: 1,
                            submessages: [
                                {
                                    messageType: 2,
                                    messageText: 'Game Title',
                                },
                            ],
                            unifiedResponse: {
                                data: Buffer.from(
                                    JSON.stringify({
                                        response_id: responseId,
                                        sections: [
                                            {
                                                view_model: {
                                                    primitive: {
                                                        __typename: 'GenAIaeacdsnwHtmlPrimitive',
                                                        payload: html,
                                                        trusted_sources: [],
                                                    },
                                                    __typename: 'GenAISingleLayoutViewModel',
                                                },
                                            },
                                        ],
                                    })
                                ).toString('base64'),
                            },
                            contextInfo: {
                                forwardingScore: 1,
                                isForwarded: true,
                                forwardedAiBotMessageInfo: {
                                    botJid: '867051314767696@bot',
                                },
                                forwardOrigin: 4,
                            },
                        },
                    },
                },
            },
            {
                messageId: responseId,
                raw: true, // Pastikan opsi ini ada agar payload tidak dimodifikasi
            }
        );
    }
};
```
