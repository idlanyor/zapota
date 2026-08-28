import mongoose from '../index.js';

const RpgInventorySchema = new mongoose.Schema(
    {
        userId: {
            type: String,
            required: true,
            index: true,
        },
        itemId: {
            type: String,
            required: true,
        },
        itemName: {
            type: String,
            required: true,
        },
        category: {
            type: String,
            enum: ['konsumsi', 'kendaraan', 'senjata', 'aksesoris', 'spesial'],
            default: 'konsumsi',
        },
        quantity: {
            type: Number,
            default: 1,
        },
        isEquipped: {
            type: Boolean,
            default: false,
        },
        durability: {
            type: Number,
            default: 100,
        },
    },
    { timestamps: true }
);

export default mongoose.model('RpgInventory', RpgInventorySchema, 'rpg_inventories');
