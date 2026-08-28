export const up = async (knex) => {
    await knex.schema.createTable('budgets', (table) => {
        table.increments('id').primary();
        table.string('userId').notNullable();
        table.integer('month').notNullable();
        table.integer('year').notNullable();
        table.float('incomeTarget').notNullable().defaultTo(0);
        table.float('savingsTarget').notNullable().defaultTo(0);
        table.string('note').nullable();
        table.dateTime('createdAt').notNullable().defaultTo(knex.fn.now());
        table.dateTime('updatedAt').notNullable().defaultTo(knex.fn.now());

        table.unique(['userId', 'month', 'year'], {
            indexName: 'uq_budgets_user_month_year',
        });
    });
};

export const down = async (knex) => {
    await knex.schema.dropTableIfExists('budgets');
};
