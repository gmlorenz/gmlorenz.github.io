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
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// --- Global State ---
let currentUser = null;
let confirmCallback = null;
let unsubscribeFromBorrowers = null;
let allBorrowers = [];
let currentFilter = 'all';
let loanTypeChart = null;
const primaryAdmin = 'cristinemae111@gmail.com';
let sortState = { column: 'loanDate', direction: 'desc' };
let expandedBorrowerIds = new Set();
let currentPage = 1; 
const loansPerPage = 10;
let appSettings = {};
let currentUserRole = 'user';
let historyModalOpen = false;

// --- DOM Elements ---
const loginScreen = document.getElementById('loginScreen');
const mainApp = document.getElementById('mainApp');
const googleSignInButton = document.getElementById('googleSignInButton');

// --- Custom Modals ---
function showAlert(title, message) {
    document.getElementById('alertTitle').textContent = title;
    document.getElementById('alertMessage').textContent = message;
    document.getElementById('alertModal').style.display = 'flex';
}
document.getElementById('alertOkButton').addEventListener('click', () => document.getElementById('alertModal').style.display = 'none');

function showConfirm(title, message, callback) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    confirmCallback = callback;
    document.getElementById('confirmModal').style.display = 'flex';
}
document.getElementById('confirmOkButton').addEventListener('click', () => {
    if (confirmCallback) confirmCallback(true); // Pass true for confirmation
    document.getElementById('confirmModal').style.display = 'none';
    confirmCallback = null;
});
document.getElementById('confirmCancelButton').addEventListener('click', () => {
    if (confirmCallback) confirmCallback(false); // Pass false for cancellation
    document.getElementById('confirmModal').style.display = 'none';
    confirmCallback = null;
});

function toggleButtonSpinner(button, show) {
    if (!button) return;
    const textSpan = button.querySelector('.button-text');
    const spinnerSvg = button.querySelector('.spinner-icon');

    if (show) {
        button.disabled = true;
        if (textSpan) textSpan.style.display = 'none';
        if (spinnerSvg) spinnerSvg.style.display = 'inline-block';
    } else {
        button.disabled = false;
        if (textSpan) textSpan.style.display = 'inline-block';
        if (spinnerSvg) spinnerSvg.style.display = 'none';
    }
}

// --- Authentication ---
googleSignInButton.addEventListener('click', () => {
    toggleButtonSpinner(googleSignInButton, true);
    signInWithPopup(auth, provider).catch(error => {
        console.error("Google Sign-In Error:", error);
        if (error.code !== 'auth/popup-closed-by-user') {
            showAlert('Sign-In Failed', `Error: ${error.message}`);
        }
        toggleButtonSpinner(googleSignInButton, false);
    });
});

onAuthStateChanged(auth, user => {
    if (user) {
        checkAuthorization(user);
    } else {
        currentUser = null;
        showLoginScreen();
        toggleButtonSpinner(googleSignInButton, false);
    }
});

async function checkAuthorization(user) {
    const configRef = doc(db, `artifacts/${appId}/config/app_settings`);
    try {
        let configSnap = await getDoc(configRef);
        if (!configSnap.exists()) {
            await setDoc(configRef, { 
                authorizedEmails: [primaryAdmin],
                defaultPenaltyRate: 5,
                defaultELoanInterest: 20,
                userRoles: { [primaryAdmin]: 'admin' }
            });
            configSnap = await getDoc(configRef);
        }
        
        const data = configSnap.data();
        const authorizedEmails = data.authorizedEmails || [];
        const userRoles = data.userRoles || {};
        
        appSettings = {
            authorizedEmails: authorizedEmails,
            defaultPenaltyRate: data.defaultPenaltyRate || 5,
            defaultELoanInterest: data.defaultELoanInterest || 20,
            userRoles: userRoles
        };
        
        currentUserRole = appSettings.userRoles[user.email] || 'user';

        if (appSettings.authorizedEmails.includes(user.email)) {
            currentUser = user;
            showMainApp(user);
        } else {
            showAlert('Access Denied', 'Your email is not authorized to access this application.');
            signOut(auth);
        }
    } catch (error) {
        console.error("Error checking authorization:", error);
        showAlert('Authorization Error', 'Could not verify your access rights. Please try again.');
        signOut(auth);
    }
}

