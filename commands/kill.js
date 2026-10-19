import {
  SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize,
  MessageFlags
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('kill')
  .setDescription('Yeni bir kill kanalı oluşturur.')
  .addStringOption(o => o.setName('isim').setDescription('Oluşturulacak kanalın ismi').setRequired(true));

export async function execute(interaction, client) {
  const categoryId = process.env.KILL_CATEGORY_ID || client.config?.killCategoryId;
  if (!categoryId) return interaction.reply({ content: '❌ killCategoryId ayarlanmamış.', ephemeral: true });

  const category = await interaction.guild.channels.fetch(categoryId).catch(() => null);
  if (!category || category.type !== ChannelType.GuildCategory) return interaction.reply({ content: '❌ Kategori bulunamadı.', ephemeral: true });

  const channelName = interaction.options.getString('isim', true).toLowerCase().replace(/\s+/g, '-');
  const existingChannel = interaction.guild.channels.cache.find(ch => ch.name === channelName && ch.parentId === categoryId);
  if (existingChannel) return interaction.reply({ content: `❌ \`${channelName}\` adında bir kanal zaten mevcut.`, ephemeral: true });

  try {
    const permissionOverwrites = category.permissionOverwrites.cache.map(ow => ({ id: ow.id, type: ow.type, allow: ow.allow, deny: ow.deny }));
    const newChannel = await interaction.guild.channels.create({ name: channelName, type: ChannelType.GuildText, parent: categoryId, permissionOverwrites });

    const channelsInCategory = interaction.guild.channels.cache.filter(ch => ch.parentId === categoryId && ch.id !== newChannel.id).sort((a, b) => a.position - b.position);
    if (channelsInCategory.size > 0) {
      const arr = [...channelsInCategory.values()];
      await newChannel.setPosition(arr[arr.length - 1].position + 1);
    }

    const welcomeContainer = new ContainerBuilder()
      .setAccentColor(0x5865F2)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🎯 Yeni Kill Kanalı Oluşturuldu`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `> Yeni aldığınız kill povları yüklemeniz için bu kanal oluşturuldu.`
      ))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# FiveM Ekip Yönetim Sistemi`));

    await newChannel.send({ content: '@here' });
    await newChannel.send({ components: [welcomeContainer], flags: MessageFlags.IsComponentsV2 });

    const container = new ContainerBuilder()
      .setAccentColor(0x57F287)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ✅ Kanal Oluşturuldu`)
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `\`${channelName}\` adlı kanal başarıyla oluşturuldu.\n\n` +
          `> 📍 **Konum:** \`${category.name}\``
        )
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('-# Viqole Bot`s')
      );

    await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2, ephemeral: true });
  } catch (error) {
    console.error('Kill kanalı hatası:', error);
    await interaction.reply({ content: '❌ Kanal oluşturulurken hata oluştu.', ephemeral: true });
  }
}
