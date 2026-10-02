import fs from 'node:fs';
import path from 'node:path';
import sqlite3 from 'sqlite3';

/**
 * Mencari nomor telepon dari database kontak WhatsApp (zapo-auth.sqlite)
 * jika pesan datang hanya dengan LID dan tidak memiliki alternate JID.
 *
 * @param {string} lid JID bertipe @lid (misal: 213296682643550@lid)
 * @returns {Promise<string|null>}
 */
export const lookupContactPhone = (lid) => {
    if (!lid || typeof lid !== 'string' || !lid.endsWith('@lid')) return Promise.resolve(null);

    return new Promise((resolve) => {
        try {
            const dbPath = path.resolve('data/zapo-auth.sqlite');
            if (!fs.existsSync(dbPath)) return resolve(null);

            const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
                if (err) return resolve(null);
            });

            db.get(
                'SELECT phone_number, jid FROM mailbox_contacts WHERE (jid = ? OR lid = ?) AND phone_number IS NOT NULL LIMIT 1',
                [lid, lid],
                (err, row) => {
                    db.close();
                    if (err || !row?.phone_number) return resolve(null);
                    resolve(row.phone_number);
                }
            );
        } catch {
            resolve(null);
        }
    });
};

/**
 * Mendapatkan identitas nomor telepon (JID canonical dan angka nomor WA)
 * dari objek message WhatsApp.
 *
 * @param {object} m Objek serialized message
 * @returns {Promise<{canonicalJid: string, phoneNumber: string}>}
 */
export const resolveSenderInfo = async (m) => {
    const userId = m?.sender || '';
    const alternateJids = [m?.key?.participantAlt, m?.key?.remoteJidAlt, m?.chatAlt].filter(Boolean);

    let canonicalJid = alternateJids.find((jid) => typeof jid === 'string' && jid.endsWith('@s.whatsapp.net'));

    if (!canonicalJid && userId.endsWith('@lid')) {
        const contactPhone = await lookupContactPhone(userId);
        if (contactPhone && contactPhone.endsWith('@s.whatsapp.net')) {
            canonicalJid = contactPhone;
        }
    }

    if (!canonicalJid) {
        if (userId.endsWith('@s.whatsapp.net')) {
            canonicalJid = userId;
        } else if (!m?.isGroup && m?.chat && m.chat.endsWith('@s.whatsapp.net')) {
            canonicalJid = m.chat;
        } else {
            canonicalJid = userId;
        }
    }

    let rawDigits = canonicalJid.split('@')[0].split(':')[0].replace(/\D/g, '');
    if (rawDigits.startsWith('0')) rawDigits = `62${rawDigits.slice(1)}`;
    else if (rawDigits.startsWith('8')) rawDigits = `62${rawDigits}`;

    return {
        canonicalJid,
        phoneNumber: rawDigits || canonicalJid.split('@')[0],
    };
};
