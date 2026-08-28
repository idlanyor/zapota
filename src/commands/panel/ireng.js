import QRCode from 'qrcode';
import { settings } from '../../config/settings.js';
import {
    verifyToken,
    saveUserToken,
    clearUserToken,
    requireUserToken,
    getUserToken,
    getAccount,
    getAllServers,
    lxcPower,
    appPower,
    getAppStatus,
    getLxcStats,
    getInvoices,
    getInvoice,
    getProducts,
    checkout,
    getTickets,
    getTicket,
    createTicket,
    replyTicket,
} from '../../services/ireng.js';

const REGIONS = ['SG', 'EU', 'USA'];
const STATUS_EMOJI = {
    paid: '✅',
    unpaid: '⏳',
    expired: '⌛',
    cancelled: '❌',
    open: '🟢',
    pending: '🟡',
    closed: '⚪',
};

const fmtDate = (d) =>
    d
        ? new Date(d).toLocaleDateString('id-ID', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
          })
        : '-';
const fmtMoney = (n) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;

const parseKv = (tokens) => {
    const kv = {};
    tokens.forEach((t) => {
        const match = t.match(/^([a-z]+)=(.+)$/i);
        if (match) kv[match[1].toLowerCase()] = match[2];
    });
    return kv;
};

export default {
    name: 'ireng',
    aliases: ['irengvps', 'irengbot'],
    description: 'Manage your ireng.uk hosting account, servers, invoices, and tickets',
    category: 'Panel',
    execute: async (sock, m, args, text) => {
        const subCommand = args[0]?.toLowerCase();
        const params = args.slice(1);

        try {
            switch (subCommand) {
                case 'bind':
                case 'link':
                    await handleBind(m, params[0]);
                    break;

                case 'unbind':
                case 'unlink':
                    await clearUserToken(m.sender);
                    await m.reply('Akun ireng.uk berhasil dilepas dari nomor ini.');
                    break;

                case 'me':
                case 'profile':
                case 'akun':
                    await handleProfile(m);
                    break;

                case 'srv':
                case 'list':
                case 'ls':
                case 'servers':
                    await handleServers(m);
                    break;

                case 'panel':
                case 'power':
                case 'ctrl':
                    await handlePower(m, params);
                    break;

                case 'plans':
                case 'products':
                case 'produk':
                    await handleProducts(m, params[0]);
                    break;

                case 'order':
                case 'create':
                case 'beli':
                case 'buat':
                    await handleOrder(sock, m, params);
                    break;

                case 'invoices':
                case 'invoice':
                case 'inv':
                    await handleInvoices(m, params[0]);
                    break;

                case 'tickets':
                case 'ticket':
                    await handleTickets(m, params, text);
                    break;

                default:
                    await handleHelp(m);
            }
        } catch (error) {
            await m.react('❌');
            await m.reply(`Error: ${error.message}`);
        }
    },
};

async function handleHelp(m) {
    const token = await getUserToken(m.sender);

    await m.reply(
        `*IRENG.UK MENU*\n\n` +
            `Status: ${token ? '✅ Akun terhubung' : '❌ Belum terhubung'}\n\n` +
            `*Akun:*\n` +
            `• ${settings.prefix}ireng bind <token> - hubungkan akun\n` +
            `• ${settings.prefix}ireng unbind - lepas akun\n` +
            `• ${settings.prefix}ireng me - profil & saldo\n\n` +
            `*Server:*\n` +
            `• ${settings.prefix}ireng srv - daftar server\n` +
            `• ${settings.prefix}ireng panel <lxc|kvm|app> <id> <start|stop|restart|status>\n\n` +
            `*Order:*\n` +
            `• ${settings.prefix}ireng plans [lxc|kvm|app] - daftar produk\n` +
            `• ${settings.prefix}ireng order <id_produk> [bulan] [balance] - order & bayar QRIS\n\n` +
            `*Invoice:*\n` +
            `• ${settings.prefix}ireng invoices - daftar invoice\n` +
            `• ${settings.prefix}ireng invoice <external_id> - detail invoice\n\n` +
            `*Tiket:*\n` +
            `• ${settings.prefix}ireng tickets - daftar tiket\n` +
            `• ${settings.prefix}ireng ticket <external_id> - detail/balas\n` +
            `• ${settings.prefix}ireng ticket new <subjek> | <pesan> - buat tiket\n\n` +
            `_Belum punya token? Login ke ireng.uk → API Tokens → buat token baru._`
    );
}

