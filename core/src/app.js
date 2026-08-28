import { query } from './database/pool.js';
import { readBody, json } from './http.js';
import { authenticateService } from './security/authenticateService.js';
import { parseCookies, resolveSession, createSession, destroySession, sessionCookie } from './security/session.js';
import { config } from './config.js';
import { logAudit } from './security/audit.js';
import { resolveIdentity, attachIdentity, getOrCreateByIdentity } from './identity/service.js';
import * as authService from './auth/service.js';
import * as userService from './users/service.js';
import * as financeService from './finance/service.js';

const getClientIp = (headers) => {
    const forwarded = headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return forwarded.split(',')[0].trim();
    }
    return 'unknown';
};

const requireJson = (body) => {
    try {
        return JSON.parse(body.toString('utf8') || '{}');
    } catch {
        throw Object.assign(new Error('Invalid JSON body'), { status: 400 });
    }
};

// Auth yang izin: cookie (web) ATAU service HMAC. Return actor {type, id, scopes, user}.
const authenticateActor = async ({ headers, method, path, body, url }) => {
    const cookies = parseCookies(headers.cookie);
    const sessionToken = cookies[config.cookieName];
    const session = sessionToken ? await resolveSession(sessionToken) : null;
    if (session) {
        return {
            type: 'web',
            id: session.user_id,
            user: session,
            scopes: ['*'],
        };
    }

    const service = await authenticateService({
        headers,
        method,
        path: `${url.pathname}${url.search}`,
        body,
    });
    return { type: 'service', id: service.clientId, clientId: service.clientId, scopes: service.scopes };
};

const hasScope = (actor, scope) => actor.scopes.includes('*') || actor.scopes.includes(scope);

