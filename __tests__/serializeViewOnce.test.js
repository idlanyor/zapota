import { serialize } from '../src/utils/serialize.js';

const sock = { user: { id: '62800000000@s.whatsapp.net' } };
const audio = { mimetype: 'audio/ogg; codecs=opus', ptt: true, viewOnce: true };

const msgQuoting = (quotedMessage) => ({
    key: { remoteJid: '123@g.us', fromMe: false, id: 'ABC', participant: '62811@s.whatsapp.net' },
    message: {
        extendedTextMessage: {
            text: 'hai',
            contextInfo: { stanzaId: 'Q1', participant: '62822@s.whatsapp.net', quotedMessage },
        },
    },
});

describe('serialize view-once unwrapping', () => {
    test.each(['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension'])(
        'quoted %s is unwrapped and flagged view-once',
        (wrapper) => {
            const m = serialize(
                msgQuoting({ [wrapper]: { message: { audioMessage: audio } } }),
                sock
            );
            expect(m.quoted.mtype).toBe('audioMessage');
            expect(m.quoted.isAudio).toBe(true);
            expect(m.quoted.isViewOnce).toBe(true);
        }
    );

    test('incoming viewOnceMessageV2Extension is unwrapped and flagged view-once', () => {
        const m = serialize(
            {
                key: { remoteJid: '62822@s.whatsapp.net', fromMe: false, id: 'X' },
                message: { viewOnceMessageV2Extension: { message: { audioMessage: audio } } },
            },
            sock
        );
        expect(m.mtype).toBe('audioMessage');
        expect(m.isViewOnce).toBe(true);
    });

    test('plain quoted audio is not flagged view-once', () => {
        const m = serialize(msgQuoting({ audioMessage: { ...audio, viewOnce: false } }), sock);
        expect(m.quoted.isViewOnce).toBe(false);
    });
});
