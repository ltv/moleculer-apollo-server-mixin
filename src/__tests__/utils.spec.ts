import { HeaderMap } from '@apollo/server'
import { createHeaderMap, createSchemaModule, gql } from '..'

describe('createHeaderMap', () => {
  it('should return a HeaderMap', () => {
    const headers = createHeaderMap({
      'content-type': 'application/json',
      'user-agent': 'PostmanRuntime/7.26.5',
    })
    expect(headers).toBeInstanceOf(HeaderMap)
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('user-agent')).toBe('PostmanRuntime/7.26.5')
  })

  it('should return a HeaderMap with multiple values', () => {
    const headers = createHeaderMap({
      'content-type': ['application/json', 'application/xml'] as any,
      'user-agent': 'PostmanRuntime/7.26.5',
    })
    expect(headers).toBeInstanceOf(HeaderMap)
    expect(headers.get('content-type')).toBe('application/json,application/xml')
    expect(headers.get('user-agent')).toBe('PostmanRuntime/7.26.5')
  })
})

describe('createSchemaModule', () => {
  it('should return a SchemaModule', () => {
    const typeDefs = gql`
      type Query {
        hello: String
      }
    `
    const resolvers = {
      Query: {
        hello: () => 'Hello World',
      },
    }
    const schemaModule = createSchemaModule(typeDefs, resolvers)
    expect(schemaModule).toHaveProperty('typeDefs', typeDefs)
    expect(schemaModule).toHaveProperty('resolvers', resolvers)
  })
})
