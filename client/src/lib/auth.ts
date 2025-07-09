import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { JWT } from "next-auth/jwt";

// Extend the built-in types
declare module "next-auth" {
  interface Session {
    accessToken?: string;
    error?: string;
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }

  interface User {
    id: string;
    name?: string;
    email?: string;
    accessToken: string;
    refreshToken: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    error?: string;
  }
}

// Function to refresh token
async function refreshToken(token: JWT): Promise<JWT> {
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.inhoanglinh.click';
    
    const response = await fetch(`${apiUrl}/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refreshToken: token.refreshToken }),
    });

    const refreshedTokens = await response.json();

    if (!response.ok) {
      throw refreshedTokens;
    }

    return {
      ...token,
      accessToken: refreshedTokens.token,
      accessTokenExpires: Date.now() + 60 * 60 * 1000, // 1 hour
    };
  } catch (error) {
    console.error("Error refreshing token:", error);
    return {
      ...token,
      error: "RefreshAccessTokenError",
    };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.inhoanglinh.click';
          
          const res = await fetch(`${apiUrl}/login`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email: credentials?.email,
              password: credentials?.password,
            }),
          });

          const user = await res.json();

          if (!res.ok) {
            throw new Error(user.message || "Authentication failed");
          }

          if (res.ok && user) {
            return {
              id: user.id || "unknown",
              email: credentials?.email,
              name: user.name || credentials?.email,
              accessToken: user.token,
              refreshToken: user.token, // In a real app, you'd have a separate refresh token
            };
          }
        } catch (e) {
          console.error("Authentication error:", e);
          throw new Error(e instanceof Error ? e.message : "Authentication failed");
        }
        
        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // This will only be executed when the user logs in
        token.accessToken = user.accessToken;
        token.refreshToken = user.refreshToken;
        token.accessTokenExpires = Date.now() + 60 * 60 * 1000; // 1 hour
      }

      // If the access token has not expired yet, return it
      if (token.accessTokenExpires && Date.now() < (token.accessTokenExpires || 0)) {
        return token;
      }

      // Access token has expired, try to refresh it
      return refreshToken(token);
    },
    async session({ session, token }) {
      // Send properties to the client
      session.accessToken = token.accessToken;
      session.error = token.error;
      session.user = {
        ...session.user,
        id: token.sub,
      };

      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.NEXTAUTH_SECRET,
}; 