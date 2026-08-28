import mongoose from '../index.js';

const pollSchema = new mongoose.Schema({
    pollId: { type: String, required: true, unique: true },
    chat: { type: String, required: true },
    question: { type: String, required: true },
    options: [{ type: String }],
    messageSecret: { type: Buffer, required: true },
    createdAt: { type: Date, default: Date.now, expires: 604800 }, // Auto delete after 7 days
});

const Poll = mongoose.model('Poll', pollSchema);
export default Poll;
