export const up = async (knex) => {
    await knex.schema.createTable('servers', (table) => {
        table.increments('id').primary();
        table.string('userId').notNullable();
        table.integer('pteroId').notNullable();
        table.string('identifier').notNullable();
        table.string('planName').notNullable();
        table.float('price').notNullable();
        table.string('status').notNullable().defaultTo('active');
        table.dateTime('expiredAt').notNullable();
        table.boolean('autoRenewEnabled').notNullable().defaultTo(true);
        table.integer('autoRenewCycleDays').notNullable().defaultTo(30);
        table.string('lastAutoRenewFor').notNullable().defaultTo('');
        table.dateTime('lastAutoRenewAt').nullable();
        table.string('lastRenewalNotifyFor').notNullable().defaultTo('');
        table.dateTime('suspendedAt').nullable();
        table.dateTime('createdAt').notNullable().defaultTo(knex.fn.now());
        table.dateTime('updatedAt').notNullable().defaultTo(knex.fn.now());

        table.index('autoRenewEnabled', 'idx_servers_auto_renew_enabled');
    });
};

export const down = async (knex) => {
    await knex.schema.dropTableIfExists('servers');
};
