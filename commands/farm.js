import {
  SlashCommandBuilder,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize,
  MessageFlags, MediaGalleryBuilder, MediaGalleryItemBuilder
} from 'discord.js';
import { getFarmAmount } from '../db.js';
import { E } from '../utils/emojis.js';

export const data = new SlashCommandBuilder()
  .setName('farm')
  .setDescription('Bir üyenin toplam farm değerini gösterir.')
  .addUserOption(o => o.setName('uye').setDescription('Farm değeri gösterilecek üye (boş = kendin)').setRequired(false));

export async function execute(interaction) {
  const targetUser = interaction.options.getUser('uye') || interaction.user;
  const current = getFarmAmount(interaction.guild.id, targetUser.id);

  const container = new ContainerBuilder()
    .setAccentColor(0x5865F2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## 🌾 Farm Bilgisi`)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${targetUser} kullanıcısının farm bilgileri:\n\n` +
        `> ${E.uye} **Kullanıcı:** ${targetUser} (\`${targetUser.tag}\`)\n` +
        `> 📊 **Toplam Farm:** \`${current.toLocaleString('tr-TR')}\` farm\n` +
        `> 🆔 **ID:** \`${targetUser.id}\``
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('-# Viqole Bot`s')
    );

  await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}
