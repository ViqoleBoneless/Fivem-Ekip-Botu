import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import crypto from 'crypto';
import { createWebToken } from '../db.js';

// Owner-only sekmeler: bunlar hiçbir zaman normal kullanıcılara verilmez
const OWNER_ONLY_TABS = ['allperm', 'config', 'database'];

// Tüm geçerli sekmeler
const ALL_TABS = ['dashboard', 'ticket', 'activity', 'youtube', 'banaf', 'cekilis', 'events', 'farm', 'ickontrol', 'bioguild', 'dmduyuru'];

export const data = new SlashCommandBuilder()
  .setName('ekipyonetim-panel')
  .setDescription('Ekip yönetim panelini açmak için kişiye özel giriş bağlantısı oluşturur.')
  .addStringOption(option =>
    option.setName('sure')
      .setDescription('Bağlantının geçerlilik süresi (varsayılan: 1 saat)')
      .setRequired(false)
      .addChoices(
        { name: '15 Dakika', value: '15m' },
        { name: '30 Dakika', value: '30m' },
        { name: '1 Saat', value: '1h' }
      )
  );

export async function execute(interaction, client) {
  const userId = interaction.user.id;
  const config = client.config || {};

  // ── OwnerIds kontrolü ──────────────────────────────────────────
  const ownerIds = (config.ownerIds || '')
    .split(',').map(id => id.trim()).filter(Boolean);
  const isOwner = ownerIds.includes(userId);

  // ── webPanel izin kontrolü ────────────────────────────────────
  // Kişiye özel izinler (webTabPermissions.users)
  let webTabPerms = {};
  try {
    webTabPerms = JSON.parse(config.webTabPermissions || '{}');
  } catch (_) { webTabPerms = {}; }

  const webPanelUsers = (config.webPanelUsers || '')
    .split(',').map(id => id.trim()).filter(Boolean);
  const webPanelRoles = (config.webPanelRoles || '')
    .split(',').map(id => id.trim()).filter(Boolean);

  // Kullanıcının Discord'daki rollerini al
  const member = interaction.member;
  const memberRoleIds = member?.roles?.cache?.map(r => r.id) || [];

  // Kullanıcı izinlerini topla (birleştir)
  let allowedTabs = new Set();
  let hasWebAccess = false;

  if (isOwner) {
    // Owner: tüm sekmeler (özel owner-only dahil)
    hasWebAccess = true;
    allowedTabs.add('*');
  } else {
    // Kullanıcı doğrudan webPanelUsers'da mı?
    if (webPanelUsers.includes(userId)) {
      hasWebAccess = true;
      const userTabs = (webTabPerms.users?.[userId] || ['*']);
      userTabs.forEach(t => allowedTabs.add(t));
    }

    // Kullanıcının herhangi bir rolü webPanelRoles'da mı?
    for (const roleId of memberRoleIds) {
      if (webPanelRoles.includes(roleId)) {
        hasWebAccess = true;
        const roleTabs = (webTabPerms.roles?.[roleId] || ['*']);
        roleTabs.forEach(t => allowedTabs.add(t));
      }
    }

    // '*' varsa tümü demek, ancak owner-only sekmeleri çıkar
    if (allowedTabs.has('*')) {
      allowedTabs = new Set(ALL_TABS);
    }

    // Owner-only sekmeleri her durumda çıkar (owner değilse)
    OWNER_ONLY_TABS.forEach(t => allowedTabs.delete(t));
  }

  if (!hasWebAccess) {
    return interaction.reply({
      content: '❌ **Web panel erişim yetkiniz bulunmuyor.**\nBir ekip sahibi size Yetki Yönetimi panelinden erişim yetkisi tanımlamalıdır.',
      flags: MessageFlags.Ephemeral
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const durationChoice = interaction.options.getString('sure') || '1h';

  let durationMs = 60 * 60 * 1000;
  let durationText = '1 saat';

  if (durationChoice === '15m') {
    durationMs = 15 * 60 * 1000;
    durationText = '15 dakika';
  } else if (durationChoice === '30m') {
    durationMs = 30 * 60 * 1000;
    durationText = '30 dakika';
  }

  const token = crypto.randomUUID();
  const expiresAt = Date.now() + durationMs;

  // allowedTabs dizisini belirle
  const allowedTabsArr = isOwner ? ['*'] : [...allowedTabs];

  try {
    createWebToken(token, client.user.id, interaction.guild.id, userId, expiresAt, allowedTabsArr);

    const webPort = client.config.webPort || 3000;
    const rawPanelUrl = client.config.panelUrl || `http://localhost:${webPort}`;
    const cleanPanelUrl = rawPanelUrl.endsWith('/') ? rawPanelUrl.slice(0, -1) : rawPanelUrl;
    const accessUrl = `${cleanPanelUrl}/panel/${client.user.id}/${interaction.guild.id}/${token}`;

    // Sekme bilgisini kullanıcıya göster
    let tabInfo = '';
    if (isOwner) {
      tabInfo = '🌟 *Tüm sekmelere erişiminiz var (Ekip Sahibi).*';
    } else {
      const tabNames = allowedTabsArr.join(', ');
      tabInfo = `📑 *Erişilebilir sekmeler:* \`${tabNames}\``;
    }

    await interaction.editReply({
      content: `🔑 **Yönetim Paneli Giriş Bağlantınız:**\n${accessUrl}\n\n⏱️ *Bu bağlantı **${durationText}** geçerlidir ve tek kullanımlıktır.*\n${tabInfo}`
    });

    // Log kanalı bildirimi
    const botLogChannelId = client.config.botLogChannelId;
    if (botLogChannelId) {
      const logChannel = interaction.guild.channels.cache.get(botLogChannelId) ||
                         await interaction.guild.channels.fetch(botLogChannelId).catch(() => null);
      if (logChannel?.isTextBased()) {
        await logChannel.send({
          content: `🔑 **Panel Yetki Talebi:** ${interaction.user} (\`${interaction.user.tag}\`) tarafından yönetim paneli giriş bağlantısı oluşturuldu. Süre: \`${durationText}\` | Sekmeler: \`${allowedTabsArr.join(', ')}\``
        }).catch(() => null);
      }
    }
  } catch (err) {
    console.error('Yönetim paneli token oluşturma hatası:', err);
    await interaction.editReply({
      content: '❌ Giriş bağlantısı oluşturulurken bir hata meydana geldi.'
    });
  }
}
