import {defineBlueprint, defineDocumentFunction} from '@sanity/blueprints'

export default defineBlueprint({
  resources: [
    defineDocumentFunction({
      name: 'link-checker-scan',
      // Sanity Functions default to a 10s execution limit - checking a dataset's worth of
      // external links takes much longer than that. 600s gives comfortable headroom.
      timeout: 600,
      event: {
        on: ['create', 'update'],
        filter: '_type == "linkCheckerTrigger"',
      },
    }),
  ],
})
