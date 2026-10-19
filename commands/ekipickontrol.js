import {
  SlashCommandBuilder, PermissionFlagsBits, MessageFlags,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize,
  ActionRowBuilder, ButtonBuilder, ButtonStyle
} from 'discord.js';
import fs from 'fs';

export const data = new SlashCommandBuilder()
  .setName('ekipickontrol')
  .setDescription('Ekip içi oyuncu aktiflik kontrolü ayarlarını düzenler.')
  .addStringOption(o => o.setName('sunucu')
    .setDescription('Ana Sunucu (MDRP veya WELL)')
    .setRequired(false)
    .addChoices(
      { name: 'MDRP', value: 'MDRP' },
      { name: 'WELL', value: 'WELL' }
    )
  )
  .addStringOption(o => o.setName('tur')
    .setDescription('Kontrol Türü')
    .setRequired(false)
    .addChoices(
      { name: 'İsim (Nickname Prefix)', value: 'isim' },
      { name: 'Kanal-list (Yazılı Liste)', value: 'kanal-list' },
      { name: 'Her İkisi (İsim + Kanal-list)', value: 'her-ikisi' }
    )
  );

export async function execute(interaction, client) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '❌ Bu komutu kullanabilmek için **Yönetici** yetkisine sahip olmalısınız.', flags: MessageFlags.Ephemeral });
  }

  const sunucu = interaction.options.getString('sunucu');
  const tur = interaction.options.getString('tur');

  const cp = client.configPath;

  // Case 1: Both options omitted - Show current settings
  if (!sunucu && !tur) {
    const mainServer = client.config.icKontrolMainServer || 'Ayarlanmadı';
    // Support both legacy string and new array format
    const typeRaw = client.config.icKontrolType;
    const activeTypes = Array.isArray(typeRaw) ? typeRaw : (typeRaw ? [typeRaw] : []);
    const activeServers = client.config.icKontrolActiveServers || [];

    const typeLabel = activeTypes.length === 0
      ? 'Ayarlanmadı'
      : activeTypes.length === 2
        ? 'Her İkisi (İsim + Kanal-list)'
        : activeTypes[0] === 'isim'
          ? 'İsim (Nickname Prefix)'
          : 'Kanal-list (Yazılı Liste)';

    let info = `### ⚙️ IC Kontrol Mevcut Ayarları\n\n` +
      `> 👑 **Ana Sunucu:** \`${mainServer}\`\n` +
      `> 📊 **Kontrol Türü:** \`${typeLabel}\`\n` +
      `> 🌐 **Aktif Tarama Sunucuları:** ${activeServers.length > 0 ? activeServers.map(s => `\`${s}\``).join(', ') : 'Hiçbiri'}\n`;

    if (activeTypes.includes('kanal-list')) {
      info += `> 📺 **Liste Kanalı:** <#${client.config.icKontrolChannelId || '-'}>\n`;
    }

    const container = new ContainerBuilder()
      .setAccentColor(0x3498db)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(info))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

    const row = new ActionRowBuilder();
    
    // Add "Ekle" button only if a main server has been configured
    if (client.config.icKontrolMainServer) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('ickontrol_ekle_start')
          .setLabel('Ekle')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('➕')
      );
      container.addActionRowComponents(row);
    } else {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ℹ️ Yeni ayarları kaydetmek için lütfen \`/ekipickontrol sunucu:MDRP tur:isim\` şeklinde komutu doldurarak kullanın.`));
    }

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

    return interaction.reply({ components: [container], flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
  }

  // Case 2: Only one option provided
  if (!sunucu || !tur) {
    return interaction.reply({ content: '❌ Eğer bir alanı doldurursanız diğer alanın da doldurulması zorunludur. Lütfen iki seçeneği de doldurun.', flags: MessageFlags.Ephemeral });
  }

  // Case 3: Both options provided
  try {
    let currentConfig = {};
    if (fs.existsSync(cp)) {
      currentConfig = JSON.parse(fs.readFileSync(cp, 'utf8'));
    }

    // Convert 'her-ikisi' to array, otherwise wrap single value in array
    const newTypes = tur === 'her-ikisi' ? ['isim', 'kanal-list'] : [tur];
    const typeLabel = newTypes.length === 2
      ? 'Her İkisi (İsim + Kanal-list)'
      : newTypes[0] === 'isim'
        ? 'İsim (Nickname Prefix)'
        : 'Kanal-list (Yazılı Liste)';

    currentConfig.icKontrolMainServer = sunucu;
    currentConfig.icKontrolType = newTypes;
    currentConfig.icKontrolActiveServers = [sunucu]; // Reset active servers to only contain the main one
    currentConfig.icKontrolChannelId = interaction.channel.id;
    currentConfig.icKontrolMessageId = null; // Reset message id

    // If kanal-list is one of the active types, create the list message
    if (newTypes.includes('kanal-list')) {
      const msg = await interaction.channel.send({ content: '⏳ Oyuncu listesi hazırlanıyor...' });
      currentConfig.icKontrolMessageId = msg.id;
    }

    fs.writeFileSync(cp, JSON.stringify(currentConfig, null, 2), 'utf8');
    client.config = currentConfig;

    const container = new ContainerBuilder()
      .setAccentColor(0x57F287)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ✅ IC Kontrol Ayarları Kaydedildi`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `> 👑 **Ana Sunucu:** \`${sunucu}\`\n` +
        `> 📊 **Kontrol Türü:** \`${typeLabel}\`\n` +
        `> 📺 **Kanal:** ${interaction.channel}\n` +
        `> 🌐 **Aktif Tarama Sunucuları:** \`${sunucu}\`\n\n` +
        `-# ℹ️ Diğer sunucuları taramaya eklemek için komutu parametresiz çalıştırıp 'Ekle' butonuna basabilirsiniz.`
      ))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

    return interaction.reply({ components: [container], flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });

  } catch (err) {
    console.error('Error saving IC Kontrol config:', err);
    return interaction.reply({ content: '❌ Ayarlar kaydedilirken hata oluştu.', flags: MessageFlags.Ephemeral });
  }
}
