import { type GetServerSidePropsContext } from "next";
import {
  getServerSession,
  type NextAuthOptions,
  type DefaultSession,
} from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { env } from "~/env.mjs";
import { prisma } from "~/server/db";

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      // ...other properties
      // role: UserRole;
    } & DefaultSession["user"];
  }

  // interface User {
  //   // ...other properties
  //   // role: UserRole;
  // }
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authOptions: NextAuthOptions = {
  debug: true,
  callbacks: {
    session: ({ session, user }) => ({
      ...session,
      user: {
        ...session.user,
        id: user.id, },
    }),
  },
  adapter: PrismaAdapter(prisma),
  providers: [
    // SGID Provider
    {
      id: 'SGID',
      name: 'SGID',
      type: 'oauth',
      wellKnown: 'https://api.id.gov.sg/v2/.well-known/openid-configuration',
      checks: 'pkce',
      authorization: { 
        url: "https://api.id.gov.sg/v2/oauth/authorize",
        params: {
          scope: "openid myinfo.name",
          grant_type: 'authorization_code'
        }
      },
      client: { token_endpoint_auth_method: "client_secret_post" },
      clientId: env.SGID_CLIENT_ID,
      clientSecret: env.SGID_CLIENT_SECRET,
      profile(profile) {
        return {
          id: profile.sub,
        }
      },
    }
  ],
};

/**
 * Wrapper for `getServerSession` so that you don't need to import the `authOptions` in every file.
 *
 * @see https://next-auth.js.org/configuration/nextjs
 */
export const getServerAuthSession = (ctx: {
  req: GetServerSidePropsContext["req"];
  res: GetServerSidePropsContext["res"];
}) => {
  return getServerSession(ctx.req, ctx.res, authOptions);
};
