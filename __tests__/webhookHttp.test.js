import { jest } from '@jest/globals';
import {
    getClientIp,
    createRateLimiter,
    normalizeJid,
    decodeBase64Data,
    validateToken,
} from '../src/webhook/http.js';
import { createRouter } from '../src/webhook/router.js';

process.env.OWNER_NUMBER = '628111000111';
const { parsePaymentNotification } = await import('../src/webhook/routes/payment.js');

const req = (remoteAddress, xff) => ({
    socket: { remoteAddress },
    headers: xff ? { 'x-forwarded-for': xff } : {},
});

describe('getClientIp', () => {
    test('trusts X-Forwarded-For only from a local reverse proxy', () => {
        expect(getClientIp(req('127.0.0.1', '10.0.0.5, 127.0.0.1'))).toBe('10.0.0.5');
        expect(getClientIp(req('::1', '10.0.0.5'))).toBe('10.0.0.5');
        // A remote client cannot claim an allowlisted IP.
        expect(getClientIp(req('203.0.113.9', '10.0.0.5'))).toBe('203.0.113.9');
        expect(getClientIp(req('127.0.0.1'))).toBe('127.0.0.1');
    });
});

describe('createRateLimiter', () => {
    test('allows `max` hits per window, per key', () => {
        jest.useFakeTimers();
        const hit = createRateLimiter({ windowMs: 1000, max: 2 });
        expect([hit('a'), hit('a'), hit('a'), hit('b')]).toEqual([true, true, false, true]);
        jest.advanceTimersByTime(1001);
        expect(hit('a')).toBe(true);
        jest.useRealTimers();
    });
});

describe('helpers', () => {
    test('normalizeJid / decodeBase64Data / validateToken', () => {
        expect(normalizeJid(' +62 812-3 ')).toBe('628123@s.whatsapp.net');
        expect(normalizeJid('120@g.us')).toBe('120@g.us');
        expect(normalizeJid('abc')).toBeNull();
        expect(decodeBase64Data('data:x;base64,aGk=').toString()).toBe('hi');
        expect(decodeBase64Data('')).toBeNull();
        expect(validateToken('secret', 'secret')).toBe(true);
        expect(validateToken('secreT', 'secret')).toBe(false);
        expect(validateToken('', 'secret')).toBe(false);
    });
});

describe('router', () => {
    test('rejects duplicate routes and routes without handlers', () => {
        const r = { method: 'GET', path: '/x', handler: async () => {} };
        expect(() => createRouter([r, { ...r }])).toThrow('Duplicate webhook route: GET /x');
        expect(() => createRouter([{ method: 'GET', path: '/y' }])).toThrow('has no handler');
    });
});

describe('parsePaymentNotification', () => {
    test('GoBiz native settlement event', () => {
        const p = parsePaymentNotification({
            header: { event_name: 'payment.transaction.settlement' },
            body: { transaction: { order_id: 'O1', gross_amount: 15000, payment_type: 'gopay' } },
        });
        expect(p).toMatchObject({
            explicitOrderId: 'O1',
            amount: 15000,
            status: 'settlement',
            isSuccess: true,
            paymentType: 'GOPAY',
        });
    });

    test('forwarded phone notification text', () => {
        const p = parsePaymentNotification({
            title: 'QRIS',
            text: 'Pembayaran sebesar 7.500 diterima',
        });
        expect(p).toMatchObject({
            explicitOrderId: null,
            amount: 7500,
            isSuccess: true,
            paymentType: 'QRIS',
        });
    });

    test('pending / expire are not successful', () => {
        expect(
            parsePaymentNotification({ transaction_status: 'pending', amount: 1 }).isSuccess
        ).toBe(false);
        expect(parsePaymentNotification({ status: 'EXPIRE', amount: 1 }).status).toBe('expire');
        expect(parsePaymentNotification({ text: 'Pembayaran berhasil' }).isSuccess).toBe(false); // no amount
    });
});
