import logger from '../utils/logger.js';

export const patchInteractiveMessageForMd = (message) => {
    const alreadyWrapped =
        message?.viewOnceMessage?.message ||
        message?.viewOnceMessageV2?.message ||
        message?.viewOnceMessageV2Extension?.message;
    if (alreadyWrapped) {
        return message;
    }

    const requiresPatch = !!(
        message?.buttonsMessage ||
        message?.listMessage ||
        message?.interactiveMessage
    );

    if (!requiresPatch) {
        return message;
    }

    return {
        viewOnceMessage: {
            message: {
                messageContextInfo: {
                    deviceListMetadata: {},
                    deviceListMetadataVersion: 2,
                },
                ...message,
            },
        },
    };
};

const formatError = (error) => {
    if (error instanceof Error) {
        return error.stack || `${error.name}: ${error.message}`;
    }
    if (typeof error === 'string') return error;
    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
};

const isRecoverableLibsignalError = (error) => {
    if (!error) return false;
    const message =
        error instanceof Error ? `${error.message}\n${error.stack || ''}` : String(error);
    return (
        message.includes('Incorrect private key length: 0') ||
        message.includes('libsignal') ||
        error.name === 'CryptoError' ||
        error.code === 'BAD_MAC'
    );
};

let recoveryScheduled = false;

export const installProcessGuards = (startBotFn, getActiveSocket) => {
    const scheduleSoftRecovery = (reason) => {
        if (recoveryScheduled) {
            logger.warn(`Recovery already scheduled. Ignoring duplicate trigger: ${reason}`);
            return;
        }

        recoveryScheduled = true;
        logger.warn(`Scheduling soft recovery in 5s due to: ${reason}`);

        setTimeout(async () => {
            try {
                const activeSocket = getActiveSocket();
                if (activeSocket?.ws && typeof activeSocket.ws.close === 'function') {
                    activeSocket.ws.close();
                }
            } catch (closeError) {
                logger.warn(
                    `Failed to close existing socket during recovery: ${closeError.message}`
                );
            }

            try {
                await startBotFn();
                logger.info('Soft recovery completed');
            } catch (restartError) {
                logger.error(`Soft recovery failed: ${restartError.message}`);
            } finally {
                recoveryScheduled = false;
            }
        }, 5000);
    };

    process.on('uncaughtException', (error) => {
        logger.error(`Uncaught exception:\n${formatError(error)}`);
        if (isRecoverableLibsignalError(error)) {
            scheduleSoftRecovery('recoverable libsignal error (uncaughtException)');
        }
    });

    process.on('unhandledRejection', (reason) => {
        logger.error(`Unhandled rejection:\n${formatError(reason)}`);
        if (isRecoverableLibsignalError(reason)) {
            scheduleSoftRecovery('recoverable libsignal rejection (unhandledRejection)');
        }
    });
};
