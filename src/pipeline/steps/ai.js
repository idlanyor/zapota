/**
 * Conversational fallbacks for non-command messages.
 */
import { handleAutoAiPrivate } from '../../handlers/messageFlow.js';
import { isAddressedToBot, stripBotMentions } from '../../lib/botMention.js';

const handleDsChat = async (...args) => {
    const { handleDsChat: handler } = await import('../../commands/ai/ds.js');
    return handler(...args);
};

/** Non-owners who @-mention or reply to the bot get a DeepSeek chat answer. */
export const mentionChat = async (ctx, next) => {
    const { sock, m, isOwner } = ctx;
    if (m.body && !m.key.fromMe && !isOwner && isAddressedToBot(sock, m).addressed) {
        const prompt = stripBotMentions(sock, m.body);
        if (prompt) {
            await handleDsChat(sock, m, prompt);
            return;
        }
    }
    await next();
};

/**
 * Private-chat auto AI (enabled via bot settings). Main bot only: a sub-bot
 * is someone's personal number and must not auto-answer their contacts.
 */
export const autoAiPrivate = async (ctx) => {
    const { sock, m, botSettings, isOwner } = ctx;
    if (ctx.subBot) return;
    await handleAutoAiPrivate(sock, m, botSettings, isOwner);
};
