import axios from 'axios';

const BASE_URL = process.env.IRENG_ADMIN_BASE_URL || 'https://irengcloud.com/api';
const TOKEN = process.env.IRENG_ADMIN_TOKEN || '';

const client = () =>
    axios.create({
        baseURL: BASE_URL,
        timeout: 20000,
        headers: {
            Authorization: `Bearer ${TOKEN}`,
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

// ---------- Ringkasan & saldo ----------
const adminStats = async () => {
    try {
        const { data } = await client().get('/admin/stats');
        return data;
    } catch (error) {
        throw unwrap(error);
    }
};

const adminBalanceOverview = async () => {
    try {
        const { data } = await client().get('/admin/balance');
        return data;
    } catch (error) {
        throw unwrap(error);
    }
};

// ---------- LXC ----------
const adminLxcServers = async () => {
    try {
        const { data } = await client().get('/admin/lxc');
        return data;
    } catch (error) {
        throw unwrap(error);
    }
};

// ---------- KVM ----------
const adminKvmServers = async () => {
    try {
        const { data } = await client().get('/admin/kvm');
        return data;
    } catch (error) {
        throw unwrap(error);
    }
};

// ---------- Apps ----------
const adminAppServers = async (perPage = 50) => {
    try {
        const { data } = await client().get('/admin/apps', { params: { per_page: perPage } });
        return data;
    } catch (error) {
        throw unwrap(error);
    }
};

// ---------- Users & saldo ----------
const adminUsers = async (q = '', page = 1) => {
    try {
        const params = { per_page: 25 };
        if (q) params.q = q;
        const { data } = await client().get('/admin/users', { params });
        return data;
    } catch (error) {
        throw unwrap(error);
    }
};

const adminUserBalanceHistory = async (id) => {
    try {
        const { data } = await client().get(`/admin/users/${id}/balance`, {
            params: { per_page: 20 },
        });
        return data;
    } catch (error) {
        throw unwrap(error);
    }
};

const adminAdjustBalance = async (id, direction, amount, reason) => {
    try {
        const { data } = await client().post(`/admin/users/${id}/balance`, {
            direction,
            amount,
            reason: reason || undefined,
        });
        return data;
    } catch (error) {
        throw unwrap(error);
    }
};

// ---------- Invoice ----------
const adminInvoices = async () => {
    try {
        const { data } = await client().get('/admin/invoices');
        return data;
    } catch (error) {
        throw unwrap(error);
    }
};

const adminInvoiceDetail = async (externalId) => {
    try {
        const { data } = await client().get(`/admin/invoices/${encodeURIComponent(externalId)}`);
        return data;
    } catch (error) {
        throw unwrap(error);
    }
};

export {
    adminStats,
    adminBalanceOverview,
    adminLxcServers,
    adminKvmServers,
    adminAppServers,
    adminUsers,
    adminUserBalanceHistory,
    adminAdjustBalance,
    adminInvoices,
    adminInvoiceDetail,
};