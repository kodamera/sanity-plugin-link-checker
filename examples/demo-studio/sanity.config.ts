import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {linkChecker} from 'sanity-plugin-link-checker'

import {schemaTypes} from './schemaTypes'

export default defineConfig({
  name: 'default',
  title: 'Link Checker Demo',
  projectId: 'csst5o08',
  dataset: 'production',
  plugins: [
    structureTool(),
    linkChecker({
      // Demo of scan-scope options - LinkedIn blocks automated checks anyway.
      excludeUrls: ['linkedin.com'],
    }),
  ],
  schema: {
    types: schemaTypes,
  },
})
