import {defineField, defineType} from 'sanity'

const article = defineType({
  name: 'article',
  title: 'Article',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string'}),
    defineField({name: 'coverImage', type: 'image', title: 'Cover image'}),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'array',
      of: [
        {
          type: 'block',
          marks: {
            annotations: [
              {
                name: 'link',
                type: 'object',
                title: 'Link',
                fields: [{name: 'href', type: 'url', title: 'URL'}],
              },
            ],
          },
        },
      ],
    }),
    defineField({
      name: 'relatedCase',
      title: 'Related case study',
      type: 'reference',
      to: [{type: 'caseStudy'}],
    }),
  ],
  preview: {
    select: {title: 'title', media: 'coverImage'},
  },
})

const caseStudy = defineType({
  name: 'caseStudy',
  title: 'Case study',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string'}),
    defineField({name: 'client', type: 'string'}),
    defineField({name: 'url', type: 'url', title: 'Live site'}),
    defineField({name: 'coverImage', type: 'image', title: 'Cover image'}),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'array',
      of: [
        {
          type: 'block',
          marks: {
            annotations: [
              {
                name: 'link',
                type: 'object',
                title: 'Link',
                fields: [{name: 'href', type: 'url', title: 'URL'}],
              },
            ],
          },
        },
      ],
    }),
  ],
  preview: {
    select: {title: 'title', subtitle: 'client', media: 'coverImage'},
  },
})

const person = defineType({
  name: 'person',
  title: 'Person',
  type: 'document',
  fields: [
    defineField({name: 'name', type: 'string'}),
    defineField({name: 'role', type: 'string'}),
    defineField({name: 'photo', type: 'image'}),
    defineField({name: 'linkedin', type: 'url', title: 'LinkedIn'}),
    defineField({name: 'website', type: 'url', title: 'Personal website'}),
  ],
  preview: {
    select: {title: 'name', subtitle: 'role', media: 'photo'},
  },
})

const siteSettings = defineType({
  name: 'siteSettings',
  title: 'Site settings',
  type: 'document',
  fields: [
    defineField({name: 'siteTitle', type: 'string'}),
    defineField({name: 'githubUrl', type: 'url', title: 'GitHub'}),
    defineField({
      name: 'featuredArticle',
      type: 'reference',
      to: [{type: 'article'}],
    }),
  ],
})

export const schemaTypes = [article, caseStudy, person, siteSettings]
