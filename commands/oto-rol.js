import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize
} from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const data = new SlashCommandBuilder()
  .setName('oto-rol')
  .setDescription('Sunucuya katılan herkese otomatik verilecek rolü ayarla.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addRoleOption(option =>
    option
      .setName('rol')
      .setDescription('Otomatik verilecek rol (kapatmak için boş bırakın)')
      .setRequired(false)
  );

export async function execute(interaction, client) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
    return interaction.reply({ content: '❌ Yönetici yetkisi gerekiyor.', ephemeral: true });

  const role = interaction.options.getRole('rol');
  const configPath = client.configPath || path.join(__dirname, '../config.json');

  let config = {};
  try {
    if (fs.existsSync(configPath)) config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch { config = {}; }

  if (!role) {
    // Kapat
    delete config.autoRoleId;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    client.config = config;

    const container = new ContainerBuilder()
      .setAccentColor(0xED4245)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('## ❌ Oto-Rol Kapatıldı'))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('> Artık sunucuya katılan üyelere otomatik rol **verilmeyecek**.'))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

    return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
  }

  // Bot'un rolü verip veremeyeceğini kontrol et
  const botMember = interaction.guild.members.me;
  if (role.position >= botMember.roles.highest.position) {
    return interaction.reply({
      content: `❌ \`${role.name}\` rolü botun en yüksek rolünden daha yukarıda! Bot bu rolü veremez.`,
      ephemeral: true
    });
  }

  if (role.managed) {
    return interaction.reply({
      content: `❌ \`${role.name}\` bir entegrasyon tarafından yönetilen bir rol, kullanılamaz.`,
      ephemeral: true
    });
  }

  config.autoRoleId = role.id;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  client.config = config;

  const container = new ContainerBuilder()
    .setAccentColor(0x57F287)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('## ✅ Oto-Rol Ayarlandı'))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `> <:mod:1507746579078053999> **Rol:** ${role}\n` +
      `> 🆔 **Rol ID:** \`${role.id}\`\n\n` +
      `> Artık sunucuya katılan her üye otomatik olarak bu rolü alacak.`
    ))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Viqole Bot`s'));

  return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
}
