export const up = async (knex) => {
    await knex.schema.createTable('polls', (table) => {
        table.increments('id').primary();
        table.string('pollId').notNullable().unique();
        table.string('chat').notNullable();
        table.string('question').notNullable();
        table.text('options').notNullable().defaultTo('[]');
        table.binary('messageSecret').notNullable();
        table.dateTime('createdAt').notNullable().defaultTo(knex.fn.now());
    });
};

export const down = async (knex) => {
    await knex.schema.dropTableIfExists('polls');
};
