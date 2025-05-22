// src/firebase/config.js

// Imports MUST be at the top for ESLint rule import/first
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// --- TEMPORARY DEBUG LOGGING ---
// Now that imports are done, we can log.
console.log("--- DEBUG: Firebase Config Script Execution ---");
console.log("Raw process.env.REACT_APP_FIREBASE_PROJECT_ID:", process.env.REACT_APP_FIREBASE_PROJECT_ID);
console.log("Raw process.env.REACT_APP_FIREBASE_API_KEY:", process.env.REACT_APP_FIREBASE_API_KEY);
// --- END TEMPORARY DEBUG LOGGING ---

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

// --- TEMPORARY DEBUG LOGGING ---
console.log("firebaseConfig object to be used by initializeApp:", JSON.stringify(firebaseConfig, null, 2));
// --- END TEMPORARY DEBUG LOGGING ---

const app = initializeApp(firebaseConfig);

// --- TEMPORARY DEBUG LOGGING ---
console.log("Firebase app initialized. Project ID from app instance:", app.options.projectId);
console.log("--- END DEBUG: Firebase Config Script Execution ---");
// --- END TEMPORARY DEBUG LOGGING ---

export const db = getFirestore(app);
export const storage = getStorage(app);