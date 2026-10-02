import { settings } from '../../config/settings.js';
import {
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
} from '../../services/irengAdmin.js';

const fmtMoney = (n) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;

const parseAmount = (raw) => {
    const num = Number(String(raw || '').replace(/[^0-9.]/g, ''));
    return Number.isFinite(num) && num > 0 ? num : null;
};

const statusEmoji = (status = '') => {
    const s = String(status).toLowerCase();
    if (s === 'running' || s === 'active' || s === 'online' || s === 'healthy' || s === 'paid') return '✅';
    if (s === 'stopped' || s === 'suspended' || s === 'offline' || s === 'expired' || s === 'failed' || s === 'cancelled') return '⛔';
    return '⏳';
};

const dueLabel = (due) => (due ? new Date(due).toLocaleDateString('id-ID') : '-');

const fmtCores = (v) => (Number(v) ? `${v} core` : '-');

// ---------- render helper per subcommand ----------

const renderStats = (d) => {
    const s = d?.stats || {};
    const lines = [
        `📊 *RINGKASAN IRENGCLOUD*`,
        ``,
        `👥 User: *${s.total_users ?? 0}*`,
        `💰 Revenue (paid): *${fmtMoney(s.total_revenue)}*`,
        `🟢 LXC aktif: *${s.active_lxc ?? 0}*`,
        `🔵 KVM aktif: *${s.active_kvm ?? 0}*`,
        `📦 App aktif: *${s.active_app ?? 0}*`,
        `◆ Total server aktif: *${s.total_active_servers ?? 0}*`,
    ];
    if (Array.isArray(d?.nodes) && d.nodes.length) {
        lines.push(``, `🏗 *NODE*`);
        for (const n of d.nodes.slice(0, 8)) {
            const mark = n.status === 'healthy' || n.status === 'online' ? '✅' : '⛔';
            lines.push(`• ${mark} ${n.name} (${n.type || '-'})`);
            if (n.ram) lines.push(`   RAM: ${n.ram} | Disk: ${n.disk || '-'} | CPU: ${n.cpu || '-'}`);
        }
        if (d.nodes.length > 8) lines.push(`…dan ${d.nodes.length - 8} node lainnya`);
    }
    return lines.join('\n');
};

const renderLxcList = (servers = []) => {
    if (!servers.length) return 'Tidak ada server LXC.';
    const parts = [`🐧 *DAFTAR LXC (${servers.length})*\n`];
    for (const s of servers.slice(0, 20)) {
        const owner = s.user ? `${s.user.name} <${s.user.email}>` : 'Tanpa owner';
        parts.push(
            `*${s.hostname || s.vmid}* (${s.vmid ?? '-'})`,
            `• Status: ${statusEmoji(s.status)} ${s.status || '-'} | Node: ${s.node || '-'}`,
            `• Owner: ${owner}`,
            `• Due: ${dueLabel(s.due_date)} | IP: ${s.ip_address || '-'} | SSH: ${s.ssh_port || '-'}`
        );
    }
    return parts.join('\n');
};

const renderLxcDetail = (servers, id) => {
    const match = servers.find(
        (s) =>
            String(s.vmid) === String(id) ||
            String(s.id) === String(id) ||
            String(s.hostname).toLowerCase() === String(id).toLowerCase()
    );
    if (!match) return `Server LXC *${id}* tidak ditemukan.`;
    const o = match.user || {};
    const parts = [
        `🐧 *DETAIL LXC*`,
        ``,
        `Hostname: *${match.hostname}*`,
        `VMID: *${match.vmid}*`,
        `Node: *${match.node || '-'}*`,
        `Status: ${statusEmoji(match.status)} *${match.status || '-'}*`,
        `IP: *${match.ip_address || '-'}*`,
        `Internal IP: *${match.internal_ip || '-'}*`,
        `SSH Port: *${match.ssh_port || '-'}*`,
        `Due: *${dueLabel(match.due_date)}*`,
        `CPU: *${fmtCores(match.cpu_limit)}* | RAM: *${match.memory_limit || 0} MB* | Disk: *${match.disk_limit || 0} MB*`,
        ``,
        `Owner: ${[o.name, o.email].filter(Boolean).join(' · ') || '-'}`,
    ];
    if (match.migration?.status) {
        parts.push(`Migration: ${match.migration.status}`);
    }
    return parts.join('\n');
};

