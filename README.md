# moleculer-apollo-server-mixin

An Apollo Server v4 mixin for moleculerjs. Schema first &amp; compatible with GraphQL codegen

## Features

- GraphQL Schema first
- Apollo Server v4
- Compatible with GraphQL Codegen
- DataLoader
- Tracing
- Metrics

## The inspiration

Generally, you can create your standalone Apollo Server and use it as a supgraphql server, btw, you have to do manything if you want to approach the micro-services architecture.

Luckily, we have `moleculerjs` which is very comprehensive framework for developing a micro-services system. Basically, the `moleculerjs` service provide the `moleculer-web` as a HTTP Gateway for publishing RESTFul APIs.

If you want to support the GraphQL, you have to use `moleculer-apollo-server` (a mixin developed by `Icebob` the `moleculerjs` author.). The problem is, this mixin is not well support typescript, and separated schema definition.

The approach of `moleculer-apollo-server` is using `action` as a graphql resolver, and using action configuration to define the GraphQL schema.

It looks like:

```javascript
const schema = {
    actions: {
        hello: {
            graphql: {
                query: "hello: String"
            },
            handler(ctx) {
                return "Hello Moleculer!"
            }
        },
        welcome: {
            params: {
                name: "string"
            },
            graphql: {
                mutation: "welcome(name: String!): String"
            },
            handler(ctx) {
                return `Hello ${ctx.params.name}`;
            }
        }
    }
}
```

The drawbacks of this approach:

- You have no good insight about your schema definition, Your type, your schema are locating scattered whenever in your service schema. It will be easy for first sight, but will be difficult for maintenance.
- You have no typing. Actually, it's not really, you can able to define the `ctx` type again. Check the below examples

```ts
graphql: {
    mutation: "welcome(name: String!): String"
},
handler(ctx: Context<{ name: string }>) {
    return `Hello ${ctx.params.name}`
}
```

Lets see. You already defined the GraphQL schema then it will not make sense when you have to define the type again. In the example, there is only one `name` param, and there is no issue with it. But, if you have many params,
You need to define it again many time, and ..., I bet you get the point now.

- So if you're working with javascript? Probably, you can guide your IDE with the javascript docs but you can not reuse it somewhere, and this is unsafe typings.

Finally, I decided to write this mixin to overcome the typings issue and approach with schema first.

## Examples

- schema definition (`./graphql/user.schema`)

```ts
import { gql } from '@ltv/moleculer-apollo-server-mixin';

export const typeDefs = gql`
  extend type Query {
    me: User!
    user(id: ID!): User
    allUsers: [User]
  }

  enum Role {
    USER
    ADMIN
  }

  type User implements Node {
    id: ID!
    username: String!
    email: String!
    role: Role!
    createdAt: DateTime!
  }
`;
```

- service schema (`services/user/user.svc.ts`)

```ts
import {
  GraphQLActionSchema,
  ServiceSettings,
  User,
} from '@shared/graphql/generated';
import { print } from 'graphql';
import { typeDefs } from './graphql/user.schema';

const users: User[] = [
  { id: '1', username: 'user1' } as User,
  { id: '2', username: 'user2' } as User,
];

const name = 'user';

type UserActionSchema = {
  resolveUsername: GraphQLActionSchema<'User'>['username'];
};

const actions: GraphQLActionSchema<'Query' | 'User'> & UserActionSchema = {
  allUsers: {
    handler: async () => {
      return users;
    },
  },
  user: {
    params: {
      id: 'string',
    },
    handler: async (ctx) => {
      const { id } = ctx.params;
      return users.find((user) => user.id === id);
    },
  },
  resolveUsername: {
    handler: async (ctx) => {
      const { username } = ctx.params.$parent
      return `transformed ${username}`;
    },
  },
};

const settings: ServiceSettings<typeof name, keyof typeof actions> = {
  typeDefs: print(typeDefs),
  resolvers: {
    Query: {
      allUsers: 'user.allUsers',
      user: 'user.user',
    },
    User: {
      username: 'user.resolveUsername',
    },
  },
};

export default { name, settings, actions };
```
