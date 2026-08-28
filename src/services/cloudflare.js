import axios from 'axios';
import { getCachedSettings } from '../handlers/messageFlow.js';

const getHeaders = async () => {
    const settings = await getCachedSettings();
    const token = settings.cfToken || process.env.CLOUDFLARE_API_TOKEN;
    return {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
    };
};

const getAccountId = async () => {
    const settings = await getCachedSettings();
    return settings.cfAccountId || process.env.CLOUDFLARE_ACCOUNT_ID;
};

export const listRules = async (mode = null, page = 1) => {
    try {
        const headers = await getHeaders();
        const accountId = await getAccountId();
        const CF_API_URL = `https://api.cloudflare.com/client/v4/accounts/${accountId}/firewall/access_rules/rules`;

        const params = {
            page: page,
            per_page: 50,
        };
        if (mode) params.mode = mode;

        const response = await axios.get(CF_API_URL, { headers, params });
        return response.data.result;
    } catch (error) {
        console.error('CF List Error:', error.response?.data || error.message);
        throw error;
    }
};

export const createRule = async (ip, mode, notes) => {
    try {
        const headers = await getHeaders();
        const accountId = await getAccountId();
        const CF_API_URL = `https://api.cloudflare.com/client/v4/accounts/${accountId}/firewall/access_rules/rules`;

        const data = {
            mode: mode, // 'block', 'whitelist', 'challenge', 'js_challenge'
            configuration: {
                target: 'ip',
                value: ip,
            },
            notes: notes || `Created via Bot by Owner`,
        };

        const response = await axios.post(CF_API_URL, data, { headers });
        return response.data.result;
    } catch (error) {
        console.error('CF Create Error:', error.response?.data || error.message);
        throw error;
    }
};

export const deleteRule = async (ip) => {
    try {
        const headers = await getHeaders();
        const accountId = await getAccountId();
        const CF_API_URL = `https://api.cloudflare.com/client/v4/accounts/${accountId}/firewall/access_rules/rules`;

        // 1. Find the rule ID first by searching the IP
        const searchResponse = await axios.get(CF_API_URL, {
            headers,
            params: {
                'configuration.value': ip,
            },
        });

        const rules = searchResponse.data.result;
        if (rules.length === 0) return null; // Not found

        const ruleId = rules[0].id;

        // 2. Delete using ID
        await axios.delete(`${CF_API_URL}/${ruleId}`, { headers });
        return { id: ruleId, ip: ip };
    } catch (error) {
        console.error('CF Delete Error:', error.response?.data || error.message);
        throw error;
    }
};

// Normalise ASN input: accept "12345" or "AS12345", always return "AS12345"
const normaliseAsn = (asn) => {
    if (!asn) return asn;
    const cleaned = String(asn).trim().toUpperCase().replace(/\s+/g, '');
    return cleaned.startsWith('AS') ? cleaned : `AS${cleaned}`;
};

export const createAsnRule = async (asn, mode, notes) => {
    try {
        const headers = await getHeaders();
        const accountId = await getAccountId();
        const CF_API_URL = `https://api.cloudflare.com/client/v4/accounts/${accountId}/firewall/access_rules/rules`;

        const value = normaliseAsn(asn);

        const data = {
            mode: mode, // 'block', 'whitelist', 'challenge', 'js_challenge'
            configuration: {
                target: 'asn',
                value: value,
            },
            notes: notes || `Created via Bot by Owner`,
        };

        const response = await axios.post(CF_API_URL, data, { headers });
        return response.data.result;
    } catch (error) {
        console.error('CF CreateASN Error:', error.response?.data || error.message);
        throw error;
    }
};

export const deleteAsnRule = async (asn) => {
    try {
        const headers = await getHeaders();
        const accountId = await getAccountId();
        const CF_API_URL = `https://api.cloudflare.com/client/v4/accounts/${accountId}/firewall/access_rules/rules`;

        const value = normaliseAsn(asn);

        const searchResponse = await axios.get(CF_API_URL, {
            headers,
            params: {
                'configuration.target': 'asn',
                'configuration.value': value,
            },
        });

        const rules = searchResponse.data.result;
        if (!rules || rules.length === 0) return null;

        const ruleId = rules[0].id;
        await axios.delete(`${CF_API_URL}/${ruleId}`, { headers });
        return { id: ruleId, asn: value };
    } catch (error) {
        console.error('CF DeleteASN Error:', error.response?.data || error.message);
        throw error;
    }
};

export const listAsnRules = async (mode = null, page = 1) => {
    try {
        const headers = await getHeaders();
        const accountId = await getAccountId();
        const CF_API_URL = `https://api.cloudflare.com/client/v4/accounts/${accountId}/firewall/access_rules/rules`;

        const params = {
            'configuration.target': 'asn',
            page: page,
            per_page: 50,
        };
        if (mode) params.mode = mode;

        const response = await axios.get(CF_API_URL, { headers, params });
        return response.data.result;
    } catch (error) {
        console.error('CF ListASN Error:', error.response?.data || error.message);
        throw error;
    }
};

// --- DNS Management Functions ---

export const getZoneId = async (domainName) => {
    try {
        const settings = await getCachedSettings();

        // 1. Check in database first
        if (settings.cfZones && settings.cfZones.length > 0) {
            const found = settings.cfZones.find((z) => z.domain === domainName?.toLowerCase());
            if (found) return found.zoneId;
        }

        // 2. If not found in DB, try to fetch from Cloudflare API
        const headers = await getHeaders();
        const response = await axios.get('https://api.cloudflare.com/client/v4/zones', {
            headers,
            params: { name: domainName },
        });
        const zones = response.data.result;
        return zones.length > 0 ? zones[0].id : null;
    } catch (error) {
        console.error('CF GetZone Error:', error.response?.data || error.message);
        throw error;
    }
};

export const addDnsRecord = async (zoneId, type, name, content, proxied = false) => {
    try {
        const headers = await getHeaders();
        const url = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`;
        const data = {
            type: type, // A, CNAME, etc
            name: name,
            content: content,
            ttl: 1, // Automatic
            proxied: proxied,
        };

        const response = await axios.post(url, data, { headers });
        return response.data.result;
    } catch (error) {
        console.error('CF AddDNS Error:', error.response?.data || error.message);
        throw error;
    }
};

export const listDnsRecords = async (zoneId, page = 1) => {
    try {
        const headers = await getHeaders();
        const url = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`;
        const response = await axios.get(url, {
            headers,
            params: { page, per_page: 50 },
        });
        return response.data.result;
    } catch (error) {
        console.error('CF ListDNS Error:', error.response?.data || error.message);
        throw error;
    }
};

export const fetchAllZones = async (page = 1) => {
    try {
        const headers = await getHeaders();
        const accountId = await getAccountId();
        const response = await axios.get('https://api.cloudflare.com/client/v4/zones', {
            headers,
            params: {
                'account.id': accountId,
                page: page,
                per_page: 50,
            },
        });
        return response.data.result;
    } catch (error) {
        console.error('CF FetchZones Error:', error.response?.data || error.message);
        throw error;
    }
};
