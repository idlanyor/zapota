class SessionManager {
    constructor() {
        this.sessions = new Map();
        this.timeout = 2 * 60 * 1000; // 2 minutes timeout
    }

    create(id, data = {}) {
        const session = {
            id,
            step: 0,
            data,
            lastActivity: Date.now(),
        };
        this.sessions.set(id, session);
        return session;
    }

    get(id) {
        const session = this.sessions.get(id);
        if (session) {
            if (Date.now() - session.lastActivity > this.timeout) {
                this.delete(id);
                return null;
            }
            session.lastActivity = Date.now();
        }
        return session;
    }

    next(id) {
        const session = this.get(id);
        if (session) session.step++;
        return session;
    }

    delete(id) {
        return this.sessions.delete(id);
    }
}

export const sessionManager = new SessionManager();
