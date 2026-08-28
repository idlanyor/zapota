/**
 * Patches the groupMetadata method to handle group invite links.
 * If a link is passed instead of a JID, it automatically calls groupGetInviteInfo.
 */
export const attachGroupMetadataPatch = (sock) => {
    if (!sock || sock.__groupMetadataPatchAttached) {
        return sock;
    }

    const originalGroupMetadata = sock.groupMetadata.bind(sock);

    sock.groupMetadata = async (jid) => {
        if (!jid || typeof jid !== 'string') {
            return originalGroupMetadata(jid);
        }

        // Handle WhatsApp Group Invite Links
        // Formats: https://chat.whatsapp.com/CODE or chat.whatsapp.com/CODE
        if (jid.includes('chat.whatsapp.com/')) {
            const parts = jid.split('chat.whatsapp.com/');
            let code = parts[parts.length - 1]?.split('?')[0]?.trim();

            if (code) {
                // Strip legacy 'invite/' prefix if present
                if (code.startsWith('invite/')) {
                    code = code.replace('invite/', '');
                }

                try {
                    return await sock.groupGetInviteInfo(code);
                } catch (err) {
                    // If groupGetInviteInfo fails, it might be an invalid code or other issue
                    // We throw a more descriptive error instead of letting Baileys crash later
                    const error = new Error(
                        `Failed to fetch group info from link "${code}": ${err.message}`
                    );
                    error.code = err.code || 'INVITE_ERROR';
                    throw error;
                }
            }
        }

        // Normal JID processing
        try {
            return await originalGroupMetadata(jid);
        } catch (err) {
            // Some versions of baileys might still crash if the response is unexpected
            // but usually they throw an error which is caught by the command's try-catch.
            // We just re-throw here.
            throw err;
        }
    };

    sock.__groupMetadataPatchAttached = true;
    return sock;
};