const requireRole = (actor, role) => {
    const user = actor.user;
    const roles = ['user', 'admin', 'owner'];
    if (!user) throw Object.assign(new Error('Authentication required'), { status: 401 });
    if (roles.indexOf(user.role) < roles.indexOf(role)) {
        throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
};

export const handleRequest = async (request, response) => {
    const url = new URL(request.url, 'http://core.local');
    const requestId = crypto.randomUUID();
    response.setHeader('x-request-id', requestId);
    const ipAddress = getClientIp(request.headers);

    try {
        if (request.method === 'GET' && url.pathname === '/health') {
            return json(response, 200, { ok: true, service: 'kanata-core', version: '0.1.0' });
        }
        if (request.method === 'GET' && url.pathname === '/ready') {
            await query('SELECT 1');
            return json(response, 200, { ok: true, database: 'ready' });
        }

        // ---- Auth (public) ----
        if (request.method === 'POST' && url.pathname === '/v1/auth/login') {
            const { username, password } = requireJson(await readBody(request));
            if (!username || !password) {
                return json(response, 400, { ok: false, error: 'username and password are required', requestId });
            }
            const user = await authService.findUserByLogin(username);
            if (!user || !authService.checkWebAccess(user) || !(await authService.verifyPassword(password, user.password_hash))) {
                return json(response, 401, { ok: false, error: 'Invalid credentials', requestId });
            }
            const token = await createSession({
                userId: user.id,
                ipAddress,
                userAgent: request.headers['user-agent'],
            });
            await logAudit({ actorType: 'web', actorId: user.id, action: 'auth.login', ipAddress });
            const phone = user.identities?.find((i) => i.type === 'phone')?.value;
            response.setHeader('set-cookie', sessionCookie(token));
            return json(response, 200, {
                ok: true,
                data: {
                    userId: user.id,
                    username: user.display_name || username,
                    whatsappNumber: phone || username,
                    isOwner: user.role === 'owner',
                    role: user.role,
                },
            });
        }

        if (request.method === 'POST' && url.pathname === '/v1/auth/logout') {
            const cookies = parseCookies(request.headers.cookie);
            await destroySession(cookies[config.cookieName]);
            response.setHeader(
                'set-cookie',
                `${config.cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`
            );
            return json(response, 200, { ok: true, requestId });
        }

        // ---- Actor auth (web cookie atau service HMAC) ----
        const body = await readBody(request);
        const actor = await authenticateActor({ headers: request.headers, method: request.method, body, url });

        if (request.method === 'GET' && url.pathname === '/v1/auth/me') {
            if (actor.type !== 'web') return json(response, 401, { ok: false, error: 'Cookie session required', requestId });
            const { password_hash, ...safe } = actor.user;
            return json(response, 200, { ok: true, data: safe, requestId });
        }

        // ---- /v1/identities ----
        if (request.method === 'GET' && url.pathname === '/v1/identities/resolve') {
            if (!hasScope(actor, 'identities')) return json(response, 403, { ok: false, error: 'Forbidden', requestId });
            const value = url.searchParams.get('value');
            if (!value) return json(response, 400, { ok: false, error: 'value is required', requestId });
            const user = await resolveIdentity(value);
            return json(response, user ? 200 : 404, { ok: Boolean(user), data: user, requestId });
        }

        if (request.method === 'POST' && url.pathname === '/v1/identities/attach') {
            if (!hasScope(actor, 'identities')) return json(response, 403, { ok: false, error: 'Forbidden', requestId });
            const { userId, value, isPrimary } = requireJson(body);
            if (!userId || !value) return json(response, 400, { ok: false, error: 'userId and value are required', requestId });
            const identity = await attachIdentity({ userId, value, isPrimary: !!isPrimary, verified: true });
            await logAudit({ actorType: actor.type, actorId: actor.id, action: 'identity.attach', resourceType: 'user', resourceId: userId, metadata: { identity }, ipAddress });
            return json(response, 200, { ok: true, data: identity, requestId });
        }

        if (request.method === 'POST' && url.pathname === '/v1/identities/ensure') {
            if (!hasScope(actor, 'identities')) return json(response, 403, { ok: false, error: 'Forbidden', requestId });
            const { value, displayName } = requireJson(body);
            if (!value) return json(response, 400, { ok: false, error: 'value is required', requestId });
            const user = await getOrCreateByIdentity({ value, displayName, role: 'user' });
            await logAudit({ actorType: actor.type, actorId: actor.id, action: 'identity.ensure', resourceType: 'user', resourceId: user.id, metadata: { value }, ipAddress });
            return json(response, 200, { ok: true, data: user, requestId });
        }

        // ---- /v1/users ----
        if (request.method === 'GET' && url.pathname === '/v1/users') {
            if (actor.type === 'web') {
                requireRole(actor, 'owner');
            } else if (!hasScope(actor, 'users')) {
                return json(response, 403, { ok: false, error: 'Forbidden', requestId });
            }
            const { page, limit, search } = url.searchParams;
            const result = await userService.listUsers({ page, limit, search });
            return json(response, 200, { ok: true, data: result, requestId });
        }

        const userMatch = url.pathname.match(/^\/v1\/users\/([^/]+)(\/password)?$/);
        if (userMatch) {
            // Decode segment (JID berisi %40 utk @) agar resolve identity benar.
            let [, rawTargetId, passwordSuffix] = userMatch;
            let targetUserId = rawTargetId;
            try {
                targetUserId = decodeURIComponent(rawTargetId);
            } catch {
                targetUserId = rawTargetId;
            }
            if (request.method === 'GET' && !passwordSuffix) {
                if (actor.type === 'web') {
                    if (actor.user.id !== targetUserId && actor.user.role !== 'owner') {
                        return json(response, 403, { ok: false, error: 'Forbidden', requestId });
                    }
                } else if (!hasScope(actor, 'users')) {
                    return json(response, 403, { ok: false, error: 'Forbidden', requestId });
                }
                const user = await userService.getUserById(targetUserId);
                if (!user) return json(response, 404, { ok: false, error: 'Not found', requestId });
                return json(response, 200, { ok: true, data: user, requestId });
            }

            if (request.method === 'PATCH' && !passwordSuffix) {
                if (actor.type === 'web') {
                    requireRole(actor, 'owner');
                } else if (!hasScope(actor, 'users')) {
                    return json(response, 403, { ok: false, error: 'Forbidden', requestId });
                }
                const fields = requireJson(body);
                // targetUserId bisa UUID atau identity (JID/phone) -> resolve ke UUID.
                let resolvedId = targetUserId;
                if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId)) {
                    const existing = await resolveIdentity(targetUserId);
                    if (!existing) return json(response, 404, { ok: false, error: 'User not found', requestId });
                    resolvedId = existing.id;
                }
                const user = await userService.updateUser(resolvedId, fields);
                if (!user) return json(response, 404, { ok: false, error: 'Not found', requestId });
                await logAudit({ actorType: actor.type, actorId: actor.id, action: 'user.update', resourceType: 'user', resourceId: resolvedId, metadata: fields, ipAddress });
                const { password_hash, ...safe } = user;
                return json(response, 200, { ok: true, data: safe, requestId });
            }

            if (request.method === 'POST' && passwordSuffix) {
                let resolvedId = targetUserId;
                if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId)) {
                    const existing = await resolveIdentity(targetUserId);
                    if (!existing) return json(response, 404, { ok: false, error: 'User not found', requestId });
                    resolvedId = existing.id;
                }

                // Bot service set password (command .integrate)
                if (actor.type === 'service') {
                    if (!hasScope(actor, 'users:password')) return json(response, 403, { ok: false, error: 'Forbidden', requestId });
                } else if (actor.user.id !== resolvedId) {
                    return json(response, 403, { ok: false, error: 'Forbidden', requestId });
                }
                const { password } = requireJson(body);
                if (!password || String(password).length < 12) {
                    return json(response, 400, { ok: false, error: 'password must be at least 12 characters', requestId });
                }
                const result = await authService.setUserPassword({ userId: resolvedId, password });
                if (!result.ok) return json(response, 404, { ok: false, error: 'User not found', requestId });
                await logAudit({ actorType: actor.type, actorId: actor.id, action: 'user.password_set', resourceType: 'user', resourceId: resolvedId, ipAddress });
                return json(response, 200, { ok: true, requestId });
            }
        }

        // ---- /v1/finance ----
        if (url.pathname.startsWith('/v1/finance')) {
            if (!hasScope(actor, 'finance')) return json(response, 403, { ok: false, error: 'Forbidden', requestId });

            // Resolve userId: web -> actor sendiri; service -> dari query/body, identity-aware
            const resolveUserId = async (given) => {
                if (actor.type === 'web') return actor.user.id;
                if (!given) throw Object.assign(new Error('userId is required'), { status: 400 });
                // UUID user langsung, jangan di-resolve sebagai identity.
                if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(given))) {
                    return given;
                }
                const user = await resolveIdentity(given);
                return user ? user.id : given;
            };

            if (request.method === 'GET' && url.pathname === '/v1/finance/report') {
                const userId = await resolveUserId(url.searchParams.get('userId'));
                const month = url.searchParams.get('month');
                const year = url.searchParams.get('year');
                const type = url.searchParams.get('type');
                const category = url.searchParams.get('category');
                const startDate = url.searchParams.get('startDate');
                const endDate = url.searchParams.get('endDate');
                const report = await financeService.getMonthlyReport({
                    userId,
                    month: month != null ? Number(month) - 1 : undefined,
                    year: year != null ? Number(year) : undefined,
                    type,
                    category,
                    startDate,
                    endDate,
                });
                return json(response, 200, { ok: true, data: report, requestId });
            }

            if (request.method === 'GET' && url.pathname === '/v1/finance/kakeibo') {
                const userId = await resolveUserId(url.searchParams.get('userId'));
                const month = url.searchParams.get('month');
                const year = url.searchParams.get('year');
                const data = await financeService.getKakeiboReport({
                    userId,
                    month: month != null ? Number(month) - 1 : undefined,
                    year: year != null ? Number(year) : undefined,
                });
                return json(response, 200, { ok: true, data, requestId });
            }

            if (request.method === 'GET' && url.pathname === '/v1/finance/budget') {
                const userId = await resolveUserId(url.searchParams.get('userId'));
                const month = Number(url.searchParams.get('month'));
                const year = Number(url.searchParams.get('year'));
                if (!month || !year) {
                    return json(response, 400, { ok: false, error: 'month and year are required', requestId });
                }
                const budget = await financeService.getBudget(userId, month, year);
                return json(response, 200, { ok: true, data: budget, requestId });
            }

            if (request.method === 'PUT' && url.pathname === '/v1/finance/budget') {
                const parsed = requireJson(body);
                const userId = await resolveUserId(parsed.userId);
                const { month, year, incomeTarget, savingsTarget, note } = parsed;
                if (!month || !year) {
                    return json(response, 400, { ok: false, error: 'month and year are required', requestId });
                }
                const budget = await financeService.setBudget({ userId, month, year, incomeTarget, savingsTarget, note });
                await logAudit({ actorType: actor.type, actorId: actor.id, action: 'finance.budget_set', resourceType: 'user', resourceId: userId, metadata: { month, year }, ipAddress });
                return json(response, 200, { ok: true, data: budget, requestId });
            }

            if (request.method === 'DELETE' && url.pathname === '/v1/finance/transactions/last') {
                const parsed = requireJson(body);
                const userId = await resolveUserId(parsed.userId);
                const deletedId = await financeService.deleteLastTransaction(userId);
                if (!deletedId) return json(response, 404, { ok: false, error: 'Nothing to delete', requestId });
                return json(response, 200, { ok: true, deleted: true, requestId });
            }

            const txMatch = url.pathname.match(/^\/v1\/finance\/transactions(?:\/([^/]+))?$/);
            if (txMatch) {
                const txId = txMatch[1];
                if (request.method === 'POST' && !txId) {
                    const parsed = requireJson(body);
                    const userId = await resolveUserId(parsed.userId);
                    const { type, amount, category, description, date, kakeiboCategory } = parsed;
                    if (!type || amount === undefined || amount === null) {
                        return json(response, 400, { ok: false, error: 'type and amount are required', requestId });
                    }
                    const tx = await financeService.addTransaction({
                        userId,
                        userName: parsed.userName || null,
                        type,
                        amount,
                        category,
                        description,
                        date,
                        kakeiboCategory,
                        source: parsed.source || 'other',
                    });
                    await logAudit({ actorType: actor.type, actorId: actor.id, action: 'finance.transaction_create', resourceType: 'user', resourceId: userId, metadata: { id: tx.id, type, amount }, ipAddress });
                    return json(response, 200, { ok: true, data: tx, requestId });
                }

                if (txId) {
                    const parsed = body.length ? requireJson(body) : {};
                    const userId = await resolveUserId(parsed.userId || url.searchParams.get('userId'));
                    if (request.method === 'DELETE') {
                        const deleted = await financeService.deleteTransaction(txId, userId);
                        if (!deleted) return json(response, 404, { ok: false, error: 'Not found', requestId });
                        await logAudit({ actorType: actor.type, actorId: actor.id, action: 'finance.transaction_delete', resourceType: 'user', resourceId: userId, metadata: { id: txId }, ipAddress });
                        return json(response, 200, { ok: true, deleted: true, requestId });
                    }
                    if (request.method === 'PATCH') {
                        const tx = await financeService.updateTransaction(txId, userId, parsed);
                        if (!tx) return json(response, 404, { ok: false, error: 'Not found', requestId });
                        return json(response, 200, { ok: true, data: tx, requestId });
                    }
                    if (request.method === 'GET') {
                        const tx = await financeService.getTransaction(txId, userId);
                        if (!tx) return json(response, 404, { ok: false, error: 'Not found', requestId });
                        return json(response, 200, { ok: true, data: tx, requestId });
                    }
                }
            }

            return json(response, 404, { ok: false, error: 'Not found', requestId });
        }

        return json(response, 404, { ok: false, error: 'Not found', requestId, clientId: actor.clientId });
    } catch (error) {
        const status = error.status || 500;
        if (status >= 500) console.error(`[${requestId}]`, error);
        return json(response, status, {
            ok: false,
            error: status >= 500 ? 'Internal server error' : error.message,
            requestId,
        });
    }
};
