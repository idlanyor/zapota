import axios from 'axios';

const PTERO_URL = process.env.PTERO_URL; // e.g., https://panel.example.com
const PTERO_API_KEY = process.env.PTERO_API_KEY; // Application API Key

const ptero = axios.create({
    baseURL: `${PTERO_URL}/api/application`,
    headers: {
        Authorization: `Bearer ${PTERO_API_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'Application/vnd.pterodactyl.v1+json',
    },
});

export const findPteroUserByPhone = async (phone) => {
    try {
        // Pterodactyl API doesn't have a direct phone filter in standard installs,
        // so we search by external_id (which we'll use for JID) or custom logic.
        // For now, we fetch all users and filter manually if necessary,
        // but better to search by email/username first.
        const usersResp = await ptero.get('/users');
        const user = usersResp.data.data.find(
            (u) => u.attributes.external_id === phone || u.attributes.username.includes(phone)
        );
        return user ? user.attributes : null;
    } catch (error) {
        console.error('Find Ptero User Error:', error.message);
        return null;
    }
};

export const getClientAccount = async () => {
    try {
        const client = axios.create({
            baseURL: `${PTERO_URL}/api/client`,
            headers: {
                Authorization: `Bearer ${process.env.PTERO_CLIENT_KEY}`,
                'Content-Type': 'application/json',
                Accept: 'Application/vnd.pterodactyl.v1+json',
            },
        });
        const resp = await client.get('/account');
        return resp.data.attributes;
    } catch (error) {
        console.error('Get Client Account Error:', error.response?.data || error.message);
        throw error;
    }
};

// This specific function for a specific user requires their external_id mapping
export const getPteroUserByJid = async (jid) => {
    try {
        const resp = await ptero.get(`/users?filter[external_id]=${jid}`);
        return resp.data.data.length > 0 ? resp.data.data[0].attributes : null;
    } catch (error) {
        return null;
    }
};

export const updatePteroProfile = async (userId, data) => {
    // We use the application API to update the user since the bot acts as an admin/manager
    return updatePteroUser(userId, data);
};

export const createPteroUser = async (data) => {
    try {
        const resp = await ptero.post('/users', {
            email: data.email,
            username: data.username,
            first_name: data.firstName || data.username,
            last_name: data.lastName || 'BotUser',
            external_id: data.externalId || '',
        });
        return resp.data.attributes;
    } catch (error) {
        console.error('Create Ptero User Error:', error.response?.data || error.message);
        throw error;
    }
};

export const listPteroUsers = async (page = 1) => {
    try {
        const resp = await ptero.get(`/users?page=${page}`);
        return resp.data;
    } catch (error) {
        console.error('List Ptero Users Error:', error.message);
        throw error;
    }
};

export const updatePteroUser = async (userId, data) => {
    try {
        const resp = await ptero.patch(`/users/${userId}`, data);
        return resp.data.attributes;
    } catch (error) {
        console.error('Update Ptero User Error:', error.response?.data || error.message);
        throw error;
    }
};

export const deletePteroUser = async (userId) => {
    try {
        await ptero.delete(`/users/${userId}`);
        return true;
    } catch (error) {
        console.error('Delete Ptero User Error:', error.response?.data || error.message);
        throw error;
    }
};

export const createPteroServer = async (userJid, plan) => {
    try {
        // 1. Find or create user on Pterodactyl
        let pteroUser;
        const phone = userJid.split('@')[0];
        const email = `${phone}@kanata.web.id`;

        // Check by external_id (JID) first
        try {
            const usersResp = await ptero.get(`/users?filter[external_id]=${userJid}`);
            if (usersResp.data.data.length > 0) {
                pteroUser = usersResp.data.data[0].attributes;
            } else {
                // Check by email as fallback
                const emailResp = await ptero.get(`/users?filter[email]=${email}`);
                if (emailResp.data.data.length > 0) {
                    pteroUser = emailResp.data.data[0].attributes;
                } else {
                    const createUserResp = await ptero.post('/users', {
                        email,
                        username: phone,
                        first_name: phone,
                        last_name: 'BotUser',
                        external_id: userJid, // Bind JID to external_id
                    });
                    pteroUser = createUserResp.data.attributes;
                }
            }
        } catch (err) {
            console.error('Ptero User Error:', err.response?.data || err.message);
            throw new Error('Failed to find/create Pterodactyl user');
        }

        // 2. Create Server
        // You'll need to configure these default IDs based on your panel
        const serverData = {
            name: `${pteroUser.username}-${plan.name}`,
            user: pteroUser.id,
            nest: parseInt(process.env.PTERO_NEST_ID) || 1,
            egg: parseInt(process.env.PTERO_EGG_ID) || 1,
            docker_image: 'ghcr.io/shirokamiryzen/yolks:nodejs_22',
            startup:
                'if [[ -d .git ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; /usr/local/bin/node /home/container/${MAIN_FILE}',
            limits: {
                memory: plan.ram,
                swap: 0,
                disk: plan.disk,
                io: 500,
                cpu: plan.cpu,
            },
            feature_limits: {
                databases: 0,
                allocations: 1,
                backups: 0,
            },
            environment: {
                GIT_ADDRESS: '',
                BRANCH: '',
                USER_UPLOAD: '0',
                AUTO_UPDATE: '0',
                NODE_PACKAGES: '',
                USERNAME: '',
                ACCESS_TOKEN: '',
                UNNODE_PACKAGES: '',
                MAIN_FILE: 'index.js',
                NODE_ARGS: '',
            },
            deploy: {
                locations: [parseInt(process.env.PTERO_LOCATION_ID) || 1],
                dedicated_ip: false,
                port_range: [],
            },
            start_on_completion: true,
        };

        const createResp = await ptero.post('/servers', serverData);
        return createResp.data.attributes;
    } catch (error) {
        if (error.response?.data?.errors) {
            console.error(
                'Ptero Server Create Validation Errors:',
                JSON.stringify(error.response.data.errors, null, 2)
            );
            throw new Error(`Ptero Validation Error: ${error.response.data.errors[0].detail}`);
        }
        console.error('Ptero Server Create Error:', error.response?.data || error.message);
        throw error;
    }
};

export const getUserServers = async (userJid) => {
    try {
        // 1. Find Ptero user by external_id (JID)
        const usersResp = await ptero.get(`/users?filter[external_id]=${userJid}`);
        if (usersResp.data.data.length === 0) return [];

        const pteroUser = usersResp.data.data[0].attributes;

        // 2. Get all servers for this user
        // Using Application API to list servers for a specific user ID
        const serversResp = await ptero.get('/servers');
        const userServers = serversResp.data.data.filter((s) => s.attributes.user === pteroUser.id);

        return userServers.map((s) => s.attributes);
    } catch (error) {
        console.error('Get User Servers Error:', error.message);
        throw error;
    }
};

export const setServerPowerState = async (serverIdentifier, signal) => {
    try {
        // Power actions require the Client API
        // We use PTERO_CLIENT_KEY which should be an Admin Client API Key
        const client = axios.create({
            baseURL: `${PTERO_URL}/api/client`,
            headers: {
                Authorization: `Bearer ${process.env.PTERO_CLIENT_KEY}`,
                'Content-Type': 'application/json',
                Accept: 'Application/vnd.pterodactyl.v1+json',
            },
        });

        await client.post(`/servers/${serverIdentifier}/power`, { signal });
        return true;
    } catch (error) {
        console.error('Set Power State Error:', error.response?.data || error.message);
        throw error;
    }
};

export const getServerResources = async (serverIdentifier) => {
    try {
        const client = axios.create({
            baseURL: `${PTERO_URL}/api/client`,
            headers: {
                Authorization: `Bearer ${process.env.PTERO_CLIENT_KEY}`,
                'Content-Type': 'application/json',
                Accept: 'Application/vnd.pterodactyl.v1+json',
            },
        });

        const resp = await client.get(`/servers/${serverIdentifier}/resources`);
        return resp.data.attributes;
    } catch (error) {
        console.error('Get Server Resources Error:', error.response?.data || error.message);
        throw error;
    }
};
