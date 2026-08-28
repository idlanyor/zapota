export const up = async (knex) => {
    await knex.schema.createTable('groups', (table) => {
        table.increments('id').primary();
        table.string('jid').notNullable().unique();
        table.string('name').notNullable().defaultTo('');
        table.boolean('announce').notNullable().defaultTo(false);
        table.boolean('restrict').notNullable().defaultTo(false);
        table.boolean('antilink').notNullable().defaultTo(false);
        table.boolean('antitoxic').notNullable().defaultTo(false);
        table.boolean('welcome').notNullable().defaultTo(false);
        table.boolean('left').notNullable().defaultTo(false);
        table.boolean('nsfw').notNullable().defaultTo(false);
        table.boolean('mute').notNullable().defaultTo(false);
        table.boolean('prayerReminder').notNullable().defaultTo(false);
        table.string('cityId').notNullable().defaultTo('1420');
        table.string('cityName').notNullable().defaultTo('KAB. PURBALINGGA');
        table.string('welcomeMsg').notNullable().defaultTo('Selamat datang @user di grup @group!');
        table
            .string('leaveMsg')
            .notNullable()
            .defaultTo('Selamat tinggal @user, semoga tenang di sana!');
        table.boolean('autoOpen').notNullable().defaultTo(false);
        table.boolean('autoClose').notNullable().defaultTo(false);
        table.string('autoOpenTime').notNullable().defaultTo('05:00');
        table.string('autoCloseTime').notNullable().defaultTo('22:00');
        table.string('lastAutoOpenAt').notNullable().defaultTo('');
        table.string('lastAutoCloseAt').notNullable().defaultTo('');
        table.dateTime('createdAt').notNullable().defaultTo(knex.fn.now());
        table.dateTime('updatedAt').notNullable().defaultTo(knex.fn.now());
    });
};

export const down = async (knex) => {
    await knex.schema.dropTableIfExists('groups');
};
