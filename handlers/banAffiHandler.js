import {
  EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, MessageFlags,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize
} from 'discord.js';
import { E } from '../utils/emojis.js';
import { loadBanAffi, saveBanAffi } from '../db.js';

// Check if user has Ban Sorumlusu role or Administrator permission
function hasBanStaffPermission(interaction, client) {
  const banCommandRoleId = client.config.banCommandRoleId;
  const hasRole = banCommandRoleId && interaction.member.roles.cache.has(banCommandRoleId);
  return hasRole || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
}

// Ban affi log kanalına log gönder (ContainerBuilder V2)
async function sendBanAffiLog(client, guild, title, color, fields) {
  const logChannelId = client.config.banAfLogChannelId;
  if (!logChannelId) return;
  try {
    const logChannel = await guild.channels.fetch(logChannelId);
    if (!logChannel?.isTextBased()) return;
    const content = fields.map(f => `> **${f.name}:** ${f.value}`).join('\n');
    const container = new ContainerBuilder()
      .setAccentColor(color)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bots'));
    await logChannel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
  } catch (error) { console.error('Ban affı log hatası:', error); }
}

export async function handleBanAffiTalepOlustur(interaction) {
  const allRequests = loadBanAffi();
  const userOpenRequest = allRequests.find(r => r.userId === interaction.user.id && r.opened === false);
  if (userOpenRequest) return interaction.reply({ content: '❌ Bir kişinin birden fazla açık ban talebi olamaz.', flags: MessageFlags.Ephemeral });

  const modal = new ModalBuilder().setCustomId('banaf_modal').setTitle('Ban Affı Talebi Oluştur');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('banaf_ban_type').setLabel('Ban Türünüz').setStyle(TextInputStyle.Short).setPlaceholder('Örn: Genel af, Perma').setRequired(true).setMaxLength(100)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('banaf_ban_reason').setLabel('Ban Sebebi').setStyle(TextInputStyle.Paragraph).setPlaceholder('Örn: 3. parti, kural ihlali vs.').setRequired(true).setMaxLength(500))
  );
  await interaction.showModal(modal);
}

