import 'dotenv/config';
import connectDB from './config/database.js';
import { loadCommands } from './lib/commands.js';
import logger from './utils/logger.js';
import { startPrayerScheduler } from './lib/prayerScheduler.js';
import { startGroupScheduler } from './lib/groupScheduler.js';
import { startWebhookApi } from './webhook/server.js';
import { registerRecurringTasks, registerSocketEvents } from './lib/botRuntime.js';
import { jadibotService } from './services/jadibotService.js';
import { installProcessGuards } from './lib/appSetup.js';
import { createTransport } from './wa/client.js';
import { createLiveSocket } from './lib/liveSocket.js';
import { setMainSocketGetter } from './lib/botProfile.js';
import { archiveCredentials, createAttemptGuard } from './wa/sessionReset.js';
import { assertEnv } from './config/env.js';

try {
    assertEnv(logger);
} catch (err) {
    logger.error(`${err.message}\nFix .env (see .env.example) and restart.`);
    process.exit(1);
}

let activeSocket = null;
/** Forwards to whichever socket is current; safe to hold in long-lived jobs. */
const liveSock = createLiveSocket(() => activeSocket);
// Sub-bots notify their owners and report errors through the main bot.
setMainSocketGetter(() => activeSocket);
let backgroundTasksStarted = false;
/** At most 3 fresh logins per 10 minutes after WhatsApp logs the bot out. */
const allowRelogin = createAttemptGuard({ max: 3, windowMs: 10 * 60_000 });
let isApiStarted = false;
let isAppInitialized = false;

const startBot = async () => {
    if (!isAppInitialized) {
        await connectDB();
        await loadCommands();
        isAppInitialized = true;
    }

    const transport = await createTransport();
    const sock = transport.client;
    activeSocket = sock;
    registerRecurringTasks(liveSock);

    if (!isApiStarted) {
        startWebhookApi({ getSocket: () => activeSocket });
        isApiStarted = true;
    }

    registerSocketEvents({
        sock,
        saveCreds: transport.saveCreds || (() => {}),
        connectToWhatsApp: startBot,
        authFolder: transport.authFolder,
        onLoggedOut: async () => {
            activeSocket = null;
            if (!allowRelogin()) {
                logger.error(
                    'Logged out repeatedly; not reconnecting. Fix the device link, then restart the bot.'
                );
                return;
            }
            const backup = await archiveCredentials(transport);
            logger.warn(
                `Old WhatsApp credentials moved to ${backup ?? '(none found)'}; starting a new login.`
            );
            await startBot();
        },
        onOpen: () => {
            if (!backgroundTasksStarted) {
                backgroundTasksStarted = true;
                startPrayerScheduler(liveSock);
                startGroupScheduler(() => activeSocket);
                jadibotService.init().catch((err) => logger.error(err, 'Jadibot init failed'));
            }
        },
    });

    if (typeof transport.connect === 'function') await transport.connect();
    return sock;
};

installProcessGuards(
    () => {
        activeSocket = null;
        return startBot();
    },
    () => activeSocket
);

startBot().catch((err) => {
    logger.error(`Bot failed to start: ${err.message}`);
});
