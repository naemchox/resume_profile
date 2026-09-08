// Initializes Firebase for Arthid and exposes the SDK on `window` so the
// legacy non-module code in index3.html and auth.html can use it.
//
// Public API key — Firebase web keys are identifiers, not secrets. Access
// is controlled by Firestore security rules and the authorized-domains
// list in the Firebase Console.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
    getFirestore,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    addDoc,
    collection,
    query,
    where,
    orderBy,
    limit,
    onSnapshot,
    serverTimestamp,
    arrayUnion,
    arrayRemove,
    writeBatch,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {
    getStorage,
    ref as storageRef,
    uploadBytes,
    uploadBytesResumable,
    getDownloadURL,
    deleteObject,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";

const firebaseConfig = {
    apiKey: "REPLACE_WITH_YOUR_FIREBASE_API_KEY",
    authDomain: "arthid-0417.firebaseapp.com",
    projectId: "arthid-0417",
    storageBucket: "arthid-0417.firebasestorage.app",
    messagingSenderId: "629924908533",
    appId: "1:629924908533:web:9ed90bb9095c0d3eb364bc",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Expose to legacy script-tag code. Subsequent phases will use these.
window.firebase = {
    app,
    auth,
    db,
    storage,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    addDoc,
    collection,
    query,
    where,
    orderBy,
    limit,
    onSnapshot,
    serverTimestamp,
    arrayUnion,
    arrayRemove,
    writeBatch,
    storageRef,
    uploadBytes,
    uploadBytesResumable,
    getDownloadURL,
    deleteObject,
};

// Smoke-test signal so we can confirm the module loaded.
console.log("[firebase] initialized — project:", firebaseConfig.projectId);
window.dispatchEvent(new Event("firebase-ready"));

// On every successful sign-in, mirror the user's profile into
// `users/{uid}`. createdAt is set once; the mutable fields are refreshed
// on each login so name/picture stay in sync with the auth provider.
onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    try {
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);
        const fallbackName = (user.displayName
            || (user.email === "patwan@arthid.dev" ? "Patwan (admin)" : null)
            || (user.email || "").split("@")[0]
            || "Unnamed");
        const base = {
            uid: user.uid,
            email: user.email || "",
            name: fallbackName,
            picture: user.photoURL || null,
            isAdmin: user.email === "patwan@arthid.dev",
            updatedAt: serverTimestamp(),
        };
        if (!snap.exists()) {
            await setDoc(userRef, Object.assign({}, base, { createdAt: serverTimestamp() }));
            console.log("[firebase] created users/" + user.uid);
        } else {
            // Don't clobber a name the user has customised in their profile.
            // Only overwrite if the doc still has the auto-generated value.
            const existing = snap.data() || {};
            const patch = {
                email: base.email,
                picture: base.picture,
                isAdmin: base.isAdmin,
                updatedAt: base.updatedAt,
            };
            if (!existing.name || existing.name === existing.email) patch.name = base.name;
            await updateDoc(userRef, patch);
            console.log("[firebase] refreshed users/" + user.uid);
        }
    } catch (err) {
        console.error("[firebase] could not upsert user doc:", err);
    }
});