export async function handleBanAffiModalSubmit(interaction, client) {
  const banType = interaction.fields.getTextInputValue('banaf_ban_type');
  const banReason = interaction.fields.getTextInputValue('banaf_ban_reason');

  const allRequests = loadBanAffi();
  const newId = allRequests.length > 0 ? Math.max(...allRequests.map(r => r.id || 0)) + 1 : 1;

  const requestObject = {
    id: newId,
    userId: interaction.user.id,
    banType,
    banReason,
    opened: false,
    createdAt: Date.now(),
    mgmtMessageId: null,
    mgmtChannelId: null
  };

  allRequests.push(requestObject);
  saveBanAffi(allRequests);

  await interaction.reply({ content: `✅ Talebiniz alındı. Numaranız: **#${newId}**`, flags: MessageFlags.Ephemeral });

  // ban-affı-yönetim kanalına butonlu ContainerBuilder V2 mesajı gönder
  const mgmtChannelId = client.config.banAffiManagementChannelId;
  if (mgmtChannelId) {
    try {
      const mgmtChannel = await interaction.guild.channels.fetch(mgmtChannelId);
      if (mgmtChannel?.isTextBased()) {
        const mgmtRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`banaf_opened_${newId}`).setLabel('Açıldı').setStyle(ButtonStyle.Success).setEmoji({ id: '1507733693903540265' }),
          new ButtonBuilder().setCustomId(`banaf_delete_${newId}`).setLabel('Sil').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
          new ButtonBuilder().setCustomId(`banaf_copy_${newId}`).setLabel('Kopyala').setStyle(ButtonStyle.Secondary).setEmoji('📋')
        );

        const mgmtContainer = new ContainerBuilder()
          .setAccentColor(0x5865F2)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## ${E.banAffi} Yeni Ban Affı Talebi • #${newId}`)
          )
          .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
          )
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `### <:ye:1507732515585265825> Kullanıcı Bilgileri\n` +
              `> ${E.uye} **Talep Eden:** ${interaction.user} (\`${interaction.user.tag}\`)\n` +
              `> 🆔 **Discord ID:** \`${interaction.user.id}\`\n` +
              `> ${E.tarih} **Tarih:** <t:${Math.floor(Date.now() / 1000)}:R>`
            )
          )
          .addSeparatorComponents(
            new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small)
          )
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `### <:733737files:1508008108310528070> Talep Detayları\n` +
              `> ${E.ban} **Ban Türü:** \`${banType}\`\n` +
              `> ${E.ceza} **Ban Sebebi:**\n` +
              `\`\`\`fix\n${banReason}\n\`\`\``
            )
          )
          .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
          )
          .addActionRowComponents(mgmtRow)
          .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
          )
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('-# Viqole Bots')
          );
        const mgmtMsg = await mgmtChannel.send({ components: [mgmtContainer], flags: MessageFlags.IsComponentsV2 });

        // Save management channel and message ID so we can edit it if the user modifies/deletes their request
        const currentRequests = loadBanAffi();
        const reqIdx = currentRequests.findIndex(r => r.id === newId);
        if (reqIdx !== -1) {
          currentRequests[reqIdx].mgmtMessageId = mgmtMsg.id;
          currentRequests[reqIdx].mgmtChannelId = mgmtChannel.id;
          saveBanAffi(currentRequests);
        }
      }
    } catch (error) { console.error('Ban affı yönetim hatası:', error); }
  }

  // ban-affi-log kanalına sadece detay logu gönder (buton yok)
  await sendBanAffiLog(client, interaction.guild,
    `${E.banAffi} Yeni Ban Affı Talebi Oluşturuldu`,
    0xFEE75C,
    [
      { name: `${E.uye} Gönderen`, value: `${interaction.user} (\`${interaction.user.tag}\`)` },
      { name: `${E.liste} Talep #`, value: `#${newId}` },
      { name: `${E.ban} Ban Türü`, value: banType },
      { name: `${E.ceza} Ban Sebebi`, value: banReason }
    ]
  );
}

export async function handleBanAffiBanlilar(interaction, client) {
  if (!hasBanStaffPermission(interaction, client))
    return interaction.reply({ content: '❌ Bu butonu kullanabilmek için **Ban Sorumlusu** rolüne sahip olmalısınız.', flags: MessageFlags.Ephemeral });

  const allRequests = loadBanAffi();
  const closedRequests = allRequests.filter(req => req.opened === false);
  if (closedRequests.length === 0) return interaction.reply({ content: '❌ Henüz ban affı talebi bulunmuyor.', flags: MessageFlags.Ephemeral });

  await showBanAffiPage(interaction, closedRequests, 0, closedRequests.length, client);
}

