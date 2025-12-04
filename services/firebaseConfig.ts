
import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import "firebase/compat/firestore";
import "firebase/compat/storage";

// Configuration for Project: aipodcastvoice-7221d
const firebaseConfig = {
  apiKey: "AIzaSyCLNXGiM4gj0uGankALvA6EMmnOfjgKjEU",
  authDomain: "aipodcastvoice-7221d.firebaseapp.com",
  projectId: "aipodcastvoice-7221d",
  storageBucket: "aipodcastvoice-7221d.firebasestorage.app", // Corrected bucket domain
  messagingSenderId: "555885424688",
  appId: "1:555885424688:web:fd48f632a5b496d49c7df5",
  measurementId: "G-JFDYH3FC20"
};

// Initialize Firebase
// Check if apps already exist to avoid re-initialization error in HMR/Dev
export const app = !firebase.apps.length ? firebase.initializeApp(firebaseConfig) : firebase.app();

// Initialize Services
export const auth = firebase.auth();
export const db = firebase.firestore();
export const storage = firebase.storage();
