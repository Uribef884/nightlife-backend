import { OAuth2Client } from 'google-auth-library';

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export interface GoogleUserInfo {
  googleId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  emailVerified: boolean;
}

export class OAuthService {
  /**
   * Generate Google OAuth URL for authorization
   */
  static getGoogleAuthUrl(state?: string): string {
    const scopes = [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ];

    const authUrl = client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state: state, // Can pass sessionId to preserve cart
    });

    return authUrl;
  }

  /**
   * Exchange authorization code for tokens and get user info
   */
  static async verifyGoogleToken(code: string): Promise<GoogleUserInfo> {
    try {
      // Exchange code for tokens
      const { tokens } = await client.getToken(code);
      client.setCredentials(tokens);

      // Verify the ID token and extract user info
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token!,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        throw new Error('Invalid Google token payload');
      }

      return {
        googleId: payload.sub,
        email: payload.email!,
        firstName: payload.given_name,
        lastName: payload.family_name,
        avatar: payload.picture,
        emailVerified: payload.email_verified || false,
      };
    } catch (error) {
      console.error('❌ Google OAuth verification failed:', error);
      throw new Error('Failed to verify Google token');
    }
  }

  /**
   * Verify a Google ID token directly (for frontend integration)
   */
  static async verifyGoogleIdToken(idToken: string): Promise<GoogleUserInfo> {
    try {
      const ticket = await client.verifyIdToken({
        idToken: idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        throw new Error('Invalid Google ID token payload');
      }

      return {
        googleId: payload.sub,
        email: payload.email!,
        firstName: payload.given_name,
        lastName: payload.family_name,
        avatar: payload.picture,
        emailVerified: payload.email_verified || false,
      };
    } catch (error) {
      console.error('❌ Google ID token verification failed:', error);
      throw new Error('Failed to verify Google ID token');
    }
  }
} 