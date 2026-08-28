import mongoose from '../index.js';

const settingSchema = new mongoose.Schema({
    id: {
        type: String,
        default: 'bot_settings',
        unique: true,
    },
    disabledCommands: {
        type: [String],
        default: [],
    },
    mode: {
        type: String,
        default: 'public', // 'self', 'public', 'group'
    },
    autoStatusRead: {
        type: Boolean,
        default: false,
    },
    autoAiPrivate: {
        type: Boolean,
        default: false,
    },
    privateAiPersona: {
        type: String,
        default: 'Kamu adalah KanataBot, asisten pribadi AI yang cerdas.',
    },
    mustJoinGroup: {
        type: Boolean,
        default: false,
    },
    smartMode: {
        type: Boolean,
        default: false,
    },
    groupInviteLink: {
        type: String,
        default: 'https://chat.whatsapp.com/I5JCuQnIo4f79JsZAGCvDD',
    },
    cfToken: {
        type: String,
        default: '',
    },
    cfAccountId: {
        type: String,
        default: '',
    },
    cfZones: [
        {
            domain: String,
            zoneId: String,
        },
    ],
    owners: {
        type: [String],
        default: [],
    },
});

const Settings = mongoose.model('Settings', settingSchema);

export default Settings;
