import fs from 'fs';
import path from 'path';

export function getLogoPath(client) {
  if (client?.config?.logoPath) {
    const customPath = path.isAbsolute(client.config.logoPath)
      ? client.config.logoPath
      : path.resolve(process.cwd(), client.config.logoPath);
    if (fs.existsSync(customPath)) {
      return customPath;
    }
  }
  return path.resolve(process.cwd(), 'logo.png');
}

export function getBannerPath(client) {
  if (client?.config?.bannerPath) {
    const customPath = path.isAbsolute(client.config.bannerPath)
      ? client.config.bannerPath
      : path.resolve(process.cwd(), client.config.bannerPath);
    if (fs.existsSync(customPath)) {
      return customPath;
    }
  }
  const candidates = ['banner.png', 'laynebanner.png', 'yetmus.png', 'logo.png'];
  for (const candidate of candidates) {
    const p = path.resolve(process.cwd(), candidate);
    if (fs.existsSync(p)) return p;
  }
  return path.resolve(process.cwd(), 'logo.png');
}