async function handleBind(m, token) {
    if (!token) {
        return m.reply(
            `Usage: ${settings.prefix}ireng bind <api_token>\n\n` +
                `Cara dapat token:\n1. Login ke https://ireng.uk\n2. Buka menu API Tokens, buat token baru\n3. Kirim: ${settings.prefix}ireng bind <token>`
        );
    }

    await m.react('⏳');
    const user = await verifyToken(token);
    await saveUserToken(m.sender, token);
    await m.reply(
        `Berhasil! Akun ireng.uk *${user.name || user.email}* (${user.email}) sekarang terhubung dengan nomor WhatsApp ini.\n\n` +
            `Coba: ${settings.prefix}ireng srv, ${settings.prefix}ireng invoices, ${settings.prefix}ireng tickets`
    );
    await m.react('✅');
}

async function handleProfile(m) {
    await m.react('⏳');
    const token = await requireUserToken(m.sender);
    const user = await getAccount(token);

    await m.reply(
        `*AKUN IRENG.UK*\n\n` +
            `Nama: ${user.name}\n` +
            `Email: ${user.email}\n` +
            `Saldo: ${fmtMoney(user.balance)}\n` +
            `Role: ${user.role}`
    );
    await m.react('✅');
}

async function handleServers(m) {
    await m.react('⏳');
    const token = await requireUserToken(m.sender);
    const { lxc, kvm, app } = await getAllServers(token);

    if (lxc.length === 0 && kvm.length === 0 && app.length === 0) {
        await m.react('❌');
        return m.reply('Anda belum memiliki server di ireng.uk.');
    }

    let msg = `*SERVER IRENG.UK ANDA*\n\n`;

    if (lxc.length) {
        msg += `📦 *LXC*\n`;
        lxc.forEach((s) => {
            msg += `- *${s.hostname}* (#${s.id})\n`;
            msg += `  IP: ${s.ip_address || '-'} | Status: ${s.status}\n`;
            msg += `  Jatuh tempo: ${fmtDate(s.due_date)}\n`;
        });
        msg += `\n`;
    }

    if (kvm.length) {
        msg += `🖥️ *KVM*\n`;
        kvm.forEach((s) => {
            msg += `- *${s.hostname || s.name}* (#${s.id})\n`;
            msg += `  Status: ${s.status}\n`;
        });
        msg += `\n`;
    }

    if (app.length) {
        msg += `🚀 *App Server*\n`;
        app.forEach((s) => {
            msg += `- *${s.name}* (#${s.id})\n`;
            msg += `  Status: ${s.status}\n`;
        });
        msg += `\n`;
    }

    msg += `Kontrol: ${settings.prefix}ireng panel <lxc|kvm|app> <id> <start|stop|restart|status>`;

    await m.reply(msg);
    await m.react('✅');
}

