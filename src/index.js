import 'dotenv/config';
import connectDB from './config/database.js';
import { loadCommands } from './lib/commands.js';
import logger from './utils/logger.js';
import { startPrayerScheduler } from './lib/prayerScheduler.js';
import { startGroupScheduler } from './lib/groupScheduler.js';
import { startWebhookApi } from './services/webhookApi.js';
import { registerRecurringTasks, registerSocketEvents } from './lib/botRuntime.js';
import { jadibotService } from './services/jadibotService.js';
import { installProcessGuards } from './lib/appSetup.js';
import { createTransport } from './wa/client.js';

let activeSocket = null;
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
    registerRecurringTasks(sock);

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
                startPrayerScheduler(sock);
                if (!global.isGroupSchedulerStarted) {
                    startGroupScheduler(() => activeSocket);
                    global.isGroupSchedulerStarted = true;
                }
                backgroundTasksStarted = true;
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
