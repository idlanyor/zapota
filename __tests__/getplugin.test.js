import { jest } from '@jest/globals';
import getPlugin, {
    buildAiRichCodeMessage,
    fitCodeForAiRich,
} from '../src/commands/owner/getplugin.js';

describe('getplugin AI Rich command', () => {
    const message = {
        chat: '120363000000000000@g.us',
        sender: '628123@s.whatsapp.net',
        key: { id: 'source-message-id' },
        message: { conversation: '.gp testbutton' },
        reply: jest.fn(),
        react: jest.fn().mockResolvedValue({}),
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('builds a renderable AI Rich payload with one code block', () => {
        const payload = buildAiRichCodeMessage({
            content: 'export default { name: \'demo\' };',
            fileName: 'demo.js',
            m: message,
        });

        const rich = payload.botForwardedMessage.message.richResponseMessage;
        expect(rich.contextInfo.forwardingScore).toBe(1);
        expect(rich.submessages[1].codeMetadata.codeBlocks).toEqual([
            {
                highlightType: 0,
                codeContent: 'export default { name: \'demo\' };',
            },
        ]);
        expect(payload.messageContextInfo.botMetadata.messageDisclaimerText).toContain('AI Rich');
    });

    test('limits oversized source code for AI Rich compatibility', () => {
        const result = fitCodeForAiRich('x'.repeat(30_000));

        expect(result.truncated).toBe(true);
        expect(result.code).toContain('output dipotong');
        expect(result.code.length).toBeLessThan(25_000);
    });

    test('publishes an existing plugin as AI Rich', async () => {
        const sock = {
            relayMessage: jest.fn().mockResolvedValue({}),
            generateMessageTag: jest.fn().mockReturnValue('generated-id'),
        };

        await getPlugin.execute(sock, message, ['testbutton'], 'testbutton');

        expect(sock.relayMessage).toHaveBeenCalledTimes(1);
        const [chat, payload, options] = sock.relayMessage.mock.calls[0];
        expect(chat).toBe(message.chat);
        expect(options).toEqual({ messageId: 'generated-id' });
        expect(
            payload.botForwardedMessage.message.richResponseMessage.submessages[1].codeMetadata
                .codeBlocks
        ).toHaveLength(1);
        expect(message.react).not.toHaveBeenCalled();
    });

    test('shows usage when plugin name is omitted', async () => {
        await getPlugin.execute({}, message, [], '');

        expect(message.reply).toHaveBeenCalledWith(
            'Masukkan nama plugin. Contoh: `.gp testbutton`'
        );
    });
});
