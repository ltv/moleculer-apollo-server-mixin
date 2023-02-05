import { Context, ServiceSchema } from 'moleculer'

import { ApolloServer, BaseContext, ContextFunction, HTTPGraphQLRequest } from '@apollo/server'
import { ApolloServerPluginUsageReportingDisabled } from '@apollo/server/plugin/disabled'
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer'
import { ApolloServerPluginInlineTrace } from '@apollo/server/plugin/inlineTrace'
import http from 'http'
import http2 from 'http2'
import https from 'https'
import { parse as urlParse } from 'url'

import { buildSubgraphSchema } from '@apollo/subgraph'
import { GraphQLResolveInfo, GraphQLSchema } from 'graphql'
import defaultsDeep from 'lodash.defaultsdeep'
import omit from 'lodash.omit'
import type { ApiRouteSchema, GatewayResponse, IncomingRequest } from 'moleculer-web'
import { gql } from './gql'
import {
  ApolloServerMixinOptions,
  ApolloServerServerServiceSettings,
  MoleculerContextFunctionArgument,
  MoleculerContextWithResponseType,
  ServiceListCatalogOptions,
} from './types'
import { SchemaModule, createHeaderMap } from './utils'

const defaultContext: ContextFunction<[MoleculerContextFunctionArgument], any> = async ({ req }) => ({
  ctx: req.$ctx,
  service: req.$service,
  params: req.$params,
})

/**
 * Creates a Moleculer Mixin that adds an Apollo Server instance to the service.
 *
 * @export
 * @param {*} typeDefs
 * @return {*}  {Partial<ServiceSchema>}
 */
