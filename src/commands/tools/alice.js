import axios from 'axios';
import { settings } from '../../config/settings.js';

const ALICE_API_BASE = 'https://app.alice.ws/cli/v1';

const getApiKey = () => {
    // You can set ALICE_API_KEY in your .env file
    return process.env.ALICE_API_KEY || '';
};

const aliceApi = axios.create({
    baseURL: ALICE_API_BASE,
    headers: {
        'Content-Type': 'application/json',
    },
});

aliceApi.interceptors.request.use((config) => {
    config.headers.Authorization = `Bearer ${getApiKey()}`;
    return config;
});

const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

export default {
    name: 'alice',
    aliases: ['vpsalice', 'ephemera'],
    description: 'Manage Alice Ephemera VPS',
    category: 'AI',
    execute: async (sock, m, args, text) => {
        try {
            if (!getApiKey()) {
                await m.reply(
                    ' API Key Alice belum dikonfigurasi. Silakan tambahkan ALICE_API_KEY di file .env Anda.'
                );
                return;
            }

            // args is already an array of words.
            // args[0] is the subcommand
            const subCommand = args[0]?.toLowerCase();
            const params = args.slice(1); // The rest of the arguments

            await sock.sendMessage(m.chat, {
                react: { text: '', key: m.key },
            });

            switch (subCommand) {
                case 'plans':
                case 'paket':
                    await handlePlans(sock, m);
                    break;

                case 'os':
                case 'image':
                    await handleOsImages(sock, m, params[0]);
                    break;

                case 'create':
                case 'deploy':
                case 'buat':
                    await handleDeploy(sock, m, params);
                    break;

                case 'list':
                case 'ls':
                case 'daftar':
                    await handleList(sock, m);
                    break;

                case 'info':
                case 'state':
                case 'status':
                    await handleState(sock, m, params[0]);
                    break;

                case 'delete':
                case 'hapus':
                case 'destroy':
                    await handleDelete(sock, m, params[0]);
                    break;

                case 'power':
                    await handlePower(sock, m, params[0], params[1]);
                    break;

                case 'renew':
                case 'perpanjang':
                    await handleRenew(sock, m, params[0], params[1]);
                    break;

                case 'profile':
                case 'profil':
                    await handleProfile(sock, m);
                    break;

                default:
                    await m.reply(` *ALICE EPHEMERA VPS*

*Subcommand:*
• plans - Lihat daftar paket
• os <plan_id> - Lihat OS tersedia
• create <plan_id> <os_id> <jam> - Buat VPS
• list - Daftar VPS aktif
• info <id> - Detail VPS
• delete <id> - Hapus VPS
• power <id> <action> - Power control
• renew <id> <jam> - Perpanjang
• profile - Profil akun

_Ketik ${settings.prefix}alice plans untuk mulai_`);
            }

            await sock.sendMessage(m.chat, {
                react: { text: '', key: m.key },
            });
        } catch (error) {
            console.error('Error in alice vps:', error);
            await sock.sendMessage(m.chat, {
                react: { text: '', key: m.key },
            });

            const errorMsg = error.response?.data?.message || error.message;
            await m.reply(` Error: ${errorMsg}`);
        }
    },
};

async function handlePlans(sock, m) {
    const response = await aliceApi.get('/evo/plans');
    const plans = response.data.data;

    if (!plans || plans.length === 0) {
        await m.reply(' Tidak ada paket tersedia');
        return;
    }

    let text = ` *DAFTAR PAKET VPS ALICE*\n\n`;

    for (const plan of plans) {
        const memory =
            plan.memory >= 1024 ? `${(plan.memory / 1024).toFixed(0)}GB` : `${plan.memory}MB`;
        const disk = plan.disk >= 1000 ? `${(plan.disk / 1000).toFixed(0)}TB` : `${plan.disk}GB`;

        text += `*${plan.name}* (ID: ${plan.id})\n`;
        text += `├ CPU: ${plan.cpu} Core (${plan.cpu_name})\n`;
        text += `├ RAM: ${memory}\n`;
        text += `├ Disk: ${disk} ${plan.disk_type}\n`;
        text += `├ Speed: ${plan.show_speed}\n`;
        text += `├ Stock: ${plan.stock}\n`;
        text += `├ Region: ${plan.region === 2 ? 'Salt Lake City' : 'Unknown'}\n`;
        if (plan.gpu) text += `├ GPU: ${plan.gpu}\n`;
        text += `└ Status: ${plan.status === 1 ? ' Available' : ' Unavailable'}\n\n`;
    }

    text += `_Gunakan ${settings.prefix}alice os <plan_id> untuk melihat OS tersedia_`;

    await m.reply(text);
}

