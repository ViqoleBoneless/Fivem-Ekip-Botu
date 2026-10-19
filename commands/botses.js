import {
  SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder
} from 'discord.js';
import { joinVoiceChannel, getVoiceConnection } from '@discordjs/voice';
import { setVoiceConfig, clearVoiceConfig, getVoiceConfig } from '../db.js';
import { E } from '../utils/emojis.js';

export const data = new SlashCommandBuilder()
  .setName('botses')
  .setDescription('Botun ses kanalı yönetim paneli (Gir, Çık, Durum).')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(opt =>
    opt.setName('eylem')
      .setDescription('Yapılacak işlem (seçilmezse yönetim paneli açılır)')
      .setRequired(false)
      .addChoices(
        { name: 'Yönetim Paneli / Durum', value: 'durum' },
        { name: 'Kanalına Gir', value: 'gir' },
        { name: 'Sesten Çıkart', value: 'çık' }
      )
  )
  .addChannelOption(opt =>
    opt.setName('kanal')
      .setDescription('Botun gireceği ses kanalı (Gir işlemi için)')
      .setRequired(false)
      .addChannelTypes(ChannelType.GuildVoice)
  );

export function buildVoiceControlPanel(guild, client) {
  const connection = getVoiceConnection(guild.id);
  const savedConfig = getVoiceConfig();

  let channelMention = 'Yok';
  if (savedConfig?.channelId) {
    channelMention = `<#${savedConfig.channelId}> (\`${savedConfig.channelId}\`)`;
  }

  const isConnected = connection && connection.state.status === 'ready';
  const accentColor = isConnected ? 0x57F287 : (connection ? 0xFEE75C : 0x747F8D);
  const statusText = isConnected
    ? '🟢 Bağlı (Aktif)'
    : (connection ? `🟡 Bağlanıyor (${connection.state.status})` : '🔴 Bağlı Değil');

  const container = new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🎙️ Bot Ses Yönetim Paneli`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `> 📡 **Bağlantı Durumu:** ${statusText}\n` +
      `> ${E.kanal || '📺'} **Kayıtlı Ses Kanalı:** ${channelMention}\n` +
      `> 🔄 **Otomatik Koruma:** ${savedConfig?.channelId ? 'Aktif (30sn periyot)' : 'Pasif'}\n` +
      `> 🔇 **Self-Deaf:** Aktif\n\n` +
      `*Aşağıdaki menüden veya butonlardan botun ses bağlantısını anında yönetebilirsiniz.*`
    ))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

  // Menü: Ses kanalı seçimi
  const channelRow = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId('botses_select_channel')
      .setPlaceholder('Botun gireceği ses kanalını seçin...')
      .setChannelTypes(ChannelType.GuildVoice)
  );

  // Butonlar: Bulunduğum Kanala Gir, Sesten Çıkart, Durumu Yenile
  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('botses_btn_join_user')
      .setLabel('Kanalıma Gir')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🔊'),
    new ButtonBuilder()
      .setCustomId('botses_btn_leave')
      .setLabel('Sesten Çıkart')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔇'),
    new ButtonBuilder()
      .setCustomId('botses_btn_refresh')
      .setLabel('Yenile')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔄')
  );

  container
    .addActionRowComponents(channelRow)
    .addActionRowComponents(buttonRow)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

  return container;
}

export function handleJoinVoice(channel, guild) {
  joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfMute: false,
    selfDeaf: true
  });
  setVoiceConfig(channel.id, guild.id);
}

export function handleLeaveVoice(guild) {
  const connection = getVoiceConnection(guild.id);
  if (connection) connection.destroy();
  clearVoiceConfig();
}

export async function execute(interaction, client) {
  // Check permissions: Administrator or Bot Owner
  const ownerIds = (client.config?.ownerIds || '').split(',').map(id => id.trim()).filter(Boolean);
  const isOwner = ownerIds.includes(interaction.user.id) || interaction.guild.ownerId === interaction.user.id;
  const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

  if (!isAdmin && !isOwner) {
    return interaction.reply({
      content: '❌ Bu komutu sadece **Yöneticiler** veya **Bot Sahipleri** kullanabilir.',
      flags: MessageFlags.Ephemeral
    });
  }

  const action = interaction.options.getString('eylem');
  const targetChannel = interaction.options.getChannel('kanal');

  // 1. DOĞRUDAN KANALINA GİR İŞLEMİ
  if (action === 'gir') {
    let channelToJoin = targetChannel;
    if (!channelToJoin && interaction.member?.voice?.channel) {
      channelToJoin = interaction.member.voice.channel;
    }

    if (!channelToJoin) {
      return interaction.reply({
        content: '❌ Lütfen komutta bir kanal belirtin veya bir ses kanalına girin.',
        flags: MessageFlags.Ephemeral
      });
    }

    try {
      handleJoinVoice(channelToJoin, interaction.guild);
      const container = buildVoiceControlPanel(interaction.guild, client);
      return interaction.reply({
        content: `✅ Bot ${channelToJoin} kanalına sokuldu ve korumaya alındı!`,
        components: [container],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
      });
    } catch (err) {
      console.error('[BOTSES] Gir hatası:', err);
      return interaction.reply({ content: `❌ Hata: ${err.message}`, flags: MessageFlags.Ephemeral });
    }
  }

  // 2. DOĞRUDAN SESTEN ÇIKART İŞLEMİ
  if (action === 'çık') {
    try {
      handleLeaveVoice(interaction.guild);
      const container = buildVoiceControlPanel(interaction.guild, client);
      return interaction.reply({
        content: '✅ Bot ses kanalından çıkartıldı ve koruma kapatıldı.',
        components: [container],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
      });
    } catch (err) {
      console.error('[BOTSES] Çık hatası:', err);
      return interaction.reply({ content: `❌ Hata: ${err.message}`, flags: MessageFlags.Ephemeral });
    }
  }

  // 3. YÖNETİM PANELİ / DURUM (Varsayılan)
  const container = buildVoiceControlPanel(interaction.guild, client);
  return interaction.reply({
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
  });
}
