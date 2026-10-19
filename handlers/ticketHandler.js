import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  PermissionFlagsBits, ChannelType, AttachmentBuilder, MessageFlags,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize,
  MediaGalleryBuilder, MediaGalleryItemBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  OverwriteType
} from 'discord.js';
import {
  getTicketsForGuild,
  getTicket,
  saveOrUpdateTicket,
  deleteTicket,
  getActiveTicketForUser,
  getTicketConfig,
  setTicketConfig,
  addApplicationDecision
} from '../db.js';
import { E } from '../utils/emojis.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTranscript as generateHtmlTranscript, ExportReturnType } from 'discord-transcript-v2';
import { generateApprovalCard, generateRejectionCard } from '../utils/canvasHelper.js';

import { getLogoPath } from '../utils/logoHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGO = path.join(__dirname, '../logo.png');

/**
 * HTML Transkript üretir, yerel diske yedekler (data/transcripts/<guildId>/...)
 * ve Discord mesajına eklenebilecek Attachment nesnesi döner.
 */
export async function generateAndSaveTranscript(channel) {
  try {
    const htmlContent = await generateHtmlTranscript(channel, {
      returnType: ExportReturnType.String,
      saveImages: true
    });

    if (!htmlContent) {
      console.warn(`[TRANSCRIPT] #${channel.name} için transkript içeriği üretilemedi.`);
      return null;
    }

    // 1. Yerel disk yedeği al
    const guildId = channel.guild?.id || 'default';
    const transcriptDir = path.join(process.cwd(), 'data', 'transcripts', guildId);
    if (!fs.existsSync(transcriptDir)) {
      fs.mkdirSync(transcriptDir, { recursive: true });
    }

    const safeChannelName = channel.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const timestamp = Date.now();
    const fileName = `transcript-${safeChannelName}-${timestamp}.html`;
    const filePath = path.join(transcriptDir, fileName);

    fs.writeFileSync(filePath, htmlContent, 'utf-8');
    console.log(`[TRANSCRIPT] Transkript yerel olarak yedeklendi: ${filePath}`);

    // 2. Discord attachment nesnesi oluştur
    const attachment = new AttachmentBuilder(Buffer.from(htmlContent, 'utf-8'), {
      name: `transcript-${safeChannelName}.html`
    });

    return {
      html: htmlContent,
      attachment,
      filePath,
      fileName
    };
  } catch (err) {
    console.error('[TRANSCRIPT] HTML transkript üretim hatası:', err);
    return null;
  }
}


export async function getTicketOwnerId(channel) {
  // 1. Try to load from SQLite
  const ticket = getTicket(channel.guild.id, channel.id);
  const cached = ticket?.userId;
  if (cached) return cached;

  // 2. Try to look at permission overwrites (user who is not the bot, who has ViewChannel allowed)
  for (const [id, overwrite] of channel.permissionOverwrites.cache) {
    if (overwrite.type === 1) { // member type (User)
      if (id !== channel.guild.members.me.id) {
        if (overwrite.allow.has(PermissionFlagsBits.ViewChannel)) {
          return id;
        }
      }
    }
  }

  // 3. Try to parse from the messages of the channel
  try {
    const fetched = await channel.messages.fetch({ limit: 50 });
    const messages = Array.from(fetched.values()).reverse();
    for (const msg of messages) {
      for (const embed of msg.embeds) {
        if (embed.description) {
          const match = embed.description.match(/Merhaba <@!?(\d+)>/);
          if (match) return match[1];
        }
      }
      const match = msg.content.match(/<@!?(\d+)>/);
      if (match) return match[1];
    }
  } catch (err) {
    console.error('[TRANSCRIPT BOT] Owner parsing error:', err);
  }

  return null;
}

