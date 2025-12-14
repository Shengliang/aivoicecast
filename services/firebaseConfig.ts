
import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import "firebase/compat/firestore";
import "firebase/compat/storage";
import { firebaseKeys } from './private_keys';

// 1. Check for local override (set by the Safe Mode modal)
const localConfigStr = localStorage.getItem('firebase_config');
let localConfig = null;
try {
    if (localConfigStr) localConfig = JSON.parse(localConfigStr);
} catch(e) {
    console.error("Invalid local firebase config", e);
}

// 2. Determine config to use: LocalStorage > Private Keys File
const configToUse = localConfig || firebaseKeys;

// 3. Export flag to tell UI if we are running on meaningful config
// We check if apiKey is present and not an empty string
export const isFirebaseConfigured = !!(configToUse && configToUse.apiKey && configToUse.apiKey.trim() !== "");

// 4. Initialize Firebase
// Check if apps are already initialized to prevent hot-reload errors
export const app = !firebase.apps.length ? firebase.initializeApp(configToUse) : firebase.app();

export const auth = firebase.auth();
export const db = firebase.firestore();
export const storage = firebase.storage();
