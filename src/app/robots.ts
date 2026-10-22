import type { MetadataRoute } from 'next';
import { ROLE_ROUTES } from '@/constants/roles';
import { SITE_URL } from '@/constants/site';

// Only the landing page is meant for search engines. The role portals and the
// one-time-link pages (reset, driver setup) are useless to a searcher and would
// only show up as login walls in results.
export default function robots(): MetadataRoute.Robots {
  const portals = Array.from(new Set(Object.values(ROLE_ROUTES)));
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [...portals, '/api', '/change-password', '/reset-password', '/driver-setup', '/messages'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
