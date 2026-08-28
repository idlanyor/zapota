export const up = async (knex) => {
    await knex.schema.alterTable('users', (table) => {
        table.string('irengToken').nullable();
    });
};

export const down = async (knex) => {
    await knex.schema.alterTable('users', (table) => {
        table.dropColumn('irengToken');
    });
};