const renderKvmList = (servers = []) => {
    if (!servers.length) return 'Tidak ada server KVM.';
    const parts = [`🔵 *DAFTAR KVM (${servers.length})*\n`];
    for (const s of servers.slice(0, 20)) {
        const owner = s.user ? `${s.user.name} <${s.user.email}>` : 'Tanpa owner';
        parts.push(
            `*${s.hostname || s.id}* (${s.id ?? '-'})`,
            `• Status: ${statusEmoji(s.status)} ${s.status || '-'} | IP: ${s.ipv4 || s.local_ip || '-'}`,
            `• Plan: ${s.plan || '-'} | Region: ${s.region || '-'}`,
            `• Owner: ${owner}`,
            `• Next payment: ${dueLabel(s.next_payment)} | OS: ${s.os || '-'}`
        );
    }
    return parts.join('\n');
};

const renderAppList = (servers = []) => {
    if (!servers.length) return 'Tidak ada server App.';
    const parts = [`📦 *DAFTAR APP (${servers.length})*\n`];
    for (const s of servers.slice(0, 20)) {
        const owner = s.user ? `${s.user.name} <${s.user.email}>` : 'Tanpa owner';
        parts.push(
            `*${s.hostname || s.container_name || s.id}* (${s.id ?? '-'})`,
            `• Status: ${statusEmoji(s.status)} ${s.status || '-'} | Node: ${s.node || '-'}`,
            `• Port: ${s.public_app_port || '-'} | Image: ${s.docker_image || '-'}`,
            `• Owner: ${owner}`
        );
    }
    return parts.join('\n');
};

const renderUser = (u) => {
    const parts = [
        `👤 *USER*`,
        ``,
        `ID: *${u.id}*`,
        `Nama: *${u.name || '-'}*`,
        `Email: *${u.email || '-'}*`,
        `WA: *${u.whatsapp || '-'}*`,
        `Role: *${u.role || '-'}* | Status: ${u.status || '-'}`,
        `Saldo: *${fmtMoney(u.balance)}*`,
        `App: *${u.app_count || 0}* | LXC: *${u.lxc_count || 0}*`,
        `Joined: *${u.joined || '-'}*`,
    ];
    return parts.join('\n');
};

const renderBalanceHist = (d) => {
    const user = d?.user || {};
    const txs = d?.transactions || [];
    const parts = [
        `💰 *RIWAYAT SALDO — ${user.name || user.email || user.id || 'User'}*`,
        `Saldo saat ini: *${fmtMoney(user.balance)}*`,
        ``,
    ];
    if (!txs.length) {
        parts.push('Belum ada transaksi.');
        return parts.join('\n');
    }
    for (const t of txs.slice(0, 10)) {
        const sign = t.direction === 'credit' ? '➕' : '➖';
        parts.push(
            `${sign} *${fmtMoney(t.amount)}* — ${t.direction || '-'}`,
            `   ${new Date(t.created_at).toLocaleDateString('id-ID')} | ${t.reason || t.source_type || '-'}`
        );
    }
    return parts.join('\n');
};

const renderInvoices = (invoices = []) => {
    if (!invoices.length) return 'Tidak ada invoice.';
    const parts = [`🧾 *DAFTAR INVOICE (${invoices.length})*\n`];
    for (const inv of invoices.slice(0, 20)) {
        const owner = inv.user ? `${inv.user.name} <${inv.user.email}>` : 'Tanpa owner';
        const product = inv.product ? inv.product.name : '-';
        parts.push(
            `*${inv.external_id}* — ${statusEmoji(inv.status)} ${inv.status || '-'}`,
            `   ${fmtMoney(inv.amount)} | ${product}`,
            `   ${owner.split('<')[0].trim()}` + (new Date(inv.due_date).getTime() ? ` (due ${dueLabel(inv.due_date)})` : '')
        );
    }
    return parts.join('\n');
};

