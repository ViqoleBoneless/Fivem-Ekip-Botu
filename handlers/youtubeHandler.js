import {
  loadYoutubeChannels as loadChannels,
  saveYoutubeChannels as saveChannels,
  loadYtPending,
  saveYtPending,
  addYtPending,
  removeYtPending,
  getYtPending
} from '../db.js';
import {
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, MessageFlags,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize,
  PermissionFlagsBits
} from 'discord.js';
import { getChannelIdFromUrl, getChannelName } from '../services/youtubeService.js';

// YouTube log kanalına log gönder (ContainerBuilder V2)
async function sendYoutubeLog(client, guild, title, color, fields) {
  const logChannelId = client.config.youtubeLogChannelId;
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
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));
    await logChannel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
  } catch (error) { console.error('YouTube log hatası:', error); }
}

// YT Sorumlusu rolüne sahip mi kontrol et
function hasYtSorumlusuRole(interaction, client) {
  const ytRoleId = client.config.ytSorumlusuRoleId;
  if (!ytRoleId) return false;
  return interaction.member.roles.cache.has(ytRoleId);
}

// ─── EKLE ───
export async function handleYoutubeEkle(interaction, client) {
  const modal = new ModalBuilder().setCustomId('youtube_ekle_modal').setTitle('YouTube Kanal Ekle');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('youtube_channel_link').setLabel('YouTube Kanal Linki').setStyle(TextInputStyle.Short).setPlaceholder('https://www.youtube.com/@KanalAdi').setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('youtube_everyone').setLabel('@everyone Etiketi (var/yok)').setStyle(TextInputStyle.Short).setPlaceholder('var veya yok').setRequired(true).setMaxLength(3))
  );
  await interaction.showModal(modal);
}

export async function handleYoutubeEkleModal(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
  const channelLink = interaction.fields.getTextInputValue('youtube_channel_link').trim();
  const everyoneValue = interaction.fields.getTextInputValue('youtube_everyone').trim().toLowerCase();
  if (everyoneValue !== 'var' && everyoneValue !== 'yok') return interaction.editReply({ content: '❌ @everyone değeri sadece "var" veya "yok" olabilir.' });
  const everyone = everyoneValue === 'var';

  try {
    const channelId = await getChannelIdFromUrl(channelLink);
    if (!channelId) return interaction.editReply({ content: '❌ Geçersiz YouTube kanal linki.' });
    const channels = loadChannels();
    if (channels.find(c => c.channelId === channelId)) return interaction.editReply({ content: '❌ Bu kanal zaten sistemde kayıtlı!' });
    const channelName = await getChannelName(channelId) || 'Bilinmeyen Kanal';

    if (hasYtSorumlusuRole(interaction, client)) {
      channels.push({ channelId, channelLink, channelName, everyone, lastVideoId: null, addedAt: new Date().toISOString() });
      saveChannels(channels);

      const container = new ContainerBuilder()
        .setAccentColor(0x57F287)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## <a:tik:1507733693903540265> Kanal Eklendi`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `> <:475960stagechannelon:1508015138005979309> **Kanal:** ${channelName}\n` +
          `> 🔔 **@everyone:** ${everyone ? 'Var' : 'Yok'}`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

      await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });

      await sendYoutubeLog(client, interaction.guild,
        '<a:youtube:1507744406500020345> YouTube Kanal Eklendi',
        0x57F287,
        [
          { name: 'Kanal', value: channelName },
          { name: '@everyone', value: everyone ? 'Var' : 'Yok' },
          { name: 'Ekleyen', value: `${interaction.user} (\`${interaction.user.tag}\`)` },
          { name: 'Link', value: channelLink }
        ]
      );
    } else {
      const managementChannelId = client.config.youtubeManagementChannelId;
      if (!managementChannelId) return interaction.editReply({ content: '❌ YouTube yönetim kanalı ayarlanmamış. Lütfen bir yetkiliye başvurun.' });

      try {
        const mgmtChannel = await interaction.guild.channels.fetch(managementChannelId);
        if (!mgmtChannel?.isTextBased()) return interaction.editReply({ content: '❌ YouTube yönetim kanalı bulunamadı.' });

        const mgmtRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`ytapprove_add_${channelId}_${everyone ? '1' : '0'}_${interaction.user.id}`).setLabel('Onayla').setStyle(ButtonStyle.Success).setEmoji({ id: '1507733693903540265' }),
          new ButtonBuilder().setCustomId(`ytreject_add_${interaction.user.id}`).setLabel('Reddet').setStyle(ButtonStyle.Danger).setEmoji({ id: '1507748207617114264' })
        );

        const mgmtContainer = new ContainerBuilder()
          .setAccentColor(0xFEE75C)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## <a:youtube:1507744406500020345> YouTube Kanal Ekleme İsteği`))
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `> <:ye:1507732515585265825> **İsteyen:** ${interaction.user} (\`${interaction.user.tag}\`)\n` +
            `> <:475960stagechannelon:1508015138005979309> **Kanal:** ${channelName}\n` +
            `> <a:duyuruvar:1507733857917735022> **everyone:** ${everyone ? 'Var' : 'Yok'}\n` +
            `> <:balant:1506291932752515254> **Link:** ${channelLink}\n` +
            `> 🆔 **İsteyen ID:** \`${interaction.user.id}\``
          ))
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
          .addActionRowComponents(mgmtRow)
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# FiveM Ekip Yönetim Sistemi`));

        addYtPending(channelId, { channelId, channelLink, channelName, everyone, requesterId: interaction.user.id });

        await mgmtChannel.send({ components: [mgmtContainer], flags: MessageFlags.IsComponentsV2 });
        await interaction.editReply({ content: '📨 Kanal ekleme isteğiniz **YouTube Yönetim** kanalına gönderildi. Onay bekliyor...' });
      } catch (error) {
        console.error('YouTube onay gönderme hatası:', error);
        await interaction.editReply({ content: '❌ İstek gönderilirken hata oluştu.' });
      }
    }
  } catch (error) {
    console.error('YouTube ekle hatası:', error);
    await interaction.editReply({ content: '❌ Kanal eklenirken hata oluştu.' });
  }
}

