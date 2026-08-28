export const up = async (knex) => {
    await knex.schema.createTable('users', (table) => {
        table.increments('id').primary();
        table.string('jid').notNullable().unique();
        table.string('phoneNumber').notNullable().defaultTo('');
        table.string('name').notNullable().defaultTo('');
        table.string('role').notNullable().defaultTo('user');
        table.float('balance').notNullable().defaultTo(0);
        table.string('emailCloud').notNullable().defaultTo('');
        table.string('webPassword').nullable();
        table.dateTime('createdAt').notNullable().defaultTo(knex.fn.now());
        table.dateTime('updatedAt').notNullable().defaultTo(knex.fn.now());
    });
};

export const down = async (knex) => {
    await knex.schema.dropTableIfExists('users');
};
