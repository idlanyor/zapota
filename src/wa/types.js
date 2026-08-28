// Runtime contract documentation. Kept as JSDoc because this project uses JavaScript.

/**
 * @typedef {Object} WaClientAdapter
 * @property {(jid: string, content: object|string, options?: object) => Promise<unknown>} sendMessage
 * @property {(jid: string) => Promise<object>} groupMetadata
 * @property {(jid: string, participants: string[], action: string) => Promise<unknown>} groupParticipantsUpdate
 * @property {(keys: object[]) => Promise<void>} readMessages
 * @property {(presence: string, jid?: string) => Promise<void>} sendPresenceUpdate
 * @property {object} user
 */

/**
 * @typedef {Object} WaMessageContract
 * @property {string} id
 * @property {string} chat
 * @property {string} sender
 * @property {boolean} isGroup
 * @property {string} body
 * @property {(text: string, options?: object) => Promise<unknown>} reply
 * @property {(emoji: string) => Promise<unknown>} react
 * @property {() => Promise<Buffer>} download
 */

/** @typedef {string|Buffer|import('node:stream').Readable|{url: string}} WaMediaSource */

export {};
