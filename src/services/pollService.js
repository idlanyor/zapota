/** Polls the bot created, kept so votes can be decrypted later. */
import { pollRepo } from '../database/repos/pollRepo.js';

export const savePoll = (poll) => pollRepo.create(poll);
export const findPoll = (pollId) => pollRepo.findByPollId(pollId);
export const removePoll = (pollId) => pollRepo.remove(pollId);
export const prunePollsOlderThan = (cutoff) => pollRepo.removeOlderThan(cutoff);