async function handlePower(m, params) {
    const [type, id, action] = [params[0]?.toLowerCase(), params[1], params[2]?.toLowerCase()];
    const VALID_TYPES = ['lxc', 'kvm', 'app'];
    const LXC_ACTIONS = ['start', 'stop'];
    const APP_ACTIONS = ['start', 'stop', 'restart'];

    if (!type || !VALID_TYPES.includes(type) || !id || !action) {
        return m.reply(
            `Usage: ${settings.prefix}ireng panel <lxc|kvm|app> <id> <action>\n\n` +
                `LXC actions: ${LXC_ACTIONS.join(', ')}, status\n` +
                `App actions: ${APP_ACTIONS.join(', ')}, status\n` +
                `KVM: status only (power via console)\n\n` +
                `Contoh: ${settings.prefix}ireng panel lxc 12 restart`
        );
    }

    const token = await requireUserToken(m.sender);

    if (type === 'lxc') {
        if (action === 'status' || action === 'info') {
            await m.react('⏳');
            const stats = await getLxcStats(token, id);
            await m.reply(`*STATUS LXC #${id}*\n\n` + JSON.stringify(stats, null, 2));
            return m.react('✅');
        }
        if (action === 'restart') {
            await m.react('⏳');
            await lxcPower(token, id, 'stop');
            await lxcPower(token, id, 'start');
            await m.reply(`Server LXC #${id} berhasil di-restart.`);
            return m.react('✅');
        }
        if (!LXC_ACTIONS.includes(action)) {
            return m.reply(`Aksi LXC tidak valid. Pakai: ${LXC_ACTIONS.join(', ')}, status`);
        }
        await m.react('⏳');
        await lxcPower(token, id, action);
        await m.reply(`Sinyal *${action}* berhasil dikirim ke server LXC #${id}.`);
        return m.react('✅');
    }

    if (type === 'app') {
        if (action === 'status' || action === 'info') {
            await m.react('⏳');
            const status = await getAppStatus(token, id);
            await m.reply(`*STATUS APP #${id}*\n\n` + JSON.stringify(status, null, 2));
            return m.react('✅');
        }
        if (!APP_ACTIONS.includes(action)) {
            return m.reply(`Aksi App Server tidak valid. Pakai: ${APP_ACTIONS.join(', ')}, status`);
        }
        await m.react('⏳');
        await appPower(token, id, action);
        await m.reply(`Sinyal *${action}* berhasil dikirim ke App Server #${id}.`);
        return m.react('✅');
    }

    if (type === 'kvm') {
        return m.reply(
            'KVM tidak mendukung power control via API. Gunakan console di dashboard ireng.uk.'
        );
    }
}

async function handleProducts(m, filterCategory) {
    await m.react('⏳');
    const token = await requireUserToken(m.sender);
    let products = await getProducts(token);

    if (filterCategory) {
        products = products.filter(
            (p) => p.category.toLowerCase() === filterCategory.toLowerCase()
        );
    }

    if (products.length === 0) {
        await m.react('❌');
        return m.reply('Tidak ada produk yang tersedia.');
    }

    let msg = `*PRODUK IRENG.UK*\n\n`;
    products.forEach((p) => {
        msg += `▸ *#${p.id} - ${p.name}* (${p.category})\n`;
        msg += `  Harga: ${fmtMoney(p.price)}/bulan\n`;
        msg += `  CPU: ${p.cpu} | RAM: ${p.memory}MB | Disk: ${p.disk}MB\n`;
        msg += `  Stok: ${p.stock > 0 ? p.stock : 'Habis'}\n\n`;
    });
    msg += `Order: ${settings.prefix}ireng order <id_produk> [bulan]\n`;
    msg += `Contoh: ${settings.prefix}ireng order ${products[0].id} 1`;

    await m.reply(msg);
    await m.react('✅');
}