async function createTicketChannel(guild, user, category, client) {
  const guildConfig = getTicketConfig(guild.id);

  const categories = client.config?.ticketCategories || [];
  const targetCat = categories.find(c => c.id === category);

  let categoryId = targetCat?.categoryId || guildConfig.categoryId || client.config?.basvuruCategoryId || process.env.BASVURU_CATEGORY_ID || null;
  if (!categoryId) {
    throw new Error('CATEGORY_NOT_FOUND');
  }

  const categoryExists = guild.channels.cache.has(categoryId) || await guild.channels.fetch(categoryId).catch(() => null);
  if (!categoryExists) {
    throw new Error('CATEGORY_NOT_FOUND');
  }

  const categoryChannel = guild.channels.cache.get(categoryId) || (typeof categoryExists === 'object' ? categoryExists : await guild.channels.fetch(categoryId).catch(() => null));
  if (!categoryChannel || categoryChannel.type !== ChannelType.GuildCategory) {
    throw new Error('CATEGORY_NOT_FOUND');
  }

  const ticketCount = (guildConfig.ticketCount || 0) + 1;
  guildConfig.ticketCount = ticketCount;
  setTicketConfig(guild.id, guildConfig);

  const prefix = category || 'basvuru';
  const username = user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
  const ticketId = `${prefix}-${username || 'uye'}-${ticketCount}`;

  const overwrites = [
    { id: guild.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
    { id: user.id, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: guild.members.me.id, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
  ];

  // Ekip sahipleri
  const ownerIds = (client.config?.ownerIds || '').split(',').map(id => id.trim()).filter(id => /^\d{17,20}$/.test(id));
  for (const ownerId of ownerIds) overwrites.push({ id: ownerId, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });

  // All-Perm kullanıcıları
  const allPermUsers = (client.config?.allPermUsers || '').split(',').map(id => id.trim()).filter(id => /^\d{17,20}$/.test(id));
  for (const uid of allPermUsers) overwrites.push({ id: uid, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });

  // All-Perm rolleri
  const allPermRoles = (client.config?.allPermRoles || '').split(',').map(id => id.trim()).filter(id => /^\d{17,20}$/.test(id));
  for (const rid of allPermRoles) overwrites.push({ id: rid, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });

  // Ticket Staff kullanıcıları
  const ticketStaffUsers = (client.config?.ticketStaffUsers || '').split(',').map(id => id.trim()).filter(id => /^\d{17,20}$/.test(id));
  for (const uid of ticketStaffUsers) overwrites.push({ id: uid, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });

  // Ticket Staff rolleri
  const ticketStaffRoles = (client.config?.ticketStaffRoles || '').split(',').map(id => id.trim()).filter(id => /^\d{17,20}$/.test(id));
  for (const rid of ticketStaffRoles) overwrites.push({ id: rid, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });

  // Legacy role ID
  const staffRoleId = client.config?.ticketStaffRoleId || process.env.TICKET_STAFF_ROLE_ID;
  if (staffRoleId && /^\d{17,20}$/.test(staffRoleId)) overwrites.push({ id: staffRoleId, type: OverwriteType.Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });

  const channel = await guild.channels.create({
    name: ticketId,
    type: ChannelType.GuildText,
    parent: categoryId,
    permissionOverwrites: overwrites
  });

  saveOrUpdateTicket(guild.id, channel.id, { userId: user.id, category, status: 'open', createdAt: Date.now() });

  return channel;
}

async function createTranscript(channel) {
  const messages = [];
  let lastId;
  while (true) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;
    const fetched = await channel.messages.fetch(options);
    if (fetched.size === 0) break;
    messages.push(...Array.from(fetched.values()));
    lastId = fetched.last().id;
    if (fetched.size < 100) break;
  }
  messages.reverse();
  let transcript = `Ticket Transcript - ${channel.name}\nOluşturulma: ${new Date().toLocaleString('tr-TR')}\nToplam Mesaj: ${messages.length}\n${'='.repeat(50)}\n\n`;
  for (const msg of messages) {
    const date = new Date(msg.createdTimestamp).toLocaleString('tr-TR');
    transcript += `[${date}] ${msg.author.tag} (${msg.author.id}):\n${msg.content}\n`;
    if (msg.attachments.size > 0) transcript += `Ekler: ${msg.attachments.map(a => a.url).join(', ')}\n`;
    transcript += '\n';
  }
  return transcript;
}

export async function handleTicketInteraction(interaction, client) {
  let category = null;

  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_category') {
    category = interaction.values[0];
    if (category === 'reset') {
      return interaction.reply({
        content: '🔄 Seçim sıfırlandı. Yeniden bir kategori seçebilirsiniz.',
        flags: MessageFlags.Ephemeral
      });
    }
  } else if (interaction.isButton() && interaction.customId.startsWith('ticket_category_btn_')) {
    category = interaction.customId.replace('ticket_category_btn_', '');
  }

  // Kategori seçimi tetiklendiyse ticket oluştur
  if (category) {
    if (client.config?.ticketSystemEnabled === false) {
      return interaction.reply({
        content: '❌ Ticket sistemi şu anda devre dışı bırakılmıştır.',
        flags: MessageFlags.Ephemeral
      });
    }
    if (client.config.basvuruDurumu === 'kapali') {
      return interaction.reply({
        content: '❌ Başvurular şu anda kapalıdır.',
        flags: MessageFlags.Ephemeral
      });
    }

    // Aktif ticket kontrolü
    const activeTicket = getActiveTicketForUser(interaction.guild.id, interaction.user.id);
    if (activeTicket) return interaction.reply({
      content: `❌ Zaten açık bir başvurunuz var: <#${activeTicket}>`,
      flags: MessageFlags.Ephemeral
    });

    const configCategories = client.config.ticketCategories || [];
    const activeCategories = configCategories.length > 0
      ? configCategories.filter(c => c.enabled)
      : [
        { id: 'destek', label: 'Destek', emoji: '1507734289255628990', description: 'Destek almak için ticket açın', enabled: true },
        { id: 'basvuru', label: 'Başvuru', emoji: '1507733959432208515', description: 'Ekibe katılmak için başvurun', enabled: true },
        { id: 'referans', label: 'Referans ile Alım', emoji: '1507734363046150204', description: 'Referans ile alım için başvurun', enabled: true }
      ];

    const targetCategoryObj = activeCategories.find(c => c.id === category);
    const categoryName = targetCategoryObj ? targetCategoryObj.label : category;

    let emojiStr = '';
    if (targetCategoryObj && targetCategoryObj.emoji) {
      const isIdOnly = /^\d+$/.test(targetCategoryObj.emoji);
      emojiStr = isIdOnly ? `<:emoji:${targetCategoryObj.emoji}>` : targetCategoryObj.emoji;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const channel = await createTicketChannel(interaction.guild, interaction.user, category, client);

      const logoPath = getLogoPath(client);
      const attachment = new AttachmentBuilder(logoPath, { name: 'logo.png' });

      const buttons = category === 'destek'
        ? new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_delete').setLabel('Sil').setStyle(ButtonStyle.Secondary).setEmoji('🗑️')
        )
        : new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_approve').setLabel('Onayla').setStyle(ButtonStyle.Success).setEmoji('✅'),
          new ButtonBuilder().setCustomId('ticket_reject').setLabel('Reddet').setStyle(ButtonStyle.Danger).setEmoji('❌'),
          new ButtonBuilder().setCustomId('ticket_delete').setLabel('Sil').setStyle(ButtonStyle.Secondary).setEmoji('🗑️')
        );

      const title = category === 'destek'
        ? `## <a:coffe:1517808496748527726> DESTEK TALEBİ OLUŞTURULDU`
        : (category === 'referans' ? `## <a:coffe:1517808496748527726> REFERANS İLE ALIM TALEBİ` : `## <a:coffe:1517808496748527726> BAŞVURU OLUŞTURULDU`);

      const description = category === 'destek'
        ? `Merhaba ${interaction.user}!\n\n` +
        `> **Kategori:** <a:coffe:1517808496748527726> ${categoryName}\n` +
        `> Destek talebiniz oluşturuldu. Yetkililer en kısa sürede size yardımcı olacaktır.\n` +
        `> Lütfen sorununuzu detaylıca buraya yazınız.`
        : (category === 'basvuru'
          ? `Merhaba ${interaction.user}!\n\n` +
          `> **Kategori:** <a:coffe:1517808496748527726> ${categoryName}\n` +
          `> Başvurunuz oluşturuldu. Yetkililer en kısa sürede size yardımcı olacaktır.\n` +
          `> Lütfen aşağıdaki başvuru formunu doldurup bu kanala gönderiniz.`
          : `Merhaba ${interaction.user}!\n\n` +
          `> **Kategori:** <a:coffe:1517808496748527726> ${categoryName}\n` +
          `> Talebiniz oluşturuldu. Yetkililer en kısa sürede size yardımcı olacaktır.\n` +
          `> Lütfen yetkililerin incelemesini bekleyiniz.`);

      const embedColorHex = client.config.ticketEmbedColor || '#2B2D7A';
      const embedColorInt = parseInt(embedColorHex.replace('#', ''), 16) || 0x2B2D7A;

      const ticketContainer = new ContainerBuilder()
        .setAccentColor(embedColorInt)
        .addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL('attachment://logo.png')
          )
        )
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(title))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(description));

      if (category === 'basvuru') {
        const rawForm = client.config.ticketFormText || `Yaş:\nGünlük aktiflik süreniz?\nDaha önce hangi ekiplerde oynadınız?\nFivem saatiniz:\nMap Bilgisi (10/?):\n3 Adet kill pov (zorunlu):`;
        const cleanForm = rawForm.replace(/^\s*\*{0,2}Başvuru [fF]ormu\s*:?\*{0,2}\s*\n+/i, '').trim();

        ticketContainer
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### <:733737files:1508008108310528070> Başvuru Formu\n\`\`\`fix\n${cleanForm}\n\`\`\``));
      }

      ticketContainer
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addActionRowComponents(buttons)
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Ticket: ${channel.name}`));

      await channel.send({ components: [ticketContainer], files: [attachment], flags: MessageFlags.IsComponentsV2 });

      await interaction.followUp({ content: `✅ Başvuru kanalınız oluşturuldu: ${channel}`, flags: MessageFlags.Ephemeral });
    } catch (err) {
      if (err.message === 'CATEGORY_NOT_FOUND') {
        await interaction.followUp({ content: 'Başvuru katagorisi tanımlı değil', flags: MessageFlags.Ephemeral });
      } else {
        console.error('Ticket oluşturma hatası:', err);
        await interaction.followUp({ content: '❌ Başvuru oluşturulurken hata oluştu.', flags: MessageFlags.Ephemeral });
      }
    }
    return;
  }

  // Ticket Onay
  if (interaction.customId === 'ticket_approve') {
    const staffRoleId = client.config?.ticketStaffRoleId || process.env.TICKET_STAFF_ROLE_ID;
    if (staffRoleId && !interaction.member.roles.cache.has(staffRoleId))
      return interaction.reply({ content: '❌ Bu butonu sadece yetkililer kullanabilir.', flags: MessageFlags.Ephemeral });

    const ticketOwnerId = await getTicketOwnerId(interaction.channel);
    if (!ticketOwnerId) return interaction.reply({ content: '❌ Ticket sahibi bulunamadı.', flags: MessageFlags.Ephemeral });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Başvuru onay kararını kaydet
    addApplicationDecision(interaction.user.id, ticketOwnerId, 'approve');

    const onayRoleId = client.config?.onayRoleId || process.env.ONAY_ROLE;
    if (onayRoleId) {
      try {
        const onayRole = await interaction.guild.roles.fetch(onayRoleId).catch(() => null);
        if (onayRole) {
          const targetMember = await interaction.guild.members.fetch(ticketOwnerId).catch(() => null);
          if (targetMember) {
            const hasRolePhysically = targetMember.roles.cache.some(r => r.id === onayRole.id);
            if (!hasRolePhysically) {
              await targetMember.roles.add(onayRole);
            }
          }
        }
      } catch (roleErr) {
        console.error('[TICKET APPROVE] Üye rolü eklenirken hata:', roleErr);
      }
    }

    const transcriptData = await generateAndSaveTranscript(interaction.channel);

    const onayChannelId = client.config?.onayChannelIdEnabled !== false ? (client.config?.onayChannelId || process.env.ONAY_CHANNEL) : null;
    if (onayChannelId && client.config?.ticketApprovalChannelEnabled !== false) {
      const onayChannel = await interaction.guild.channels.fetch(onayChannelId).catch(() => null);
      if (onayChannel) {
        const chanTemplate = client.config?.ticketApprovalChannelMessage || `{panda} {user} incelenip ekibe uygun görülmüş ve başvurusu onaylanmıştır.`;
        const chanContent = chanTemplate
          .replace(/{user}/g, `<@${ticketOwnerId}>`)
          .replace(/{panda}/g, E.panda || '🐼')
          .replace(/{unlem}/g, E.unlem || '⚠️');
        await onayChannel.send({
          content: chanContent
        });
      }
    }

    const logChannelId = client.config?.ticketLogChannelIdEnabled !== false ? (client.config?.ticketLogChannelId || process.env.TICKET_LOG_CHANNEL_ID) : null;
    if (logChannelId) {
      try {
        const logChannel = await interaction.guild.channels.fetch(logChannelId).catch(() => null);
        if (logChannel) {
          const configCategories = client.config.ticketCategories || [];
          const ticketData = getTicket(interaction.guild.id, interaction.channel.id);
          const categoryKey = ticketData ? ticketData.category : 'basvuru';
          const targetCatObj = configCategories.find(c => c.id === categoryKey);
          const categoryName = targetCatObj ? targetCatObj.label : (categoryKey === 'destek' ? 'Destek' : (categoryKey === 'referans' ? 'Referans ile Alım' : 'Başvuru'));
          const closedAtUnix = Math.floor(Date.now() / 1000);

          const logContainer = new ContainerBuilder()
            .setAccentColor(0x57F287)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${E.kitap || '📚'} Başvuru Talebi Kabul Edildi`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
              `> ${E.uye || '👤'} **Kullanıcı:** <@${ticketOwnerId}>\n` +
              `> <:mod:1507746579078053999> **İşlemi Yapan:** ${interaction.user}\n` +
              `> ${E.kanal || '📺'} **Kanal:** \`#${interaction.channel.name}\`\n` +
              `> ${E.destek || '💬'} **Kategori:** ${categoryName}\n` +
              `> 📅 **Kapanma Tarihi:** <t:${closedAtUnix}:F> (<t:${closedAtUnix}:R>)\n` +
              `> 📎 **Transkript:** Mesaja ek olarak yüklenmiştir.`
            ))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Viqole | Ticket Log`));

          if (transcriptData?.html) {
            const transcriptAttachment = new AttachmentBuilder(Buffer.from(transcriptData.html, 'utf-8'), {
              name: `transcript-${interaction.channel.name}.html`
            });
            await logChannel.send({ files: [transcriptAttachment] }).catch(err => console.error('[TRANSCRIPT BOT] Transkript dosyası gönderilemedi:', err));
          }

          await logChannel.send({
            components: [logContainer],
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { parse: [] }
          });
        }
      } catch (err) {
        console.error('[TRANSCRIPT BOT] Onay logu gönderilemedi:', err);
      }
    }


    if (client.config?.ticketApprovalDmEnabled !== false) {
      try {
        const user = await interaction.guild.members.fetch(ticketOwnerId);
        const dmTemplate = client.config?.ticketApprovalDmMessage || `{panda} **Başvurunuz Onaylandı!**\n\nTebrikler! Başvurunuz incelendi ve onaylandı. Aramıza hoş geldin!`;
        const dmContent = dmTemplate
          .replace(/{user}/g, `<@${ticketOwnerId}>`)
          .replace(/{panda}/g, E.panda || '🐼')
          .replace(/{unlem}/g, E.unlem || '⚠️');

        // Generate application approved canvas card
        const avatarUrl = user.user.displayAvatarURL({ forceStatic: true, extension: 'png', size: 256 });
        const canvasBuffer = await generateApprovalCard({
          username: user.user.username,
          avatarUrl,
          approvedBy: interaction.user.tag
        }).catch(err => {
          console.error('[TICKET APPROVE] DM Canvas generation failed:', err);
          return null;
        });

        const files = [];
        const dmContainer = new ContainerBuilder()
          .setAccentColor(0x57F287);

        if (canvasBuffer) {
          files.push(new AttachmentBuilder(canvasBuffer, { name: 'approval-card.png' }));
          dmContainer.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
              new MediaGalleryItemBuilder().setURL('attachment://approval-card.png')
            )
          );
        }

        dmContainer
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(dmContent))
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

        await user.send({ components: [dmContainer], files, flags: MessageFlags.IsComponentsV2 });
      } catch (err) {
        console.error('[TICKET APPROVE] DM sending failed:', err);
      }
    }

    await interaction.editReply({ content: '✅ Başvuru onaylandı, kanal siliniyor...' });

    setTimeout(async () => {
      try {
        deleteTicket(interaction.guild.id, interaction.channel.id);
        await interaction.channel.delete();
      } catch (err) {
        console.error('[TICKET APPROVE] Kanal silinirken hata oluştu:', err);
      }
    }, 5000);
    return;
  }

  // Ticket Red
  if (interaction.customId === 'ticket_reject') {
    const staffRoleId = client.config?.ticketStaffRoleId || process.env.TICKET_STAFF_ROLE_ID;
    if (staffRoleId && !interaction.member.roles.cache.has(staffRoleId))
      return interaction.reply({ content: '❌ Bu butonu sadece yetkililer kullanabilir.', flags: MessageFlags.Ephemeral });

    const modal = new ModalBuilder().setCustomId('ticket_reject_modal').setTitle('Başvuru Red Sebebi');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('reason').setLabel('Red Sebebi').setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Başvurunun reddedilme sebebini yazınız').setRequired(true)
      )
    );
    await interaction.showModal(modal);
    return;
  }

  // Ticket Red Modal
  if (interaction.isModalSubmit() && interaction.customId === 'ticket_reject_modal') {
    const reason = interaction.fields.getTextInputValue('reason');
    const ticketOwnerId = await getTicketOwnerId(interaction.channel);
    if (!ticketOwnerId) return interaction.reply({ content: '❌ Ticket sahibi bulunamadı.', flags: MessageFlags.Ephemeral });

    await interaction.reply({ content: '⏳ İşlem yapılıyor...', flags: MessageFlags.Ephemeral });

    // Başvuru red kararını kaydet
    addApplicationDecision(interaction.user.id, ticketOwnerId, 'reject');

    const transcriptData = await generateAndSaveTranscript(interaction.channel);

    const onayChannelId = client.config?.onayChannelIdEnabled !== false ? (client.config?.onayChannelId || process.env.ONAY_CHANNEL) : null;
    if (onayChannelId && client.config?.ticketRejectionChannelEnabled !== false) {
      const onayChannel = await interaction.guild.channels.fetch(onayChannelId).catch(() => null);
      if (onayChannel) {
        const chanTemplate = client.config?.ticketRejectionChannelMessage || `{unlem} {user} başvurusu **{reason}** sebebiyle reddedilmiştir.`;
        const chanContent = chanTemplate
          .replace(/{user}/g, `<@${ticketOwnerId}>`)
          .replace(/{reason}/g, reason)
          .replace(/{panda}/g, E.panda || '🐼')
          .replace(/{unlem}/g, E.unlem || '⚠️');
        await onayChannel.send({
          content: chanContent
        });
      }
    }

    const logChannelId = client.config?.ticketLogChannelIdEnabled !== false ? (client.config?.ticketLogChannelId || process.env.TICKET_LOG_CHANNEL_ID) : null;
    if (logChannelId) {
      try {
        const logChannel = await interaction.guild.channels.fetch(logChannelId).catch(() => null);
        if (logChannel) {
          const configCategories = client.config.ticketCategories || [];
          const ticketData = getTicket(interaction.guild.id, interaction.channel.id);
          const categoryKey = ticketData ? ticketData.category : 'basvuru';
          const targetCatObj = configCategories.find(c => c.id === categoryKey);
          const categoryName = targetCatObj ? targetCatObj.label : (categoryKey === 'destek' ? 'Destek' : (categoryKey === 'referans' ? 'Referans ile Alım' : 'Başvuru'));
          const closedAtUnix = Math.floor(Date.now() / 1000);

          const logContainer = new ContainerBuilder()
            .setAccentColor(0xED4245)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${E.kitap || '📚'} Başvuru Talebi Reddedildi`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
              `> ${E.uye || '👤'} **Kullanıcı:** <@${ticketOwnerId}>\n` +
              `> <:mod:1507746579078053999> **İşlemi Yapan:** ${interaction.user}\n` +
              `> ${E.kanal || '📺'} **Kanal:** \`#${interaction.channel.name}\`\n` +
              `> ${E.destek || '💬'} **Kategori:** ${categoryName}\n` +
              `> ${E.ceza || '⚠️'} **Sebep:** ${reason}\n` +
              `> 📅 **Kapanma Tarihi:** <t:${closedAtUnix}:F> (<t:${closedAtUnix}:R>)\n` +
              `> 📎 **Transkript:** Mesaja ek olarak yüklenmiştir.`
            ))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Viqole | Ticket Log`));

          if (transcriptData?.html) {
            const transcriptAttachment = new AttachmentBuilder(Buffer.from(transcriptData.html, 'utf-8'), {
              name: `transcript-${interaction.channel.name}.html`
            });
            await logChannel.send({ files: [transcriptAttachment] }).catch(err => console.error('[TRANSCRIPT BOT] Transkript dosyası gönderilemedi:', err));
          }

          await logChannel.send({
            components: [logContainer],
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { parse: [] }
          });
        }
      } catch (err) {
        console.error('[TRANSCRIPT BOT] Red logu gönderilemedi:', err);
      }
    }


    if (client.config?.ticketRejectionDmEnabled !== false) {
      try {
        const user = await interaction.guild.members.fetch(ticketOwnerId);
        const dmTemplate = client.config?.ticketRejectionDmMessage || `{unlem} **Başvurunuz Reddedildi**\n\nMaalesef başvurunuz reddedildi.\n\n**Sebep:** {reason}`;
        const dmContent = dmTemplate
          .replace(/{user}/g, `<@${ticketOwnerId}>`)
          .replace(/{reason}/g, reason)
          .replace(/{panda}/g, E.panda || '🐼')
          .replace(/{unlem}/g, E.unlem || '⚠️');

        // Generate application rejected canvas card
        const avatarUrl = user.user.displayAvatarURL({ forceStatic: true, extension: 'png', size: 256 });
        const canvasBuffer = await generateRejectionCard({
          username: user.user.username,
          avatarUrl,
          rejectedBy: interaction.user.tag,
          reason: reason
        }).catch(err => {
          console.error('[TICKET REJECT] DM Canvas generation failed:', err);
          return null;
        });

        const files = [];
        const dmContainer = new ContainerBuilder()
          .setAccentColor(0xED4245);

        if (canvasBuffer) {
          files.push(new AttachmentBuilder(canvasBuffer, { name: 'rejection-card.png' }));
          dmContainer.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
              new MediaGalleryItemBuilder().setURL('attachment://rejection-card.png')
            )
          );
        }

        dmContainer
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(dmContent))
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

        await user.send({ components: [dmContainer], files, flags: MessageFlags.IsComponentsV2 });
      } catch (err) {
        console.error('[TICKET REJECT] DM sending failed:', err);
      }
    }

    setTimeout(async () => {
      try {
        deleteTicket(interaction.guild.id, interaction.channel.id);
        await interaction.channel.delete();
      } catch (err) {
        console.error('[TICKET REJECT] Kanal silinirken hata oluştu:', err);
      }
    }, 5000);
    return;
  }

  // Ticket Sil / Kapat
  if (interaction.customId === 'ticket_delete') {
    const staffRoleId = client.config?.ticketStaffRoleId || process.env.TICKET_STAFF_ROLE_ID;
    if (staffRoleId && !interaction.member.roles.cache.has(staffRoleId))
      return interaction.reply({ content: '❌ Bu butonu sadece yetkililer kullanabilir.', flags: MessageFlags.Ephemeral });

    const ticketOwnerId = await getTicketOwnerId(interaction.channel);
    if (!ticketOwnerId) return interaction.reply({ content: '❌ Ticket sahibi bulunamadı.', flags: MessageFlags.Ephemeral });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const transcriptData = await generateAndSaveTranscript(interaction.channel);

    const logChannelId = client.config?.ticketLogChannelIdEnabled !== false ? (client.config?.ticketLogChannelId || process.env.TICKET_LOG_CHANNEL_ID) : null;
    if (logChannelId) {
      try {
        const logChannel = await interaction.guild.channels.fetch(logChannelId).catch(() => null);
        if (logChannel) {
          const categoryNames = {
            destek: 'Destek',
            basvuru: 'Başvuru',
            referans: 'Referans ile Alım'
          };
          const ticketData = getTicket(interaction.guild.id, interaction.channel.id);
          const categoryKey = ticketData ? ticketData.category : 'basvuru';
          const categoryName = categoryNames[categoryKey] || 'Başvuru';
          const closedAtUnix = Math.floor(Date.now() / 1000);

          const logContainer = new ContainerBuilder()
            .setAccentColor(0x747F8D)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${E.kitap || '📚'} Ticket Kapatıldı`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
              `> ${E.uye || '👤'} **Kullanıcı:** <@${ticketOwnerId}>\n` +
              `> <:mod:1507746579078053999> **İşlemi Yapan:** ${interaction.user}\n` +
              `> ${E.kanal || '📺'} **Kanal:** \`#${interaction.channel.name}\`\n` +
              `> ${E.destek || '💬'} **Kategori:** ${categoryName}\n` +
              `> 📅 **Kapanma Tarihi:** <t:${closedAtUnix}:F> (<t:${closedAtUnix}:R>)\n` +
              `> 📎 **Transkript:** Mesaja ek olarak yüklenmiştir.`
            ))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Viqole | Ticket Log`));

          if (transcriptData?.html) {
            const transcriptAttachment = new AttachmentBuilder(Buffer.from(transcriptData.html, 'utf-8'), {
              name: `transcript-${interaction.channel.name}.html`
            });
            await logChannel.send({ files: [transcriptAttachment] }).catch(err => console.error('[TRANSCRIPT BOT] Transkript dosyası gönderilemedi:', err));
          }

          await logChannel.send({
            components: [logContainer],
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { parse: [] }
          });
        }
      } catch (err) {
        console.error('[TRANSCRIPT BOT] Silme logu gönderilemedi:', err);
      }
    }


    try {
      const user = await interaction.guild.members.fetch(ticketOwnerId);
      const dmContainer = new ContainerBuilder()
        .setAccentColor(0x747F8D)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${E.unlem || '⚠️'} Ticketiniz Kapatıldı`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `Açmış olduğunuz destek/başvuru talebi yetkili tarafından sonlandırılmıştır.`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));
      await user.send({ components: [dmContainer], flags: MessageFlags.IsComponentsV2 });
    } catch { }

    await interaction.editReply({ content: '✅ Ticket kapatıldı, kanal siliniyor...' });

    setTimeout(async () => {
      try {
        deleteTicket(interaction.guild.id, interaction.channel.id);
        await interaction.channel.delete();
      } catch (err) {
        console.error('[TICKET DELETE] Kanal silinirken hata oluştu:', err);
      }
    }, 5000);
    return;
  }

  // Transfer handler removed.
}