const renderInvoiceDetail = (inv) => {
    if (!inv) return 'Invoice tidak ditemukan.';
    const o = inv.user || {};
    const lines = [
        `🧾 *INVOICE ${inv.external_id}*`,
        ``,
        `Status: ${statusEmoji(inv.status)} *${inv.status || '-'}*`,
        `Jumlah: *${fmtMoney(inv.amount)}*`,
        `Produk: *${inv.product?.name || '-'}*`,
        `Tipe: *${inv.server_type || inv.type || '-'}*`,
        `User: ${[o.name, o.email].filter(Boolean).join(' · ') || '-'}`,
    ];
    if (inv.due_date) lines.push(`Due: *${dueLabel(inv.due_date)}*`);
    if (inv.paid_at) lines.push(`Paid at: *${new Date(inv.paid_at).toLocaleString('id-ID')}*`);
    if (inv.payment_link) lines.push(`Link: ${inv.payment_link}`);
    return lines.join('\n');
};

const renderBalanceOverview = (d) => {
    const s = d?.summary || {};
    const lines = [
        `🪙 *OVERVIEW SALDO*`,
        ``,
        `Kredit: *${fmtMoney(s.credit_total)}* (${s.credit_count ?? 0} tx)`,
        `Debit: *${fmtMoney(s.debit_total)}* (${s.debit_count ?? 0} tx)`,
    ];
    return lines.join('\n');
};

// ---------- helper bantuan ----------

const cmd = (sc) => `${settings.prefix}irengadmin ${sc}`;

const handleHelp = () => {
    const lines = [
        `⚙️ *IRENGADMIN*`,
        ``,
        `Kelola IrengCloud dari bot (khusus Owner).`,
        ``,
        `📋 *Subcommand:*`,
        `• ${cmd('stats')} — ringkasan platform`,
        `• ${cmd('saldo')} — overview saldo`,
        `• ${cmd('lxc')} — daftar server LXC`,
        `• ${cmd('lxc <id|hostname>')} — detail LXC`,
        `• ${cmd('kvm')} — daftar server KVM`,
        `• ${cmd('apps')} — daftar App Server`,
        `• ${cmd('user <email|nama|wa|id>')} — cari user + saldo`,
        `• ${cmd('riwayat <user-id>')} — riwayat transaksi saldo`,
        `• ${cmd('topup <email|wa|id> <jumlah>')} — tambah saldo`,
        `• ${cmd('invoice')} — daftar invoice`,
        `• ${cmd('invoice <ID>')} — detail invoice`,
        `• ${cmd('bantuan')} — bantuan ini`,
    ];
    return lines.join('\n');
};

// ---------- dispatch ----------

