const messages = new Map();

export const saveMessage = (m) => {
    if (!m || !m.id) return;
    messages.set(m.id, {
        body: m.body,
        sender: m.sender,
        senderAlt: m.key?.participantAlt || m.key?.remoteJidAlt || null,
        chat: m.chat,
        timestamp: Date.now(),
    });

    setTimeout(() => {
        messages.delete(m.id);
    }, 3600000);
};

export const getMessage = (id) => messages.get(id);