// ─── ÇIKART ───
export async function handleYoutubeCikart(interaction, client) {
  const modal = new ModalBuilder().setCustomId('youtube_cikart_modal').setTitle('YouTube Kanal Çıkart');
  modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('youtube_cikart_input').setLabel('Kanal Linki veya Sıra Numarası').setStyle(TextInputStyle.Short).setPlaceholder('https://www.youtube.com/@... veya 1').setRequired(true)));
  await interaction.showModal(modal);
}

export async function handleYoutubeCikartModal(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
  const input = interaction.fields.getTextInputValue('youtube_cikart_input').trim();
  try {
    const channels = loadChannels();
    if (channels.length === 0) return interaction.editReply({ content: '❌ Sistemde kayıtlı kanal yok.' });
    let removedChannel = null, removedIndex = -1;
    const numberMatch = input.match(/^(\d+)$/);
    if (numberMatch) {
      const index = parseInt(numberMatch[1], 10) - 1;
      if (index >= 0 && index < channels.length) { removedChannel = channels[index]; removedIndex = index; }
      else return interaction.editReply({ content: `❌ Geçersiz sıra numarası. 1-${channels.length} arasında girin.` });
    } else {
      const channelId = await getChannelIdFromUrl(input);
      if (channelId) { removedIndex = channels.findIndex(c => c.channelId === channelId); if (removedIndex !== -1) removedChannel = channels[removedIndex]; }
    }
    if (!removedChannel) return interaction.editReply({ content: '❌ Kanal bulunamadı.' });

    if (hasYtSorumlusuRole(interaction, client)) {
      channels.splice(removedIndex, 1);
      saveChannels(channels);

      const container = new ContainerBuilder()
        .setAccentColor(0xFEE75C)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## <a:tik:1507733693903540265> Kanal Çıkarıldı`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `> <:475960stagechannelon:1508015138005979309> **Kanal:** ${removedChannel.channelName}`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

      await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });

      await sendYoutubeLog(client, interaction.guild,
        '<a:youtube:1507744406500020345> YouTube Kanal Çıkarıldı',
        0xED4245,
        [
          { name: 'Kanal', value: removedChannel.channelName },
          { name: 'Çıkaran', value: `${interaction.user} (\`${interaction.user.tag}\`)` },
          { name: 'Link', value: removedChannel.channelLink || 'Bilinmiyor' }
        ]
      );
    } else {
      const managementChannelId = client.config.youtubeManagementChannelId;
      if (!managementChannelId) return interaction.editReply({ content: '❌ YouTube yönetim kanalı ayarlanmamış.' });

      try {
        const mgmtChannel = await interaction.guild.channels.fetch(managementChannelId);
        if (!mgmtChannel?.isTextBased()) return interaction.editReply({ content: '❌ YouTube yönetim kanalı bulunamadı.' });

        const mgmtRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`ytapprove_remove_${removedChannel.channelId}_0_${interaction.user.id}`).setLabel('Onayla').setStyle(ButtonStyle.Success).setEmoji({ id: '1507733693903540265' }),
          new ButtonBuilder().setCustomId(`ytreject_remove_${interaction.user.id}`).setLabel('Reddet').setStyle(ButtonStyle.Danger).setEmoji({ id: '1507748207617114264' })
        );

        const mgmtContainer = new ContainerBuilder()
          .setAccentColor(0xED4245)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## <a:youtube:1507744406500020345> YouTube Kanal Çıkarma İsteği`))
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `> <:ye:1507732515585265825> **İsteyen:** ${interaction.user} (\`${interaction.user.tag}\`)\n` +
            `> <:475960stagechannelon:1508015138005979309> **Kanal:** ${removedChannel.channelName}\n` +
            `> <:balant:1506291932752515254> **Link:** ${removedChannel.channelLink || 'Bilinmiyor'}\n` +
            `> 🆔 **İsteyen ID:** \`${interaction.user.id}\``
          ))
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
          .addActionRowComponents(mgmtRow)
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

        await mgmtChannel.send({ components: [mgmtContainer], flags: MessageFlags.IsComponentsV2 });
        await interaction.editReply({ content: '📨 Kanal çıkarma isteğiniz **YouTube Yönetim** kanalına gönderildi. Onay bekliyor...' });
      } catch (error) {
        console.error('YouTube çıkarma onay hatası:', error);
        await interaction.editReply({ content: '❌ İstek gönderilirken hata oluştu.' });
      }
    }
  } catch (error) { await interaction.editReply({ content: '❌ Hata oluştu.' }); }
}

