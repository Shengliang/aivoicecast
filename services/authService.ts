

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

export async function signInWithGitHub(): Promise<{ user: firebase.User | null, token: string | null }> {
  try {
    const provider = new firebase.auth.GithubAuthProvider();
    // Request repo scope to allow reading and writing private/public repositories
    provider.addScope('repo');
    provider.addScope('user');

    const result = await auth.signInWithPopup(provider);
    
    // This gives you a GitHub Access Token. You can use it to access the GitHub API.
    const credential = result.credential as firebase.auth.OAuthCredential;
    const token = credential?.accessToken || null;

    return { user: result.user, token };
  } catch (error) {
    console.error("GitHub Login failed:", error);
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