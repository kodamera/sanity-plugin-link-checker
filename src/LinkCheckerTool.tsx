import type {Tool} from 'sanity'

import {LinkCheckerIcon} from './components/LinkCheckerIcon'
import {LinkCheckerView} from './components/LinkCheckerView'
import type {LinkCheckerPluginConfig} from './lib/types'

export function linkCheckerTool(config: LinkCheckerPluginConfig): Tool {
  return {
    name: 'link-checker',
    title: 'Link Checker',
    icon: LinkCheckerIcon,
    component: () => <LinkCheckerView config={config} />,
  }
}
