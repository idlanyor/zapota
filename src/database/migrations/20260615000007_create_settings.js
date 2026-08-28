export const up = async (knex) => {
    await knex.schema.createTable('settings', (table) => {
        table.increments('id').primary();
        table.string('settingsId').notNullable().unique().defaultTo('bot_settings');
        table.text('disabledCommands').notNullable().defaultTo('[]');
        table.string('mode').notNullable().defaultTo('public');
        table.boolean('autoStatusRead').notNullable().defaultTo(false);
        table.boolean('autoAiPrivate').notNullable().defaultTo(false);
        table
            .string('privateAiPersona')
            .notNullable()
            .defaultTo('Kamu adalah KanataBot, asisten pribadi AI yang cerdas.');
        table.boolean('mustJoinGroup').notNullable().defaultTo(false);
        table.boolean('smartMode').notNullable().defaultTo(false);
        table
            .string('groupInviteLink')
            .notNullable()
            .defaultTo('https://chat.whatsapp.com/I5JCuQnIo4f79JsZAGCvDD');
        table.string('cfToken').notNullable().defaultTo('');
        table.string('cfAccountId').notNullable().defaultTo('');
        table.text('cfZones').notNullable().defaultTo('[]');
        table.text('owners').notNullable().defaultTo('[]');
        table.dateTime('createdAt').notNullable().defaultTo(knex.fn.now());
        table.dateTime('updatedAt').notNullable().defaultTo(knex.fn.now());
    });
};

export const down = async (knex) => {
    await knex.schema.dropTableIfExists('settings');
};
