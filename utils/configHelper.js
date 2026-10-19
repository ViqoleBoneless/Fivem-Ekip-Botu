import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export const DEFAULT_CONFIG_PATH = path.join(rootDir, 'config.json');
export const EXAMPLE_CONFIG_PATH = path.join(rootDir, 'config.example.json');

/**
 * Konfigürasyon dosyasını ve .env ortam değişkenlerini harmanlayarak yükler.
 * config.json yoksa config.example.json şablonundan otomatik olarak oluşturur.
 */
export function loadConfig(customPath = null) {
  const configPath = customPath || process.env.BOT_CONFIG || DEFAULT_CONFIG_PATH;
  let config = {};

  // 1. config.json kontrolü ve yüklemesi
  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      config = JSON.parse(raw);
    } catch (err) {
      console.error(`[CONFIG] ${configPath} okuma hatası:`, err);
    }
  } else if (fs.existsSync(EXAMPLE_CONFIG_PATH)) {
    try {
      const raw = fs.readFileSync(EXAMPLE_CONFIG_PATH, 'utf8');
      config = JSON.parse(raw);
      // İlk açılışta config.json dosyasını örnekten üret
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      console.log(`[CONFIG] ${configPath} bulunamadı, config.example.json baz alınarak oluşturuldu.`);
    } catch (err) {
      console.error('[CONFIG] config.example.json okunamadı:', err);
    }
  }

  // 2. .env değişkenlerini config ile harmanla (Sadece temel hassas/ortam değişkenleri)
  if (process.env.TOKEN && process.env.TOKEN !== 'BOT_TOKEN_BURAYA') {
    config.token = process.env.TOKEN;
  }
  if (process.env.CLIENT_ID && process.env.CLIENT_ID !== 'BOT_CLIENT_ID_BURAYA') {
    config.clientId = process.env.CLIENT_ID;
  }
  if (process.env.GUILD_ID && process.env.GUILD_ID !== 'SUNUCU_ID_BURAYA') {
    config.guildId = process.env.GUILD_ID;
  }
  if (process.env.WEB_PORT || process.env.PORT) {
    const port = parseInt(process.env.WEB_PORT || process.env.PORT, 10);
    if (!isNaN(port)) config.webPort = port;
  }
  if (process.env.OAUTH_CLIENT_SECRET && process.env.OAUTH_CLIENT_SECRET !== 'BURAYA_OAUTH_CLIENT_SECRET') {
    config.oauthClientSecret = process.env.OAUTH_CLIENT_SECRET;
  }
  if (process.env.SESSION_SECRET) {
    config.sessionSecret = process.env.SESSION_SECRET;
  }
  if (process.env.MONGODB_URI && !process.env.MONGODB_URI.includes('...')) {
    config.mongodbUri = process.env.MONGODB_URI;
  }

  // Varsayılan veritabanı yolu
  if (!config.dbPath || config.dbPath.includes('customer1')) {
    config.dbPath = 'data/bot.db';
  }

  return {
    config,
    configPath,
    saveConfig: (newConfig) => saveConfig(newConfig, configPath)
  };
}

/**
 * Konfigürasyonu belirtilen dosyaya yazar.
 */
export function saveConfig(newConfig, customPath = null) {
  const configPath = customPath || process.env.BOT_CONFIG || DEFAULT_CONFIG_PATH;
  try {
    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`[CONFIG] ${configPath} kaydetme hatası:`, err);
    return false;
  }
}
