import axios from 'axios';
import https from 'https';

const getClient = () => {
    const CLOUD_URL = process.env.CLOUD_API_URL || 'http://cloud.kanata.web.id';
    const CLOUD_TOKEN = process.env.CLOUD_ADMIN_TOKEN;

    return axios.create({
        baseURL: `${CLOUD_URL}/api`,
        headers: {
            Authorization: `Bearer ${CLOUD_TOKEN}`,
            'Content-Type': 'application/json',
        },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        timeout: 10000,
    });
};

export const getCloudNodes = async () => {
    try {
        const client = getClient();
        const resp = await client.get('/proxmox/nodes');
        return resp.data;
    } catch (error) {
        throw new Error(error.response?.data?.error || error.message);
    }
};

export const getCloudLXCs = async (node) => {
    try {
        const client = getClient();
        const resp = await client.get(`/proxmox/${node}/lxc`);
        return resp.data;
    } catch (error) {
        throw new Error(error.response?.data?.error || error.message);
    }
};

export const setLxcPowerState = async (node, vmid, action) => {
    try {
        const client = getClient();
        const resp = await client.post(`/proxmox/vm/${node}/${vmid}/${action}?type=lxc`);
        return resp.data;
    } catch (error) {
        throw new Error(error.response?.data?.error || error.message);
    }
};

export const getLxcStatus = async (node, vmid) => {
    try {
        const client = getClient();
        const resp = await client.get(`/proxmox/${node}/lxc/${vmid}`);
        return resp.data;
    } catch (error) {
        throw new Error(error.response?.data?.error || error.message);
    }
};

// Admin Helpers
export const getCloudUsers = async () => {
    try {
        const client = getClient();
        const resp = await client.get('/admin/users');
        return resp.data;
    } catch (error) {
        throw new Error(error.response?.data?.error || error.message);
    }
};

export const getCloudSubscriptions = async () => {
    try {
        const client = getClient();
        const resp = await client.get('/admin/subscriptions');
        return resp.data;
    } catch (error) {
        throw new Error(error.response?.data?.error || error.message);
    }
};

export const updateCloudUser = async (userId, data) => {
    try {
        const client = getClient();
        const resp = await client.put(`/admin/users/${userId}`, data);
        return resp.data;
    } catch (error) {
        throw new Error(error.response?.data?.error || error.message);
    }
};

export const deleteCloudUser = async (userId) => {
    try {
        const client = getClient();
        const resp = await client.delete(`/admin/users/${userId}`);
        return resp.data;
    } catch (error) {
        throw new Error(error.response?.data?.error || error.message);
    }
};

/**
 * Get LXCs belonging to a specific WhatsApp user
 */
export const getUserLXCs = async (userEmail, isAdmin = false) => {
    try {
        const nodes = await getCloudNodes();
        let allLXCs = [];

        for (const node of nodes) {
            const lxcs = await getCloudLXCs(node.node);
            allLXCs.push(...lxcs.map((l) => ({ ...l, node: node.node })));
        }

        if (isAdmin && !userEmail) return allLXCs;

        // Find Cloud User ID
        const users = await getCloudUsers();
        const cloudUser = users.find((u) => u.email === userEmail);
        if (!cloudUser) return [];

        // Find VMIDs from subscriptions
        const subs = await getCloudSubscriptions();
        const userVmids = subs.filter((s) => s.ownerId === cloudUser.id).map((s) => s.vmid);

        return allLXCs.filter((l) => userVmids.includes(l.vmid.toString()));
    } catch (error) {
        console.error('getUserLXCs Error:', error.message);
        throw error;
    }
};
