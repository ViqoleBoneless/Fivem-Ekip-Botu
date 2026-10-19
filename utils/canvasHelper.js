import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getLogoPath } from './logoHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOGO_PATHS = [
  path.join(__dirname, '../VQLOGO1.png'),
  path.join(__dirname, '../ViqoleBotsLOGO.png'),
  path.join(__dirname, '../logo.png')
];
const DEFAULT_AVATAR = 'https://cdn.discordapp.com/embed/avatars/0.png';

const CARD = {
  width: 1000,
  height: 380,
  padding: 34,
  radius: 34
};

async function resolveMentions(text) {
  if (!text) return text;
  let str = String(text);

  // User Mentions: <@userId> or <@!userId>
  const userRegex = /<@!?(\d+)>/g;
  const userMatches = [...str.matchAll(userRegex)];
  for (const match of userMatches) {
    const fullMention = match[0];
    const userId = match[1];
    let displayName = userId;
    if (globalThis.client) {
      try {
        let user = globalThis.client.users.cache.get(userId);
        if (!user) {
          user = await globalThis.client.users.fetch(userId).catch(() => null);
        }
        if (user) {
          displayName = user.username || user.tag;
        }
      } catch (err) {
        console.error('[Canvas Helper] User fetch error:', err);
      }
    }
    str = str.replace(fullMention, `@${displayName}`);
  }

  // Role Mentions: <@&roleId>
  const roleRegex = /<@&(\d+)>/g;
  const roleMatches = [...str.matchAll(roleRegex)];
  for (const match of roleMatches) {
    const fullMention = match[0];
    const roleId = match[1];
    let roleName = roleId;
    if (globalThis.client) {
      try {
        for (const guild of globalThis.client.guilds.cache.values()) {
          const role = guild.roles.cache.get(roleId);
          if (role) {
            roleName = role.name;
            break;
          }
        }
      } catch (err) {
        console.error('[Canvas Helper] Role cache error:', err);
      }
    }
    str = str.replace(fullMention, `@${roleName}`);
  }

  // Channel Mentions: <#channelId>
  const channelRegex = /<#(\d+)>/g;
  const channelMatches = [...str.matchAll(channelRegex)];
  for (const match of channelMatches) {
    const fullMention = match[0];
    const channelId = match[1];
    let channelName = channelId;
    if (globalThis.client) {
      try {
        const channel = globalThis.client.channels.cache.get(channelId);
        if (channel) {
          channelName = channel.name;
        }
      } catch (err) {
        console.error('[Canvas Helper] Channel cache error:', err);
      }
    }
    str = str.replace(fullMention, `#${channelName}`);
  }

  return str;
}

