import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  guides: [
    'getting-started',
    'configuration',
    'providers',
    'mcp',
    'extension',
    'cli',
    'api',
    'import-export',
    'export-format',
    'backup',
    'upgrading',
    'hardening',
    'privacy',
    {
      type: 'category',
      label: 'Architecture',
      link: { type: 'doc', id: 'architecture/overview' },
      items: [
        'architecture/reader',
        'architecture/search',
        'architecture/knowledge-pipeline',
        'architecture/jobs',
      ],
    },
    {
      type: 'category',
      label: 'Decisions',
      link: { type: 'doc', id: 'decisions/README' },
      items: [
        'decisions/server-boundaries',
        'decisions/file-storage',
        'decisions/owner-setup',
        'decisions/media-fetch-and-storage',
        'decisions/container-runtime',
        'decisions/request-security-and-ci',
        'decisions/minimal-reader',
        'decisions/standard-library-layout',
      ],
    },
  ],
};

export default sidebars;
