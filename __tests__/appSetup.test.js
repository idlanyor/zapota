import { patchInteractiveMessageForMd } from '../src/lib/appSetup.js';

describe('App Setup Utilities', () => {
    test('patchInteractiveMessageForMd should wrap interactive messages', () => {
        const input = {
            buttonsMessage: { text: 'Hello' },
        };
        const patched = patchInteractiveMessageForMd(input);

        expect(patched).toHaveProperty('viewOnceMessage');
        expect(patched.viewOnceMessage.message).toHaveProperty('messageContextInfo');
        expect(patched.viewOnceMessage.message).toHaveProperty('buttonsMessage');
    });

    test('patchInteractiveMessageForMd should ignore already wrapped messages', () => {
        const input = {
            viewOnceMessage: {
                message: { text: 'Already wrapped' },
            },
        };
        const patched = patchInteractiveMessageForMd(input);
        expect(patched).toEqual(input);
    });

    test('patchInteractiveMessageForMd should ignore normal text messages', () => {
        const input = {
            text: 'Just text',
        };
        const patched = patchInteractiveMessageForMd(input);
        expect(patched).toEqual(input);
    });
});
