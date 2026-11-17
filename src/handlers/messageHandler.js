/**
 * Entry point for incoming WhatsApp messages. The actual flow lives in
 * `src/pipeline/` as small ordered steps.
 */
import { handleIncomingMessage } from '../pipeline/index.js';

export { clearSettingsCache } from './messageFlow.js';

export const messageHandler = (sock, m) => handleIncomingMessage(sock, m);
