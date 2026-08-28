import axios from 'axios';
import User from '../database/models/User.js';
import { encrypt, decrypt } from '../utils/crypto.js';

const BASE_URL = process.env.IRENG_API_URL || 'https://irengcloud.net/api';

const client = (token) =>
    axios.create({
        baseURL: BASE_URL,
        timeout: 15000,
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
    });

const unwrap = (error) => {
    const message =
        error.response?.data?.message ||
        error.response?.data?.errors?.[0] ||
        error.message ||
        'Unknown error';
    const err = new Error(message);
    err.status = error.response?.status;
    return err;
};

export const saveUserToken = async (jid, token) => {
    await User.findOneAndUpdate(
        { jid },
        { irengToken: encrypt(token) },
        { upsert: true, new: true }
    );
};

export const clearUserToken = async (jid) => {
    await User.findOneAndUpdate({ jid }, { irengToken: null });
};

export const getUserToken = async (jid) => {
    const user = await User.findOne({ jid });
    if (!user?.irengToken) return null;
    try {
        return decrypt(user.irengToken);
    } catch {
        return null;
    }
};

export const requireUserToken = async (jid) => {
    const token = await getUserToken(jid);
    if (!token) {
        const err = new Error(
            'Akun ireng.uk belum terhubung. Hubungkan dulu dengan .irengbind <token>'
        );
        err.notLinked = true;
        throw err;
    }
    return token;
};

export const verifyToken = async (token) => {
    try {
        const resp = await client(token).get('/user');
        return resp.data;
    } catch (error) {
        throw unwrap(error);
    }
};

export const getAccount = (token) => verifyToken(token);

export const getLxcServers = async (token) => {
    try {
        const resp = await client(token).get('/lxc/servers');
        return resp.data.servers || [];
    } catch (error) {
        throw unwrap(error);
    }
};

export const getKvmServers = async (token) => {
    try {
        const resp = await client(token).get('/kvm/servers');
        return resp.data.servers || [];
    } catch (error) {
        throw unwrap(error);
    }
};

export const getAppServers = async (token) => {
    try {
        const resp = await client(token).get('/apps');
        return resp.data.servers || [];
    } catch (error) {
        throw unwrap(error);
    }
};

export const getAllServers = async (token) => {
    const [lxc, kvm, app] = await Promise.all([
        getLxcServers(token).catch(() => []),
        getKvmServers(token).catch(() => []),
        getAppServers(token).catch(() => []),
    ]);
    return {
        lxc: lxc.map((s) => ({ ...s, _type: 'lxc' })),
        kvm: kvm.map((s) => ({ ...s, _type: 'kvm' })),
        app: app.map((s) => ({ ...s, _type: 'app' })),
    };
};

export const lxcPower = async (token, id, action) => {
    try {
        const resp = await client(token).post(`/lxc/servers/${id}/power`, { action });
        return resp.data;
    } catch (error) {
        throw unwrap(error);
    }
};

export const appPower = async (token, id, action) => {
    try {
        const resp = await client(token).post(`/apps/${id}/${action}`);
        return resp.data;
    } catch (error) {
        throw unwrap(error);
    }
};

export const getAppStatus = async (token, id) => {
    try {
        const resp = await client(token).get(`/apps/${id}/status`);
        return resp.data;
    } catch (error) {
        throw unwrap(error);
    }
};

export const getLxcStats = async (token, id) => {
    try {
        const resp = await client(token).get(`/lxc/servers/${id}/stats`);
        return resp.data;
    } catch (error) {
        throw unwrap(error);
    }
};

export const getInvoices = async (token) => {
    try {
        const resp = await client(token).get('/invoices');
        return resp.data.invoices || [];
    } catch (error) {
        throw unwrap(error);
    }
};

export const getInvoice = async (token, externalId) => {
    try {
        const resp = await client(token).get(`/invoices/${externalId}`);
        return resp.data.invoice;
    } catch (error) {
        throw unwrap(error);
    }
};

export const getProducts = async (token) => {
    try {
        const resp = await client(token).get('/products');
        return resp.data.products || [];
    } catch (error) {
        throw unwrap(error);
    }
};

export const checkout = async (token, payload) => {
    try {
        const resp = await client(token).post('/checkout', payload);
        return resp.data;
    } catch (error) {
        throw unwrap(error);
    }
};

export const getTickets = async (token) => {
    try {
        const resp = await client(token).get('/tickets');
        return resp.data.tickets || resp.data.data || [];
    } catch (error) {
        throw unwrap(error);
    }
};

export const getTicket = async (token, externalId) => {
    try {
        const resp = await client(token).get(`/tickets/${externalId}`);
        return resp.data.ticket;
    } catch (error) {
        throw unwrap(error);
    }
};

export const createTicket = async (
    token,
    { subject, message, category = 'general', priority = 'medium' }
) => {
    try {
        const resp = await client(token).post('/tickets', { subject, message, category, priority });
        return resp.data.ticket || resp.data;
    } catch (error) {
        throw unwrap(error);
    }
};

export const replyTicket = async (token, externalId, message) => {
    try {
        const resp = await client(token).post(`/tickets/${externalId}/replies`, { message });
        return resp.data;
    } catch (error) {
        throw unwrap(error);
    }
};