// ─── LİSTELE ───
export async function handleYoutubeListele(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
  try {
    const channels = loadChannels();
    if (channels.length === 0) return interaction.editReply({ content: '📋 Sistemde kayıtlı kanal yok.' });

    let channelList = '';
    channels.forEach((ch, i) => { channelList += `\n**${i + 1}.** ${ch.channelName} (${ch.everyone ? '<a:tik:1507733693903540265> @everyone' : '<a:warning:1507734002524487800> yok'})\n   <:balant:1506291932752515254> [Kanal Linki](${ch.channelLink})`; });

    const container = new ContainerBuilder()
      .setAccentColor(0xFF0000)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 📋 Kayıtlı YouTube Kanalları`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `Toplam **${channels.length}** kanal takip ediliyor.\n${channelList}`
      ))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));
    await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  } catch (err) {
    console.error('YouTube listeleme hatası:', err);
    await interaction.editReply({ content: '❌ Hata oluştu.' });
  }
}

// ─── ONAY/RED BUTONLARI ───
export async function handleYoutubeApprove(interaction, client) {
  const parts = interaction.customId.split('_');
  const action = parts[1];
  const ytChannelId = parts[2];
  const requesterId = parts[4];

  try {
    await interaction.reply({ content: '⏳ İşlem yapılıyor...', flags: MessageFlags.Ephemeral });

    if (action === 'add') {
      const everyone = parts[3] === '1';
      const pendingData = getYtPending(ytChannelId);
      if (!pendingData) return interaction.editReply({ content: '❌ Bekleyen istek bulunamadı.' });

      const channels = loadChannels();
      if (channels.find(c => c.channelId === ytChannelId)) return interaction.editReply({ content: '❌ Bu kanal zaten ekli.' });

      channels.push({ channelId: ytChannelId, channelLink: pendingData.channelLink, channelName: pendingData.channelName, everyone, lastVideoId: null, addedAt: new Date().toISOString() });
      saveChannels(channels);

      removeYtPending(ytChannelId);

      try { const user = await client.users.fetch(requesterId); await user.send(`<a:tik:1507733693903540265> YouTube kanal ekleme isteğiniz onaylandı: **${pendingData.channelName}**`); } catch { }

      await sendYoutubeLog(client, interaction.guild,
        '<a:youtube:1507744406500020345> YouTube Kanal Eklendi (Onay ile)',
        0x57F287,
        [
          { name: 'Kanal', value: pendingData.channelName },
          { name: 'İsteyen', value: `<@${requesterId}>` },
          { name: 'Onaylayan', value: `${interaction.user} (\`${interaction.user.tag}\`)` },
          { name: 'Link', value: pendingData.channelLink }
        ]
      );

      await interaction.editReply({ content: `<a:tik:1507733693903540265> Kanal eklendi: **${pendingData.channelName}**` });
      await interaction.message.delete().catch(() => null);
    } else if (action === 'remove') {
      const channels = loadChannels();
      const removeIndex = channels.findIndex(c => c.channelId === ytChannelId);
      if (removeIndex === -1) return interaction.editReply({ content: '❌ Kanal bulunamadı.' });

      const removedChannel = channels[removeIndex];
      channels.splice(removeIndex, 1);
      saveChannels(channels);

      try { const user = await client.users.fetch(requesterId); await user.send(`<a:tik:1507733693903540265> YouTube kanal çıkarma isteğiniz onaylandı: **${removedChannel.channelName}**`); } catch { }

      await sendYoutubeLog(client, interaction.guild,
        '📥 YouTube Kanal Çıkarıldı (Onay ile)',
        0xED4245,
        [
          { name: 'Kanal', value: removedChannel.channelName },
          { name: 'İsteyen', value: `<@${requesterId}>` },
          { name: 'Onaylayan', value: `${interaction.user} (\`${interaction.user.tag}\`)` }
        ]
      );

      await interaction.editReply({ content: `<a:tik:1507733693903540265> Kanal çıkarıldı: **${removedChannel.channelName}**` });
      await interaction.message.delete().catch(() => null);
    }
  } catch (error) {
    console.error('YouTube onay hatası:', error);
    await interaction.editReply({ content: '❌ Hata oluştu.' });
  }
}

