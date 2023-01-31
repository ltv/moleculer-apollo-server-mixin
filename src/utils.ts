import { HeaderMap } from '@apollo/server'
import { DocumentNode } from 'graphql'
import { IncomingHttpHeaders } from 'http'

/**
 * Create a HeaderMap from a Request Headers object
 *
 * @export
 * @param {IncomingHttpHeaders} reqHeaders
 */
export function createHeaderMap(reqHeaders: IncomingHttpHeaders) {
  const headers = new HeaderMap()
  for (const [key, value] of Object.entries(reqHeaders)) {
    if (value !== undefined) {
      headers.set(key, Array.isArray(value) ? value.join(',') : value)
    }
  }
  return headers
}

/**
 * Create a GraphQL Schema Module
 *
 * @export
 * @param {DocumentNode} typeDefs
 * @param {*} resolvers
 * @return {*}
 */
export function createSchemaModule(typeDefs: DocumentNode, resolvers?: any) {
  return {
    typeDefs,
    resolvers,
  }
}

export type SchemaModule = ReturnType<typeof createSchemaModule>

// (S) support codegen
const ServiceNameAndAllowActions = '`${ServiceName}.${AllowActions}`'
const customImports = `
import { PickAndFlatten } from '@ltv/moleculer-apollo-server-mixin';
import { ActionSchema, Context } from 'moleculer';
`
const customDef = `
export type MoleculerResolvers<
  ServiceName extends string = 'unknown',
  AllowActions extends string = any,
> = {
  [K in keyof Resolvers as K extends string ? K : never]: {
    [L in keyof Resolvers[K] as L extends string ? L : never]: {
      action: ${ServiceNameAndAllowActions};
      parentParams?: {
        [P in keyof ResolversParentTypes[K] as P extends keyof Omit<
          ResolversParentTypes[K],
          '__typename' | L
        >
          ? P
          : never]?: string;
      };
    };
  };
};


export type ServiceSettings<ServiceName extends string = 'unknown', AllowActions extends string = any, ExtraSettings = unknown> = {
  typeDefs: string;
  resolvers: MoleculerResolvers<ServiceName, AllowActions>;
} & ExtraSettings;

export type GraphQLContext<TArgs, TParent = unknown> = Context<TArgs & { $parent: TParent, $info: GraphQLResolveInfo, $args: TArgs }>
export type ActionHandlerFn<Result, Args = unknown, TParent = unknown> = (ctx: GraphQLContext<Args, TParent>) => Promise<Result> | Result;

export type extractResolverType<T> = T extends Resolver<infer TResult, infer TParent, infer TContext, infer TArgs> ? { Result: TResult, Parent: TParent, Context: TContext, Args: TArgs} : never

export type MoleculerActionSchema = Pick<
  ActionSchema,
  | 'rest'
  | 'params'
  | 'visibility'
  | 'service'
  | 'cache'
  | 'tracing'
  | 'bulkhead'
  | 'circuitBreaker'
  | 'retryPolicy'
  | 'fallback'
  | 'hooks'
>;

export type MoleculerActionResolver<TResult, TArgs, TParent> =
  MoleculerActionSchema & {
    handler: ActionHandlerFn<TResult, TArgs, TParent>;
  };

export type GraphQLActionSchemaTypeNested = {
  [K in keyof Resolvers]: {
    [L in keyof Resolvers[K]]: MoleculerActionResolver<
      extractResolverType<Resolvers[K][L]>['Result'],
      extractResolverType<Resolvers[K][L]>['Args'],
      extractResolverType<Resolvers[K][L]>['Parent']
    >;
  };
};

export type GraphQLActionSchemaType<T extends keyof Resolvers> = PickAndFlatten<
  GraphQLActionSchemaTypeNested,
  T
>;
`

export const graphQLCodeGenPlugins = [
  {
    add: {
      placement: 'prepend',
      content: customImports,
    },
  },
  {
    add: {
      placement: 'append',
      content: customDef,
    },
  },
]
// (E) support codegen