async function handleOrder(sock, m, params) {
    const productId = params[0];

    if (!productId) {
        return m.reply(
            `Usage: ${settings.prefix}ireng order <id_produk> [bulan] [balance]\n\n` +
                `Default pembayaran: QRIS. Tambahkan kata "balance" untuk bayar dari saldo ireng.\n` +
                `Khusus produk KVM, tambahkan: region=SG|EU|USA os=Ubuntu_22 pass=passwordAnda\n\n` +
                `Lihat daftar produk: ${settings.prefix}ireng plans\n` +
                `Contoh: ${settings.prefix}ireng order 3 1\n` +
                `Contoh KVM: ${settings.prefix}ireng order 7 1 region=SG os=Ubuntu_22 pass=RahasiaKuat123`
        );
    }

    await m.react('⏳');
    const token = await requireUserToken(m.sender);

    const rest = params.slice(1);
    const monthsArg = rest.find((t) => /^\d+$/.test(t));
    const months = monthsArg ? parseInt(monthsArg, 10) : 1;
    const paymentMethod = rest.some((t) => t.toLowerCase() === 'balance') ? 'balance' : 'qris';
    const kv = parseKv(rest);

    const products = await getProducts(token);
    const product = products.find((p) => String(p.id) === String(productId));
    if (!product) {
        await m.react('❌');
        return m.reply(`Produk #${productId} tidak ditemukan. Cek ${settings.prefix}ireng plans`);
    }

    if (product.stock <= 0) {
        await m.react('❌');
        return m.reply(`Produk *${product.name}* sedang habis stok.`);
    }

    const payload = {
        product_id: product.id,
        type: 'new',
        months,
        payment_method: paymentMethod,
    };

    const category = product.category.toLowerCase();
    if (category === 'kvm') {
        if (!kv.region || !REGIONS.includes(kv.region.toUpperCase()) || !kv.os || !kv.pass) {
            await m.react('❌');
            return m.reply(
                `Produk KVM wajib menyertakan region, os, dan pass.\n` +
                    `Contoh: ${settings.prefix}ireng order ${product.id} ${months} region=SG os=Ubuntu_22 pass=RahasiaKuat123`
            );
        }
        payload.region = kv.region.toUpperCase();
        payload.os_image = kv.os.replace(/_/g, ' ');
        payload.root_password = kv.pass;
    }

    const result = await checkout(token, payload);
    const invoice = result.invoice;

    if (result.paid_by_balance || result.paid_by_discount) {
        await m.reply(
            `*ORDER BERHASIL*\n\n` +
                `Invoice: ${invoice.external_id}\n` +
                `Produk: ${product.name}\n` +
                `Dibayar dari ${result.paid_by_balance ? 'saldo' : 'diskon'}. Server sedang diproses, cek dengan ${settings.prefix}ireng srv.`
        );
        return m.react('✅');
    }

    if (!result.qr_content) {
        await m.reply(
            `Invoice dibuat: *${invoice.external_id}*\n` +
                `Jumlah: ${fmtMoney(invoice.amount)}\n` +
                `Bayar di: ${result.payment_url}`
        );
        return m.react('✅');
    }

    const qrBuffer = await QRCode.toBuffer(result.qr_content, { width: 512 });
    await sock.sendMessage(
        m.chat,
        {
            image: qrBuffer,
            caption:
                `*ORDER DIBUAT - BAYAR QRIS*\n\n` +
                `Invoice: ${invoice.external_id}\n` +
                `Produk: ${product.name}\n` +
                `Jumlah: ${fmtMoney(invoice.amount)}\n\n` +
                `Scan QR di atas untuk membayar. Setelah lunas, server otomatis dibuat dan Anda akan dapat notifikasi WhatsApp.\n` +
                `Cek status: ${settings.prefix}ireng invoice ${invoice.external_id}\n` +
                `Link alternatif: ${result.payment_url}`,
        },
        { quoted: m }
    );
    await m.react('✅');
}

