import {
  SlashCommandBuilder, PermissionFlagsBits, MessageFlags,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize,
  ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder,
  ButtonBuilder, ButtonStyle
} from 'discord.js';
import fs from 'fs';

export const data = new SlashCommandBuilder()
  .setName('bio-guild')
  .setDescription('Onaylı üyelerin guild veya bio bilgilerini tarar.')
  .addStringOption(o => o.setName('tip')
    .setDescription('Tarama yapılacak alan (guild veya bio)')
    .setRequired(true)
    .addChoices(
      { name: 'Guild (Durum/Status)', value: 'guild' },
      { name: 'Bio (Hakkımda/About Me)', value: 'bio' }
    )
  );

// Helper function to fetch Discord profile with User/Self token
export async function fetchDiscordProfile(userId, guildId, userToken) {
  const url = `https://discord.com/api/v9/users/${userId}/profile?guild_id=${guildId}`;
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': userToken,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (response.status === 429) {
      const retryAfter = parseFloat(response.headers.get('retry-after') || '2');
      console.warn(`[BioGuild] Rate limited on ${userId}, retry-after: ${retryAfter}s`);
      if (retryAfter > 30) {
        console.warn(`[BioGuild] Global rate limit detected (${retryAfter}s), stopping scan.`);
        throw new Error(`RATE_LIMIT_EXCEEDED:${retryAfter}`);
      }
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      return fetchDiscordProfile(userId, guildId, userToken);
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error('INVALID_TOKEN');
    }

    if (!response.ok) {
      console.error(`[BioGuild] Profile fetch failed for ${userId}: ${response.status} ${response.statusText}`);
      return null;
    }

    return await response.json();
  } catch (err) {
    if (err.message === 'INVALID_TOKEN' || err.message.startsWith('RATE_LIMIT_EXCEEDED')) {
      throw err;
    }
    console.error(`[BioGuild] Error fetching profile for ${userId}:`, err);
    return null;
  }
}

export function getClanTag(profileData) {
  if (!profileData) return null;
  if (profileData.user?.clan?.tag) return profileData.user.clan.tag;
  if (profileData.user?.primary_guild?.tag) return profileData.user.primary_guild.tag;
  if (profileData.user_profile?.clan?.tag) return profileData.user_profile.clan.tag;
  if (profileData.clan?.tag) return profileData.clan.tag;
  if (profileData.primary_guild?.tag) return profileData.primary_guild.tag;
  return null;
}

export function hasGuildStatus(profileData, guildName) {
  if (!profileData) return false;

  // 1. Check Discord's new Sunucu Etiketi (Clan Tag)
  const clanTag = getClanTag(profileData);
  if (clanTag && (clanTag.toLowerCase().includes(guildName.toLowerCase()) || guildName.toLowerCase().includes(clanTag.toLowerCase()))) {
    return true;
  }

  // 2. Check activities in presence
  const activities = profileData.presence?.activities || [];
  for (const activity of activities) {
    if (activity.type === 4) { // Custom Status
      const state = activity.state || '';
      const name = activity.name || '';
      if (state.toLowerCase().includes(guildName.toLowerCase()) || name.toLowerCase().includes(guildName.toLowerCase())) {
        return true;
      }
    }
  }

  // 3. Secondary check of all activities
  for (const activity of activities) {
    const state = activity.state || '';
    const name = activity.name || '';
    const details = activity.details || '';
    if (state.toLowerCase().includes(guildName.toLowerCase()) ||
      name.toLowerCase().includes(guildName.toLowerCase()) ||
      details.toLowerCase().includes(guildName.toLowerCase())) {
      return true;
    }
  }

  // 4. Check direct custom status field
  const customStatusText = profileData.custom_status?.text || '';
  if (customStatusText.toLowerCase().includes(guildName.toLowerCase())) {
    return true;
  }

  return false;
}

export function hasBioName(profileData, bioName) {
  if (!profileData) return false;

  const keywords = bioName.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
  if (keywords.length === 0) return false;

  const bio1 = (profileData.user_profile?.bio || '').toLowerCase();
  const bio2 = (profileData.user?.bio || '').toLowerCase();
  const pronouns = (profileData.user_profile?.pronouns || '').toLowerCase();
  const pronounsUser = (profileData.user?.pronouns || '').toLowerCase();

  return keywords.some(keyword =>
    bio1.includes(keyword) ||
    bio2.includes(keyword) ||
    pronouns.includes(keyword) ||
    pronounsUser.includes(keyword)
  );
}

