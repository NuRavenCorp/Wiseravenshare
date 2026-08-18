import { initializeApp, getApp, getApps } from 'firebase/app';
import {
    FacebookAuthProvider,
    GoogleAuthProvider,
    OAuthProvider,
    createUserWithEmailAndPassword,
    getAuth,
    signInWithEmailAndPassword,
    signInWithPopup,
    signOut,
    updateProfile
} from 'firebase/auth';

const readEnv = (key) => String(import.meta.env[key] || '').trim();

const firebaseConfig = {
    apiKey: readEnv('VITE_FIREBASE_API_KEY'),
    authDomain: readEnv('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: readEnv('VITE_FIREBASE_PROJECT_ID'),
    appId: readEnv('VITE_FIREBASE_APP_ID'),
    messagingSenderId: readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    measurementId: readEnv('VITE_FIREBASE_MEASUREMENT_ID')
};

const providerIds = {
    microsoft: readEnv('VITE_FIREBASE_MICROSOFT_PROVIDER_ID'),
    tiktok: readEnv('VITE_FIREBASE_TIKTOK_PROVIDER_ID')
};

const hasValue = (value) => String(value || '').trim().length > 0;

const isConfigured = () => (
    hasValue(firebaseConfig.apiKey)
    && hasValue(firebaseConfig.authDomain)
    && hasValue(firebaseConfig.projectId)
    && hasValue(firebaseConfig.appId)
);

const getFirebaseApp = () => {
    if (!isConfigured()) {
        return null;
    }

    return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
};

const getFirebaseAuth = () => {
    const app = getFirebaseApp();
    return app ? getAuth(app) : null;
};

const buildProvider = (providerId) => {
    const normalized = String(providerId || '').trim().toLowerCase();
    if (!normalized) {
        return null;
    }

    if (normalized === 'google') {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        provider.addScope('email');
        provider.addScope('profile');
        return provider;
    }

    if (normalized === 'facebook') {
        const provider = new FacebookAuthProvider();
        provider.setCustomParameters({ auth_type: 'reauthenticate' });
        provider.addScope('email');
        provider.addScope('public_profile');
        return provider;
    }

    const providerConfigId = providerIds[normalized];
    if (!hasValue(providerConfigId)) {
        return null;
    }

    const provider = new OAuthProvider(providerConfigId);
    provider.setCustomParameters({ prompt: 'consent' });
    provider.addScope('openid');
    provider.addScope('email');
    provider.addScope('profile');
    return provider;
};

const signInWithFirebaseEmail = async (email, password) => {
    const auth = getFirebaseAuth();
    if (!auth) {
        throw new Error('Firebase authentication is not configured.');
    }

    const credential = await signInWithEmailAndPassword(auth, email, password);
    const idToken = await credential.user.getIdToken(true);
    return { credential, idToken };
};

const registerWithFirebaseEmail = async ({ email, password, displayName, photoURL }) => {
    const auth = getFirebaseAuth();
    if (!auth) {
        throw new Error('Firebase authentication is not configured.');
    }

    const credential = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName || photoURL) {
        await updateProfile(credential.user, {
            displayName: displayName || undefined,
            photoURL: photoURL || undefined
        });
    }

    const idToken = await credential.user.getIdToken(true);
    return { credential, idToken };
};

const signInWithFirebaseProvider = async (providerId) => {
    const auth = getFirebaseAuth();
    if (!auth) {
        throw new Error('Firebase authentication is not configured.');
    }

    const provider = buildProvider(providerId);
    if (!provider) {
        throw new Error(`Firebase provider "${providerId}" is not configured.`);
    }

    const credential = await signInWithPopup(auth, provider);
    const idToken = await credential.user.getIdToken(true);
    return { credential, idToken };
};

const signOutFirebase = async () => {
    const auth = getFirebaseAuth();
    if (!auth) {
        return;
    }

    await signOut(auth);
};

export const firebaseAuth = {
    isConfigured,
    signInWithEmail: signInWithFirebaseEmail,
    registerWithEmail: registerWithFirebaseEmail,
    signInWithProvider: signInWithFirebaseProvider,
    signOut: signOutFirebase
};
