/**
 * User balance (users.balance) and its ledger. Balance changes here are
 * single SQL statements, so concurrent purchases/top-ups cannot lose
 * updates or overdraw.
 */
import { userRepo } from '../database/repos/userRepo.js';
import { ensureUser, findUser } from './userService.js';
import { transactionRepo } from '../database/repos/transactionRepo.js';
import { voucherRepo } from '../database/repos/voucherRepo.js';

const assertAmount = (amount) => {
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new RangeError(`Invalid amount: ${amount}`);
    }
};

export { ensureUser, findUser };

export const getBalance = async (jid) => (await userRepo.findOne({ jid }))?.balance ?? 0;

/** Add `amount`; returns the new balance. */
export const credit = async (jid, amount) => {
    assertAmount(amount);
    await ensureUser(jid);
    await userRepo.query().where({ jid }).increment('balance', amount);
    return getBalance(jid);
};

/**
 * Subtract `amount` only if the balance covers it (checked in the same
 * UPDATE). Returns `{ ok, balance }`; `ok: false` means insufficient funds.
 */
export const debit = async (jid, amount) => {
    assertAmount(amount);
    await ensureUser(jid);
    const changed = await userRepo
        .query()
        .where({ jid })
        .andWhere('balance', '>=', amount)
        .decrement('balance', amount);
    return { ok: changed > 0, balance: await getBalance(jid) };
};

/** Append to the local transaction ledger (store, SMM, vouchers). */
export const recordTransaction = (entry) => transactionRepo.create(entry);

export const createVoucher = (voucher) => voucherRepo.create(voucher);

export const findVoucher = (code) => voucherRepo.findByCode(code);

/** Atomic voucher redemption (see voucherRepo.redeem). */
export const redeemVoucher = (code, jid) => voucherRepo.redeem(code, jid);
