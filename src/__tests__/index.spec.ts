import * as idx from '..'

describe('index.ts', () => {
  it('should export gql', async () => {
    const { gql } = await import('../gql')
    expect(idx.gql).toBe(gql)
  })

  it('should export ApolloServerMixin', async () => {
    const { ApolloServerMixin } = await import('../mixin')
    expect(idx.ApolloServerMixin).toBe(ApolloServerMixin)
  })
})
