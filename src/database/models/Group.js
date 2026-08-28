import mongoose from '../index.js';

const groupSchema = new mongoose.Schema({
    jid: {
        type: String,
        required: true,
        unique: true,
    },
    name: {
        type: String,
        default: '',
    },
    announce: {
        type: Boolean,
        default: false,
    },
    restrict: {
        type: Boolean,
        default: false,
    },
    antilink: {
        type: Boolean,
        default: false,
    },
    antitoxic: {
        type: Boolean,
        default: false,
    },
    welcome: {
        type: Boolean,
        default: false,
    },
    left: {
        type: Boolean,
        default: false,
    },
    antidelete: {
        type: Boolean,
        default: false,
    },
    nsfw: {
        type: Boolean,
        default: false,
    },
    mute: {
        type: Boolean,
        default: false,
    },
    prayerReminder: {
        type: Boolean,
        default: false,
    },
    cityId: {
        type: String,
        default: '1420', // Default Purbalingga
    },
    cityName: {
        type: String,
        default: 'KAB. PURBALINGGA',
    },
    welcomeMsg: {
        type: String,
        default: 'Selamat datang @user di grup @group!',
    },
    leaveMsg: {
        type: String,
        default: 'Selamat tinggal @user, semoga tenang di sana!',
    },
    welcomeBg: {
        type: String,
        default: 'https://i.ibb.co/4YBNyvP/images-76.jpg',
    },
    autoOpen: {
        type: Boolean,
        default: false,
    },
    autoClose: {
        type: Boolean,
        default: false,
    },
    autoOpenTime: {
        type: String,
        default: '05:00',
    },
    autoCloseTime: {
        type: String,
        default: '22:00',
    },
    lastAutoOpenAt: {
        type: String,
        default: '',
    },
    lastAutoCloseAt: {
        type: String,
        default: '',
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

const Group = mongoose.model('Group', groupSchema);

export default Group;
