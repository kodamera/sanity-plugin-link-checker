import type {Tool} from 'sanity'
import {route} from 'sanity/router'

import {LinkCheckerIcon} from './components/LinkCheckerIcon'
import {LinkCheckerView} from './components/LinkCheckerView'
import type {LinkCheckerPluginConfig} from './lib/types'

export function linkCheckerTool(config: LinkCheckerPluginConfig): Tool {
  return {
    name: 'link-checker',
    title: 'Link Checker',
    icon: LinkCheckerIcon,
    component: () => <LinkCheckerView config={config} />,
    // /doc/:inspectDocId/:inspectKind keeps the open Details dialog in the URL - refresh
    // restores it, the browser back button closes it, and the link is shareable with a
    // teammate. inspectKind ('link' | 'reference') scopes Details to the section it was
    // opened from - a document can have both a broken reference and fine links at once,
    // and Details must show what you actually clicked on, not just "the worst problem
    // anywhere on this document" regardless of entry point.
    router: route.create('/', [route.create('/doc/:inspectDocId/:inspectKind')]),
  }
}
