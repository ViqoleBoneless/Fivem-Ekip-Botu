import {
  SlashCommandBuilder, PermissionFlagsBits, MessageFlags,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder
} from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configPath = path.join(__dirname, '../config.json');

export const data = new SlashCommandBuilder()
  .setName('perm')
  .setDescription('Bir rol veya kişiye yetki tanımlar.')
  .addUserOption(o =>
    o.setName('kisi')
      .setDescription('Yetki tanımlanacak kişi')
      .setRequired(false)
  )
  .addStringOption(o =>
    o.setName('kisi_id')
      .setDescription("Yetki tanımlanacak kişinin Discord ID'si")
      .setRequired(false)
  )
  .addRoleOption(o =>
    o.setName('rol')
      .setDescription('Yetki tanımlanacak rol')
      .setRequired(false)
  );

export async function execute(interaction, client) {
  const activeConfigPath = client.configPath || configPath;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Ekip sahibi kontrolü
  const ownerIdsStr = client.config.ownerIds || '';
  const ownerIds = ownerIdsStr ? ownerIdsStr.split(',').map(id => id.trim()).filter(Boolean) : [];
  
  if (ownerIds.length > 0) {
    if (!ownerIds.includes(interaction.user.id)) {
      return interaction.editReply({ content: '❌ Bu komutu sadece **Ekip Sahibi** kullanabilir.' });
    }
  } else {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.editReply({ content: '❌ Ekip sahibi tanımlanmamış. Bu komutu kullanmak için **Yönetici** yetkisine sahip olmalısınız.' });
    }
  }

  let targetUser = interaction.options.getUser('kisi');
  const kisiIdStr = interaction.options.getString('kisi_id');
  const targetRole = interaction.options.getRole('rol');

  if (kisiIdStr) {
    try {
      targetUser = await client.users.fetch(kisiIdStr);
    } catch {
      return interaction.editReply({ content: "❌ Geçersiz bir kullanıcı ID'si girdiniz veya kullanıcı bulunamadı." });
    }
  }

  const selectionCount = (targetUser ? 1 : 0) + (targetRole ? 1 : 0);
  if (selectionCount > 1) {
    return interaction.editReply({ content: '❌ Lütfen sadece bir kişi veya rol seçin, ikisini birden seçemezsiniz.' });
  }

  // Boş bırakılarak gönderilirse listeyi göster
  if (!targetRole && !targetUser) {
    const allUsersStr = client.config.allPermUsers || '';
    const allUsers = allUsersStr ? allUsersStr.split(',').map(id => id.trim()).filter(Boolean) : [];
    
    const allRolesStr = client.config.allPermRoles || '';
    const allRoles = allRolesStr ? allRolesStr.split(',').map(id => id.trim()).filter(Boolean) : [];

    const embed = new EmbedBuilder()
      .setTitle('🔑 Dinamik Yetkili Listesi')
      .setColor(0x5865F2)
      .setDescription(
        `### 👤 Yetkili Kişiler (All-Perm):\n` +
        (allUsers.length > 0 ? allUsers.map(id => `- <@${id}> (\`${id}\`)`).join('\n') : '*Hiç yok.*\n') +
        `\n### 🎭 Yetkili Roller (All-Perm):\n` +
        (allRoles.length > 0 ? allRoles.map(id => `- <@&${id}> (\`${id}\`)`).join('\n') : '*Hiç yok.*') +
        `\n\n*Not: Tüm yetkileri ve detaylı listeyi web panelindeki "Yetki Yönetimi" kısmından görüntüleyebilirsiniz.*`
      )
      .setFooter({ text: 'Viqole Bot`s' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('all_perm_cikar')
        .setLabel('Hızlı All-Perm Çıkart')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
    );

    return interaction.editReply({ embeds: [embed], components: [row] });
  }

  const permRoles = [
    { key: 'ticketStaffRoleId', label: 'Alım Sorumlusu' },
    { key: 'banCommandRoleId', label: 'Ban Sorumlusu' },
    { key: 'farmSorumlusuRoleId', label: 'Farm Sorumlusu' },
    { key: 'ytSorumlusuRoleId', label: 'YouTube Sorumlusu' },
    { key: 'all-perm', label: 'Tüm Yetkiler (All-Perm)' }
  ];

  if (targetUser) {
    const selectOptions = permRoles.map(perm => 
      new StringSelectMenuOptionBuilder()
        .setLabel(perm.label)
        .setValue(perm.key)
        .setDescription(`Kişiye ${perm.label} yetkisini tanımlar.`)
    );

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`perm_select_user_${targetUser.id}`)
      .setPlaceholder('Eklenecek Yetkileri Seçiniz..')
      .setMinValues(1)
      .setMaxValues(selectOptions.length)
      .addOptions(selectOptions);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    return interaction.editReply({
      content: `👤 ${targetUser} kullanıcısı için eklemek istediğiniz yetkileri seçin:`,
      components: [row]
    });
  }

  if (targetRole) {
    const selectOptions = permRoles.map(perm => 
      new StringSelectMenuOptionBuilder()
        .setLabel(perm.label)
        .setValue(perm.key)
        .setDescription(`Role ${perm.label} yetkisini tanımlar.`)
    );

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`perm_select_role_${targetRole.id}`)
      .setPlaceholder('Eklenecek Yetkileri Seçiniz..')
      .setMinValues(1)
      .setMaxValues(selectOptions.length)
      .addOptions(selectOptions);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    return interaction.editReply({
      content: `🎭 **${targetRole.name}** rolü için eklemek istediğiniz yetkileri seçin:`,
      components: [row]
    });
  }
}
