export const up = async (knex) => {
    await knex.schema.createTable('transactions', (table) => {
        table.increments('id').primary();
        table.string('userId').notNullable();
        table.string('userName').nullable();
        table.string('type').notNullable();
        table.float('amount').notNullable();
        table.string('category').notNullable().defaultTo('General');
        table.string('source').notNullable().defaultTo('other');
        table.string('description').nullable();
        table.string('kakeiboCategory').nullable();
        table.dateTime('date').notNullable().defaultTo(knex.fn.now());
        table.dateTime('createdAt').notNullable().defaultTo(knex.fn.now());
        table.dateTime('updatedAt').notNullable().defaultTo(knex.fn.now());

        table.index('source', 'idx_transactions_source');
    });
};

export const down = async (knex) => {
    await knex.schema.dropTableIfExists('transactions');
};
