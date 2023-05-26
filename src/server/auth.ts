import { compactDecrypt, importJWK, importPKCS8, type JWK } from 'jose'
import { type GetServerSidePropsContext } from "next";
import {
  getServerSession,
  type NextAuthOptions,
  type DefaultSession,
} from "next-auth";
import { type TokenSet } from "openid-client"
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

interface SGIDUserInfo {
  key: string
  sub: string
  data: Record<string, string>
}
/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authOptions: NextAuthOptions = {
  callbacks: {
    session: ({ session, user }) => {
      return {
        ...session,
        user: {
          ...session.user,
          id: user.id,
        }
      }
    }
  },
  adapter: PrismaAdapter(prisma),
  providers: [
    // SGID Provider
    {
      id: 'sgid',
      name: 'sgID',
      type: 'oauth',
      wellKnown: 'https://api.id.gov.sg/v2/.well-known/openid-configuration',
      jwks_endpoint: 'https://api.id.gov.sg/v2/.well-known/jwks.json',
      checks: 'pkce',
      authorization: {
        params: {
          scope: "myinfo.name openid",
        }
      },
      client: { token_endpoint_auth_method: "client_secret_post" },
      clientId: env.SGID_CLIENT_ID,
      clientSecret: env.SGID_CLIENT_SECRET,
      userinfo: {
        url: 'https://api.id.gov.sg/v2/oauth/userinfo',
        // Make the call here and do whatever you like to profile
        async request({ client, tokens }) {
          const profile = await client.userinfo<SGIDUserInfo>(tokens as TokenSet)
          let privateKeyJwk
          let payloadJwk
          try {
            // Import client private key in PKCS8 format
            privateKeyJwk = await importPKCS8(env.SGID_PRIVATE_KEY, 'RSA-OAEP-256')
          } catch (e) {
            throw new Error('Failed to import private key. Check that privateKey is a valid PKCS1 or PKCS8 key.')
          }
          // Decrypt key to get plaintext symmetric key
          const decoder = new TextDecoder()
          try {
            const decryptedKey = decoder.decode(
              (await compactDecrypt(profile.key, privateKeyJwk)).plaintext,
            )
            payloadJwk = await importJWK(JSON.parse(decryptedKey) as JWK)
          } catch (e) {
            throw new Error('Unable to decrypt or import payload key. Check that you used the correct private key.')
          }

          // Decrypt each jwe in body
          const result: Record<string, string> = {}
          try {
            for (const field in profile.data) {
              const jwe = profile.data[field] as string
              const decryptedValue = decoder.decode(
                (await compactDecrypt(jwe, payloadJwk)).plaintext,
              )
              result[field] = decryptedValue
            }
          } catch (e) {
            throw new Error('Unable to decrypt payload')
          }
          return { sub: profile.sub, data: result }
        }
      },
      profile(profile: SGIDUserInfo) {
        return {
          id: profile.sub,
          name: profile.data['myinfo.name'],
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
