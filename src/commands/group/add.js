import { jidNormalizedUser } from '../../wa/helpers.js';

export default {
    name: 'add',
    description: 'Add a member to the group',
    category: 'Group',
    execute: async (sock, m, args, text) => {
        if (!m.isGroup) return m.reply('This command can only be used in groups.');

        const groupMetadata = await sock.groupMetadata(m.chat);
        const participants = groupMetadata.participants;

        const botJid = jidNormalizedUser(sock.user.id);
        const botLid = sock.user.lid ? jidNormalizedUser(sock.user.lid) : null;

        const userAdmin = participants.find(
            (p) => jidNormalizedUser(p.id) === jidNormalizedUser(m.sender)
        );
        const botAdmin = participants.find((p) => {
            const pid = jidNormalizedUser(p.id);
            return pid === botJid || pid === botLid;
        });

        const isAdmin =
            userAdmin && (userAdmin.admin === 'admin' || userAdmin.admin === 'superadmin');
        const botIsAdmin =
            botAdmin && (botAdmin.admin === 'admin' || botAdmin.admin === 'superadmin');

        if (!isAdmin) return m.reply('This command is only for group admins.');
        if (!botIsAdmin) return m.reply('I need to be an admin to add members.');

        const users = new Set();
        const participantSet = new Set(participants.map((p) => jidNormalizedUser(p.id)));

        const addNumberAsJid = (raw) => {
            if (!raw) return;
            let num = String(raw).replace(/[^0-9]/g, '');
            if (num.startsWith('0')) {
                num = '62' + num.slice(1);
            }
            if (num.length >= 10) users.add(`${num}@s.whatsapp.net`);
        };

        const extractWaidFromVcard = (vcard = '') => {
            const match = /waid=(\d{6,})/i.exec(vcard);
            return match ? match[1] : null;
        };

        const findInviteMeta = (node) => {
            if (!node || typeof node !== 'object') return null;

            const attrs = node.attrs || {};
            const inviteCode = attrs.invite_code || attrs.code || attrs.inviteCode;
            const inviteExpirationRaw =
                attrs.invite_exp || attrs.expiration || attrs.inviteExpiration;

            if (inviteCode) {
                return {
                    inviteCode,
                    inviteExpiration:
                        Number(inviteExpirationRaw) ||
                        Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60,
                };
            }

            if (Array.isArray(node.content)) {
                for (const child of node.content) {
                    const childResult = findInviteMeta(child);
                    if (childResult) return childResult;
                }
            }

            return null;
        };

        // 1. From Arguments (Numbers)
        if (args.length > 0) {
            args.forEach(addNumberAsJid);
        }

        const contextInfo = m.msg?.contextInfo || {};

        // 2. From Mention (direct mention in current message)
        if (Array.isArray(contextInfo.mentionedJid)) {
            contextInfo.mentionedJid.forEach((jid) => users.add(jid));
        }

        // 3. From Quoted Message (reply target, vCard, contacts array)
        const quoted = contextInfo.quotedMessage || null;
        if (quoted) {
            if (contextInfo.participant) {
                users.add(contextInfo.participant);
            }

            if (quoted.contactMessage?.vcard) {
                const waid = extractWaidFromVcard(quoted.contactMessage.vcard);
                addNumberAsJid(waid);
            }

            if (quoted.contactsArrayMessage?.contacts?.length) {
                quoted.contactsArrayMessage.contacts.forEach((c) => {
                    const waid = extractWaidFromVcard(c.vcard || '');
                    addNumberAsJid(waid);
                });
            }
        }

        if (users.size === 0) {
            return m.reply('Usage: !add 628123456789 / tag user / reply contact');
        }

        const normalizedUsers = [...users].map((jid) => jidNormalizedUser(jid));
        const targets = normalizedUsers.filter((jid) => !participantSet.has(jid));
        const alreadyInGroup = normalizedUsers.filter((jid) => participantSet.has(jid));

        if (targets.length === 0) {
            return m.reply('Semua target sudah ada di grup.');
        }

        try {
            const response = await sock.groupParticipantsUpdate(m.chat, targets, 'add');

            // Response details: [{ jid: '...', status: '200' }, ...]
            const success = [];
            const failed = [];
            const pendingInvite = [];
            let fallbackInviteCode = null;

            for (const res of response) {
                const statusCode = String(res.status);
                if (statusCode === '200') {
                    success.push(res.jid);
                    continue;
                }

                // WA may return invite-required/privacy-related statuses.
                if (statusCode === '403' || statusCode === '408') {
                    pendingInvite.push(res.jid);

                    const inviteMeta = findInviteMeta(res.content);

                    try {
                        if (!fallbackInviteCode) {
                            fallbackInviteCode = await sock.groupInviteCode(m.chat);
                        }

                        const inviteCode = inviteMeta?.inviteCode || fallbackInviteCode;
                        const inviteExpiration =
                            inviteMeta?.inviteExpiration ||
                            Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60;

                        if (inviteCode) {
                            await sock.sendMessage(res.jid, {
                                groupInvite: {
                                    inviteCode,
                                    inviteExpiration,
                                    text: `Undangan untuk bergabung ke grup ${groupMetadata.subject}`,
                                    jid: m.chat,
                                    subject: groupMetadata.subject,
                                },
                            });
                        } else {
                            throw new Error('invite code unavailable');
                        }
                    } catch (inviteError) {
                        if (!fallbackInviteCode) {
                            try {
                                fallbackInviteCode = await sock.groupInviteCode(m.chat);
                            } catch {}
                        }

                        if (fallbackInviteCode) {
                            await sock.sendMessage(res.jid, {
                                text: `Kamu diundang ke grup *${groupMetadata.subject}*\n\nhttps://chat.whatsapp.com/${fallbackInviteCode}`,
                            });
                        } else {
                            console.error('[DEBUG] Failed to send invite:', inviteError);
                        }
                    }
                    continue;
                }

                failed.push(res.jid);
            }

            const lines = [];
            if (success.length > 0) lines.push(`Berhasil add: ${success.length}`);
            if (pendingInvite.length > 0)
                lines.push(`Butuh invite manual/privacy: ${pendingInvite.length}`);
            if (alreadyInGroup.length > 0) lines.push(`Sudah di grup: ${alreadyInGroup.length}`);
            if (failed.length > 0) lines.push(`Gagal: ${failed.length}`);

            await m.reply(lines.join('\n') || 'Tidak ada member yang berhasil ditambahkan.');
        } catch (err) {
            console.error('[DEBUG] Add command error:', err);
            await m.reply(`Gagal menambahkan member: ${err.message}`);
        }
    },
};
