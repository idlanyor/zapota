import { jidNormalizedUser } from '../wa/helpers.js';

/** @param {{ admin?: string | null } | undefined} participant */
export const isAdminRole = (participant) =>
    participant?.admin === 'admin' || participant?.admin === 'superadmin';

/**
 * Find a participant by any of the given JIDs, matching both the phone JID
 * (`p.id`) and the LID (`p.lid`) after normalization.
 */
export const findParticipant = (participants = [], ...jids) => {
    const wanted = new Set(jids.filter(Boolean).map(jidNormalizedUser).filter(Boolean));
    if (!wanted.size) return undefined;
    return participants.find(
        (p) =>
            wanted.has(jidNormalizedUser(p.id)) || (p.lid && wanted.has(jidNormalizedUser(p.lid)))
    );
};

export const isParticipantAdmin = (participants, ...jids) =>
    isAdminRole(findParticipant(participants, ...jids));

export const isBotAdmin = (sock, participants) =>
    isParticipantAdmin(participants, sock.user?.id, sock.user?.lid);