async function showBanAffiPage(interaction, requests, pageIndex, totalPages, client) {
  if (pageIndex < 0 || pageIndex >= requests.length) return interaction.reply({ content: '❌ Geçersiz sayfa.', flags: MessageFlags.Ephemeral });
  const request = requests[pageIndex];
  try {
    const user = await client.users.fetch(request.userId);

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`banaf_opened_${request.id}_page_${pageIndex}`).setLabel('Açıldı').setStyle(ButtonStyle.Success).setEmoji({ id: '1507733693903540265' }),
      new ButtonBuilder().setCustomId(`banaf_delete_${request.id}_page_${pageIndex}`).setLabel('Sil').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
      new ButtonBuilder().setCustomId(`banaf_copy_${request.id}_page_${pageIndex}`).setLabel('Kopyala').setStyle(ButtonStyle.Secondary).setEmoji('📋')
    );
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`banaf_banlilar_prev_${pageIndex - 1}`).setLabel('⬅️ Önceki').setStyle(ButtonStyle.Secondary).setDisabled(pageIndex <= 0),
      new ButtonBuilder().setCustomId(`banaf_banlilar_next_${pageIndex + 1}`).setLabel('Sonraki ➡️').setStyle(ButtonStyle.Primary).setDisabled(pageIndex >= totalPages - 1)
    );

    const pageContainer = new ContainerBuilder()
      .setAccentColor(0x5865F2)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${E.banAffi} #${request.id} - ${user.tag} Dosyası`)
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `> ${E.uye} **Talep Sahibi:** ${user} (\`${user.tag}\`)\n` +
          `> ${E.liste} **Talep #:** ${request.id}\n` +
          `> ${E.ban} **Ban Türü:** ${request.banType}\n` +
          `> ${E.ceza} **Ban Sebebi:** ${request.banReason}\n` +
          `> ${E.yetkili} **Banlayan:** ${request.bannedBy}`
        )
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      )
      .addActionRowComponents(row1)
      .addActionRowComponents(row2)
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# Viqole Bots • Sayfa ${pageIndex + 1} / ${totalPages}`)
      );

    const replyOptions = { components: [pageContainer], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) await interaction.editReply(replyOptions);
    else await interaction.reply(replyOptions);
  } catch (error) {
    console.error('Ban affı sayfa hatası:', error);
    if (!interaction.replied) await interaction.reply({ content: '❌ Sayfa gösterilirken hata oluştu.', flags: MessageFlags.Ephemeral });
  }
}

export async function handleBanAffiBanlilarPage(interaction, client) {
  if (!hasBanStaffPermission(interaction, client))
    return interaction.reply({ content: '❌ Bu butonu kullanabilmek için **Ban Sorumlusu** rolüne sahip olmalısınız.', flags: MessageFlags.Ephemeral });

  const parts = interaction.customId.split('_');
  const currentPage = parseInt(parts[3], 10);
  const allRequests = loadBanAffi();
  const closedRequests = allRequests.filter(req => req.opened === false);
  if (closedRequests.length === 0) return interaction.reply({ content: '❌ Talep bulunmuyor.', flags: MessageFlags.Ephemeral });
  await showBanAffiPage(interaction, closedRequests, currentPage, closedRequests.length, client);
}

export async function handleBanAffiOpened(interaction, client) {
  if (!hasBanStaffPermission(interaction, client))
    return interaction.reply({ content: '❌ Bu işlemi gerçekleştirmek için yetkiniz yok.', flags: MessageFlags.Ephemeral });

  await interaction.reply({ content: '⏳ İşlem yapılıyor...', flags: MessageFlags.Ephemeral });

  const parts = interaction.customId.split('_');
  const requestId = parseInt(parts[2], 10);
  const allRequests = loadBanAffi();
  const request = allRequests.find(r => r.id === requestId);
  if (!request) return interaction.editReply({ content: '❌ Talep bulunamadı.' });
  if (request.opened) return interaction.editReply({ content: '❌ Bu talep zaten açılmış.' });

  request.opened = true;
  saveBanAffi(allRequests);

  const banAfChannelId = client.config.banAfChannelId || process.env.BAN_AF_CHANNEL;
  if (banAfChannelId) {
    try {
      const banAfChannel = await interaction.guild.channels.fetch(banAfChannelId);
      if (banAfChannel?.isTextBased()) {
        const user = await client.users.fetch(request.userId);
        await banAfChannel.send(`${user} kullanıcısının banı, ${interaction.user} tarafından ban affı kullanılarak açıldı.`);
      }
    } catch { }
  }

  try {
    const dmUser = await client.users.fetch(request.userId);
    const dmApproved = new ContainerBuilder()
      .setAccentColor(0x57F287)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${E.panda} Ban Affı Onaylandı`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `"${request.banReason}" sebebi ile yasaklanmıştın.\n\nBanın açıldı, sunucuya girebilirsin!`
      ))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bots'));
    await dmUser.send({ components: [dmApproved], flags: MessageFlags.IsComponentsV2 });
  } catch { }

  // Log kanalına işlem bilgisi gönder
  await sendBanAffiLog(client, interaction.guild,
    `${E.panda} Ban Affı Açıldı`,
    0x57F287,
    [
      { name: `${E.liste} Talep #`, value: `#${requestId}` },
      { name: `${E.uye} Talep Sahibi`, value: `<@${request.userId}>` },
      { name: `${E.yetkili} Açan Yetkili`, value: `${interaction.user} (\`${interaction.user.tag}\`)` },
      { name: `${E.ban} Ban Türü`, value: request.banType },
      { name: `${E.ceza} Ban Sebebi`, value: request.banReason }
    ]
  );

  // If this action was from the page view, update the view
  if (parts.includes('page')) {
    const currentPage = parseInt(parts[4], 10);
    const closedRequests = allRequests.filter(req => req.opened === false);
    if (closedRequests.length > 0) {
      const nextIdx = Math.min(currentPage, closedRequests.length - 1);
      await showBanAffiPage(interaction, closedRequests, nextIdx, closedRequests.length, client);
      try {
        await interaction.message.delete().catch(() => null);
      } catch { }
      return;
    }
  }

  await interaction.editReply({ content: '✅ Ban affı onaylandı ve kullanıcıya bildirildi.' });
  try {
    await interaction.message.delete().catch(() => null);
  } catch { }
}



