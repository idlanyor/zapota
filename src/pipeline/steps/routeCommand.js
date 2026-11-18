import logger from '../../utils/logger.js';
import { commands } from '../../lib/commands.js';
import { getBotIdentity } from '../../middlewares/auth.js';
import { checkGuards } from '../guards.js';
import { mainSocket } from '../../lib/botProfile.js';

const chatLabel = (m) => (m.isGroup ? m.metadata?.subject || m.chat : m.chat);

/** Parse the command name after the prefix (case-insensitive). */
export const parseCommandName = (body, prefix) =>
    body.slice(prefix.length).trim().split(/\s+/)[0].toLowerCase();

const reportFailure = async (ctx, cmdName, err) => {
    const { sock, m } = ctx;
    logger.command({
        phase: 'FAIL',
        name: cmdName,
        sender: m.sender,
        chat: chatLabel(m),
        extra: err.message,
    });
    logger.error(err, `Error in command: ${cmdName}`);

    const { ownerJid } = getBotIdentity(sock);
    // A sub-bot is a user's own number: report through the main bot instead.
    const reporter = ctx.subBot ? mainSocket() : sock;
    const report =
        ` *COMMAND ERROR REPORT*\n\n` +
        `➛ *Command:* ${cmdName}\n` +
        `➛ *Sender:* @${m.sender.split('@')[0]}\n` +
        `➛ *Error:* ${err.message}\n\n` +
        `\`\`\`${err.stack}\`\`\``;
    await reporter?.sendMessage(ownerJid, { text: report, mentions: [m.sender] }).catch(() => {});
    m.reply(` Terjadi kesalahan. Detail error telah dikirim ke Owner.`);
};

/**
 * Prefixed messages end here: run the command if it exists and its guards
 * pass. Unknown prefixed commands are ignored (they never reach the AI steps).
 */
export const routeCommand = async (ctx, next) => {
    const { sock, m, usedPrefix, botSettings } = ctx;
    if (!usedPrefix) return next();

    const cmdName = parseCommandName(m.body, usedPrefix);
    const command = commands.get(cmdName);
    if (!command) return;

    const denial = await checkGuards(ctx, command);
    if (denial) {
        if (denial.reply) await m.reply(denial.reply);
        return;
    }

    m.command = cmdName;
    sock.sendPresenceUpdate('composing', m.chat).catch(() => {});

    const logBase = { name: cmdName, sender: m.sender, chat: chatLabel(m) };
    try {
        logger.command({ phase: 'RUN', ...logBase, extra: `mode=${botSettings?.mode}` });
        await command.execute(sock, m, m.args, m.text);
        logger.command({ phase: 'DONE', ...logBase });
    } catch (err) {
        await reportFailure(ctx, cmdName, err);
    }
};
