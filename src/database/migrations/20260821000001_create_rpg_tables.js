export const up = async (knex) => {
    await knex.schema.createTable('rpg_players', (table) => {
        table.increments('id').primary();
        table.string('userId').notNullable().unique();
        table.integer('level').notNullable().defaultTo(1);
        table.integer('exp').notNullable().defaultTo(0);
        table.integer('hp').notNullable().defaultTo(100);
        table.integer('maxHp').notNullable().defaultTo(100);
        table.integer('gizi').notNullable().defaultTo(100);
        table.integer('kewarasan').notNullable().defaultTo(100);
        table.integer('energi').notNullable().defaultTo(100);
        table.integer('maxEnergi').notNullable().defaultTo(100);
        table.string('job').notNullable().defaultTo('Pengangguran');
        table.integer('reputasiWarga').notNullable().defaultTo(50);
        table.integer('reputasiPreman').notNullable().defaultTo(20);
        table.integer('reputasiAparat').notNullable().defaultTo(50);
        table.integer('bintangKorupsi').notNullable().defaultTo(0);
        table.dateTime('lastMbgClaim').nullable();
        table.dateTime('lastWork').nullable();
        table.dateTime('lastHealing').nullable();
        table.dateTime('lastEnergyReset').notNullable().defaultTo(knex.fn.now());
        table.dateTime('createdAt').notNullable().defaultTo(knex.fn.now());
        table.dateTime('updatedAt').notNullable().defaultTo(knex.fn.now());
    });

    await knex.schema.createTable('rpg_inventories', (table) => {
        table.increments('id').primary();
        table.string('userId').notNullable();
        table.string('itemId').notNullable();
        table.string('itemName').notNullable();
        table.string('category').notNullable().defaultTo('konsumsi');
        table.integer('quantity').notNullable().defaultTo(1);
        table.boolean('isEquipped').notNullable().defaultTo(false);
        table.integer('durability').notNullable().defaultTo(100);
        table.dateTime('createdAt').notNullable().defaultTo(knex.fn.now());
        table.dateTime('updatedAt').notNullable().defaultTo(knex.fn.now());
    });

    await knex.schema.createTable('rpg_bills', (table) => {
        table.increments('id').primary();
        table.string('userId').notNullable();
        table.string('billType').notNullable();
        table.float('amount').notNullable();
        table.dateTime('dueDate').notNullable();
        table.boolean('isPaid').notNullable().defaultTo(false);
        table.dateTime('createdAt').notNullable().defaultTo(knex.fn.now());
        table.dateTime('updatedAt').notNullable().defaultTo(knex.fn.now());
    });
};

export const down = async (knex) => {
    await knex.schema.dropTableIfExists('rpg_bills');
    await knex.schema.dropTableIfExists('rpg_inventories');
    await knex.schema.dropTableIfExists('rpg_players');
};
