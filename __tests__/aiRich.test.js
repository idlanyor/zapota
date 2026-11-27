import { jest } from '@jest/globals';
import { markdownToSections, buildAiRichMessage, sendAiRichReply } from '../src/wa/aiRich.js';

const primitive = (section) => section.view_model.primitive;

const m = {
    chat: 'room@g.us',
    sender: '628123@s.whatsapp.net',
    key: { id: 'Q1' },
    message: { conversation: '.ai halo' },
};

describe('markdownToSections', () => {
    test('splits markdown tables into table primitives between text sections', () => {
        const sections = markdownToSections(
            [
                '### Jadwal',
                'Berikut **jadwalnya**:',
                '',
                '| Ibadah | Waktu |',
                '|:-------|------:|',
                '| Subuh | 04:30 |',
                '| **Dzuhur** | 11:50 |',
                '',
                '> semoga membantu',
            ].join('\n')
        );

        expect(sections.map((s) => primitive(s).__typename)).toEqual([
            'GenAIMarkdownTextUXPrimitive',
            'GenATableUXPrimitive',
            'GenAIMarkdownTextUXPrimitive',
        ]);
        expect(primitive(sections[0]).text).toBe('### Jadwal\nBerikut *jadwalnya*:');
        expect(primitive(sections[1]).rows).toEqual([
            {
                is_header: true,
                cells: ['Ibadah', 'Waktu'],
                markdown_cells: [{ text: 'Ibadah' }, { text: 'Waktu' }],
            },
            {
                is_header: false,
                cells: ['Subuh', '04:30'],
                markdown_cells: [{ text: 'Subuh' }, { text: '04:30' }],
            },
            {
                is_header: false,
                cells: ['**Dzuhur**', '11:50'],
                markdown_cells: [{ text: '*Dzuhur*' }, { text: '11:50' }],
            },
        ]);
        expect(primitive(sections[2]).text).toBe('> semoga membantu');
    });

    test('pads short rows to the header width', () => {
        const [table] = markdownToSections('| A | B | C |\n|---|---|---|\n| 1 |');
        expect(primitive(table).rows[1].cells).toEqual(['1', '', '']);
    });

    test('leaves tables inside code fences as text', () => {
        const sections = markdownToSections('```\n| a | b |\n|---|---|\n```');
        expect(sections).toHaveLength(1);
        expect(primitive(sections[0]).__typename).toBe('GenAIMarkdownTextUXPrimitive');
    });

    test('a pipe line without a separator row is not a table', () => {
        const sections = markdownToSections('| bukan tabel |\nlanjut');
        expect(sections).toHaveLength(1);
    });
});

describe('links', () => {
    test('[text](url) stays a plain markdown link (style A)', () => {
        const [section] = markdownToSections('Lihat [GitHub Kanata](https://github.com/x/y) ya');
        const p = primitive(section);
        expect(p.text).toBe('Lihat [GitHub Kanata](https://github.com/x/y) ya');
        expect(p.inline_entities).toBeUndefined();
    });

    test('[sumber](url) becomes a source chip with a hash inside (style C)', () => {
        const [section] = markdownToSections('Fakta penting [sumber](https://www.bmkg.go.id/a).');
        const p = primitive(section);
        expect(p.text).toMatch(/^Fakta penting \{\{IE_0\}\}[0-9a-f]{4}\{\{\/IE_0\}\}\.$/);
        expect(p.inline_entities[0].metadata).toMatchObject({
            reference_title: 'bmkg.go.id',
            reference_display_name: 'bmkg.go.id',
        });
    });

    test('chip keys are unique per message, repeated URLs share a reference id', () => {
        const sections = markdownToSections(
            '[sumber](https://a.com) [1](https://b.com) [teks](https://c.com)\n\n| x |\n|---|\n| y |\n\n[ref](https://a.com)'
        );
        const entities = [sections[0], sections[2]].flatMap((s) => primitive(s).inline_entities);
        expect(entities.map((e) => e.key)).toEqual(['IE_0', 'IE_1', 'IE_2']);
        expect(entities.map((e) => e.metadata.reference_id)).toEqual([1, 2, 1]);
        expect(primitive(sections[0]).text).toContain('[teks](https://c.com)');
    });

    test('links inside code are left alone', () => {
        const [section] = markdownToSections('`[sumber](https://a.com)`\n```\n[sumber](https://b.com)\n```');
        expect(primitive(section).inline_entities).toBeUndefined();
    });

    test('fallback text spells links out', () => {
        const { message } = buildAiRichMessage('[Web](https://k.id) ok [sumber](https://s.id)', m);
        const rich = message.botForwardedMessage.message.richResponseMessage;
        expect(rich.submessages[0].messageText).toBe('Web (https://k.id) ok (https://s.id)');
    });
});

describe('buildAiRichMessage', () => {
    test('wraps unifiedResponse in botForwardedMessage with a text fallback and quote', () => {
        const { message, responseId } = buildAiRichMessage('Halo **dunia**', m);

        expect(message.conversation).toBeUndefined();
        const rich = message.botForwardedMessage.message.richResponseMessage;
        expect(rich.submessages).toEqual([{ messageType: 2, messageText: 'Halo *dunia*' }]);
        expect(rich.contextInfo).toMatchObject({
            isForwarded: true,
            forwardOrigin: 4,
            stanzaId: 'Q1',
            participant: m.sender,
            quotedMessage: m.message,
        });
        const data = JSON.parse(rich.unifiedResponse.data.toString('utf8'));
        expect(data.response_id).toBe(responseId);
        expect(primitive(data.sections[0]).text).toBe('Halo *dunia*');
        expect(message.messageContextInfo.botMetadata.botResponseId).toBe(responseId);
    });
});

describe('sendAiRichReply', () => {
    test('relays the rich message with its response id', async () => {
        const sock = { relayMessage: jest.fn().mockResolvedValue({}), sendMessage: jest.fn() };
        await sendAiRichReply(sock, m, 'hai');

        const [chat, message, options] = sock.relayMessage.mock.calls[0];
        expect(chat).toBe(m.chat);
        expect(options.messageId).toBe(message.messageContextInfo.botMetadata.botResponseId);
        expect(sock.sendMessage).not.toHaveBeenCalled();
    });

    test('falls back to a quoted plain text reply when relaying fails', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        const sock = {
            relayMessage: jest.fn().mockRejectedValue(new Error('boom')),
            sendMessage: jest.fn().mockResolvedValue({}),
        };
        await sendAiRichReply(sock, m, '**hai**');

        expect(sock.sendMessage).toHaveBeenCalledWith(m.chat, { text: '*hai*' }, { quoted: m });
        console.error.mockRestore();
    });
});
