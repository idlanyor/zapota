// The Group model has had `antidelete` and `welcomeBg` for a while, but no
// migration created them, so Group.create() failed on migrated databases.
// Guarded so databases that already have the columns are left untouched.
export const up = async (knex) => {
    const hasAntidelete = await knex.schema.hasColumn('groups', 'antidelete');
    const hasWelcomeBg = await knex.schema.hasColumn('groups', 'welcomeBg');
    if (hasAntidelete && hasWelcomeBg) return;

    await knex.schema.alterTable('groups', (table) => {
        if (!hasAntidelete) table.boolean('antidelete').notNullable().defaultTo(false);
        if (!hasWelcomeBg) {
            table
                .string('welcomeBg')
                .notNullable()
                .defaultTo('https://i.ibb.co/4YBNyvP/images-76.jpg');
        }
    });
};

export const down = async (knex) => {
    await knex.schema.alterTable('groups', (table) => {
        table.dropColumn('antidelete');
        table.dropColumn('welcomeBg');
    });
};