export default {
    name: 'irengadmin',
    aliases: ['irengmanage'],
    description: 'Kelola IrengCloud (owner): server, user, invoice',
    category: 'Owner',
    execute: async (sock, m, args) => {
        if (!process.env.IRENG_ADMIN_TOKEN) {
            return m.reply(
                `❌ Config admin IrengCloud belum diset.\n\n` +
                    `Atur \`IRENG_ADMIN_TOKEN\` di file .env bot, lalu restart.`
            );
        }

        const sub = String(args[0] || '').toLowerCase();

        try {
            switch (sub) {
                case '': {
                    return m.reply(handleHelp());
                }

                case 'stats':
                case 'dashboard': {
                    await m.react('⏳');
                    const d = await adminStats();
                    await m.reply(renderStats(d));
                    return m.react('✅');
                }

                case 'saldo':
                case 'balance': {
                    await m.react('⏳');
                    const d = await adminBalanceOverview();
                    await m.reply(renderBalanceOverview(d));
                    return m.react('✅');
                }

                case 'lxc': {
                    const id = args[1];
                    if (id === undefined) {
                        await m.react('⏳');
                        const d = await adminLxcServers();
                        await m.reply(renderLxcList(d?.servers || []));
                        return m.react('✅');
                    }
                    // detail satu server
                    await m.react('⏳');
                    const dd = await adminLxcServers();
                    await m.reply(renderLxcDetail(dd?.servers || [], id));
                    return m.react('✅');
                }

                case 'kvm': {
                    await m.react('⏳');
                    const d = await adminKvmServers();
                    await m.reply(renderKvmList(d?.servers || []));
                    return m.react('✅');
                }

                case 'apps':
                case 'app': {
                    await m.react('⏳');
                    const d = await adminAppServers();
                    const servers = d?.data ?? [];
                    await m.reply(renderAppList(servers));
                    return m.react('✅');
                }

                case 'user':
                case 'users': {
                    const q = args.slice(1).join(' ').trim();
                    if (!q) {
                        return m.reply(
                            `Gunakan: ${cmd('user <email|nama|wa|id>')}\n` +
                                `Contoh: ${cmd('user roy@gmail.com')}`
                        );
                    }
                    await m.react('⏳');
                    const d = await adminUsers(q);
                    const users = d?.users || [];
                    if (!users.length) {
                        await m.reply(`User *${q}* tidak ditemukan.`);
                        return m.react('❌');
                    }
                    await m.reply(renderUser(users[0]));
                    return m.react('✅');
                }

                case 'riwayat':
                case 'history': {
                    const id = args[1];
                    if (!id) {
                        return m.reply(`Gunakan: ${cmd('riwayat <user-id>')}`);
                    }
                    await m.react('⏳');
                    const d = await adminUserBalanceHistory(id);
                    await m.reply(renderBalanceHist(d));
                    return m.react('✅');
                }

                case 'topup':
                case 'add':
                case 'tambah': {
                    const q = args.slice(1).join(' ').trim();
                    const mMatch = q.match(/(\d[\d.]*)\s*$/);
                    const query = q.replace(/(\d[\d.]*)\s*$/, '').trim();
                    const amount = mMatch ? parseAmount(mMatch[1]) : null;
                    if (!query || !amount) {
                        return m.reply(
                            `Gunakan: ${cmd('topup <email|wa|id> <jumlah>' )}\n` +
                                `Contoh: ${cmd('topup roy@gmail.com 50000')}`
                        );
                    }
                    await m.react('⏳');
                    const d = await adminUsers(query);
                    const user = d?.users?.[0];
                    if (!user) {
                        await m.reply(`User *${query}* tidak ditemukan.`);
                        return m.react('❌');
                    }
                    const res = await adminAdjustBalance(user.id, 'credit', amount, 'Topup via bot WhatsApp');
                    const fresh = res?.user;
                    await m.reply(
                        `✅ *TOPUP BERHASIL*\n\n` +
                            `User: *${fresh.name || fresh.email || user.name}*\n` +
                            `Email: *${fresh.email || '-'}*\n` +
                            `Jumlah: +*${fmtMoney(amount)}*\n` +
                            `Saldo sekarang: *${fmtMoney(fresh.balance)}*`
                    );
                    return m.react('✅');
                }

                case 'invoice':
                case 'inv': {
                    const id = args[1];
                    if (id === undefined) {
                        await m.react('⏳');
                        const d = await adminInvoices();
                        await m.reply(renderInvoices(d?.invoices || []));
                        return m.react('✅');
                    }
                    await m.react('⏳');
                    const d = await adminInvoiceDetail(id);
                    await m.reply(renderInvoiceDetail(d?.invoice));
                    return m.react('✅');
                }

                case 'bantuan':
                case 'help':
                case '-h':
                default: {
                    return m.reply(handleHelp());
                }
            }
        } catch (error) {
            await m.react('❌');
            return m.reply(
                `❌ *Gagal: ${error.message || 'Terjadi kesalahan'}*\n\n` +
                    (error.status === 401
                        ? 'Token admin IrengCloud tidak valid/kedaluwarsa. Perbarui \`IRENG_ADMIN_TOKEN\` di .env.'
                        : error.status === 403
                          ? 'Token tidak punya akses admin.'
                          : 'Periksa kembali input atau coba lagi nanti.')
            );
        }
    },
};