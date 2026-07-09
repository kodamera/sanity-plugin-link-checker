/**
 * Seeds the demo dataset with fictional agency-site content covering every finding kind
 * the Link Checker can show: 404s, 5xx, dead domains, timeouts, bot-blocked hosts,
 * dangling references, multi-link documents, repeated occurrences, drafts, and
 * published-with-edits documents. All names and companies are invented.
 *
 * Usage:  SANITY_AUTH_TOKEN=<write token> node seed.mjs
 */
import {createClient} from '@sanity/client'

const token = process.env.SANITY_AUTH_TOKEN
if (!token) {
  console.error('Set SANITY_AUTH_TOKEN to a write token for project csst5o08.')
  process.exit(1)
}

const client = createClient({
  projectId: 'csst5o08',
  dataset: 'production',
  apiVersion: '2024-01-01',
  token,
  useCdn: false,
})

// --- URL palette -------------------------------------------------------------------
const OK = [
  'https://www.sanity.io/',
  'https://developer.mozilla.org/',
  'https://www.wikipedia.org/',
  'https://github.com/',
  'https://web.dev/',
]
const GONE_404 = [
  'https://www.sanity.io/this-page-was-removed',
  'https://developer.mozilla.org/en-US/docs/deleted-guide',
  'https://github.com/fjallkraft/legacy-site',
]
const SERVER_ERR = ['https://httpstat.us/503', 'https://httpstat.us/500']
const DEAD_DOMAIN = ['https://www.fjallkraft-portal.se/', 'http://intranet.norrsken-digital.se/']
const BLOCKED = ['https://www.linkedin.com/in/example-person/']

let counter = 0
function key() {
  counter += 1
  return `k${counter}`
}

function richText(paragraphs) {
  return paragraphs.map(([text, href]) => {
    const linkKey = href ? `l${key()}` : null
    return {
      _type: 'block',
      _key: key(),
      style: 'normal',
      markDefs: linkKey ? [{_type: 'link', _key: linkKey, href}] : [],
      children: [
        {_type: 'span', _key: key(), text, marks: []},
        ...(linkKey ? [{_type: 'span', _key: key(), text: 'Läs mer här.', marks: [linkKey]}] : []),
      ],
    }
  })
}

const docs = [
  // --- Case studies (one clean, two broken live-sites) ------------------------------
  {
    _id: 'case-fjallkraft',
    _type: 'caseStudy',
    title: 'Fjällkraft — ny e-handel för förnybar energi',
    client: 'Fjällkraft AB',
    url: DEAD_DOMAIN[0],
    body: richText([
      ['Fjällkraft ville nå en yngre målgrupp med en snabbare butik. ', OK[0]],
      ['Projektet levererades på tre månader. ', GONE_404[0]],
    ]),
  },
  {
    _id: 'case-norrsken',
    _type: 'caseStudy',
    title: 'Norrsken Digital — intranät som samlar allt',
    client: 'Norrsken Digital',
    url: SERVER_ERR[0],
    body: richText([['Ett intranät byggt för distansarbete. ', OK[1]]]),
  },
  {
    _id: 'case-lingon',
    _type: 'caseStudy',
    title: 'Lingongrova — kampanjsajt för lansering',
    client: 'Lingongrova Bageri',
    url: OK[2],
    body: richText([['Kampanjen nådde 2 miljoner besökare. ', OK[3]]]),
  },

  // --- Articles ---------------------------------------------------------------------
  {
    _id: 'article-webbtrender',
    _type: 'article',
    title: 'Webbtrender 2026 — vad betyder de i praktiken?',
    body: richText([
      ['Vi går igenom årets viktigaste trender. ', GONE_404[1]],
      ['Störst avtryck gör AI-drivna gränssnitt. ', GONE_404[1]], // same URL twice -> "2 places"
      ['Mer läsning finns hos MDN. ', OK[1]],
    ]),
    relatedCase: {_type: 'reference', _ref: 'case-fjallkraft'},
  },
  {
    _id: 'article-tillganglighet',
    _type: 'article',
    title: 'Tillgänglighet är inte en checklista',
    body: richText([
      ['EU-direktivet ställer nya krav från i år. ', SERVER_ERR[1]],
      ['Vår guide till WCAG 2.2. ', DEAD_DOMAIN[1]], // two different broken links -> Details dialog demo
    ]),
  },
  {
    _id: 'article-headless',
    _type: 'article',
    title: 'Därför valde vi headless CMS för Fjällkraft',
    body: richText([
      ['Strukturerat innehåll gör om-design billigare. ', OK[0]],
      ['Se hela caset här. ', OK[4]],
    ]),
    // Dangling reference. _weak lets the seed create it pointing nowhere (the API refuses
    // dangling STRONG refs at write time) - the checker treats weak and strong the same.
    relatedCase: {_type: 'reference', _ref: 'case-borttagen-kund', _weak: true},
  },
  {
    _id: 'article-prestanda',
    _type: 'article',
    title: 'Prestandabudget — så håller ni den',
    body: richText([['Core Web Vitals påverkar er synlighet. ', OK[4]]]),
  },

  // --- People (LinkedIn = blocked/excluded demo) -------------------------------------
  {
    _id: 'person-maja',
    _type: 'person',
    name: 'Maja Lindqvist',
    role: 'Digital strateg',
    linkedin: BLOCKED[0],
    website: DEAD_DOMAIN[0],
  },
  {
    _id: 'person-elias',
    _type: 'person',
    name: 'Elias Bergström',
    role: 'Utvecklare',
    linkedin: BLOCKED[0],
    website: OK[3],
  },

  // --- Site settings (dangling featured ref) -----------------------------------------
  {
    _id: 'siteSettings',
    _type: 'siteSettings',
    siteTitle: 'Granviks Byrå',
    githubUrl: 'https://github.com/granviks-byra/site-that-was-renamed',
    featuredArticle: {_type: 'reference', _ref: 'article-raderad', _weak: true}, // dangling
  },
]

// Draft-only documents: one fresh (should scan), one to demo doc-state dots.
const drafts = [
  {
    _id: 'drafts.article-utkast',
    _type: 'article',
    title: 'Utkast: Design system för myndigheter',
    body: richText([['Arbetsanteckningar och länkar. ', GONE_404[2]]]),
  },
  // Draft edits of a published article -> "published + edited" dots.
  {
    _id: 'drafts.article-prestanda',
    _type: 'article',
    title: 'Prestandabudget — så håller ni den (uppdaterad)',
    body: richText([
      ['Core Web Vitals påverkar er synlighet. ', OK[4]],
      ['Ny sektion om INP. ', GONE_404[0]],
    ]),
  },
]

const tx = client.transaction()
for (const doc of docs) tx.createOrReplace(doc)
for (const doc of drafts) tx.createOrReplace(doc)

const result = await tx.commit()
console.log(`Seeded ${result.results.length} documents into csst5o08/production.`)
console.log('Open the studio, run a scan, and every finding kind should be represented.')
