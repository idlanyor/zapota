import { jest } from '@jest/globals';
import { compose } from '../src/pipeline/compose.js';
import { validateGuards, GUARD_NAMES } from '../src/pipeline/guardNames.js';
import { findParticipant, isParticipantAdmin, isBotAdmin } from '../src/lib/groupRoles.js';
import { isAddressedToBot, stripBotMentions } from '../src/lib/botMention.js';

describe('compose', () => {
    test('runs steps in order and unwinds after next()', async () => {
        const log = [];
        const run = compose([
            async (ctx, next) => {
                log.push('a>');
                await next();
                log.push('<a');
            },
            async (ctx, next) => {
                log.push('b');
                await next();
            },
        ]);
        await run({});
        expect(log).toEqual(['a>', 'b', '<a']);
    });

    test('a step that does not call next() stops the pipeline', async () => {
        const later = jest.fn();
        await compose([async () => {}, later])({});
        expect(later).not.toHaveBeenCalled();
    });

    test('shares ctx between steps', async () => {
        const ctx = {};
        await compose([
            async (c, next) => {
                c.x = 1;
                await next();
            },
            async (c) => {
                c.y = c.x + 1;
            },
        ])(ctx);
        expect(ctx).toEqual({ x: 1, y: 2 });
    });

    test('calling next() twice throws', async () => {
        const run = compose([
            async (ctx, next) => {
                await next();
                await next();
            },
        ]);
        await expect(run({})).rejects.toThrow('next() called multiple times');
    });

    test('rejects non-function steps', () => {
        expect(() => compose([null])).toThrow(TypeError);
    });
});

describe('validateGuards', () => {
    test('accepts every known guard', () => {
        expect(validateGuards([...GUARD_NAMES])).toEqual([...GUARD_NAMES]);
    });

    test('rejects unknown names and non-arrays with the location', () => {
        expect(() => validateGuards(['admn'], 'kick.js#kick')).toThrow(
            'kick.js#kick: unknown guard(s) admn'
        );
        expect(() => validateGuards('admin')).toThrow(TypeError);
    });
});

describe('groupRoles', () => {
    const participants = [
        { id: '628111@s.whatsapp.net', admin: null },
        { id: '628222@s.whatsapp.net', lid: '222@lid', admin: 'admin' },
        { id: '628999@s.whatsapp.net', admin: 'superadmin' },
    ];

    test('finds by phone JID, device JID, or LID', () => {
        expect(findParticipant(participants, '628222:3@s.whatsapp.net')?.admin).toBe('admin');
        expect(findParticipant(participants, '222@lid')?.id).toBe('628222@s.whatsapp.net');
        expect(findParticipant(participants, null, undefined)).toBeUndefined();
    });

    test('admin and superadmin count as admin', () => {
        expect(isParticipantAdmin(participants, '628222@s.whatsapp.net')).toBe(true);
        expect(isParticipantAdmin(participants, '628999@s.whatsapp.net')).toBe(true);
        expect(isParticipantAdmin(participants, '628111@s.whatsapp.net')).toBe(false);
        expect(isParticipantAdmin(participants, '628000@s.whatsapp.net')).toBe(false);
    });

    test('isBotAdmin checks the socket identity', () => {
        expect(isBotAdmin({ user: { id: '628999:5@s.whatsapp.net' } }, participants)).toBe(true);
        expect(isBotAdmin({ user: { id: '628111@s.whatsapp.net' } }, participants)).toBe(false);
    });
});

describe('botMention', () => {
    const sock = { user: { id: '628999:12@s.whatsapp.net', lid: '999:1@lid' } };

    test('detects mention by JID or LID', () => {
        expect(isAddressedToBot(sock, { mentionedJid: ['628999@s.whatsapp.net'] })).toMatchObject({
            isMentioned: true,
            addressed: true,
        });
        expect(isAddressedToBot(sock, { mentionedJid: ['999@lid'] }).isMentioned).toBe(true);
        expect(isAddressedToBot(sock, { mentionedJid: ['628111@s.whatsapp.net'] }).addressed).toBe(
            false
        );
    });

    test('detects reply to the bot', () => {
        expect(isAddressedToBot(sock, { quoted: { fromMe: true } }).isReply).toBe(true);
        expect(
            isAddressedToBot(sock, { quoted: { sender: '628999:3@s.whatsapp.net' } }).isReply
        ).toBe(true);
        expect(
            isAddressedToBot(sock, { quoted: { sender: '628111@s.whatsapp.net' } }).isReply
        ).toBe(false);
    });

    test('strips bot mentions and trims', () => {
        expect(stripBotMentions(sock, '@628999 halo @999 bot ')).toBe('halo  bot');
        expect(stripBotMentions(sock, '@628111 halo')).toBe('@628111 halo');
    });
});
