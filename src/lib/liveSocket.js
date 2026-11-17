/**
 * A stable stand-in for the WhatsApp socket that always forwards to the
 * currently active one. Long-lived jobs (cron schedulers) registered once
 * at startup keep working after the transport reconnects and the socket
 * object is replaced.
 *
 * @param {() => object | null} getSocket
 */
export const createLiveSocket = (getSocket) =>
    new Proxy(
        {},
        {
            get(_, key) {
                const sock = getSocket();
                if (!sock) {
                    throw new Error(
                        `WhatsApp socket is not connected (accessing "${String(key)}")`
                    );
                }
                const value = sock[key];
                return typeof value === 'function' ? value.bind(sock) : value;
            },
            has: (_, key) => Boolean(getSocket()) && key in getSocket(),
        }
    );
