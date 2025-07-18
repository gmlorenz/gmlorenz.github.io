// --- Style Injection ---
function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
        body {
            font-family: 'Inter', sans-serif;
        }
        /* Custom scrollbar for better aesthetics */
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: #f1f1f1; }
        ::-webkit-scrollbar-thumb { background: #888; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #555; }
        .modal-backdrop {
            display: none;
            position: fixed;
            z-index: 50;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            justify-content: center;
            align-items: center;
        }
        .modal {
            max-height: 90vh;
            overflow-y: auto;
        }
        .filter-btn.active {
            background-color: #4f46e5; /* indigo-600 */
            color: white;
        }
        @media print {
            body * { visibility: hidden; }
            #receiptModal, #receiptModal * { visibility: visible; }
            #receiptModal { position: absolute; left: 0; top: 0; width: 100%; }
        }
        .loan-details-card {
            background-color: rgba(255, 255, 255, 0.5);
            border: 1px solid rgba(0,0,0,0.05);
        }
        .dark .loan-details-card {
             background-color: rgba(0, 0, 0, 0.2);
             border: 1px solid rgba(255,255,255,0.1);
        }
        #tableViewModal .modal {
            max-width: 90%;
        }
        .sortable-header {
            cursor: pointer;
        }
        .sortable-header:hover {
            background-color: rgba(0,0,0,0.05);
        }
        .dark .sortable-header:hover {
             background-color: rgba(255,255,255,0.05);
        }
        .collapsible-body {
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease-out;
        }
        .borrower-card.expanded .collapsible-body {
            max-height: 10000px; /* Large enough to fit content */
            transition: max-height 0.5s ease-in;
        }
        .chevron-icon {
            transition: transform 0.3s;
        }
        .borrower-card.expanded .chevron-icon {
            transform: rotate(180deg);
        }
        /* --- NEW: Timeline styles for payment history --- */
        .payment-timeline {
            position: relative;
            padding-left: 20px;
        }
        .payment-timeline::before {
            content: '';
            position: absolute;
            left: 5px;
            top: 5px;
            bottom: 5px;
            width: 2px;
            background-color: #cbd5e1; /* gray-300 */
        }
        .dark .payment-timeline::before {
            background-color: #4b5563; /* gray-600 */
        }
        .timeline-item {
            position: relative;
        }
        .timeline-item::before {
            content: '';
            position: absolute;
            left: -20px;
            top: 5px;
            width: 12px;
            height: 12px;
            border-radius: 9999px;
            background-color: #fff;
            border: 2px solid #6366f1; /* indigo-500 */
        }
        .dark .timeline-item::before {
            background-color: #1f2937; /* gray-800 */
        }
        .timeline-item:last-child::after {
             content: '';
             position: absolute;
             left: -20px;
             bottom: -5px; /* Adjust to align with the line */
             width: 12px;
             height: 12px;
             border-radius: 9999px;
             background-color: #10b981; /* emerald-500 */
             border: 2px solid #fff;
        }
        /* --- NEW: Spinner Styles --- */
        .spinner {
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
        .loading-button .button-text {
            display: none;
        }
        .loading-button .spinner-icon {
            display: inline-block;
        }
        .spinner-icon {
             display: none;
        }
    `;
    document.head.appendChild(style);
}

// --- Import Firebase functions ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, query, serverTimestamp, where, getDoc, setDoc, arrayUnion, arrayRemove, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const LoanTrackerApp = {
    // --- Global State ---
    currentUser: null,
    confirmCallback: null,
    unsubscribeFromBorrowers: null,
    allBorrowers: [],
    currentFilter: 'all',
    loanTypeChart: null,
    primaryAdmin: 'cristinemae111@gmail.com',
    sortState: { column: 'loanDate', direction: 'desc' },
    expandedBorrowerIds: new Set(),
    currentPage: 1, 
    loansPerPage: 10,
    appSettings: {},
    currentUserRole: 'user',
    historyModalOpen: false,

    // --- DOM Elements ---
    elements: {},

    // --- Firebase Services ---
    app: null,
    auth: null,
    db: null,
    provider: null,

    init() {
        injectStyles();
        
        // --- Environment and Firebase Configuration ---
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'product-loan-app-dev';
        const firebaseConfig = typeof __firebase_config !== 'undefined' 
            ? JSON.parse(__firebase_config)
            : { // Fallback configuration for local development
                apiKey: "AIzaSyB_eeYSYZPeYRr3m3xiX7OLoRzsd37yNwI",
                authDomain: "e-loan-9457a.firebaseapp.com",
                projectId: "e-loan-9457a",
                storageBucket: "e-loan-9457a.firebasestorage.app",
                messagingSenderId: "905622570857",
                appId: "1:905622570857:web:5dfb76c60f9e5d9fdedff8",
                measurementId: "G-SQF73TTGMX"
            };

        // Initialize Firebase App, Auth, and Firestore
        this.app = initializeApp(firebaseConfig);
        this.auth = getAuth(this.app);
        this.db = getFirestore(this.app);
        this.provider = new GoogleAuthProvider();

        this.cacheDOMElements();
        this.attachEventListeners();
        
        onAuthStateChanged(this.auth, this.handleAuthStateChange.bind(this));
    },

    cacheDOMElements() {
        this.elements = {
            loginScreen: document.getElementById('loginScreen'),
            mainApp: document.getElementById('mainApp'),
            googleSignInButton: document.getElementById('googleSignInButton'),
        };
    },
    
    handleAuthStateChange(user) {
        if (user) {
            this.checkAuthorization(user);
        } else {
            this.currentUser = null;
            this.showLoginScreen();
            this.toggleButtonSpinner(this.elements.googleSignInButton, false);
        }
    },

    attachEventListeners() {
        this.elements.googleSignInButton.addEventListener('click', () => {
            this.toggleButtonSpinner(this.elements.googleSignInButton, true);
            signInWithPopup(this.auth, this.provider).catch(error => {
                console.error("Google Sign-In Error:", error);
                if (error.code !== 'auth/popup-closed-by-user') {
                    this.showAlert('Sign-In Failed', `Error: ${error.message}`);
                }
                this.toggleButtonSpinner(this.elements.googleSignInButton, false);
            });
        });
    },

    // Include all other methods from your previous script here, ensuring they are part of the LoanTrackerApp object
    // and use `this.` to reference other methods or properties of the object.
    
    // For example:
    showAlert(title, message) {
        // ... implementation
    },
    
    showLoginScreen() {
        this.elements.mainApp.style.display = 'none';
        this.elements.loginScreen.style.display = 'flex';
        const borrowerList = document.getElementById('borrowerList');
        if (borrowerList) {
            borrowerList.innerHTML = '<p class="text-center text-gray-500 dark:text-gray-400 py-8">Please log in to see records.</p>';
        }
    },
    
    async checkAuthorization(user) {
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'product-loan-app-dev';
        const configRef = doc(this.db, `artifacts/${appId}/config/app_settings`);
        try {
            let configSnap = await getDoc(configRef);
            if (!configSnap.exists()) {
                await setDoc(configRef, { 
                    authorizedEmails: [this.primaryAdmin],
                    defaultPenaltyRate: 5,
                    defaultELoanInterest: 20,
                    userRoles: { [this.primaryAdmin]: 'admin' }
                });
                configSnap = await getDoc(configRef);
            }
            
            const data = configSnap.data();
            const authorizedEmails = data.authorizedEmails || [];
            const userRoles = data.userRoles || {};
            
            this.appSettings = {
                authorizedEmails: authorizedEmails,
                defaultPenaltyRate: data.defaultPenaltyRate || 5,
                defaultELoanInterest: data.defaultELoanInterest || 20,
                userRoles: userRoles
            };
            
            this.currentUserRole = this.appSettings.userRoles[user.email] || 'user';

            if (this.appSettings.authorizedEmails.includes(user.email)) {
                this.currentUser = user;
                this.showMainApp(user);
            } else {
                this.showAlert('Access Denied', 'Your email is not authorized to access this application.');
                signOut(this.auth);
            }
        } catch (error) {
            console.error("Error checking authorization:", error);
            this.showAlert('Authorization Error', 'Could not verify your access rights. Please try again.');
            signOut(this.auth);
        }
    },
    
    showMainApp(user) {
        document.getElementById('loggedInUser').textContent = user.email;
        this.elements.loginScreen.style.display = 'none';
        this.elements.mainApp.style.display = 'block';
        this.initializeMainAppEventListeners();
        this.loadBorrowers();
    },
    
    // ... all your other functions, converted to methods of LoanTrackerApp
};

document.addEventListener('DOMContentLoaded', () => {
    LoanTrackerApp.init();
});
