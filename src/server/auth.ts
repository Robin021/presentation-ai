import { env } from "@/env";
import { db } from "@/server/db";
import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { type DefaultSession, type Session } from "next-auth";
import { type Adapter } from "next-auth/adapters";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      hasAccess: boolean;
      location?: string;
      role: string;
      isAdmin: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    hasAccess: boolean;
    role: string;
  }
}

const result = NextAuth({
  trustHost: true,
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.hasAccess = user.hasAccess;
        token.name = user.name;
        token.image = user.image;
        token.picture = user.image;
        token.location = (user as Session["user"]).location;
        token.role = user.role;
        token.isAdmin = user.role === "ADMIN";
      }

      // Handle updates
      if (trigger === "update" && (session as Session)?.user) {
        const user = await db.user.findUnique({
          where: { id: token.id as string },
        });
        console.log("Session", session, user);
        if (session) {
          token.name = (session as Session).user.name;
          token.image = (session as Session).user.image;
          token.picture = (session as Session).user.image;
          token.location = (session as Session).user.location;
          token.role = (session as Session).user.role;
          token.isAdmin = (session as Session).user.role === "ADMIN";
        }
        if (user) {
          token.hasAccess = user?.hasAccess ?? false;
          token.role = user.role;
          token.isAdmin = user.role === "ADMIN";
        }
      }

      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.hasAccess = token.hasAccess as boolean;
      session.user.location = token.location as string;
      session.user.role = token.role as string;
      session.user.isAdmin = token.role === "ADMIN";
      return session;
    },
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        const dbUser = await db.user.findUnique({
          where: { email: user.email! },
          select: { id: true, hasAccess: true, role: true },
        });

        if (dbUser) {
          user.hasAccess = dbUser.hasAccess;
          user.role = dbUser.role;
        } else {
          user.hasAccess = false;
          user.role = "USER";
        }
      }

      return true;
    },
  },

  adapter: PrismaAdapter(db) as Adapter,
  providers: [
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? [
        GoogleProvider({
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
        }),
      ]
      : []),
    CredentialsProvider({
      name: "Local Account",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "admin@local.com" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email as string;
        const password = credentials.password as string;

        // Find user
        let user = await db.user.findUnique({
          where: { email },
        });

        // If user doesn't exist, create it (Auto-signup for local dev)
        if (!user) {
          user = await db.user.create({
            data: {
              email,
              password, // Storing plaintext for local dev simplicity
              name: email.split("@")[0],
              role: "ADMIN", // Default to ADMIN for local user
              hasAccess: true,
              image: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`,
            },
          });
        } else {
          // If user exists, check password 
          // (In a real app, use bcrypt.compare here)
          if (user.password !== password) {
            // Optional: Allow login if password remains same, or reject.
            // For strictness:
            return null;
          }
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
          hasAccess: user.hasAccess,
        };
      },
    }),
  ],
});

export const { handlers, signIn, signOut } = result;

export const auth = async () => {
    // Check for real session first
    const session = await result.auth();
    if (session) return session;

    // Use default admin user
    const email = "admin@local.com";
    let user = await db.user.findUnique({ where: { email } });
    
    if (!user) {
        user = await db.user.create({
            data: {
                email,
                password: "password",
                name: "Local Admin",
                role: "ADMIN",
                hasAccess: true,
                image: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`,
            },
        });
    }

    return {
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
            role: user.role,
            hasAccess: user.hasAccess,
            isAdmin: user.role === "ADMIN",
        },
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    } as Session;
};