export async function handleYoutubeReject(interaction, client) {
  const parts = interaction.customId.split('_');
  const action = parts[1];
  const requesterId = parts[2];

  try {
    await interaction.reply({ content: '⏳ İşlem yapılıyor...', flags: MessageFlags.Ephemeral });

    try {
      const user = await client.users.fetch(requesterId);
      await user.send(`<a:warning:1507734002524487800> YouTube kanal ${action === 'add' ? 'ekleme' : 'çıkarma'} isteğiniz reddedildi.`);
    } catch { }

    await sendYoutubeLog(client, interaction.guild,
      `📥 YouTube Kanal ${action === 'add' ? 'Ekleme' : 'Çıkarma'} - Reddedildi`,
      0xED4245,
      [
        { name: 'İsteyen', value: `<@${requesterId}>` },
        { name: 'Reddeden', value: `${interaction.user} (\`${interaction.user.tag}\`)` }
      ]
    );

    await interaction.editReply({ content: '<a:tik:1507733693903540265> İstek reddedildi ve kullanıcıya bildirildi.' });
    await interaction.message.delete().catch(() => null);
  } catch (error) {
    console.error('YouTube red hatası:', error);
    await interaction.editReply({ content: '❌ Hata oluştu.' });
  }
}

// ─── KONTROL ───
export async function handleYoutubeKontrol(interaction, client) {
  const isManager = hasYtSorumlusuRole(interaction, client);
  const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
  if (!isManager && !isAdmin) {
    return interaction.reply({ content: '❌ Bu işlemi sadece **YT Sorumlusu** veya **Yöneticiler** gerçekleştirebilir.', flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });

  try {
    const { checkYoutubeVideos } = await import('../tasks/youtubeCheck.js');
    const result = await checkYoutubeVideos(client);
    
    const container = new ContainerBuilder()
      .setAccentColor(0x57F287)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## <a:tik:1507733693903540265> Kontrol Tamamlandı`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `> 🔍 **Kontrol Edilen Kanal:** \`${result.checked}\` adet\n` +
        `> 📺 **Gönderilen Yeni Video:** \`${result.sent}\` adet\n\n` +
        `*Tüm kanallar başarıyla taranarak en güncel videolar kontrol edildi.*`
      ))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

    await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  } catch (error) {
    console.error('YouTube manuel kontrol hatası:', error);
    await interaction.editReply({ content: '❌ Kanallar kontrol edilirken bir hata oluştu.' });
  }
}