// --- App Initialization ---
function initializeMainAppEventListeners() {
    document.getElementById('logoutButton').addEventListener('click', () => {
        if (unsubscribeFromBorrowers) unsubscribeFromBorrowers();
        signOut(auth);
    });
    
    if (currentUserRole === 'admin') {
        document.getElementById('settingsButton').style.display = 'inline-block';
        document.getElementById('manageLoanerButton').style.display = 'inline-block';
    } else {
        document.getElementById('settingsButton').style.display = 'none';
        document.getElementById('manageLoanerButton').style.display = 'none';
    }
    
    document.getElementById('settingsButton').addEventListener('click', openSettingsModal);
    document.getElementById('closeSettingsButton').addEventListener('click', () => document.getElementById('settingsModal').style.display = 'none');
    document.getElementById('addEmailForm').addEventListener('submit', handleAddAuthorizedEmail);
    document.getElementById('loanDefaultsForm').addEventListener('submit', handleSaveDefaults);
    
    document.getElementById('manageLoanerButton').addEventListener('click', openManageLoanerModal);
    document.getElementById('closeManageLoanerButton').addEventListener('click', () => document.getElementById('manageLoanerModal').style.display = 'none');
    document.getElementById('manageLoanerSearch').addEventListener('input', renderManageLoanerList);
    document.getElementById('closeEditLoanerButton').addEventListener('click', () => document.getElementById('editLoanerModal').style.display = 'none');
    document.getElementById('editLoanerForm').addEventListener('submit', handleEditLoanerSubmit);
    document.getElementById('editLoanerDeleteButton').addEventListener('click', handleDeleteLoaner);
    document.getElementById('closeLoanerHistoryButton').addEventListener('click', () => document.getElementById('loanerHistoryModal').style.display = 'none');
    document.getElementById('resetLoanScoreBtn').addEventListener('click', handleResetLoanScore);
    
    document.getElementById('tableViewButton').addEventListener('click', () => document.getElementById('tableViewModal').style.display = 'flex');
    document.getElementById('closeTableViewButton').addEventListener('click', () => document.getElementById('tableViewModal').style.display = 'none');

    document.getElementById('importButton').addEventListener('click', (e) => {
        toggleButtonSpinner(e.target, true);
        document.getElementById('csvFileInput').click();
    });
    document.getElementById('exportButton').addEventListener('click', (e) => {
        toggleButtonSpinner(e.target, true);
        exportToCSV(allBorrowers);
        setTimeout(() => toggleButtonSpinner(e.target, false), 1000); // Simulate export time
    });
    document.getElementById('csvFileInput').addEventListener('change', (e) => importFromCSV(e.target.files[0]));

    document.getElementById('closePartialPaymentButton').addEventListener('click', () => document.getElementById('partialPaymentModal').style.display = 'none');
    document.getElementById('closeEditNotesButton').addEventListener('click', () => document.getElementById('editNotesModal').style.display = 'none');
    document.getElementById('closeEditLoanButton').addEventListener('click', () => document.getElementById('editLoanModal').style.display = 'none');

    const addLoanForm = document.getElementById('addLoanForm');
    addLoanForm.innerHTML = `
        <div>
            <label for="modalBorrowerName" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Borrower's Name</label>
            <input type="text" id="modalBorrowerName" name="borrowerName" required class="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
        </div>
        <div>
            <label for="modalLoanType" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Loan Type</label>
            <select id="modalLoanType" name="loanType" class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md">
                <option value="Product">Product</option>
                <option value="E-Loan">E-Loan</option>
                <option value="Long Term E-Loan">Long Term E-Loan</option>
            </select>
        </div>
        <div id="modalProductNameField">
            <label for="modalProductName" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Product Name</label>
            <input type="text" id="modalProductName" name="productName" class="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
        </div>
        <div class="space-y-4">
            <div>
                <label for="modalLoanAmount" id="modalLoanAmountLabel" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Loan Amount (₱)</label>
                <input type="number" id="modalLoanAmount" name="loanAmount" min="0" step="0.01" required class="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
            </div>
            <div id="interestRateSection">
                <label for="modalInterestRate" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Interest Rate (%)</label>
                <input type="number" id="modalInterestRate" name="interestRate" min="0" step="0.1" class="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
            </div>
            <div id="customInterestSection" class="hidden">
                <label for="modalCustomInterest" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Interest (₱)</label>
                <input type="number" id="modalCustomInterest" name="customInterest" min="0" step="0.01" class="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
            </div>
            <div class="flex items-center">
                <input id="customInterestCheckbox" type="checkbox" class="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded">
                <label for="customInterestCheckbox" class="ml-2 block text-sm text-gray-900 dark:text-gray-300">Custom Interest</label>
            </div>
            <div>
                <label for="modalNumberOfPayments" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Number of Payments (Gives)</label>
                <input type="number" id="modalNumberOfPayments" name="numberOfPayments" min="1" step="1" value="1" class="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
            </div>
            <div>
                <label for="modalPaymentFrequency" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Payment Frequency</label>
                <select id="modalPaymentFrequency" name="paymentFrequency" class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md">
                    <option value="weekly">Weekly</option>
                    <option value="bi-weekly">Bi-Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="one-time">One-time</option>
                </select>
            </div>
        </div>
         <div>
            <label for="modalLoanNotes" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Notes (Optional)</label>
            <textarea id="modalLoanNotes" name="loanNotes" rows="3" class="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"></textarea>
        </div>
         <div>
            <label for="modalContactDetails" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Contact Details (Optional)</label>
            <textarea id="modalContactDetails" name="contactDetails" rows="2" class="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"></textarea>
        </div>
        <div>
            <label for="modalLoanDate" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Loan Date</label>
            <input type="date" id="modalLoanDate" name="loanDate" required class="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
        </div>
        <button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-md shadow-lg">
            <span class="button-text">Add Loan Record</span>
            <svg class="spinner-icon w-5 h-5 text-white animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        </button>
    `;
    
    document.getElementById('addNewLoanerButton').addEventListener('click', () => {
        document.getElementById('addLoanForm').reset();
        document.getElementById('modalInterestRate').value = appSettings.defaultELoanInterest;
        document.getElementById('addLoanModal').style.display = 'flex';
        document.getElementById('modalLoanType').dispatchEvent(new Event('change'));
        document.getElementById('customInterestCheckbox').dispatchEvent(new Event('change'));
    });

    document.getElementById('closeAddLoanButton').addEventListener('click', () => document.getElementById('addLoanModal').style.display = 'none');
    
    const loanAmountLabel = document.getElementById('modalLoanAmountLabel');
    const interestRateInput = document.getElementById('modalInterestRate');
    const numberOfPaymentsInput = document.getElementById('modalNumberOfPayments');
    const paymentFrequencySelect = document.getElementById('modalPaymentFrequency');
    const productNameField = document.getElementById('modalProductNameField');

    document.getElementById('modalLoanType').addEventListener('change', (e) => {
        if (e.target.value === 'E-Loan') {
            productNameField.style.display = 'none';
            loanAmountLabel.textContent = 'Loan Amount (₱)';
            interestRateInput.value = appSettings.defaultELoanInterest;
            numberOfPaymentsInput.value = 1;
            paymentFrequencySelect.value = 'weekly';
        } else if (e.target.value === 'Long Term E-Loan') {
             productNameField.style.display = 'none';
             loanAmountLabel.textContent = 'Loan Amount (₱)';
             interestRateInput.value = appSettings.defaultELoanInterest;
        } else if (e.target.value === 'Product') {
            productNameField.style.display = 'block';
            loanAmountLabel.textContent = 'Product Amount (₱)';
            interestRateInput.value = 0;
        }
    });
    
    const customInterestCheckbox = document.getElementById('customInterestCheckbox');
    const interestRateSection = document.getElementById('interestRateSection');
    const customInterestSection = document.getElementById('customInterestSection');

    customInterestCheckbox.addEventListener('change', (e) => {
        if(e.target.checked) {
            interestRateSection.style.display = 'none';
            customInterestSection.style.display = 'block';
            interestRateInput.value = 0; 
        } else {
            interestRateSection.style.display = 'block';
            customInterestSection.style.display = 'none';
        }
    });

    document.getElementById('howItWorksButton').addEventListener('click', () => document.getElementById('howItWorksModal').style.display = 'flex');
    document.getElementById('closeHowItWorksButton').addEventListener('click', () => document.getElementById('howItWorksModal').style.display = 'none');
    
    document.getElementById('searchLoaner').addEventListener('input', () => {
        currentPage = 1;
        renderBorrowerList();
    });

    document.getElementById('filterButtons').addEventListener('click', (e) => {
        if (e.target.classList.contains('filter-btn')) {
            currentPage = 1;
            currentFilter = e.target.dataset.filter;
            document.querySelectorAll('#filterButtons .filter-btn').forEach(btn => {
                btn.classList.remove('active', 'bg-indigo-600', 'text-white');
                btn.classList.add('bg-gray-200', 'dark:bg-gray-700', 'text-gray-700', 'dark:text-gray-300');
            });
            e.target.classList.add('active', 'bg-indigo-600', 'text-white');
            e.target.classList.remove('bg-gray-200', 'dark:bg-gray-700', 'text-gray-700', 'dark:text-gray-300');
            renderBorrowerList();
        }
    });

    document.getElementById('summaryFilterButtons').addEventListener('click', (e) => {
         if (e.target.classList.contains('filter-btn')) {
            const filter = e.target.dataset.filter;
            document.querySelectorAll('#summaryFilterButtons .filter-btn').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');

            if (filter === 'custom') {
                document.getElementById('summaryDateRange').style.display = 'flex';
            } else {
                document.getElementById('summaryDateRange').style.display = 'none';
                updateSummary(allBorrowers, filter);
            }
        }
    });

    [document.getElementById('startDate'), document.getElementById('endDate')].forEach(input => {
        input.addEventListener('change', () => {
            updateSummary(allBorrowers, 'custom');
        });
    });
    
    addLoanForm.addEventListener('submit', async (e) => {
        toggleButtonSpinner(e.submitter, true);
        try {
            await handleAddLoanSubmit(e);
        } finally {
            toggleButtonSpinner(e.submitter, false);
        }
    });

    document.querySelectorAll('.sortable-header').forEach(header => {
        header.addEventListener('click', () => {
            const column = header.dataset.sort;
            if (sortState.column === column) {
                sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
            } else {
                sortState.column = column;
                sortState.direction = 'asc';
            }
            renderLoanTable();
        });
    });

    // Set default summary filter button
    document.querySelector('#summaryFilterButtons .filter-btn[data-filter="monthly"]').classList.add('active');
}

document.addEventListener('DOMContentLoaded', injectStyles);
