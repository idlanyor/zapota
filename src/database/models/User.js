import mongoose from '../index.js';

const userSchema = new mongoose.Schema({
    jid: {
        type: String,
        required: true,
        unique: true,
    },
    phoneNumber: {
        type: String,
        default: '',
    },
    name: {
        type: String,
        default: '',
    },
    role: {
        type: String,
        default: 'user',
        enum: ['user', 'admin'],
    },
    balance: {
        type: Number,
        default: 0,
    },
    emailCloud: {
        type: String,
        default: '',
    },
    webPassword: {
        type: String,
        default: null,
    },
    irengToken: {
        type: String,
        default: null,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    visionModel: {
        type: String,
        default: 'or/openai/gpt-4o-mini',
    },
});

const User = mongoose.model('User', userSchema);

export default User;