const THEMES = {
  ban: {
    accent: '#ff4d5e',
    accent2: '#ff8a3d',
    bg1: '#22070d',
    bg2: '#08090d',
    label: 'GUVENLIK ISLEMI',
    badge: 'BAN'
  },
  kick: {
    accent: '#ff5f57',
    accent2: '#ffc857',
    bg1: '#25100c',
    bg2: '#09090c',
    label: 'MODERASYON',
    badge: 'KICK'
  },
  unban: {
    accent: '#43f39d',
    accent2: '#45caff',
    bg1: '#062319',
    bg2: '#070a0e',
    label: 'GUVENLIK ISLEMI',
    badge: 'UNBAN'
  },
  join: {
    accent: '#3df5a4',
    accent2: '#70e1ff',
    bg1: '#05251a',
    bg2: '#070b10',
    label: 'YENI UYE',
    badge: 'JOIN'
  },
  leave: {
    accent: '#b8c4d6',
    accent2: '#7a8ea8',
    bg1: '#151b22',
    bg2: '#080a0e',
    label: 'UYE HAREKETI',
    badge: 'LEAVE'
  },
  info: {
    accent: '#7c8cff',
    accent2: '#25d6ff',
    bg1: '#0b1230',
    bg2: '#070912',
    label: 'PROFIL ANALIZI',
    badge: 'INFO'
  },
  approve: {
    accent: '#47f58f',
    accent2: '#c6ff61',
    bg1: '#082417',
    bg2: '#070a0d',
    label: 'BASVURU SONUCU',
    badge: 'ONAY'
  },
  reject: {
    accent: '#ff4d5e',
    accent2: '#ff9f43',
    bg1: '#25070c',
    bg2: '#08090d',
    label: 'BASVURU SONUCU',
    badge: 'RED'
  },
  warn: {
    accent: '#ffd166',
    accent2: '#ff7b54',
    bg1: '#241b07',
    bg2: '#08090d',
    label: 'UYARI SISTEMI',
    badge: 'WARN'
  },
  warnDanger: {
    accent: '#ff3f5f',
    accent2: '#ffb703',
    bg1: '#27070f',
    bg2: '#08090d',
    label: 'KRITIK UYARI',
    badge: 'WARN'
  },
  event: {
    accent: '#ffd166',
    accent2: '#ff3f5f',
    bg1: '#100d1f',
    bg2: '#06070b',
    label: 'EKIP ETKINLIGI',
    badge: 'EVENT'
  },
  leaderboardEvent: {
    accent: '#ffd166',
    accent2: '#45caff',
    bg1: '#111827',
    bg2: '#05070c',
    label: 'LIDERLIK TABLOSU',
    badge: 'TOP'
  },
  leaderboardVoice: {
    accent: '#70e1ff',
    accent2: '#8b5cf6',
    bg1: '#071826',
    bg2: '#070812',
    label: 'SES AKTIFLIGI',
    badge: 'VOICE'
  },
  leaderboardFarm: {
    accent: '#52c41a',
    accent2: '#13c2c2',
    bg1: '#092b15',
    bg2: '#05070c',
    label: 'FARM SIRALAMASI',
    badge: 'FARM'
  }
};

function safeText(value, fallback = 'Belirtilmedi') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value).replace(/\s+/g, ' ').trim();
}

