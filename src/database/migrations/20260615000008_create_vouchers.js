export const up = async (knex) => {
    await knex.schema.createTable('vouchers', (table) => {
        table.increments('id').primary();
        table.string('code').notNullable().unique();
        table.float('value').notNullable();
        table.integer('quota').notNullable().defaultTo(1);
        table.text('usedBy').notNullable().defaultTo('[]');
        table.boolean('isPublic').notNullable().defaultTo(false);
        table.dateTime('expiredAt').nullable();
        table.dateTime('createdAt').notNullable().defaultTo(knex.fn.now());
        table.dateTime('updatedAt').notNullable().defaultTo(knex.fn.now());
    });
};

export const down = async (knex) => {
    await knex.schema.dropTableIfExists('vouchers');
};
