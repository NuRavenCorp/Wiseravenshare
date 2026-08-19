export const firebaseAuth = {
    isConfigured: () => false,
    signInWithEmail: async () => { throw new Error('Firebase Auth is not configured.'); },
    registerWithEmail: async () => { throw new Error('Firebase Auth is not configured.'); },
    signInWithProvider: async () => { throw new Error('Firebase Auth is not configured.'); },
    signOut: async () => {}
};

export default firebaseAuth;