export async function execute(interaction, client) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '❌ Bu komutu kullanabilmek için **Yönetici** yetkisine sahip olmalısınız.', flags: MessageFlags.Ephemeral });
  }

  const cp = client.configPath;
  const currentConfig = client.config;

  const guildName = currentConfig.bioGuildGuildName;
  const bioName = currentConfig.bioGuildBioName;
  const userToken = currentConfig.userToken;

  if (!userToken) {
    return interaction.reply({
      content: `❌ **Hata:** Config dosyasında \`userToken\` tanımlanmamış. Lütfen config dosyanıza \`"userToken": "TOKEN"\` ekleyin.`,
      flags: MessageFlags.Ephemeral
    });
  }

  // If system is not set up, ask for Guild and Bio names via Modal
  if (!guildName || !bioName) {
    const modal = new ModalBuilder()
      .setCustomId('bio_guild_setup')
      .setTitle('Bio-Guild Sistem Kurulumu');

    const guildInput = new TextInputBuilder()
      .setCustomId('guild_name')
      .setLabel('Aranacak Guild Kelimesi')
      .setPlaceholder('Örn: discord.gg/revente')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const bioInput = new TextInputBuilder()
      .setCustomId('bio_name')
      .setLabel('Aranacak Bio Kelimesi')
      .setPlaceholder('Örn: .revente')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(guildInput),
      new ActionRowBuilder().addComponents(bioInput)
    );

    await interaction.showModal(modal);

    const submitted = await interaction.awaitModalSubmit({
      time: 60000,
      filter: i => i.user.id === interaction.user.id && i.customId === 'bio_guild_setup'
    }).catch(() => null);

    if (submitted) {
      const inputGuild = submitted.fields.getTextInputValue('guild_name').trim();
      const inputBio = submitted.fields.getTextInputValue('bio_name').trim();

      try {
        let fileConfig = {};
        if (fs.existsSync(cp)) {
          fileConfig = JSON.parse(fs.readFileSync(cp, 'utf8'));
        }
        fileConfig.bioGuildGuildName = inputGuild;
        fileConfig.bioGuildBioName = inputBio;

        fs.writeFileSync(cp, JSON.stringify(fileConfig, null, 2), 'utf8');
        client.config = fileConfig;

        return submitted.reply({
          content: `✅ **Sistem Kurulumu Başarılı!**\n\n` +
            `> 🌐 **Guild Kelimesi:** \`${inputGuild}\`\n` +
            `> 📝 **Bio Kelimesi:** \`${inputBio}\`\n\n` +
            `Tarama yapmak için komutu tekrar çalıştırabilirsiniz.`,
          flags: MessageFlags.Ephemeral
        });
      } catch (err) {
        console.error('Setup save error:', err);
        return submitted.reply({ content: '❌ Ayarlar kaydedilirken hata oluştu.', flags: MessageFlags.Ephemeral });
      }
    }
    return;
  }

  const type = interaction.options.getString('tip');

  await interaction.deferReply({ flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });

  const onayRoleId = currentConfig.onayRoleId;
  if (!onayRoleId) {
    const errorContainer = new ContainerBuilder()
      .setAccentColor(0xED4245)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ❌ Hata: onayRoleId Bulunamadı`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `Config dosyasında \`onayRoleId\` ayarlanmamış. Lütfen kurulumu tamamlayın.`
      ))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

    return interaction.editReply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
  }

  const guild = interaction.guild;
  let roleMembers = new Map();
  try {
    let lastId = '0';
    const limit = 1000;
    while (true) {
      const rawMembers = await guild.client.rest.get(
        `/guilds/${guild.id}/members`,
        { query: new URLSearchParams({ limit: limit.toString(), after: lastId }) }
      );
      if (!rawMembers || rawMembers.length === 0) break;

      for (const raw of rawMembers) {
        if (raw.roles.includes(onayRoleId) && !raw.user.bot) {
          const member = guild.members.cache.get(raw.user.id) || guild.members._add(raw, true);
          roleMembers.set(raw.user.id, member);
        }
      }

      if (rawMembers.length < limit) break;
      lastId = rawMembers[rawMembers.length - 1].user.id;
    }
  } catch (err) {
    console.warn('[BioGuild] REST members fetch failed, falling back to cache:', err);
    const role = guild.roles.cache.get(onayRoleId);
    if (role) {
      for (const [id, member] of role.members) {
        if (!member.user.bot) roleMembers.set(id, member);
      }
    }
  }

  const members = Array.from(roleMembers.values());
  if (members.length === 0) {
    const emptyContainer = new ContainerBuilder()
      .setAccentColor(0x3498db)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ℹ️ Üye Bulunamadı`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `Belirtilen onaylı rolde (\`${onayRoleId}\`) taranacak üye bulunamadı.`
      ))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

    return interaction.editReply({ components: [emptyContainer], flags: MessageFlags.IsComponentsV2 });
  }

  let count = 0;
  const total = members.length;
  const missing = [];

  for (const member of members) {
    count++;

    // Update progress periodically
    if (count % 5 === 0 || count === total) {
      const progressContainer = new ContainerBuilder()
        .setAccentColor(0xf1c40f)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🔍 Tarama Devam Ediyor`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `> 📊 **Tip:** \`${type === 'guild' ? 'Guild (Status)' : 'Bio'}\`\n` +
          `> 👥 **İlerleme:** \`${count}/${total}\` üye tarandı.\n` +
          `> ⚠️ **Uyumsuz:** \`${missing.length}\` üye.`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Lütfen işlemin tamamlanmasını bekleyin...`));

      await interaction.editReply({ components: [progressContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
    }

    try {
      const profile = await fetchDiscordProfile(member.id, guild.id, userToken);
      if (!profile) {
        missing.push(member);
        continue;
      }

      if (type === 'guild') {
        if (!hasGuildStatus(profile, guildName)) {
          missing.push(member);
        }
      } else if (type === 'bio') {
        if (!hasBioName(profile, bioName)) {
          missing.push(member);
        }
      }
    } catch (err) {
      if (err.message === 'INVALID_TOKEN') {
        const errorContainer = new ContainerBuilder()
          .setAccentColor(0xED4245)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ❌ Geçersiz User Token`))
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `Config dosyasındaki \`userToken\` geçersiz veya süresi dolmuş. Lütfen geçerli bir kullanıcı tokeni girin.`
          ))
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

        await interaction.editReply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
        return;
      }
      if (err.message.startsWith('RATE_LIMIT_EXCEEDED')) {
        const parts = err.message.split(':');
        const retryAfterSeconds = parts[1] ? parseFloat(parts[1]) : null;
        let waitTimeStr = 'Lütfen **30-60 dakika** bekleyip tekrar deneyin.';
        if (retryAfterSeconds) {
          const minutes = Math.ceil(retryAfterSeconds / 60);
          waitTimeStr = `Lütfen **${minutes} dakika** bekleyip tekrar deneyin. (Discord API engel süresi: ${Math.round(retryAfterSeconds)} saniye)`;
        }

        const rateLimitContainer = new ContainerBuilder()
          .setAccentColor(0xED4245)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ⏳ Rate Limit — Tarama Durduruldu`))
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `Discord API global rate limit uyguladı. Token geçici olarak engellendi.\n\n` +
            `> 📊 **Taranan:** \`${count}/${total}\` üye\n` +
            `> ⚠️ **Bulunan Uyumsuz:** \`${missing.length}\` üye\n\n` +
            `${waitTimeStr}`
          ))
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

        await interaction.editReply({ components: [rateLimitContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
        return;
      }
      console.error(`[BioGuild] Error processing user ${member.user.tag}:`, err);
      missing.push(member);
    }

    // Delay to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 750));
  }

  // Tarama Sonuçları
  if (missing.length === 0) {
    const resultContainer = new ContainerBuilder()
      .setAccentColor(0x57F287)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ✅ Tarama Tamamlandı`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `Tüm onaylı üyeler (\`${total}\` kişi) başarıyla kontrol edildi. \`${type === 'guild' ? guildName : bioName}\` ibaresini taşımayan hiç kimse bulunamadı!`
      ))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

    await interaction.editReply({ components: [resultContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
  } else {
    client.bioGuildScanResults = client.bioGuildScanResults || new Map();
    client.bioGuildScanResults.set(interaction.id, missing.map(m => m.id));
    const listText = missing.map(m => `- ${m} (\`${m.id}\`)`).join('\n');
    const targetWord = type === 'guild' ? guildName : bioName;

    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('bg_remove_roles')
        .setLabel('Permleri Çek')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('bg_send_list')
        .setLabel('Liste Gönder')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('bg_preview_list')
        .setLabel('Listeyi Ön İzle')
        .setStyle(ButtonStyle.Secondary)
    );

    let reply;
    if (listText.length > 1500) {
      const rawList = missing.map(m => `${m.user.tag} (${m.id})`).join('\n');
      const buffer = Buffer.from(rawList, 'utf-8');
      const attachment = new AttachmentBuilder(buffer, { name: `${type}-olmayanlar.txt` });

      const resultContainer = new ContainerBuilder()
        .setAccentColor(0xED4245)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ❌ Tarama Raporu`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `Tarama tamamlandı. **${total}** onaylı üyeden **${missing.length}** kişide \`${targetWord}\` bulunamadı.\n\n` +
          `*Liste uzun olduğu için dosya olarak eklenmiştir.*`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addActionRowComponents(actionRow)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

      reply = await interaction.editReply({ components: [resultContainer], files: [attachment], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
    } else {
      const resultContainer = new ContainerBuilder()
        .setAccentColor(0xED4245)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ❌ Tarama Raporu`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `Tarama tamamlandı. **${total}** onaylı üyeden **${missing.length}** kişide \`${targetWord}\` bulunamadı.\n\n` +
          `**Olmayanlar:**\n${listText}`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addActionRowComponents(actionRow)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

      reply = await interaction.editReply({ components: [resultContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
    }

    if (!reply) return;

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 15 * 60 * 1000 // 15 minutes
    });

    collector.on('collect', async i => {
      if (i.customId === 'bg_remove_roles') {
        await i.deferUpdate();

        let successCount = 0;
        let failCount = 0;
        let permFailCount = 0;

        const autoRoleId = client.config.autoRoleId;

        for (const m of missing) {
          try {
            const member = interaction.guild.members.cache.get(m.id) || await interaction.guild.members.fetch(m.id).catch(() => null);
            if (member) {
              const rolesToRemove = member.roles.cache.filter(role =>
                role.id !== interaction.guild.id &&
                role.id !== onayRoleId &&
                role.id !== autoRoleId &&
                !role.managed
              );
              if (rolesToRemove.size > 0) {
                await member.roles.remove(rolesToRemove, 'Bio/Guild taraması sonucu yetki çekme');
              }
              successCount++;
            } else {
              failCount++;
            }
          } catch (err) {
            if (err.code === 50013) {
              // Bot doesn't have permission (member's highest role is above bot's)
              permFailCount++;
            } else {
              console.error(`[BioGuild] Failed to remove roles for ${m.id}:`, err);
              failCount++;
            }
          }
        }

        let resultLines = `> **İşlem Durumu:** Tamamlandı.\n` +
          `> 👤 **Başarılı:** \`${successCount}\` üye.\n` +
          `> ❌ **Başarısız/Bulunamayan:** \`${failCount}\` üye.`;

        if (permFailCount > 0) {
          resultLines += `\n> 🔒 **Yetki Yetersizliği (Çekilemedi):** \`${permFailCount}\` üye. *(Bu üyelerin rolü botun rolünden daha yüksek konumda.)*`;
        }

        const accentColor = (successCount > 0 || permFailCount === missing.length) ? 0xf1c40f : 0x57F287;
        const titleEmoji = permFailCount > 0 ? '⚠️' : '✅';
        const titleText = permFailCount > 0 ? 'Yetkiler Kısmen Çekildi' : 'Yetkiler Çekildi';

        const successContainer = new ContainerBuilder()
          .setAccentColor(accentColor)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${titleEmoji} ${titleText}`))
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(resultLines))
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

        await interaction.editReply({ components: [successContainer], files: [], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
        collector.stop();
      }

      if (i.customId === 'bg_send_list') {
        // Modal açarak kanal ID'si iste
        const channelModal = new ModalBuilder()
          .setCustomId(`bg_channel_modal_${interaction.id}`)
          .setTitle('Liste Gönderme Kanalı');

        const channelIdInput = new TextInputBuilder()
          .setCustomId('channel_id')
          .setLabel('Kanal ID')
          .setPlaceholder('Örn: 1234567890123456789')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        channelModal.addComponents(
          new ActionRowBuilder().addComponents(channelIdInput)
        );

        await i.showModal(channelModal);

        // Modal submit handler
        const modalSubmit = await i.awaitModalSubmit({
          filter: modal => modal.customId === `bg_channel_modal_${interaction.id}` && modal.user.id === interaction.user.id,
          time: 60000
        }).catch(() => null);

        if (!modalSubmit) return;

        const channelId = modalSubmit.fields.getTextInputValue('channel_id').trim();
        const targetChannel = interaction.guild.channels.cache.get(channelId);

        if (!targetChannel || !targetChannel.isTextBased()) {
          return modalSubmit.reply({
            content: '❌ Geçersiz kanal ID\'si. Lütfen geçerli bir metin kanalı ID\'si girin.',
            flags: MessageFlags.Ephemeral
          });
        }

        await modalSubmit.deferReply({ flags: MessageFlags.Ephemeral });

        try {
          await sendOrUpdateBioGuildChannelList(client, targetChannel, interaction.id);
          await modalSubmit.editReply({
            content: `✅ Liste başarıyla ${targetChannel} kanalına gönderildi!`
          });
        } catch (err) {
          console.error('[BioGuild] sendOrUpdateBioGuildChannelList error:', err);
          await modalSubmit.editReply({
            content: '❌ Liste gönderilirken bir hata oluştu. Botun kanala mesaj gönderme yetkisi olduğundan emin olun.'
          });
        }
      }

      if (i.customId === 'bg_preview_list') {
        // Listeyi sadece kullanıcıya ephemeral olarak göster
        const previewList = missing.map((m, idx) => `${idx + 1}. ${m} (\`${m.id}\`)`).join('\n');
        
        if (previewList.length > 4000) {
          // Liste çok uzunsa dosya olarak gönder
          const rawList = missing.map(m => `${m.user.tag} (${m.id})`).join('\n');
          const buffer = Buffer.from(rawList, 'utf-8');
          const attachment = new AttachmentBuilder(buffer, { name: `${type}-olmayanlar-onizleme.txt` });
          
          await i.reply({
            content: `📋 **Uyumsuz Üyelerin Ön İzlemesi** (${missing.length} üye)\n\n*Liste uzun olduğu için dosya olarak eklenmiştir.*`,
            files: [attachment],
            flags: MessageFlags.Ephemeral
          });
        } else {
          await i.reply({
            content: `📋 **Uyumsuz Üyelerin Ön İzlemesi** (${missing.length} üye)\n\n${previewList}`,
            flags: MessageFlags.Ephemeral
          });
        }
      }
    });
  }
}

export async function sendOrUpdateBioGuildChannelList(client, channel, scanId, page = 0, messageId = null) {
  const missingIds = client.bioGuildScanResults?.get(scanId) || [];
  if (missingIds.length === 0) {
    throw new Error('CACHE_EXPIRED');
  }

  const PAGE_SIZE = 30;
  const totalPages = Math.max(1, Math.ceil(missingIds.length / PAGE_SIZE));

  if (page < 0) page = 0;
  if (page >= totalPages) page = totalPages - 1;

  const start = page * PAGE_SIZE;
  const slice = missingIds.slice(start, start + PAGE_SIZE);

  const listText = slice.map((id, i) => `${start + i + 1}. <@${id}> (\`${id}\`)`).join('\n');

  const container = new ContainerBuilder()
    .setAccentColor(0xED4245)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## <:Panda_robber:1520200560735813682> Biosu Olmayan Üye Listesi`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `Toplam **${missingIds.length}** uyumsuz üyeden **${start + 1} - ${Math.min(start + PAGE_SIZE, missingIds.length)}** arası listeleniyor:\n\n${listText}`
    ))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `-# Sayfa ${page + 1} / ${totalPages} • Viqole Bot\s`
    ));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`bg_list_prev:${scanId}:${page}`)
      .setLabel('◀ Önceki')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`bg_list_next:${scanId}:${page}`)
      .setLabel('Sonraki ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1)
  );

  const components = totalPages > 1 ? [container, row] : [container];

  if (messageId) {
    const msg = await channel.messages.fetch(messageId).catch(() => null);
    if (msg) {
      await msg.edit({ components, flags: MessageFlags.IsComponentsV2 });
      return msg;
    }
  }

  return await channel.send({ components, flags: MessageFlags.IsComponentsV2 });
}
