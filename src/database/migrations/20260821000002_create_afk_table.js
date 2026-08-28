export const up = async (knex) => {
    await knex.schema.createTable('afk', (table) => {
        table.increments('id').primary();
        table.string('userId').notNullable().unique();
        table.string('userName').notNullable().defaultTo('');
        table.string('reason').notNullable().defaultTo('Tanpa alasan');
        table.dateTime('time').notNullable().defaultTo(knex.fn.now());
        table.dateTime('createdAt').notNullable().defaultTo(knex.fn.now());
        table.dateTime('updatedAt').notNullable().defaultTo(knex.fn.now());
    });
};

export const down = async (knex) => {
    await knex.schema.dropTableIfExists('afk');
};
