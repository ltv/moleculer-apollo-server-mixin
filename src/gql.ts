import type { DocumentNode } from 'graphql'
import gqlTag from 'graphql-tag'
export const gql: (template: TemplateStringsArray | string, ...substitutions: any[]) => DocumentNode = gqlTag
