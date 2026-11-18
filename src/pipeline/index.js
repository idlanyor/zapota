/**
 * Incoming-message pipeline. Order matters: each step either handles the
 * message (stops) or calls next(). See __tests__/messageHandler.test.js for
 * the behavior contract.
 */
import { compose } from './compose.js';
import { dedupe, loadMessage, buildContext } from './steps/intake.js';
import {
    routeActiveSession,
    pendingDeleteConfirmation,
    groupModeration,
    passiveHandlers,
    buttons,
    ignoreOwnMessages,
    joinGroupGate,
    ownerAgent,
} from './steps/interceptors.js';
import { subBotGate } from './steps/subBot.js';
import { routeCommand } from './steps/routeCommand.js';
import { mentionChat, autoAiPrivate } from './steps/ai.js';

export const steps = [
    // intake
    dedupe,
    loadMessage,
    subBotGate,
    buildContext,
    // interceptors
    routeActiveSession,
    pendingDeleteConfirmation,
    groupModeration,
    passiveHandlers,
    buttons,
    ignoreOwnMessages,
    joinGroupGate,
    ownerAgent,
    // routing
    routeCommand,
    mentionChat,
    autoAiPrivate,
];

const run = compose(steps);

/**
 * @param {object} sock transport client (zapo/Baileys facade)
 * @param {object} raw raw WhatsApp message
 */
export const handleIncomingMessage = (sock, raw) => run({ sock, raw });