function formatDate(timestamp) {
  if (!timestamp) return 'Belirtilmedi';

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Belirtilmedi';

  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function fillRounded(ctx, x, y, width, height, radius, fillStyle) {
  roundedRect(ctx, x, y, width, height, radius);
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

function strokeRounded(ctx, x, y, width, height, radius, strokeStyle, lineWidth = 1) {
  roundedRect(ctx, x, y, width, height, radius);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function addLinearGradient(ctx, x1, y1, x2, y2, stops) {
  const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  return gradient;
}

function addRadialGradient(ctx, x1, y1, r1, x2, y2, r2, stops) {
  const gradient = ctx.createRadialGradient(x1, y1, r1, x2, y2, r2);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  return gradient;
}

function drawSoftGlow(ctx, x, y, radius, color) {
  const glow = addRadialGradient(ctx, x, y, 0, x, y, radius, [
    [0, `${color}66`],
    [0.45, `${color}22`],
    [1, `${color}00`]
  ]);
  ctx.fillStyle = glow;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function drawBackground(ctx, theme) {
  const { width, height } = CARD;
  const bg = addLinearGradient(ctx, 0, 0, width, height, [
    [0, theme.bg1],
    [0.42, '#0d1018'],
    [1, theme.bg2]
  ]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  drawSoftGlow(ctx, 160, 86, 260, theme.accent);
  drawSoftGlow(ctx, width - 130, height - 82, 240, theme.accent2);

  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  for (let x = -height; x < width + height; x += 46) {
    ctx.beginPath();
    ctx.moveTo(x, height + 30);
    ctx.lineTo(x + height, -30);
    ctx.stroke();
  }
  ctx.restore();

  const vignette = addRadialGradient(ctx, width / 2, height / 2, 120, width / 2, height / 2, 620, [
    [0, '#00000000'],
    [1, '#00000099']
  ]);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

async function loadImageSafe(source) {
  if (!source) return null;
  try {
    return await loadImage(source);
  } catch (error) {
    console.warn('[Canvas] Gorsel yuklenemedi:', error.message);
    return null;
  }
}

async function loadAvatar(avatarUrl) {
  return (await loadImageSafe(avatarUrl)) || (await loadImageSafe(DEFAULT_AVATAR));
}

async function loadLogo() {
  const vqLogoPath = path.join(__dirname, '../VQLOGO1.png');
  if (fs.existsSync(vqLogoPath)) {
    const logo = await loadImageSafe(vqLogoPath);
    if (logo) return logo;
  }
  for (const logoPath of LOGO_PATHS) {
    if (!fs.existsSync(logoPath)) continue;
    const logo = await loadImageSafe(logoPath);
    if (logo) return logo;
  }
  return null;
}

function setQuality(ctx) {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
}

function fitText(ctx, text, maxWidth, fontFactory, startSize, minSize = 20) {
  let size = startSize;
  while (size > minSize) {
    ctx.font = fontFactory(size);
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 2;
  }
  ctx.font = fontFactory(minSize);
  return minSize;
}

function ellipsize(ctx, text, maxWidth) {
  const clean = safeText(text);
  if (ctx.measureText(clean).width <= maxWidth) return clean;

  let lo = 0;
  let hi = clean.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(`${clean.slice(0, mid)}...`).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${clean.slice(0, lo).trim()}...`;
}

function wrapText(ctx, text, maxWidth, maxLines = 2) {
  const words = safeText(text).split(' ');
  const lines = [];
  let line = '';

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      line = test;
      continue;
    }

    if (line) lines.push(line);
    line = word;

    if (lines.length === maxLines) break;
  }

  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines) {
    const remaining = words.slice(words.indexOf(lines.at(-1)?.split(' ').at(-1)) + 1);
    if (remaining.length > 0) lines[lines.length - 1] = ellipsize(ctx, lines.at(-1), maxWidth);
  }

  return lines.map((item) => ellipsize(ctx, item, maxWidth));
}

function drawLogo(ctx, logo, x, y, maxWidth, maxHeight, alpha = 0.92) {
  if (!logo) return;

  const ratio = Math.min(maxWidth / logo.width, maxHeight / logo.height);
  const width = logo.width * ratio;
  const height = logo.height * ratio;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(logo, x - width, y - height, width, height);
  ctx.restore();
}

function drawBadge(ctx, text, x, y, theme) {
  ctx.font = 'bold 15px "Segoe UI", Arial, sans-serif';
  const width = Math.max(74, ctx.measureText(text).width + 34);
  const badgeGradient = addLinearGradient(ctx, x, y, x + width, y + 34, [
    [0, theme.accent],
    [1, theme.accent2]
  ]);

  ctx.save();
  ctx.shadowColor = `${theme.accent}88`;
  ctx.shadowBlur = 18;
  fillRounded(ctx, x, y, width, 34, 17, badgeGradient);
  ctx.restore();

  ctx.fillStyle = '#080a0f';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + width / 2, y + 17);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

function drawMetric(ctx, item, x, y, width, theme) {
  const panel = addLinearGradient(ctx, x, y, x + width, y + 72, [
    [0, '#ffffff18'],
    [1, '#ffffff08']
  ]);
  fillRounded(ctx, x, y, width, 72, 18, panel);
  strokeRounded(ctx, x, y, width, 72, 18, '#ffffff1c', 1);

  ctx.fillStyle = `${theme.accent}dd`;
  ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
  ctx.fillText(safeText(item.label, 'Bilgi').toLocaleUpperCase('tr-TR'), x + 18, y + 26);

  ctx.fillStyle = '#f8fbff';
  ctx.font = '600 20px "Segoe UI", Arial, sans-serif';
  const lines = wrapText(ctx, item.value, width - 36, item.large ? 1 : 2);
  lines.forEach((line, index) => ctx.fillText(line, x + 18, y + 49 + index * 19));
}

function drawDetails(ctx, details, theme) {
  const startX = 350;
  const startY = 184;
  const gap = 14;
  const columns = details.length >= 3 ? 2 : 1;
  const panelWidth = columns === 2 ? 288 : 600;
  const panelHeight = 72;

  details.forEach((item, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    drawMetric(
      ctx,
      item,
      startX + col * (panelWidth + gap),
      startY + row * (panelHeight + gap),
      panelWidth,
      theme
    );
  });
}

async function drawAvatar(ctx, avatarUrl, username, theme) {
  const avatar = await loadAvatar(avatarUrl);
  const x = 170;
  const y = 190;
  const radius = 92;

  ctx.save();
  ctx.shadowColor = `${theme.accent}99`;
  ctx.shadowBlur = 34;
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(x, y, radius + 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const ring = addLinearGradient(ctx, x - radius, y - radius, x + radius, y + radius, [
    [0, theme.accent],
    [0.5, '#ffffff'],
    [1, theme.accent2]
  ]);
  ctx.fillStyle = ring;
  ctx.beginPath();
  ctx.arc(x, y, radius + 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0b0d13';
  ctx.beginPath();
  ctx.arc(x, y, radius + 1, 0, Math.PI * 2);
  ctx.fill();

  if (avatar) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, x - radius, y - radius, radius * 2, radius * 2);
    ctx.restore();
  } else {
    const fallback = addLinearGradient(ctx, x - radius, y - radius, x + radius, y + radius, [
      [0, `${theme.accent}cc`],
      [1, '#10131b']
    ]);
    ctx.fillStyle = fallback;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    const initials = safeText(username, '?')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toLocaleUpperCase('tr-TR');

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 54px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials || '?', x, y + 2);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }

  ctx.fillStyle = theme.accent;
  ctx.beginPath();
  ctx.arc(x + 66, y + 66, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0b0d13';
  ctx.lineWidth = 6;
  ctx.stroke();
}

async function drawPremiumCard({ avatarUrl, username, title, subtitle, badge, theme, details }) {
  username = await resolveMentions(username);
  title = await resolveMentions(title);
  subtitle = await resolveMentions(subtitle);
  badge = await resolveMentions(badge);
  if (details && Array.isArray(details)) {
    details = await Promise.all(
      details.map(async (item) => ({
        ...item,
        label: await resolveMentions(item.label),
        value: await resolveMentions(item.value)
      }))
    );
  }

  const canvas = createCanvas(CARD.width, CARD.height);
  const ctx = canvas.getContext('2d');
  setQuality(ctx);

  drawBackground(ctx, theme);

  const glass = addLinearGradient(ctx, CARD.padding, CARD.padding, CARD.width - CARD.padding, CARD.height - CARD.padding, [
    [0, '#ffffff1f'],
    [0.48, '#ffffff0c'],
    [1, '#ffffff16']
  ]);
  fillRounded(ctx, CARD.padding, CARD.padding, CARD.width - CARD.padding * 2, CARD.height - CARD.padding * 2, CARD.radius, glass);
  strokeRounded(ctx, CARD.padding + 0.5, CARD.padding + 0.5, CARD.width - CARD.padding * 2 - 1, CARD.height - CARD.padding * 2 - 1, CARD.radius, '#ffffff2a', 1);

  ctx.fillStyle = theme.accent;
  fillRounded(ctx, CARD.padding, 72, 8, 236, 4, theme.accent);

  await drawAvatar(ctx, avatarUrl, username, theme);

  ctx.fillStyle = `${theme.accent}e8`;
  ctx.font = 'bold 15px "Segoe UI", Arial, sans-serif';
  ctx.fillText(safeText(subtitle, theme.label).toLocaleUpperCase('tr-TR'), 350, 82);

  drawBadge(ctx, badge || theme.badge, 846, 58, theme);

  const displayName = safeText(username, 'Bilinmeyen Kullanıcı');
  fitText(ctx, displayName, 570, (size) => `800 ${size}px "Segoe UI", Arial, sans-serif`, 46, 28);
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#00000088';
  ctx.shadowBlur = 14;
  ctx.fillText(ellipsize(ctx, displayName, 570), 350, 133);
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#c8d0dc';
  ctx.font = '600 22px "Segoe UI", Arial, sans-serif';
  ctx.fillText(ellipsize(ctx, safeText(title), 570), 350, 166);

  drawDetails(ctx, details, theme);

  const logo = await loadLogo();
  drawLogo(ctx, logo, 942, 334, 170, 52);

  ctx.fillStyle = '#ffffff45';
  ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
  ctx.fillText('VİQOLE EKİP BOTU', 68, 326);

  return canvas.toBuffer('image/png');
}

function moderationDetails({ executorTag, reason, timestamp }) {
  return [
    { label: 'Yetkili', value: executorTag || 'Bilinmeyen' },
    { label: 'Tarih', value: formatDate(timestamp || Date.now()) },
    { label: 'Sebep', value: reason || 'Belirtilmedi' }
  ];
}

export async function generateBanCard({ username, avatarUrl, executorTag, reason, timestamp }) {
  return drawPremiumCard({
    avatarUrl,
    username,
    title: 'Kullanıcı yasaklandı',
    subtitle: 'Güvenlik işlemi',
    badge: 'BAN',
    theme: THEMES.ban,
    details: moderationDetails({ executorTag, reason, timestamp })
  });
}

export async function generateJoinCard({ username, avatarUrl, createdTimestamp, joinRank }) {
  return drawPremiumCard({
    avatarUrl,
    username,
    title: 'Sunucuya katıldı',
    subtitle: 'Yeni üye',
    badge: 'WELCOME',
    theme: THEMES.join,
    details: [
      { label: 'Hesap Tarihi', value: formatDate(createdTimestamp) },
      { label: 'Katılım Sırası', value: joinRank ? `${joinRank}. üye` : 'Bilinmiyor' }
    ]
  });
}

export async function generateLeaveCanvas({ username, avatarUrl, userId, timestamp }) {
  return drawPremiumCard({
    avatarUrl,
    username,
    title: 'Sunucudan ayrıldı',
    subtitle: 'Üye hareketi',
    badge: 'LEAVE',
    theme: THEMES.leave,
    details: [
      { label: 'Kullanıcı ID', value: userId || 'Bilinmiyor' },
      { label: 'Tarih', value: formatDate(timestamp || Date.now()) }
    ]
  });
}

export async function generateUserInfoCard({
  username,
  avatarUrl,
  userId,
  voiceStr,
  messageCount,
  eventCount,
  approvedCount,
  rejectedCount
}) {
  return drawPremiumCard({
    avatarUrl,
    username,
    title: `Profil özeti ${userId ? `#${userId}` : ''}`.trim(),
    subtitle: 'Kullanıcı bilgileri',
    badge: 'STATS',
    theme: THEMES.info,
    details: [
      { label: 'Ses Aktifliği', value: voiceStr || '0 saniye' },
      { label: 'Mesaj / Etkinlik', value: `${messageCount || 0} mesaj / ${eventCount || 0} etkinlik` },
      { label: 'Onay / Red', value: `${approvedCount || 0} onay / ${rejectedCount || 0} red` }
    ]
  });
}

export async function generateKickCard({ username, avatarUrl, executorTag, reason, timestamp }) {
  return drawPremiumCard({
    avatarUrl,
    username,
    title: 'Sunucudan atıldı',
    subtitle: 'Moderasyon',
    badge: 'KICK',
    theme: THEMES.kick,
    details: moderationDetails({ executorTag, reason, timestamp })
  });
}

export async function generateUnbanCard({ username, avatarUrl, executorTag, reason, timestamp }) {
  return drawPremiumCard({
    avatarUrl,
    username,
    title: 'Yasak kaldırıldı',
    subtitle: 'Güvenlik işlemi',
    badge: 'UNBAN',
    theme: THEMES.unban,
    details: moderationDetails({ executorTag, reason, timestamp })
  });
}

export async function generateEventCard({ ekipIsmi, eventType }) {
  ekipIsmi = await resolveMentions(ekipIsmi);
  eventType = await resolveMentions(eventType);

  const canvas = createCanvas(CARD.width, CARD.height);
  const ctx = canvas.getContext('2d');
  setQuality(ctx);

  const theme = /redzone|rz/i.test(eventType || '') ? { ...THEMES.event, accent: '#ff3f5f', accent2: '#ffb703' } : THEMES.event;
  const eventBgPath = getLogoPath(globalThis.client);
  const bgImage = fs.existsSync(eventBgPath) ? await loadImageSafe(eventBgPath) : null;

  if (bgImage) {
    ctx.drawImage(bgImage, 0, 0, CARD.width, CARD.height);
    ctx.fillStyle = '#05060bcc';
    ctx.fillRect(0, 0, CARD.width, CARD.height);
  } else {
    drawBackground(ctx, theme);
  }

  drawSoftGlow(ctx, CARD.width / 2, CARD.height / 2, 320, theme.accent);
  drawSoftGlow(ctx, CARD.width - 140, 90, 230, theme.accent2);

  strokeRounded(ctx, 30.5, 30.5, CARD.width - 61, CARD.height - 61, 34, '#ffffff2b', 1);
  fillRounded(ctx, 70, 70, CARD.width - 140, CARD.height - 140, 30, '#06080f99');
  strokeRounded(ctx, 70.5, 70.5, CARD.width - 141, CARD.height - 141, 30, '#ffffff20', 1);

  ctx.textAlign = 'center';
  ctx.fillStyle = theme.accent;
  ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
  ctx.fillText(safeText(ekipIsmi, 'Ekip').toLocaleUpperCase('tr-TR'), CARD.width / 2, 126);

  const type = safeText(eventType, 'Etkinlik');
  fitText(ctx, type.toLocaleUpperCase('tr-TR'), 760, (size) => `900 ${size}px "Segoe UI", Arial, sans-serif`, 66, 34);
  const headline = addLinearGradient(ctx, 210, 0, 790, 0, [
    [0, theme.accent],
    [1, theme.accent2]
  ]);
  ctx.fillStyle = headline;
  ctx.shadowColor = `${theme.accent}88`;
  ctx.shadowBlur = 22;
  ctx.fillText(ellipsize(ctx, type.toLocaleUpperCase('tr-TR'), 760), CARD.width / 2, 206);
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#d9e1ec';
  ctx.font = '600 22px "Segoe UI", Arial, sans-serif';
  ctx.fillText('Etkinlik çağrısı başladı', CARD.width / 2, 252);
  ctx.textAlign = 'start';

  const logo = await loadLogo();
  drawLogo(ctx, logo, 942, 334, 170, 52);

  return canvas.toBuffer('image/png');
}

function formatLeaderboardValue(value, type) {
  if (type === 'voice') {
    const totalSeconds = Number(value || 0);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours > 0) return `${hours} sa ${minutes} dk`;
    if (minutes > 0) return `${minutes} dk`;
    return `${totalSeconds} sn`;
  }
  if (type === 'farm') {
    return `${Number(value || 0).toLocaleString('tr-TR')} farm`;
  }

  return `${Number(value || 0).toLocaleString('tr-TR')} etkinlik`;
}

function rankLabel(rank) {
  if (rank === 1) return '1';
  if (rank === 2) return '2';
  if (rank === 3) return '3';
  return String(rank);
}

function drawLeaderboardHeader(ctx, { title, subtitle, page, totalPages, totalCount, theme }) {
  ctx.fillStyle = `${theme.accent}e8`;
  ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
  ctx.fillText(safeText(subtitle, theme.label).toLocaleUpperCase('tr-TR'), 62, 70);

  const titleText = safeText(title, 'Liderlik Tablosu');
  fitText(ctx, titleText, 890, (size) => `900 ${size}px "Segoe UI", Arial, sans-serif`, 42, 27);
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#00000099';
  ctx.shadowBlur = 16;
  ctx.fillText(ellipsize(ctx, titleText, 890), 62, 118);
  ctx.shadowBlur = 0;

  const badgeText = `SAYFA ${page + 1}/${totalPages}`;
  ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
  const badgeWidth = Math.max(120, ctx.measureText(badgeText).width + 34);
  const badgeGradient = addLinearGradient(ctx, 1340 - badgeWidth, 56, 1340, 92, [
    [0, theme.accent],
    [1, theme.accent2]
  ]);
  fillRounded(ctx, 1340 - badgeWidth, 54, badgeWidth, 38, 19, badgeGradient);
  ctx.fillStyle = '#070a10';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, 1340 - badgeWidth / 2, 73);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = '#b8c4d6';
  ctx.font = '600 18px "Segoe UI", Arial, sans-serif';
  ctx.fillText(`${totalCount.toLocaleString('tr-TR')} kisi listeleniyor`, 62, 150);
}

function drawLeaderboardEmpty(ctx, theme) {
  fillRounded(ctx, 62, 205, 1276, 190, 28, '#ffffff10');
  strokeRounded(ctx, 62.5, 205.5, 1275, 189, 28, '#ffffff22', 1);

  ctx.textAlign = 'center';
  ctx.fillStyle = theme.accent;
  ctx.font = '900 44px "Segoe UI", Arial, sans-serif';
  ctx.fillText('Kayit bulunmuyor', 700, 290);
  ctx.fillStyle = '#c8d0dc';
  ctx.font = '600 22px "Segoe UI", Arial, sans-serif';
  ctx.fillText('Veri olustugunda bu tablo otomatik dolacak.', 700, 330);
  ctx.textAlign = 'start';
}

async function drawLeaderboardRow(ctx, item, index, theme, type) {
  const y = 178 + index * 72;
  const rank = Number(item.rank || index + 1);
  const isTopThree = rank <= 3;
  const rowGradient = addLinearGradient(ctx, 62, y, 1338, y + 58, [
    [0, isTopThree ? `${theme.accent}26` : '#ffffff12'],
    [1, isTopThree ? `${theme.accent2}16` : '#ffffff08']
  ]);

  fillRounded(ctx, 62, y, 1276, 58, 18, rowGradient);
  strokeRounded(ctx, 62.5, y + 0.5, 1275, 57, 18, isTopThree ? `${theme.accent}66` : '#ffffff18', 1);

  const rankGradient = addLinearGradient(ctx, 82, y + 10, 130, y + 48, [
    [0, isTopThree ? theme.accent : '#313847'],
    [1, isTopThree ? theme.accent2 : '#202633']
  ]);
  fillRounded(ctx, 82, y + 10, 48, 38, 14, rankGradient);
  ctx.fillStyle = isTopThree ? '#070a10' : '#e7edf7';
  ctx.font = '900 18px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(rankLabel(rank), 106, y + 29);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';

  const avatar = await loadAvatar(item.avatarUrl);
  ctx.save();
  ctx.beginPath();
  ctx.arc(166, y + 29, 22, 0, Math.PI * 2);
  ctx.clip();
  if (avatar) ctx.drawImage(avatar, 144, y + 7, 44, 44);
  ctx.restore();
  ctx.strokeStyle = `${theme.accent}aa`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(166, y + 29, 23, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#f8fbff';
  ctx.font = '800 22px "Segoe UI", Arial, sans-serif';
  ctx.fillText(ellipsize(ctx, safeText(item.displayName, `Kullanici ${item.userId || ''}`), 560), 205, y + 34);

  ctx.textAlign = 'right';
  ctx.fillStyle = theme.accent;
  ctx.font = '900 24px "Segoe UI", Arial, sans-serif';
  ctx.fillText(formatLeaderboardValue(item.value, type), 1230, y + 34);
  ctx.textAlign = 'start';
}

export async function generateLeaderboardCard({
  title,
  subtitle,
  entries = [],
  page = 0,
  totalPages = 1,
  totalCount = 0,
  type = 'event',
  showLastUpdate = false
}) {
  const theme = type === 'farm' ? THEMES.leaderboardFarm : (type === 'voice' ? THEMES.leaderboardVoice : THEMES.leaderboardEvent);
  const width = 1400;
  const height = 1080;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  setQuality(ctx);

  const bg = addLinearGradient(ctx, 0, 0, width, height, [
    [0, theme.bg1],
    [0.45, '#101522'],
    [1, theme.bg2]
  ]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  drawSoftGlow(ctx, 190, 110, 320, theme.accent);
  drawSoftGlow(ctx, 1200, 900, 360, theme.accent2);

  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  for (let x = -height; x < width + height; x += 52) {
    ctx.beginPath();
    ctx.moveTo(x, height + 30);
    ctx.lineTo(x + height, -30);
    ctx.stroke();
  }
  ctx.restore();

  fillRounded(ctx, 34, 34, width - 68, height - 68, 34, '#05070db3');
  strokeRounded(ctx, 34.5, 34.5, width - 69, height - 69, 34, '#ffffff22', 1);
  fillRounded(ctx, 34, 96, 8, height - 192, 4, theme.accent);

  drawLeaderboardHeader(ctx, { title, subtitle, page, totalPages, totalCount, theme });

  if (entries.length === 0) {
    drawLeaderboardEmpty(ctx, theme);
  } else {
    for (let i = 0; i < entries.length; i += 1) {
      await drawLeaderboardRow(ctx, entries[i], i, theme, type);
    }
  }

  const logo = await loadLogo();
  drawLogo(ctx, logo, 1338, 1028, 170, 54, 0.9);

  ctx.fillStyle = '#ffffff55';
  ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
  if (showLastUpdate) {
    ctx.fillText(`Son guncelleme: ${new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }).format(new Date())}`, 62, 1024);
  }
  ctx.textAlign = 'center';
  ctx.fillText('VİQOLE EKİP BOTU', width / 2, 1024);
  ctx.textAlign = 'start';

  return canvas.toBuffer('image/png');
}

export async function generateApprovalCard({ username, avatarUrl, approvedBy }) {
  return drawPremiumCard({
    avatarUrl,
    username,
    title: 'Başvuru kabul edildi',
    subtitle: 'Başvuru sonucu',
    badge: 'ONAY',
    theme: THEMES.approve,
    details: [
      { label: 'Durum', value: 'ONAYLANDI' },
      { label: 'Kabul Eden', value: approvedBy || 'Yetkili' },
      { label: 'Tarih', value: formatDate(Date.now()) }
    ]
  });
}

export async function generateRejectionCard({ username, avatarUrl, rejectedBy, reason }) {
  return drawPremiumCard({
    avatarUrl,
    username,
    title: 'Başvuru reddedildi',
    subtitle: 'Başvuru sonucu',
    badge: 'RED',
    theme: THEMES.reject,
    details: [
      { label: 'Durum', value: 'REDDEDİLDİ' },
      { label: 'Reddeden', value: rejectedBy || 'Yetkili' },
      { label: 'Sebep', value: reason || 'Belirtilmedi' },
      { label: 'Tarih', value: formatDate(Date.now()) }
    ]
  });
}

export async function generateWarningCard({ username, avatarUrl, executorTag, warnCount, reason }) {
  const isDanger = Number(warnCount || 0) >= 3;
  return drawPremiumCard({
    avatarUrl,
    username,
    title: isDanger ? 'Kritik uyarı eşiği' : 'Kullanıcı uyarıldı',
    subtitle: isDanger ? 'Kritik uyarı' : 'Uyarı sistemi',
    badge: isDanger ? 'KRITIK' : 'UYARI',
    theme: isDanger ? THEMES.warnDanger : THEMES.warn,
    details: [
      { label: 'Yetkili', value: executorTag || 'Bilinmeyen' },
      { label: 'Toplam Uyarı', value: `${warnCount || 0}/3` },
      { label: 'Sebep', value: reason || 'Belirtilmedi' },
      { label: 'Tarih', value: formatDate(Date.now()) }
    ]
  });
}
