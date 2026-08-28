import { jest } from '@jest/globals';
import testButton from '../src/commands/owner/testbutton.js';
import { attachListMessageCompat } from '../src/lib/listMessageCompat.js';

describe('testbutton command', () => {
    const makeMessage = (overrides = {}) => ({
        isGroup: false,
        chat: 'owner@lid',
        chatAlt: '628123@s.whatsapp.net',
        reply: jest.fn(),
        ...overrides,
    });

    test('is registered as an owner-only command', () => {
        expect(testButton).toMatchObject({
            name: 'testbutton',
            aliases: expect.arrayContaining(['buttondemo', 'demobutton']),
            category: 'Owner',
        });
    });

    test('sends all button types to the alternate JID in private chat', async () => {
        const sock = { sendInteractiveButtons: jest.fn().mockResolvedValue({}) };
        const message = makeMessage();

        await testButton.execute(sock, message, []);

        expect(sock.sendInteractiveButtons).toHaveBeenCalledTimes(1);
        const [target, payload, options] = sock.sendInteractiveButtons.mock.calls[0];
        expect(target).toBe(message.chatAlt);
        expect(payload.interactiveButtons.map((button) => button.name)).toEqual([
            'quick_reply',
            'cta_url',
            'cta_copy',
            'cta_call',
        ]);
        expect(options).toEqual({ quoted: message });
    });

    test('sends the selected button type to the current group', async () => {
        const sock = { sendInteractiveButtons: jest.fn().mockResolvedValue({}) };
        const message = makeMessage({
            isGroup: true,
            chat: '120363000000000000@g.us',
            chatAlt: undefined,
        });

        await testButton.execute(sock, message, ['reply']);

        const [target, payload] = sock.sendInteractiveButtons.mock.calls[0];
        expect(target).toBe(message.chat);
        expect(payload.interactiveButtons).toHaveLength(1);
        expect(payload.interactiveButtons[0].name).toBe('quick_reply');
    });

    test('uses the native Zapo send path in a group', async () => {
        const sock = {
            transport: 'zapo',
            sendMessage: jest.fn().mockResolvedValue({}),
            sendInteractiveButtons: jest.fn(),
        };
        const message = makeMessage({
            isGroup: true,
            chat: '120363000000000000@g.us',
            chatAlt: undefined,
        });

        await testButton.execute(sock, message, ['reply']);

        expect(sock.sendInteractiveButtons).not.toHaveBeenCalled();
        expect(sock.sendMessage).toHaveBeenCalledWith(
            message.chat,
            expect.objectContaining({
                interactiveMessage: expect.objectContaining({
                    nativeFlowMessage: expect.objectContaining({
                        messageVersion: 1,
                        buttons: [expect.objectContaining({ name: 'quick_reply' })],
                    }),
                }),
            }),
            { quoted: message }
        );
    });

    test('rejects an unknown test mode without sending buttons', async () => {
        const sock = { sendInteractiveButtons: jest.fn() };
        const message = makeMessage();

        await testButton.execute(sock, message, ['unknown']);

        expect(sock.sendInteractiveButtons).not.toHaveBeenCalled();
        expect(message.reply).toHaveBeenCalledWith(
            'Mode tidak valid. Pakai: reply, url, copy, call, atau all'
        );
    });

    test('does not duplicate native-flow companion nodes on Zapo group sends', async () => {
        const sock = {
            transport: 'zapo',
            user: { id: 'bot@s.whatsapp.net' },
            sendMessage: jest.fn(),
            relayMessage: jest.fn().mockResolvedValue({}),
        };
        attachListMessageCompat(sock);

        await sock.sendInteractiveButtons('120363000000000000@g.us', {
            text: 'Button test',
            interactiveButtons: [
                {
                    name: 'quick_reply',
                    buttonParamsJson: JSON.stringify({ display_text: 'Ping', id: '.ping' }),
                },
            ],
        });

        expect(sock.relayMessage).toHaveBeenCalledTimes(1);
        expect(sock.relayMessage.mock.calls[0][2].additionalNodes).toEqual([]);
    });
});
