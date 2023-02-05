import { ApolloServerOptions, BaseContext, ContextFunction } from '@apollo/server'
import type { Context } from 'moleculer'
import { ApiRouteSchema, GatewayResponse, IncomingRequest } from 'moleculer-web'

export type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never
export type PickAndFlatten<T, K extends keyof T> = UnionToIntersection<T[K]>

export interface ApolloServerMixinHttpServerOptions {
  https?: {
    key: string
    cert: string
  }
  http2?: boolean
  timeout?: number
  requestTimeout?: number
}

export interface ApolloServerMixinOptions<TContext extends BaseContext> {
  /** Apollo Server configuration */
  apollo: ApolloServerOptions<TContext>
  /**
   * List of services that Apollo Server should load.
   * e.g. ['user', 'post']
   *
   * @type {string[]}
   * @memberof ApolloServerMixinOptions
   */
  modules: string[]
  httpServer?: ApolloServerMixinHttpServerOptions
  context?: ContextFunction<[MoleculerContextFunctionArgument], TContext>
  route?: ApiRouteSchema
}

export interface MoleculerContextFunctionArgument {
  req: IncomingRequest
  res: GatewayResponse
}

export interface MoleculerMiddlewareOptions<TContext extends BaseContext> {
  context?: ContextFunction<[MoleculerContextFunctionArgument], TContext>
}

export type MoleculerContextWithResponseType = Context<unknown, { $responseType: string }>

export type ApolloServerServerServiceSettings<TTypeDefs = string, TResolvers = any> = {
  typeDefs: TTypeDefs
  resolvers: TResolvers
}

export interface IGraphQLServiceSettings<TResolvers = any> {
  typeDefs: string
  resolvers: TResolvers
}

export interface ServiceListCatalogOptions {
  onlyLocal?: boolean
  onlyAvailable?: boolean
  skipInternal?: boolean
  withActions?: boolean
  withEvents?: boolean
  grouping?: boolean
}
