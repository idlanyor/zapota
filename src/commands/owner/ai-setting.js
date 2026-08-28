import Settings from '../../database/models/Settings.js';
import { clearSettingsCache } from '../../handlers/messageHandler.js';

export default {
    name: 'aisetting',
    aliases: ['aiconfig', 'pvaichat'],
    description: 'Manage Auto-AI Mode for Private Chat (Owner Only)',
    category: 'Owner',
    execute: async (sock, m, args, text) => {
        const subcommand = args[0]?.toLowerCase();
        if (!subcommand) {
            return m.reply(`*Auto-AI Private Configuration*
            
Gunakan:
- *.aisetting on* : Aktifkan mode Auto-AI di PC
- *.aisetting off* : Matikan mode Auto-AI di PC
- *.aisetting setpersona <teks>* : Ubah persona AI PC
- *.aisetting check* : Cek status`);
        }

        let botSettings = await Settings.findOne({ id: 'bot_settings' });

        if (subcommand === 'on') {
            botSettings.autoAiPrivate = true;
            await botSettings.save();
            clearSettingsCache();
            return m.reply(' Auto-AI untuk Private Chat diaktifkan.');
        }

        if (subcommand === 'off') {
            botSettings.autoAiPrivate = false;
            await botSettings.save();
            clearSettingsCache();
            return m.reply(' Auto-AI untuk Private Chat dimatikan.');
        }

        if (subcommand === 'setpersona') {
            const persona = text.slice(subcommand.length).trim();
            if (!persona) return m.reply('Harap masukkan teks persona.');

            botSettings.privateAiPersona = persona;
            await botSettings.save();
            clearSettingsCache();
            return m.reply(` Persona PC berhasil diubah menjadi:
"${persona}"`);
        }

        if (subcommand === 'check') {
            return m.reply(`*Auto-AI Private Status*
            
Status: ${botSettings.autoAiPrivate ? ' Aktif' : ' Mati'}
Smart Mode: ${botSettings.smartMode ? '🧠 ON (Auto-Away)' : '🤖 OFF (Always On)'}
Must Join Group: ${botSettings.mustJoinGroup ? ' Aktif' : ' Mati'}
Invite Link: ${botSettings.groupInviteLink}
Persona: ${botSettings.privateAiPersona}`);
        }

        if (subcommand === 'smartmode') {
            const toggle = args[1]?.toLowerCase();
            if (toggle === 'on') {
                botSettings.smartMode = true;
                await botSettings.save();
                clearSettingsCache();
                return m.reply(
                    '🧠 Smart Mode diaktifkan.\nBot hanya akan membalas jika kamu AFK (tidak aktif mengirim pesan selama 2 menit).'
                );
            } else if (toggle === 'off') {
                botSettings.smartMode = false;
                await botSettings.save();
                clearSettingsCache();
                return m.reply(
                    '🤖 Smart Mode dimatikan.\nBot akan selalu membalas chat (Always On).'
                );
            }
            return m.reply('Gunakan: .aisetting smartmode on/off');
        }

        if (subcommand === 'mustjoin') {
            const toggle = args[1]?.toLowerCase();
            if (toggle === 'on') {
                botSettings.mustJoinGroup = true;
                await botSettings.save();
                clearSettingsCache();
                return m.reply('✅ Syarat bergabung grup diaktifkan.');
            } else if (toggle === 'off') {
                botSettings.mustJoinGroup = false;
                await botSettings.save();
                clearSettingsCache();
                return m.reply('🚫 Syarat bergabung grup dimatikan.');
            }
            return m.reply('Gunakan: .aisetting mustjoin on/off');
        }

        if (subcommand === 'setlink') {
            const link = args[1];
            if (!link || !link.includes('chat.whatsapp.com'))
                return m.reply('Harap masukkan link grup yang valid.');
            botSettings.groupInviteLink = link;
            global.targetGroupJid = null; // Reset cache JID
            await botSettings.save();
            clearSettingsCache();
            return m.reply(`✅ Link grup berhasil diubah ke:\n${link}`);
        }

        return m.reply('Subcommand tidak dikenal.');
    },
};
