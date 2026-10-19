export const serverApis = {
  MDRP: 'https://frontend.cfx-services.net/api/servers/single/xjx5kr',
  GUİD: 'https://frontend.cfx-services.net/api/servers/single/zem7ky',
  GUID: 'https://frontend.cfx-services.net/api/servers/single/zem7ky',
  Guid: 'https://frontend.cfx-services.net/api/servers/single/zem7ky',
  MDPVP: 'https://frontend.cfx-services.net/api/servers/single/z5gxl9',
  WELL: 'https://frontend.cfx-services.net/api/servers/single/8emv3b3'
};

export async function fetchPlayersForServer(serverName) {
  const api = serverApis[serverName];
  if (!api) return [];

  try {
    const res = await fetch(api, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (res.ok) {
      const data = await res.json();
      return data?.Data?.players || [];
    } else {
      console.error(`[FiveM API] Error fetching players for ${serverName}: HTTP ${res.status}`);
    }
  } catch (err) {
    console.error(`[FiveM API] Error fetching players for ${serverName}:`, err.message);
  }
  return [];
}

export async function getOnlineStatusMap(activeServers) {
  const onlineMap = new Map();
  if (!activeServers || activeServers.length === 0) return onlineMap;

  // Fetch players for all active servers in parallel
  const promises = activeServers.map(async (srv) => {
    const players = await fetchPlayersForServer(srv);
    return { server: srv, players };
  });

  const results = await Promise.all(promises);

  for (const { server, players } of results) {
    for (const p of players) {
      if (p.identifiers) {
        for (const ident of p.identifiers) {
          if (ident.startsWith('discord:')) {
            const discordId = ident.split(':')[1];
            if (discordId) {
              // Map discordId to player details
              onlineMap.set(discordId, {
                serverName: server,
                playerName: p.name || 'Bilinmeyen'
              });
            }
          }
        }
      }
    }
  }

  return onlineMap;
}

export async function getOnlineStatusMapForMainServer(client) {
  const mainServer = client?.config?.icKontrolMainServer;
  if (!mainServer) return null;

  const players = await fetchPlayersForServer(mainServer);
  const onlineSet = new Set();
  let providesDiscordIds = false;
  
  for (const p of players) {
    if (p.identifiers) {
      for (const ident of p.identifiers) {
        if (ident.startsWith('discord:')) {
          providesDiscordIds = true;
          const discordId = ident.split(':')[1];
          if (discordId) {
            onlineSet.add(discordId);
          }
        }
      }
    }
  }
  return { onlineSet, providesDiscordIds };
}