export async function registerAllGuilds(client) {
  // Dış MongoDB / API senkronizasyonu kaldırıldı (artık yerel HTML transkript kullanılıyor)
}

export async function forceCloseTicket(channel, executorMember) {
  const client = channel.client;
  const ticketOwnerId = await getTicketOwnerId(channel) || client.user.id;

  // 1. Transkript üret & yerel disk yedeği al
  const transcriptData = await generateAndSaveTranscript(channel);

  // 2. Send ticket log
  const logChannelId = client.config?.ticketLogChannelIdEnabled !== false ? (client.config?.ticketLogChannelId || process.env.TICKET_LOG_CHANNEL_ID) : null;
  if (logChannelId) {
    try {
      const logChannel = await channel.guild.channels.fetch(logChannelId).catch(() => null);
      if (logChannel) {
        const categoryNames = {
          destek: 'Destek',
          basvuru: 'Başvuru',
          referans: 'Referans ile Alım'
        };
        const ticketData = getTicket(channel.guild.id, channel.id);
        const categoryKey = ticketData ? ticketData.category : 'basvuru';
        const categoryName = categoryNames[categoryKey] || 'Başvuru';
        const closedAtUnix = Math.floor(Date.now() / 1000);

        const logContainer = new ContainerBuilder()
          .setAccentColor(0x747F8D)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${E.kitap || '📚'} Ticket Kapatıldı`))
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `> ${E.uye || '👤'} **Kullanıcı:** <@${ticketOwnerId}>\n` +
            `> <:mod:1507746579078053999> **İşlemi Yapan:** ${executorMember.user}\n` +
            `> ${E.kanal || '📺'} **Kanal:** \`#${channel.name}\`\n` +
            `> ${E.destek || '💬'} **Kategori:** ${categoryName}\n` +
            `> 📅 **Kapanma Tarihi:** <t:${closedAtUnix}:F> (<t:${closedAtUnix}:R>)\n` +
            `> 📎 **Transkript:** Mesaja ek olarak yüklenmiştir.`
          ))
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Viqole | Ticket Log`));

        if (transcriptData?.html) {
          const transcriptAttachment = new AttachmentBuilder(Buffer.from(transcriptData.html, 'utf-8'), {
            name: `transcript-${channel.name}.html`
          });
          await logChannel.send({ files: [transcriptAttachment] }).catch(err => console.error('[TRANSCRIPT BOT] Transkript dosyası gönderilemedi:', err));
        }

        await logChannel.send({
          components: [logContainer],
          flags: MessageFlags.IsComponentsV2,
          allowedMentions: { parse: [] }
        });
      }

    } catch (err) {
      console.error('[TRANSCRIPT BOT] Force close logu gönderilemedi:', err);
    }
  }

  // 3. Send DM to ticket owner
  try {
    const user = await channel.guild.members.fetch(ticketOwnerId);
    const dmContainer = new ContainerBuilder()
      .setAccentColor(0x747F8D)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${E.unlem || '⚠️'} Ticketiniz Kapatıldı`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `Açmış olduğunuz destek/başvuru talebi yetkili tarafından sonlandırılmıştır.`
      ))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));
    await user.send({ components: [dmContainer], flags: MessageFlags.IsComponentsV2 });
  } catch { }

  // 4. Delete SQLite and channel
  try {
    deleteTicket(channel.guild.id, channel.id);
    await channel.delete();
  } catch (err) {
    console.error('[FORCE CLOSE TICKET] Kanal silinirken hata oluştu:', err);
  }
}