async function handleOsImages(sock, m, planId) {
    if (!planId) {
        await m.reply(` Masukkan plan ID\nContoh: ${settings.prefix}alice os 38`);
        return;
    }

    const response = await aliceApi.get(`/evo/plans/${planId}/os-images`);
    const osGroups = response.data.data;

    if (!osGroups || osGroups.length === 0) {
        await m.reply(' Tidak ada OS tersedia untuk plan ini');
        return;
    }

    let text = ` *OS TERSEDIA UNTUK PLAN ${planId}*\n\n`;

    for (const group of osGroups) {
        text += `*${group.group_name}*\n`;
        for (const os of group.os_list) {
            text += `├ ID: ${os.id} - ${os.name}\n`;
        }
        text += '\n';
    }

    text += `_Gunakan ${settings.prefix}alice create ${planId} <os_id> <jam>_`;

    await m.reply(text);
}

async function handleDeploy(sock, m, params) {
    const [planId, osId, time] = params;

    if (!planId || !osId || !time) {
        await m.reply(` Format salah!\n*Penggunaan:* ${settings.prefix}alice create <plan_id> <os_id> <jam>\n*Contoh:* ${settings.prefix}alice create 38 1 24

Gunakan ${settings.prefix}alice plans untuk melihat plan_id\nGunakan ${settings.prefix}alice os <plan_id> untuk melihat os_id`);
        return;
    }

    await m.react('⏳');

    const response = await aliceApi.post('/evo/instances/deploy', {
        product_id: parseInt(planId),
        os_id: parseInt(osId),
        time: parseInt(time),
        ssh_key_id: null,
        boot_script: null,
    });

    const vps = response.data.data;

    const text = ` *VPS BERHASIL DIBUAT!*\n
 *ID:* ${vps.id}\n *Hostname:* ${vps.hostname}\n *Plan:* ${vps.plan}\n
* SPESIFIKASI:*
├ CPU: ${vps.cpu} Core (${vps.cpu_name})\n├ RAM: ${formatBytes(vps.memory * 1024 * 1024)}\n├ Disk: ${vps.disk}GB ${vps.disk_type}\n├ OS: ${vps.os}\n└ Speed: ${vps.show_speed}\n
* NETWORK:*
├ IPv4: ${vps.ipv4}\n├ IPv6: ${vps.ipv6}\n└ Region: ${vps.region}\n
* AKSES SSH:*
├ Host: ${vps.ipv4}\n├ User: ${vps.user}\n├ Pass: ${vps.password}\n└ Port: 22

* WAKTU:*
├ Dibuat: ${vps.creation_at}\n└ Expired: ${vps.expiration_at}\n
\`\
ssh ${vps.user}@${vps.ipv4}\n`;

    await m.reply(text);
    await m.react('✅');
}

async function handleList(sock, m) {
    const response = await aliceApi.get('/evo/instances');
    const instances = response.data.data;

    if (!instances || instances.length === 0) {
        await m.reply(' Tidak ada VPS aktif');
        return;
    }

    let text = ` *DAFTAR VPS AKTIF*\n\n`;

    for (const vps of instances) {
        text += `*${vps.plan}* (ID: ${vps.id})\n`;
        text += `├ Host: ${vps.hostname}\n`;
        text += `├ IPv4: ${vps.ipv4}\n`;
        text += `├ OS: ${vps.os}\n`;
        text += `├ Status: ${vps.status === 'active' ? ' Active' : ' ' + vps.status}\n`;
        text += `└ Expired: ${vps.expiration_at}\n\n`;
    }

    text += `_Gunakan ${settings.prefix}alice info <id> untuk detail_`;

    await m.reply(text);
}