export async function handleBanAffiCopy(interaction, client) {
  const requestId = parseInt(interaction.customId.split('_')[2], 10);
  const allRequests = loadBanAffi();
  const request = allRequests.find(r => r.id === requestId);
  if (!request) return interaction.reply({ content: '❌ Talep bulunamadı.', flags: MessageFlags.Ephemeral });
  await interaction.reply({ content: `${request.userId}\n${request.banType}`, flags: MessageFlags.Ephemeral });
}

export async function handleBanAffiDelete(interaction, client) {
  if (!hasBanStaffPermission(interaction, client))
    return interaction.reply({ content: '❌ Bu işlemi gerçekleştirmek için yetkiniz yok.', flags: MessageFlags.Ephemeral });

  await interaction.reply({ content: '⏳ İşlem yapılıyor...', flags: MessageFlags.Ephemeral });

  const parts = interaction.customId.split('_');
  const requestId = parseInt(parts[2], 10);
  const allRequests = loadBanAffi();
  const requestIndex = allRequests.findIndex(r => r.id === requestId);
  if (requestIndex === -1) return interaction.editReply({ content: '❌ Dosya bulunamadı.' });

  allRequests.splice(requestIndex, 1);
  saveBanAffi(allRequests);

  // If this action was from the page view, update the view
  if (parts.includes('page')) {
    const currentPage = parseInt(parts[4], 10);
    const closedRequests = allRequests.filter(req => req.opened === false);
    if (closedRequests.length > 0) {
      const nextIdx = Math.min(currentPage, closedRequests.length - 1);
      await showBanAffiPage(interaction, closedRequests, nextIdx, closedRequests.length, client);
      try {
        await interaction.message.delete().catch(() => null);
      } catch { }
      return;
    } else {
      await interaction.editReply({ content: '❌ Başka ban talebi kalmadı.', embeds: [], components: [] });
      try {
        await interaction.message.delete().catch(() => null);
      } catch { }
      return;
    }
  }

  await interaction.editReply({ content: `✅ #${requestId} numaralı dosya silindi.` });
  try {
    await interaction.message.delete().catch(() => null);
  } catch { }
}

