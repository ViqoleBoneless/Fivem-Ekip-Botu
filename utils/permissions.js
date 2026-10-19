import { PermissionFlagsBits } from 'discord.js';

/**
 * Checks if a member has a specific permission dynamically assigned or falls back to legacy roles.
 * @param {import('discord.js').GuildMember} member - The guild member to check.
 * @param {string} permKey - The base key for the permission (e.g. 'ticketStaff', 'banCommand', 'farmSorumlusu').
 * @param {import('discord.js').Client} client - The Discord client containing config.
 * @returns {boolean} True if the member has the permission, otherwise false.
 */
export function hasPermission(member, permKey, client) {
    if (!member || !client.config) return false;

    // 1. Ekip Sahibi kontrolü
    const ownerIdsStr = client.config.ownerIds || '';
    const ownerIds = ownerIdsStr ? ownerIdsStr.split(',').map(id => id.trim()).filter(Boolean) : [];
    if (ownerIds.includes(member.id)) return true;

    // 2. Yönetici (Administrator) yetkisi varsa her şeye erişimi vardır
    if (member.permissions && member.permissions.has(PermissionFlagsBits.Administrator)) return true;

    // 3. All-Perm (Tüm yetkilere sahip olan kişiler)
    const allUsers = client.config.allPermUsers ? client.config.allPermUsers.split(',').map(id => id.trim()).filter(Boolean) : [];
    if (allUsers.includes(member.id)) return true;

    // 4. All-Perm (Tüm yetkilere sahip olan roller)
    const allRoles = client.config.allPermRoles ? client.config.allPermRoles.split(',').map(id => id.trim()).filter(Boolean) : [];
    if (member.roles && member.roles.cache.some(r => allRoles.includes(r.id))) return true;

    // 5. Belirli bir yetkiye sahip olan kişiler (Örn: ticketStaffUsers)
    const permUsersKey = permKey + 'Users';
    const specificUsers = client.config[permUsersKey] ? client.config[permUsersKey].split(',').map(id => id.trim()).filter(Boolean) : [];
    if (specificUsers.includes(member.id)) return true;

    // 6. Belirli bir yetkiye sahip olan roller (Örn: ticketStaffRoles)
    const permRolesKey = permKey + 'Roles';
    const specificRoles = client.config[permRolesKey] ? client.config[permRolesKey].split(',').map(id => id.trim()).filter(Boolean) : [];
    if (member.roles && member.roles.cache.some(r => specificRoles.includes(r.id))) return true;

    // 7. Geriye dönük uyumluluk: Eğer halen fiziksel olarak bir role atanmışsa (Örn: ticketStaffRoleId)
    const legacyRoleIdKey = permKey + 'RoleId';
    const envKey = legacyRoleIdKey.replace(/([A-Z])/g, '_$1').toUpperCase(); // e.g. TICKET_STAFF_ROLE_ID
    const legacyRoleId = client.config[legacyRoleIdKey] || process.env[envKey];
    
    if (legacyRoleId && member.roles && member.roles.cache.has(legacyRoleId)) return true;

    return false;
}