export function ApolloServerMixin<TContext extends BaseContext = any>(
  options: ApolloServerMixinOptions<TContext>,
): Partial<ServiceSchema> {
  let apolloServer: ApolloServer<TContext>
  let httpServer: http.Server | https.Server | http2.Http2Server
  const defaultRouteOptions: ApiRouteSchema = {
    path: '/graphql',
    cors: {
      origin: '*',
    },
    mappingPolicy: 'restrict',
    bodyParsers: { json: true, urlencoded: { extended: true } },
  }
  const { typeDefs, resolvers } = options.apollo
  const { httpServer: httpServerOptions } = options
  const route = defaultsDeep(options.route || {}, defaultRouteOptions)

  const context: ContextFunction<[MoleculerContextFunctionArgument], TContext> = options.context || defaultContext

  return {
    name: 'apollo-server',

    created() {
      httpServer = this.createHttpServer()
      this.shouldUpdateGraphqlSchema = true

      this.createActionResolvers()

      if (!this.settings) {
        return
      }

      // set the http server to the service settings (in this case, if you want to use the moleculer-web, the moleculer-web will use this server)
      this.settings.server = httpServer

      this.settings?.routes.unshift(
        defaultsDeep(
          {
            aliases: {
              '/': {
                method: 'POST',
                handler: this.handleGraphQLRequest,
              },
            },
          },
          route,
        ),
      )
    },

    async started() {
      await this.startApolloServer()
    },

    methods: {
      handleHttpRequest(req, res, next) {
        // use the httpHandler from moleculer-web
        if (this.httpHandler) {
          return this.httpHandler(req, res, next)
        }
        return next()
      },

      createHttpServer() {
        if (this.server) {
          return this.server
        }

        // create http server
        let server: http.Server | https.Server | http2.Http2Server | http2.Http2SecureServer

        const httpsOptions = httpServerOptions?.https

        if (httpsOptions && httpsOptions?.key && httpsOptions?.cert) {
          server = this.settings.http2
            ? http2.createSecureServer(httpsOptions, this.handleHttpRequest)
            : https.createServer(httpsOptions, this.handleHttpRequest)
          this.isHTTPS = true
        } else {
          server = httpServerOptions?.http2
            ? http2.createServer(this.handleHttpRequest)
            : http.createServer(this.handleHttpRequest)
          this.isHTTPS = false
        }

        // HTTP server timeout
        if (httpServerOptions?.timeout) {
          this.logger.debug('Override default http(s) server timeout:', httpServerOptions?.timeout)
          server.setTimeout(httpServerOptions?.timeout)
        }

        ;(server as https.Server).requestTimeout = httpServerOptions?.requestTimeout as number
        this.logger.debug('Setting http(s) server request timeout to:', httpServerOptions?.requestTimeout)

        return server
      },

      createApolloServer(schema?: GraphQLSchema) {
        const plugins = [
          ApolloServerPluginDrainHttpServer({
            httpServer: httpServer as http.Server,
          }),
          ApolloServerPluginUsageReportingDisabled(),
          ApolloServerPluginInlineTrace({
            includeErrors: {
              transform: (err) => {
                this.logger.error('[ApolloServerPluginInlineTrace] > error: ', err)
                return err
              },
            },
          }),
          ...(options.apollo?.plugins || []), // append the plugins from the options
        ]
        const apolloOpts = defaultsDeep({ logger: this.logger }, omit(options.apollo, ['plugins']))
        if (schema) {
          const apollo = omit(apolloOpts, ['typeDefs', 'resolvers'])
          const asOptions = defaultsDeep({ schema, plugins }, apollo)
          return new ApolloServer<TContext>(asOptions)
        }
        if (typeDefs && resolvers) {
          // this this case, no need to provide schema
          const asOptions = defaultsDeep({ typeDefs, resolvers, plugins }, omit(apolloOpts, ['schema']))
          return new ApolloServer<TContext>(asOptions)
        }
      },

      async startApolloServer() {
        await apolloServer?.start().then(() => this.logger.info('🚀 GraphQL server is available at /graphql'))
      },

      apolloServer() {
        return apolloServer
      },

      async prepareGraphQLSchema() {
        // Schema is up-to-date
        if (!this.shouldUpdateGraphqlSchema) {
          return
        }

        if (apolloServer) {
          await apolloServer.stop()
        }

        const services = this.broker.registry
          .getServiceList({ withActions: true } as ServiceListCatalogOptions)
          .filter((service) => options.modules.includes(service.name))

        const schema = this.generateGraphQLSchema(services)

        // Create new server & regenerate GraphQL schema
        this.logger.info('♻ Recreate Apollo GraphQL server and regenerate GraphQL schema...')

        // (S) Create new Apollo server
        apolloServer = this.createApolloServer(schema)
        await this.startApolloServer()
        // (E) Create new Apollo server

        this.shouldUpdateGraphqlSchema = false

        this.broker.broadcast('graphql.schema.updated', {
          // schema: GraphQL.printSchema(schema),
        })
      },

      /**
       * Generate GraphQL schema from services
       *
       * @param {ServiceSchema<any>[]} services
       */
      generateGraphQLSchema(services: ServiceSchema<ApolloServerServerServiceSettings>[]) {
        const modules: SchemaModule[] = services.map((service) => {
          return {
            typeDefs: gql(service.settings?.typeDefs || ''),
            resolvers: this.createActionResolvers(service.settings?.resolvers),
          }
        })

        if (typeDefs && resolvers) {
          // Add global typeDefs & resolvers
          modules.unshift({ typeDefs: typeDefs as any, resolvers })
        }

        return buildSubgraphSchema(modules)
      },

      createActionResolvers(
        serviceResolvers: Record<string, Record<string, { action: string; parentParams: Record<string, string> }>> = {},
      ) {
        const types = Object.keys(serviceResolvers)
        return types.reduce((carryTypes, type) => {
          const typeResolvers = serviceResolvers[type]
          const resolverKeys = Object.keys(typeResolvers)
          const typeResolver = resolverKeys.reduce(
            (carryResolvers, resolverName) => ({
              ...carryResolvers,
              [resolverName]: (
                $parent: Record<string, any>,
                args: any,
                gqlContext: { ctx: Context; params: Record<string, any> }, // should define the type of gqlContext
                $info: GraphQLResolveInfo,
              ) => {
                const { ctx } = gqlContext
                const { parentParams = {}, action } = typeResolvers[resolverName]
                const parentKeys = Object.keys(parentParams)
                const transformedParent = parentKeys.reduce(
                  (carry, key) => ({
                    ...carry,
                    [parentParams[key]]: $parent[key],
                  }),
                  {},
                )

                const gqlParams = {
                  $parent,
                  $info,
                  ...gqlContext.params,
                }
                const params = defaultsDeep(gqlParams, {
                  ...args,
                  ...transformedParent,
                })
                return ctx.call(action, params)
              },
            }),
            {},
          )
          return {
            ...carryTypes,
            [type]: typeResolver,
          }
        }, {})
      },

      async executeHTTPGraphQLRequest(req: IncomingRequest, res: GatewayResponse) {
        const headers = createHeaderMap(req.headers)

        const httpGraphQLRequest: HTTPGraphQLRequest = {
          method: req.method?.toUpperCase() ?? 'POST',
          headers,
          search: urlParse(req.url ?? '').search ?? '',
          body: req.$params,
        }

        try {
          const httpGraphQLResponse = await apolloServer.executeHTTPGraphQLRequest({
            httpGraphQLRequest,
            context: async () => context({ req, res }),
          })

          for (const [key, value] of httpGraphQLResponse.headers) {
            res.setHeader(key, value)
          }

          if (httpGraphQLResponse.body.kind === 'complete') {
            return httpGraphQLResponse.body.string
          }

          for await (const chunk of httpGraphQLResponse.body.asyncIterator) {
            res.write(chunk)
            // Express/Node doesn't define a way of saying "it's time to send this
            // data over the wire"... but the popular `compression` middleware
            // (which implements `accept-encoding: gzip` and friends) does, by
            // monkey-patching a `flush` method onto the response. So we call it
            // if it's there.
            if (typeof (res as any).flush === 'function') {
              ;(res as any).flush()
            }
          }
          res.end()
        } catch (e) {
          this.logger.error(e)
          const error = e as Error & { statusCode: number; headers: Record<string, string>; code?: number }
          if ('HttpQueryError' === error.name && error.headers) {
            Object.keys(error.headers).forEach((header) => res.setHeader(header, error.headers[header]))
          }

          if (!error.statusCode) {
            error.statusCode = 500
          }

          res.statusCode = error.statusCode || error.code || 500
          res.end(error.message)

          return
        }
      },

      async handleGraphQLRequest(req: IncomingRequest, res: GatewayResponse) {
        try {
          // Prepare GraphQL schema
          await this.prepareGraphQLSchema()

          let responseData = await this.executeHTTPGraphQLRequest(req, res)

          res.statusCode = 200
          const responseType = 'application/json'

          const ctx = res.$ctx as MoleculerContextWithResponseType
          if (!ctx.meta.$responseType) {
            ctx.meta.$responseType = responseType
          }

          const route = res.$route
          if (route.onAfterCall) {
            responseData = await route.onAfterCall.call(this, ctx, route, req, res, responseData)
          }

          const service = res.$service
          await service.sendResponse(req, res, responseData)
        } catch (err) {
          this.logger.error(err)
          this.sendError(req, res, err)
        }
      },
    },
  }
}
