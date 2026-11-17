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
let backgroundTasksStarted = false;
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
        onOpen: () => {
            if (!backgroundTasksStarted) {
                backgroundTasksStarted = true;
                startPrayerScheduler(liveSock);
                startGroupScheduler(() => activeSocket);
                jadibotService.init();
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
