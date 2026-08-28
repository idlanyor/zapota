export const up = async (knex) => {
    await knex.schema.alterTable('users', (table) => {
        table.string('visionModel').defaultTo('or/openai/gpt-4o-mini');
    });
};

export const down = async (knex) => {
    await knex.schema.alterTable('users', (table) => {
        table.dropColumn('visionModel');
    });
};
