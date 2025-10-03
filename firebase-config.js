
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAM_nhmybRetSdWJASTFz_Mq2OxVmMFD2A",
  authDomain: "account-3c2d3.firebaseapp.com",
  projectId: "account-3c2d3",
  storageBucket: "account-3c2d3.firebasestorage.app",
  messagingSenderId: "440967751243",
  appId: "1:440967751243:web:68c48569ae2799b9ed8fce",
  measurementId: "G-TM5TW08FYW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

export { db, analytics };
