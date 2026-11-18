/**
 * Sub-bots (jadibot): one row per linked WhatsApp number.
 *   status: pending (waiting for pairing) | active | stopped
 *   tier:   free | premium (premium while premiumUntil is in the future)
 */
export const up = async (knex) => {
    await knex.schema.createTable('jadibots', (table) => {
        table.increments('id').primary();
        table.string('number').notNullable().unique();
        table.string('ownerJid').nullable();
        table.string('tier').notNullable().defaultTo('free');
        table.string('status').notNullable().defaultTo('pending');
        table.bigInteger('premiumUntil').nullable();
        table.bigInteger('reminderSentAt').nullable();
        table.bigInteger('lastActiveAt').nullable();
        table.dateTime('createdAt').notNullable().defaultTo(knex.fn.now());
        table.dateTime('updatedAt').notNullable().defaultTo(knex.fn.now());

        table.index('status', 'idx_jadibots_status');
    });
};

export const down = async (knex) => {
    await knex.schema.dropTableIfExists('jadibots');
};