export async function handleAcilanBanlarPage(interaction, client) {
  if (!hasBanStaffPermission(interaction, client))
    return interaction.reply({ content: '❌ Bu butonu kullanabilmek için **Ban Sorumlusu** rolüne sahip olmalısınız.', flags: MessageFlags.Ephemeral });

  const parts = interaction.customId.split('_');
  const action = parts[2];
  const currentPage = parseInt(parts[3], 10);
  const allRequests = loadBanAffi();
  const openedRequests = allRequests.filter(req => req.opened === true);

  if (openedRequests.length === 0) {
    const replyFn = (interaction.replied || interaction.deferred) ? interaction.editReply.bind(interaction) : interaction.reply.bind(interaction);
    return replyFn({ content: '❌ Açılan ban bulunmuyor.', embeds: [], components: [], flags: MessageFlags.Ephemeral });
  }

  const pageSize = 5;
  const totalPages = Math.ceil(openedRequests.length / pageSize) + 1;
  let newPage = action === 'prev' ? Math.max(0, currentPage - 1) : Math.min(totalPages - 1, currentPage + 1);

  if (newPage === 0) {
    const content = openedRequests.slice(0, 20).map(req => `#${req.id} - <@${req.userId}>`).join('\n') || 'Yok.';
    const container = new ContainerBuilder()
      .setAccentColor(0x57F287)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ✅ Açılan Banlar`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('banaf_acilan_prev_0').setLabel('⬅️ Önceki').setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId('banaf_acilan_page').setLabel(`1 / ${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId('banaf_acilan_next_0').setLabel('Sonraki ➡️').setStyle(ButtonStyle.Secondary).setDisabled(totalPages <= 1)
    );

    container.addActionRowComponents(row);
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Viqole Bots • Sayfa 1 / ${totalPages}`));

    const opts = { components: [container], flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 };
    if (interaction.replied || interaction.deferred) await interaction.editReply(opts);
    else await interaction.reply(opts);
  } else {
    const startIndex = (newPage - 1) * pageSize;
    const pageRequests = openedRequests.slice(startIndex, startIndex + pageSize);
    let detailContent = "";
    for (const req of pageRequests) {
      detailContent += `### #${req.id} Numaralı Dosya\n` +
        `> **Sahibi:** <@${req.userId}> (\`${req.userId}\`)\n` +
        `> **Ban Türü:** ${req.banType}\n` +
        `> **Sebep:** ${req.banReason}\n\n`;
    }
    if (!detailContent) detailContent = "Yok.";

    const container = new ContainerBuilder()
      .setAccentColor(0x57F287)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ✅ Açılan Banlar - Detaylı`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(detailContent))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`banaf_acilan_prev_${newPage}`).setLabel('⬅️ Önceki').setStyle(ButtonStyle.Secondary).setDisabled(newPage <= 1),
      new ButtonBuilder().setCustomId('banaf_acilan_page').setLabel(`${newPage + 1} / ${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId(`banaf_acilan_next_${newPage}`).setLabel('Sonraki ➡️').setStyle(ButtonStyle.Secondary).setDisabled(newPage + 1 >= totalPages)
    );

    container.addActionRowComponents(row);
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Viqole Bots • Sayfa ${newPage + 1} / ${totalPages}`));

    const opts = { components: [container], flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 };
    if (interaction.replied || interaction.deferred) await interaction.editReply(opts);
    else await interaction.reply(opts);
  }
}

// ==========================================
// USER SELF SERVICE FUNCTIONS (Ban Talebim)
// ==========================================

export async function handleBanAffiKendiTalebi(interaction, client) {
  const allRequests = loadBanAffi();
  const myRequests = allRequests.filter(r => r.userId === interaction.user.id);

  if (myRequests.length === 0) {
    return interaction.reply({ content: '❌ Herhangi bir ban affı talebiniz bulunmamaktadır.', flags: MessageFlags.Ephemeral });
  }

  // Get the latest request of this user
  const latestRequest = myRequests[myRequests.length - 1];

  const content =
    `> **Talep No:** #${latestRequest.id}\n` +
    `> **Durum:** ${latestRequest.opened ? '🟢 Banınız Açıldı' : '🟡 Değerlendirmede / Beklemede'}\n` +
    `> **Ban Türü:** ${latestRequest.banType}\n` +
    `> **Ban Sebebi:** ${latestRequest.banReason}` +
    (latestRequest.bannedBy ? `\n> ${E.yetkili} **Banlayan Yetkili:** ${latestRequest.bannedBy}` : '');

  const container = new ContainerBuilder()
    .setAccentColor(latestRequest.opened ? 0x57F287 : 0xFEE75C)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🔍 Ban Affı Talebiniz (#${latestRequest.id})`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`banaf_kendi_sil_${latestRequest.id}`).setLabel('Talebi Sil').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
    new ButtonBuilder().setCustomId(`banaf_kendi_duzenle_${latestRequest.id}`).setLabel('Düzenle').setStyle(ButtonStyle.Primary).setEmoji('📝')
  );

  container.addActionRowComponents(row);
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bots'));

  await interaction.reply({ components: [container], flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
}

export async function handleBanAffiKendiSil(interaction, client) {
  const requestId = parseInt(interaction.customId.split('_')[3], 10);
  const allRequests = loadBanAffi();
  const requestIndex = allRequests.findIndex(r => r.id === requestId);

  if (requestIndex === -1) {
    return interaction.reply({ content: '❌ Talebiniz bulunamadı veya zaten silinmiş.', flags: MessageFlags.Ephemeral });
  }

  const request = allRequests[requestIndex];
  if (request.userId !== interaction.user.id) {
    return interaction.reply({ content: '❌ Bu talebi silmeye yetkiniz yok.', flags: MessageFlags.Ephemeral });
  }

  // Delete from memory / file
  allRequests.splice(requestIndex, 1);
  saveBanAffi(allRequests);

  // Edit the staff management message to show it is deleted
  if (request.mgmtMessageId && request.mgmtChannelId) {
    try {
      const channel = await interaction.guild.channels.fetch(request.mgmtChannelId).catch(() => null);
      if (channel?.isTextBased()) {
        const msg = await channel.messages.fetch(request.mgmtMessageId).catch(() => null);
        if (msg) {
          const deletedContainer = new ContainerBuilder()
            .setAccentColor(0xED4245)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🗑️ #${requestId} - Silindi`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('> Bu dosya talep sahibi tarafından silinmiştir.'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bots'));
          await msg.edit({ components: [deletedContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
        }
      }
    } catch (e) {
      console.error('Kendi talebini silerken yönetim kanalındaki mesajı güncelleme hatası:', e);
    }
  }

  // Edit the user's ephemeral message to a clean ContainerBuilder V2 success notification
  const container = new ContainerBuilder()
    .setAccentColor(0x57F287)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ✅ Talep Silindi`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('> Ban affı talebiniz başarıyla silindi.'))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bots'));
  await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

export async function handleBanAffiKendiDuzenle(interaction, client) {
  const requestId = parseInt(interaction.customId.split('_')[3], 10);
  const allRequests = loadBanAffi();
  const request = allRequests.find(r => r.id === requestId);

  if (!request) {
    return interaction.reply({ content: '❌ Talep bulunamadı.', flags: MessageFlags.Ephemeral });
  }

  if (request.userId !== interaction.user.id) {
    return interaction.reply({ content: '❌ Bu talebi düzenlemeye yetkiniz yok.', flags: MessageFlags.Ephemeral });
  }

  if (request.opened) {
    return interaction.reply({ content: '❌ Banınız zaten onaylandığı için bu talebi artık düzenleyemezsiniz.', flags: MessageFlags.Ephemeral });
  }

  const modal = new ModalBuilder().setCustomId(`banaf_kendi_duzenle_modal_${requestId}`).setTitle('Ban Talebini Düzenle');

  const typeInput = new TextInputBuilder()
    .setCustomId('banaf_ban_type')
    .setLabel('Ban Türünüz')
    .setStyle(TextInputStyle.Short)
    .setValue(request.banType)
    .setRequired(true)
    .setMaxLength(100);

  const reasonInput = new TextInputBuilder()
    .setCustomId('banaf_ban_reason')
    .setLabel('Ban Sebebi')
    .setStyle(TextInputStyle.Paragraph)
    .setValue(request.banReason)
    .setRequired(true)
    .setMaxLength(500);

  modal.addComponents(
    new ActionRowBuilder().addComponents(typeInput),
    new ActionRowBuilder().addComponents(reasonInput)
  );

  await interaction.showModal(modal);
}

export async function handleBanAffiKendiDuzenleSubmit(interaction, client) {
  const requestId = parseInt(interaction.customId.split('_')[4], 10);
  const banType = interaction.fields.getTextInputValue('banaf_ban_type');
  const banReason = interaction.fields.getTextInputValue('banaf_ban_reason');

  const allRequests = loadBanAffi();
  const requestIndex = allRequests.findIndex(r => r.id === requestId);

  if (requestIndex === -1) {
    return interaction.reply({ content: '❌ Düzenlenecek talep bulunamadı.', flags: MessageFlags.Ephemeral });
  }

  const request = allRequests[requestIndex];
  if (request.userId !== interaction.user.id) {
    return interaction.reply({ content: '❌ Bu işlemi gerçekleştirmeye yetkiniz yok.', flags: MessageFlags.Ephemeral });
  }

  // Update in memory & save
  request.banType = banType;
  request.banReason = banReason;
  saveBanAffi(allRequests);

  // Update the staff management message to reflect the edited details (rebuild ContainerBuilder V2)
  if (request.mgmtMessageId && request.mgmtChannelId) {
    try {
      const channel = await interaction.guild.channels.fetch(request.mgmtChannelId).catch(() => null);
      if (channel?.isTextBased()) {
        const msg = await channel.messages.fetch(request.mgmtMessageId).catch(() => null);
        if (msg) {
          const mgmtRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`banaf_opened_${requestId}`).setLabel('Açıldı').setStyle(ButtonStyle.Success).setEmoji({ id: '1507733693903540265' }),
            new ButtonBuilder().setCustomId(`banaf_delete_${requestId}`).setLabel('Sil').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
            new ButtonBuilder().setCustomId(`banaf_copy_${requestId}`).setLabel('Kopyala').setStyle(ButtonStyle.Secondary).setEmoji('📋')
          );

          const mgmtContainer = new ContainerBuilder()
            .setAccentColor(0x5865F2)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`## ${E.banAffi} Düzenlenmiş Ban Affı Talebi • #${requestId}`)
            )
            .addSeparatorComponents(
              new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `### <:ye:1507732515585265825> Kullanıcı Bilgileri\n` +
                `> ${E.uye} **Talep Eden:** <@${request.userId}> (\`${interaction.user.tag}\`)\n` +
                `> 🆔 **Discord ID:** \`${request.userId}\`\n` +
                `> 📝 **Düzenlenme:** <t:${Math.floor(Date.now() / 1000)}:R>`
              )
            )
            .addSeparatorComponents(
              new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `### <:733737files:1508008108310528070> Talep Detayları\n` +
                `> ${E.ban} **Ban Türü:** \`${banType}\`\n` +
                `> ${E.ceza} **Ban Sebebi:**\n` +
                `\`\`\`fix\n${banReason}\n\`\`\``
              )
            )
            .addSeparatorComponents(
              new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addActionRowComponents(mgmtRow)
            .addSeparatorComponents(
              new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent('-# Viqole Bots')
            );
          await msg.edit({ components: [mgmtContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
        }
      }
    } catch (e) {
      console.error('Kendi talebini düzenlerken yönetim kanalındaki mesajı güncelleme hatası:', e);
    }
  }

  const container = new ContainerBuilder()
    .setAccentColor(0x57F287)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ✅ Talep Güncellendi`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('> Ban affı talebiniz başarıyla güncellendi.'))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bots'));

  await interaction.reply({ components: [container], flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
}
