/**
 * User profiles (users table). Balance changes go through walletService;
 * saveUser() persists balance edits as deltas (see userRepo), so it is
 * safe for read-modify-save code such as the RPG commands.
 */
import { userRepo } from '../database/repos/userRepo.js';

export const findUser = (jid) => userRepo.findOne({ jid });

/** The user's record, created on first use. */
export const ensureUser = (jid, defaults = {}) => userRepo.findOrCreate({ jid }, defaults);

export const listUsers = () => userRepo.find();

/** Patch profile fields (creating the user if needed); returns the record. */
export const updateUser = (jid, patch) => userRepo.upsert({ jid }, patch);

export const saveUser = (record) => userRepo.save(record);
