import type { Config } from '@docusaurus/types';

const repository = 'https://github.com/Akshaysanthosh/absolute-memory';

const config: Config = {
  title: 'Absolute Memory',
  tagline: 'Your reading library, with answers that cite the page.',
  favicon: 'media/brand/mark.svg',
  // TODO(owner): domain and base path for public launch.
  url: process.env.DOCUSAURUS_SITE_URL ?? 'https://example.invalid',
  baseUrl: process.env.DOCUSAURUS_BASE_URL ?? '/',
  organizationName: 'Akshaysanthosh',
  projectName: 'absolute-memory',
  trailingSlash: true,
  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',
  staticDirectories: ['.showcase-assets'],
  markdown: {
    format: 'detect',
    hooks: { onBrokenMarkdownLinks: 'throw' },
  },
  presets: [
    [
      'classic',
      {
        docs: {
          path: '../docs',
          routeBasePath: 'guides',
          sidebarPath: './sidebars.ts',
          exclude: [
            'BUILD-LOG.md',
            'RELEASE-CHECKLIST.md',
            'build/**',
            'decisions/0001-clean-import-history.md',
            'decisions/0002-lockfile-metadata.md',
          ],
        },
        blog: false,
        theme: { customCss: './src/css/custom.css' },
      },
    ],
  ],
  themeConfig: {
    image: 'media/brand/social-preview.png',
    metadata: [
      { name: 'twitter:card', content: 'summary_large_image' },
      { property: 'og:image:width', content: '1280' },
      { property: 'og:image:height', content: '640' },
    ],
    colorMode: { defaultMode: 'light', respectPrefersColorScheme: true },
    navbar: {
      title: 'Absolute Memory',
      logo: {
        alt: '',
        src: 'media/brand/mark.svg',
        srcDark: 'media/brand/mark.svg',
      },
      items: [
        { to: '/guides/getting-started/', label: 'Install', position: 'right' },
        { to: '/guides/', label: 'Docs', position: 'right' },
        { href: repository, label: 'GitHub', position: 'right' },
      ],
    },
    footer: {
      links: [
        {
          items: [
            { label: 'Docs', to: '/guides/' },
            { label: 'GitHub', href: repository },
            { label: 'Changelog', href: `${repository}/blob/main/CHANGELOG.md` },
          ],
        },
      ],
      copyright: 'Source-available under the PolyForm Noncommercial License 1.0.0.',
    },
  },
};

export default config;