async function handleState(sock, m, instanceId) {
    if (!instanceId) {
        await m.reply(` Masukkan instance ID\nContoh: ${settings.prefix}alice info 12345`);
        return;
    }

    const response = await aliceApi.get(`/evo/instances/${instanceId}/state`);
    const data = response.data.data;

    const memUsed = data.state?.memory?.memtotal - data.state?.memory?.memfree || 0;
    const memTotal = data.state?.memory?.memtotal || 0;
    const memPercent = memTotal > 0 ? ((memUsed / memTotal) * 100).toFixed(1) : 0;

    const text = ` *STATUS VPS ${instanceId}*\n
* SPESIFIKASI:*
├ Plan: ${data.name}\n├ CPU: ${data.cpu} Core (${data.cpu_name})\n├ RAM: ${formatBytes(data.memory * 1024 * 1024)}\n└ Disk: ${data.disk}GB\n
* RESOURCE USAGE:*
├ CPU: ${data.state?.cpu || 0}%\n├ RAM: ${formatBytes(memUsed * 1024)} / ${formatBytes(memTotal * 1024)} (${memPercent}%)\n└ State: ${data.state?.state || 'unknown'}\n
* NETWORK:*
├ IPv4: ${data.ipv4_primary}\n├ IPv6: ${data.ipv6_primary}\n├ Traffic In: ${formatBytes(data.state?.traffic?.in || 0)}\n├ Traffic Out: ${formatBytes(data.state?.traffic?.out || 0)}\n└ Total: ${formatBytes(data.state?.traffic?.total || 0)}\n
* SYSTEM:*
├ OS: ${data.system?.name}\n└ Status: ${data.status}`;

    await m.reply(text);
}

async function handleDelete(sock, m, instanceId) {
    if (!instanceId) {
        await m.reply(` Masukkan instance ID\nContoh: ${settings.prefix}alice delete 12345`);
        return;
    }

    await m.reply(` Menghapus VPS ${instanceId}...`);

    const response = await aliceApi.delete(`/evo/instances/${instanceId}`);

    await m.reply(` VPS ${instanceId} berhasil dihapus!`);
}

async function handlePower(sock, m, instanceId, action) {
    const validActions = ['boot', 'shutdown', 'restart', 'poweroff'];

    if (!instanceId || !action) {
        await m.reply(
            ` Format salah!\n*Penggunaan:* ${settings.prefix}alice power <id> <action>\n*Actions:* boot, shutdown, restart, poweroff\n*Contoh:* ${settings.prefix}alice power 12345 restart`
        );
        return;
    }

    if (!validActions.includes(action.toLowerCase())) {
        await m.reply(` Action tidak valid!\nGunakan: ${validActions.join(', ')}`);
        return;
    }

    const response = await aliceApi.post(`/evo/instances/${instanceId}/power`, {
        action: action.toLowerCase(),
    });

    const actionText = {
        boot: ' Boot',
        shutdown: ' Shutdown',
        restart: ' Restart',
        poweroff: ' Poweroff',
    };

    await m.reply(` ${actionText[action.toLowerCase()]} berhasil untuk VPS ${instanceId}`);
}

async function handleRenew(sock, m, instanceId, hours) {
    if (!instanceId || !hours) {
        await m.reply(
            ` Format salah!\n*Penggunaan:* ${settings.prefix}alice renew <id> <jam>\n*Contoh:* ${settings.prefix}alice renew 12345 24`
        );
        return;
    }

    const response = await aliceApi.post(`/evo/instances/${instanceId}/renewals`, {
        time: parseInt(hours),
    });

    const data = response.data.data;

    await m.reply(` *VPS DIPERPANJANG!*\n
 Instance: ${instanceId}\n Ditambah: ${data.added_hours} jam\n Expired Baru: ${data.expiration_at}\n Total Jam: ${data.total_service_hours} jam`);
}

async function handleProfile(sock, m) {
    const response = await aliceApi.get('/account/profile');
    const profile = response.data.data;

    const text = ` *PROFIL ALICE*\n\n *Username:* ${profile.username}\n *Email:* ${profile.email}\n *Nama:* ${profile.fullname}\n\n *Saldo:*
├ Credit: ${profile.credit}\n├ Points: ${profile.points}\n└ Spent: ${profile.total_spent}\n\n *Instance:*
├ Max: ${profile.max_instances}\n└ Grade: ${profile.grade}\n
 *Lokasi:*
├ ${profile.address_1}\n├ ${profile.city}\n└ ${profile.country}\n
 *Tanggal:*
├ Register: ${profile.register_date}\n└ Last Login: ${profile.lastlogin_date}`;

    await m.reply(text);
}
