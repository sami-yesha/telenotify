import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const pages: [string, number][] = [
    ['', 1],
    ['/signup', 0.8],
    ['/login', 0.5],
    ['/check', 0.6],
    ['/terms', 0.3],
    ['/privacy', 0.3],
  ];
  return pages.map(([path, priority]) => ({ url: `${SITE_URL}${path}`, lastModified: new Date(), changeFrequency: 'weekly', priority }));
}