async function handleInvoices(m, externalId) {
    await m.react('⏳');
    const token = await requireUserToken(m.sender);

    if (externalId) {
        const inv = await getInvoice(token, externalId);

        let msg = `*INVOICE ${inv.external_id}*\n\n`;
        msg += `Produk: ${inv.product?.name || inv.type || '-'}\n`;
        msg += `Jumlah: ${fmtMoney(inv.amount)}\n`;
        msg += `Status: ${inv.status}\n`;
        if (inv.due_date) msg += `Jatuh tempo: ${inv.due_date}\n`;
        if (inv.status === 'unpaid' && inv.payment_link) msg += `\nBayar: ${inv.payment_link}`;

        await m.reply(msg);
        return m.react('✅');
    }

    const invoices = await getInvoices(token);
    if (invoices.length === 0) {
        await m.react('❌');
        return m.reply('Belum ada invoice.');
    }

    let msg = `*INVOICE IRENG.UK ANDA*\n\n`;
    invoices.slice(0, 10).forEach((inv) => {
        const emoji = STATUS_EMOJI[inv.status] || '•';
        msg += `${emoji} *${inv.external_id}*\n`;
        msg += `   ${inv.product?.name || inv.type || ''}\n`;
        msg += `   ${fmtMoney(inv.amount)} - ${inv.status}\n\n`;
    });
    msg += `Detail: ${settings.prefix}ireng invoice <external_id>`;

    await m.reply(msg);
    await m.react('✅');
}

async function handleTickets(m, params, text) {
    await m.react('⏳');
    const token = await requireUserToken(m.sender);
    const sub = params[0];

    if (!sub) {
        const tickets = await getTickets(token);
        if (tickets.length === 0) {
            await m.react('❌');
            return m.reply('Belum ada tiket support.');
        }

        let msg = `*TIKET SUPPORT IRENG.UK*\n\n`;
        tickets.slice(0, 10).forEach((t) => {
            const emoji = STATUS_EMOJI[t.status] || '•';
            msg += `${emoji} *${t.external_id}* - ${t.subject}\n`;
            msg += `   Status: ${t.status}${t.is_unread ? ' (baru)' : ''}\n\n`;
        });
        msg += `Detail/balas: ${settings.prefix}ireng ticket <external_id>\n`;
        msg += `Buat baru: ${settings.prefix}ireng ticket new <subjek> | <pesan>`;

        await m.reply(msg);
        return m.react('✅');
    }

    if (sub.toLowerCase() === 'new') {
        const rest = text.replace(/^ticket\s+new\s*/i, '');
        const [subject, message] = rest.split('|').map((s) => s?.trim());
        if (!subject || !message) {
            await m.react('❌');
            return m.reply(
                `Usage: ${settings.prefix}ireng ticket new <subjek> | <pesan>\n` +
                    `Contoh: ${settings.prefix}ireng ticket new Server LXC down | Server saya #12 tidak bisa diakses sejak tadi malam`
            );
        }
        const ticket = await createTicket(token, { subject, message });
        await m.reply(`Tiket berhasil dibuat: *${ticket.external_id || ticket.id}*`);
        return m.react('✅');
    }

    const externalId = sub;
    const action = params[1]?.toLowerCase();

    if (action === 'reply') {
        const message = text.replace(new RegExp(`^ticket\\s+${externalId}\\s+reply\\s*`, 'i'), '');
        if (!message.trim()) {
            await m.react('❌');
            return m.reply(`Usage: ${settings.prefix}ireng ticket ${externalId} reply <pesan>`);
        }
        await replyTicket(token, externalId, message.trim());
        await m.reply(`Balasan terkirim ke tiket *${externalId}*.`);
        return m.react('✅');
    }

    const ticket = await getTicket(token, externalId);

    let msg = `*TIKET ${ticket.external_id}*\n\n`;
    msg += `Subjek: ${ticket.subject}\n`;
    msg += `Status: ${ticket.status}\n`;
    msg += `Kategori: ${ticket.category}\n\n`;
    (ticket.replies || []).slice(-5).forEach((r) => {
        const who = r.user?.role === 'admin' ? 'Admin' : 'Anda';
        msg += `*${who}*: ${r.message}\n\n`;
    });
    msg += `Balas: ${settings.prefix}ireng ticket ${externalId} reply <pesan>`;

    await m.reply(msg);
    await m.react('✅');
}
