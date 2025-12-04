
import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import "firebase/compat/firestore";
import "firebase/compat/storage";

// 1. Try Environment Variables
const envConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

// 2. Try Local Storage
const localConfigStr = localStorage.getItem('firebase_config');
let localConfig = null;
try {
    if (localConfigStr) localConfig = JSON.parse(localConfigStr);
} catch(e) {
    console.error("Invalid cached firebase config", e);
}

// 3. Determine Active Config
// If env var is set (and not just empty string), use it. Otherwise local.
const hasEnv = !!envConfig.apiKey;

// Fallback to prevent crash on load if no config is found
// We use the provided key temporarily to satisfy the initialization check
const placeholderConfig = {
    apiKey: "AIzaSyCLNXGiM4gj0uGankALvA6EMmnOfjgKjEU", 
    authDomain: "placeholder-project.firebaseapp.com",
    projectId: "placeholder-project",
    storageBucket: "placeholder-project.appspot.com",
    messagingSenderId: "00000000000",
    appId: "1:00000000000:web:00000000000000"
};

const configToUse = hasEnv ? envConfig : (localConfig || placeholderConfig);

// Flag to tell UI if we are running on meaningful config
export const isFirebaseConfigured = hasEnv || !!localConfig;

// Initialize Firebase
// Check if apps already exist to avoid re-initialization error in HMR/Dev
export const app = !firebase.apps.length ? firebase.initializeApp(configToUse) : firebase.app();

// Initialize Services
export const auth = firebase.auth();
export const db = firebase.firestore();
export const storage = firebase.storage();
