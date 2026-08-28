import { werewolfService } from '../../games/werewolf/service.js';

export default {
    name: 'ww',
    aliases: [],
    description: 'Werewolf multiplayer untuk grup WhatsApp',
    category: 'Games',
    execute: async (sock, m, args) => werewolfService.execute(sock, m, args),
};
