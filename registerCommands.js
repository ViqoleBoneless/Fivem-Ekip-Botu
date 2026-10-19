import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { REST, Routes } from 'discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const mod = await import(pathToFileURL(filePath).href);
  const cmd = mod.data || mod.default?.data;
  if (cmd) commands.push(cmd.toJSON());
}

import { loadConfig } from './utils/configHelper.js';

const { config } = loadConfig();

const token = config.token || process.env.TOKEN;
const clientId = config.clientId || process.env.CLIENT_ID;
const guildId = config.guildId || process.env.GUILD_ID;

const isInvalid = (val) => !val || val.includes('BURAYA_') || val.includes('_BURAYA');

if (isInvalid(token) || isInvalid(clientId) || isInvalid(guildId)) {
  console.error('\n❌ [KOMUT KAYIT HATASI] token, clientId veya guildId bulunamadı veya henüz doldurulmadı!');
  console.error('👉 Lütfen .env veya config.json dosyanızda bu bilgileri eksiksiz tanımlayın.');
  console.error('👉 Detaylı bilgi için README.md dosyasını inceleyebilirsiniz.\n');
  process.exit(1);
}

const rest = new REST().setToken(token);

try {
  console.log(`${commands.length} komut kaydediliyor...`);
  await rest.put(
    Routes.applicationGuildCommands(clientId, guildId),
    { body: commands }
  );
  console.log('Komutlar başarıyla kaydedildi!');
} catch (err) {
  console.error(err);
}
