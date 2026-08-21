import { initializeApp, cert, getApps, App } from "firebase-admin/app";
import { getMessaging, Messaging } from "firebase-admin/messaging";
import { getFirestore, Firestore } from "firebase-admin/firestore";

let firebaseApp: App | null = null;

export function getFirebaseAdminApp(): App | null {
  if (firebaseApp) return firebaseApp;

  const existingApps = getApps();
  if (existingApps.length > 0) {
    firebaseApp = existingApps[0]!;
    return firebaseApp;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    // If credentials are not provided in environment, fallback gracefully
    console.warn(
      "[FirebaseAdmin] Firebase environment variables (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) not fully set. FCM push notifications will be simulated (DB only)."
    );
    return null;
  }

  // Handle escaped newlines in private key if passed as environment string
  if (privateKey.includes("\\n")) {
    privateKey = privateKey.replace(/\\n/g, "\n");
  }

  try {
    firebaseApp = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    return firebaseApp;
  } catch (error) {
    console.error("[FirebaseAdmin] Failed to initialize Firebase Admin SDK:", error);
    return null;
  }
}

export function getFirebaseMessaging(): Messaging | null {
  const app = getFirebaseAdminApp();
  if (!app) return null;
  return getMessaging(app);
}

export function getFirebaseFirestore(): Firestore | null {
  const app = getFirebaseAdminApp();
  if (!app) return null;
  return getFirestore(app);
}


