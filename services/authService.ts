
import { auth } from './firebaseConfig';
import firebase from 'firebase/compat/app';

export async function signInWithGoogle(): Promise<firebase.User | null> {
  // Proactive check for file protocol which is a common cause of "operation not supported"
  if (window.location.protocol === 'file:') {
    const error: any = new Error("Firebase Auth cannot run on 'file://' protocol. Please serve the app using a local web server (e.g., http://localhost).");
    error.code = 'auth/operation-not-supported-in-this-environment';
    throw error;
  }

  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    // Force the account selection screen to allow switching users
    provider.setCustomParameters({
      prompt: 'select_account'
    });
    
    const result = await auth.signInWithPopup(provider);
    return result.user;
  } catch (error) {
    console.error("Login failed:", error);
    throw error;
  }
}

export async function connectGoogleDrive(): Promise<string> {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/drive.file');
  
  // Re-authenticate or Link to get the credential with the new scope
  if (!auth.currentUser) throw new Error("Must be logged in");

  try {
    // We use linkWithPopup or reauthenticateWithPopup to get the OAuth credential
    // containing the Google Access Token (needed for Drive API, distinct from Firebase ID Token)
    const result = await auth.currentUser.reauthenticateWithPopup(provider);
    const credential = result.credential as firebase.auth.OAuthCredential;
    
    if (!credential.accessToken) throw new Error("Failed to get Google Access Token");
    return credential.accessToken;
  } catch (error) {
    console.error("Drive connection failed:", error);
    throw error;
  }
}

export async function reauthenticateWithGitHub(): Promise<{ user: firebase.User | null, token: string | null }> {
    const provider = new firebase.auth.GithubAuthProvider();
    provider.addScope('repo');
    provider.addScope('user');
    
    if (!auth.currentUser) throw new Error("No user logged in to re-authenticate.");

    try {
        const result = await auth.currentUser.reauthenticateWithPopup(provider);
        const credential = result.credential as firebase.auth.OAuthCredential;
        return { user: result.user, token: credential?.accessToken || null };
    } catch (error) {
        console.error("Re-auth failed:", error);
        throw error;
    }
}

export async function signInWithGitHub(): Promise<{ user: firebase.User | null, token: string | null }> {
  try {
    const provider = new firebase.auth.GithubAuthProvider();
    // Request repo scope to allow reading and writing private/public repositories
    provider.addScope('repo');
    provider.addScope('user');

    // SCENARIO 1: User is already logged in (e.g. with Google)
    // We want to LINK GitHub to the existing account so they can access Repos.
    if (auth.currentUser) {
       try {
         const result = await auth.currentUser.linkWithPopup(provider);
         const credential = result.credential as firebase.auth.OAuthCredential;
         return { user: result.user, token: credential?.accessToken || null };
       } catch (linkError: any) {
         // Case A: GitHub account is ALREADY linked to THIS Firebase account.
         // We just need to retrieve a fresh OAuth Access Token.
         if (linkError.code === 'auth/provider-already-linked') {
             try {
                // First try re-authenticating to get credentials
                const result = await auth.currentUser.reauthenticateWithPopup(provider);
                const credential = result.credential as firebase.auth.OAuthCredential;
                return { user: result.user, token: credential?.accessToken || null };
             } catch (reAuthError: any) {
                 console.warn("Re-auth failed, falling back to sign-in:", reAuthError);
                 // Fallback: If reauth fails (sometimes happens with popup blockers or specific flows),
                 // try generic signIn (which handles existing users)
                 try {
                    const result = await auth.signInWithPopup(provider);
                    const credential = result.credential as firebase.auth.OAuthCredential;
                    return { user: result.user, token: credential?.accessToken || null };
                 } catch (signInError: any) {
                    throw signInError;
                 }
             }
         }
         
         // Case B: GitHub account is linked to DIFFERENT Firebase account.
         if (linkError.code === 'auth/credential-already-in-use') {
            throw new Error("This GitHub account is already linked to another user. Please sign in with that account.");
         }
         
         // Other linking errors
         throw linkError;
       }
    } 
    // SCENARIO 2: User is NOT logged in
    // Attempt to sign in with GitHub directly.
    else {
       const result = await auth.signInWithPopup(provider);
       const credential = result.credential as firebase.auth.OAuthCredential;
       return { user: result.user, token: credential?.accessToken || null };
    }

  } catch (error: any) {
    console.error("GitHub Login failed:", error);
    // Ensure we return a helpful message for the toast
    if (error.code === 'auth/popup-closed-by-user') {
        throw new Error("Sign-in cancelled.");
    }
    throw error;
  }
}

export async function signOut(): Promise<void> {
  try {
    await auth.signOut();
  } catch (error) {
    console.error("Logout failed:", error);
  }
}

export function getCurrentUser(): firebase.User | null {
  return auth.currentUser;
}
