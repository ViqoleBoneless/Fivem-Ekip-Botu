import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadGiveaways, saveGiveaways } from '../db.js';
import { endGiveaway } from '../handlers/giveawayHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

setInterval(async () => {
  const client = globalThis.client;
  if (!client || !client.isReady()) return;
  if (client.config?.giveawaySystemEnabled === false) return;

  try {
    const giveaways = loadGiveaways();
    const now = Date.now();
    let changed = false;

    for (const giveaway of giveaways) {
      if (giveaway.ended || giveaway.endsAt > now) continue;

      const guild = client.guilds.cache.get(giveaway.guildId) || await client.guilds.fetch(giveaway.guildId).catch(() => null);
      if (!guild) {
        giveaway.ended = true;
        changed = true;
        continue;
      }

      await endGiveaway(giveaway, guild, client);
      changed = true;
    }

    if (changed) {
      saveGiveaways(giveaways);
    }
  } catch (err) {
    console.error('Giveaway background check task error:', err);
  }
}, 10000); // Check every 10 seconds

console.log('✅ Çekiliş kontrol görevi başlatıldı (10 saniyede bir).');
