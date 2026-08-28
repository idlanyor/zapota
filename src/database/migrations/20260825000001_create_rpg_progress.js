export const up = async (knex) => {
    await knex.schema.createTable('rpg_progress', (table) => {
        table.increments('id').primary();
        table.string('userId').notNullable().unique();
        table.string('dailyDate').notNullable();
        table.integer('dailyWork').notNullable().defaultTo(0);
        table.integer('dailyShop').notNullable().defaultTo(0);
        table.integer('dailyMeal').notNullable().defaultTo(0);
        table.integer('dailyWins').notNullable().defaultTo(0);
        table.text('claimedMissions').notNullable().defaultTo('[]');
        table.integer('totalWork').notNullable().defaultTo(0);
        table.integer('totalShop').notNullable().defaultTo(0);
        table.integer('totalMeal').notNullable().defaultTo(0);
        table.integer('totalWins').notNullable().defaultTo(0);
        table.text('unlockedAchievements').notNullable().defaultTo('[]');
        table.string('equippedTitle').notNullable().defaultTo('');
        table.dateTime('createdAt').notNullable().defaultTo(knex.fn.now());
        table.dateTime('updatedAt').notNullable().defaultTo(knex.fn.now());
    });
};

export const down = async (knex) => {
    await knex.schema.dropTableIfExists('rpg_progress');
};
