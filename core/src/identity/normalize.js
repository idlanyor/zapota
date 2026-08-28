const digitsOnly = (value) => String(value || '').replace(/\D/g, '');

export const normalizePhone = (value) => {
    let digits = digitsOnly(String(value || '').split('@')[0].split(':')[0]);
    if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
    else if (digits.startsWith('8')) digits = `62${digits}`;
    if (!/^\d{8,15}$/.test(digits)) throw new Error('Invalid phone number');
    return digits;
};

export const classifyIdentity = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (raw.endsWith('@lid')) {
        const id = digitsOnly(raw.split('@')[0]);
        if (!id) throw new Error('Invalid WhatsApp LID');
        return { type: 'whatsapp_lid', normalizedValue: `${id}@lid` };
    }
    if (raw.includes('@')) {
        const phone = normalizePhone(raw);
        return { type: 'whatsapp_jid', normalizedValue: `${phone}@s.whatsapp.net` };
    }
    return { type: 'phone', normalizedValue: normalizePhone(raw) };
};

export const identityCandidates = (value) => {
    const identity = classifyIdentity(value);
    if (identity.type === 'whatsapp_lid') return [identity];
    const phone = normalizePhone(identity.normalizedValue);
    return [
        { type: 'phone', normalizedValue: phone },
        { type: 'whatsapp_jid', normalizedValue: `${phone}@s.whatsapp.net` },
    ];
};
