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
    // /doc/:inspectDocId keeps the open Details dialog in the URL - refresh restores it,
    // the browser back button closes it, and the link is shareable with a teammate.
    router: route.create('/', [route.create('/doc/:inspectDocId')]),
  }
}
