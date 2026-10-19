// Forward to inaktif.js for backwards compatibility
import { data as inaktifData, execute as inaktifExecute } from './inaktif.js';
import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('inaktif-göster')
  .setDescription(inaktifData.description)
  .setDefaultMemberPermissions(inaktifData.default_member_permissions);

// Copy options from inaktifData
for (const opt of inaktifData.options) {
  data.options.push(opt);
}

export const execute = inaktifExecute;
