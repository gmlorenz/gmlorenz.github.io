// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAblGk1BHPF3J6w--Ii1pfDyKqcN-MFZyQ", // Replace with your actual API key if necessary
  authDomain: "time-tracker-41701.firebaseapp.com",
  projectId: "time-tracker-41701",
  storageBucket: "time-tracker-41701.firebasestorage.app",
  messagingSenderId: "401097667777",
  appId: "1:401097667777:web:d6c0c6e7741a2046945040",
  measurementId: "G-BY9CV5ZQ11"
};

// Global Firebase and UI variables
let app, db, auth;
let signInBtn, signOutBtn, userInfoDisplayDiv, userNameP, userEmailP, userPhotoImg;
let appContentDiv, loadingAuthMessageDiv, loadingOverlay;

// Application specific constants and variables
const TL_DASHBOARD_PIN = "1234";
const ALLOWED_EMAILS_DOC_REF_PATH = "settings/allowedEmails";
let allowedEmailsFromFirestore = [];

const TECH_IDS = ["4232JD", "7248AA", "4426KV", "4472JS", "7236LE", "4475JT", "7039NO", "7231NR", "7240HH", "7247JA", "7249SS", "7244AA", "7314VP"];
TECH_IDS.sort();

// Order constants for sorting and display logic
const FIX_CATEGORIES_ORDER = ["Fix1", "Fix2", "Fix3", "Fix4", "Fix5", "Fix6"];
const STATUS_ORDER = {
    Available: 1,
    InProgressDay1: 2,
    Day1Ended_AwaitingNext: 3,
    InProgressDay2: 4,
    Day2Ended_AwaitingNext: 5,
    InProgressDay3: 6,
    Completed: 7,
    Reassigned_TechAbsent: 8
};
const NUM_TABLE_COLUMNS = 15; // Update if table columns change

// UI elements for modals, forms, tables, and filters
let openAddNewProjectBtn, openTlDashboardBtn, openSettingsBtn, projectFormModal, tlDashboardModal, settingsModal;
let closeProjectFormBtn, closeTlDashboardBtn, closeSettingsBtn, newProjectForm, projectTableBody;
let tlDashboardContentElement, allowedEmailsList, addEmailInput, addEmailBtn;
let tlSummaryModal, closeTlSummaryBtn, tlSummaryContent, openTlSummaryBtn;

// State variables
let projects = [];
let groupVisibilityState = {};
let isAppInitialized = false;
let firestoreListenerUnsubscribe = null;

// Filter state variables
let batchIdSelect, fixCategoryFilter, monthFilter;
let currentSelectedBatchId = localStorage.getItem("currentSelectedBatchId") || "";
let currentSelectedFixCategory = localStorage.getItem("currentSelectedFixCategory") || ""; // Persist fix category filter
let currentSelectedMonth = localStorage.getItem("currentSelectedMonth") || "";

// NEW: Notification Bell Variables
let notificationBellArea, notificationBellIcon, notificationBadge, notificationList, notificationListItems, noNotificationsText;
let bellStatusListenerUnsubscribe = null;
const MAX_RECENT_PROJECTS_IN_BELL = 5; // Max projects to show in bell dropdown
let processedProjectReleasesForBell = new Set(); // To avoid multiple updates for the same project release in one snapshot processing cycle


// Initialize Firebase
try {
    if (typeof firebase === "undefined" || typeof firebase.initializeApp === "undefined") {
        throw new Error("Firebase SDK not loaded. Ensure Firebase scripts are correctly included.");
    }
    app = firebase.initializeApp(firebaseConfig);

    if (typeof app.firestore === "undefined") {
        throw new Error("Firestore SDK not loaded or initialized correctly with the app.");
    }
    db = firebase.firestore(); // Use compat version

    if (typeof app.auth === "undefined") {
        throw new Error("Firebase Auth SDK not loaded or initialized correctly with the app.");
    }
    auth = firebase.auth(); // Use compat version

    console.log("Firebase initialized successfully (App, Firestore, Auth) using compat libraries!");
    fetchAllowedEmails(); // Fetch allowed emails early
} catch (error) {
    console.error("CRITICAL: Error initializing Firebase: ", error.message);
    const loadingMsgDiv = document.getElementById("loading-auth-message");
    if (loadingMsgDiv) {
        loadingMsgDiv.innerHTML = `<p style="color:red; font-weight:bold;">CRITICAL ERROR: Could not connect to Firebase. App will not function correctly. Error: ${error.message}</p>`;
    } else {
        alert("CRITICAL ERROR: Could not connect to Firebase. App will not function correctly. Error: " + error.message);
    }
}

// --- Utility Functions ---
function showLoading(message = "Loading...") {
    if (loadingOverlay) {
        loadingOverlay.querySelector("p").textContent = message;
        loadingOverlay.style.display = "flex";
    }
}

function hideLoading() {
    if (loadingOverlay) {
        loadingOverlay.style.display = "none";
    }
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function formatMillisToMinutes(ms) {
    if (ms === null || typeof ms !== 'number' || ms < 0) return "N/A";
    return Math.floor(ms / 60000);
}

function calculateDurationMs(startTimestamp, finishTimestamp) {
    let startMs = startTimestamp;
    let finishMs = finishTimestamp;

    if (startTimestamp && typeof startTimestamp.toMillis === 'function') {
        startMs = startTimestamp.toMillis();
    }
    if (finishTimestamp && typeof finishTimestamp.toMillis === 'function') {
        finishMs = finishTimestamp.toMillis();
    } else if (typeof startTimestamp === 'number' && typeof finishTimestamp === 'number') {
        // Already numbers
    } else if (startTimestamp && typeof startTimestamp.toMillis === 'function' && typeof finishTimestamp === 'number') {
        // Mix, okay
    } else if (typeof startTimestamp === 'number' && finishTimestamp && typeof finishTimestamp.toMillis === 'function') {
        // Mix, okay
    } else { // Attempt to parse if they are date strings or other formats
        if (!startTimestamp || !finishTimestamp) return null;
        if (typeof startTimestamp !== 'number' && !isNaN(new Date(startTimestamp).getTime())) {
            startMs = new Date(startTimestamp).getTime();
        }
        if (typeof finishTimestamp !== 'number' && !isNaN(new Date(finishTimestamp).getTime())) {
            finishMs = new Date(finishTimestamp).getTime();
        }
    }

    if (!startMs || !finishMs || finishMs < startMs || isNaN(startMs) || isNaN(finishMs)) {
        return null;
    }
    return finishMs - startMs;
}


function loadGroupVisibilityState() {
    try {
        const storedState = localStorage.getItem("projectTrackerGroupVisibility");
        groupVisibilityState = storedState ? JSON.parse(storedState) : {};
    } catch (error) {
        console.error("Error parsing group visibility state from localStorage:", error);
        groupVisibilityState = {};
    }
}

function saveGroupVisibilityState() {
    try {
        localStorage.setItem("projectTrackerGroupVisibility", JSON.stringify(groupVisibilityState));
    } catch (error) {
        console.error("Error saving group visibility state to localStorage:", error);
        alert("Warning: Could not save your group visibility preferences.");
    }
}

// --- Firestore Interaction Functions ---
async function fetchAllowedEmails() {
    showLoading("Fetching allowed emails...");
    if (!db) {
        console.error("Firestore (db) not initialized. Cannot fetch allowed emails.");
        hideLoading();
        return;
    }
    try {
        const docRef = db.doc(ALLOWED_EMAILS_DOC_REF_PATH);
        const docSnap = await docRef.get();
        allowedEmailsFromFirestore = docSnap.exists ? (docSnap.data().emails || []) : ["znerolodarbe@gmail.com"]; // Default if not set
    } catch (error) {
        console.error("Error fetching allowed emails:", error);
        allowedEmailsFromFirestore = ["znerolodarbe@gmail.com"]; // Fallback on error
    } finally {
        hideLoading();
    }
}

async function updateAllowedEmailsInFirestore(emails) {
    showLoading("Updating allowed emails...");
    if (!db) {
        alert("Database not initialized! Cannot update allowed emails.");
        hideLoading();
        return false;
    }
    const docRef = db.doc(ALLOWED_EMAILS_DOC_REF_PATH);
    try {
        await docRef.set({ emails: emails });
        allowedEmailsFromFirestore = emails; // Update local cache
        return true;
    } catch (error) {
        console.error("Error updating allowed emails in Firestore:", error);
        alert("Error saving allowed emails. Error: " + error.message);
        return false;
    } finally {
        hideLoading();
    }
}

async function initializeFirebaseAndLoadData() {
    showLoading("Loading projects...");
    if (!db) {
        console.error("Firestore (db) not initialized. Cannot load project data.");
        projects = [];
        refreshAllViews();
        hideLoading();
        return;
    }

    if (firestoreListenerUnsubscribe) {
        firestoreListenerUnsubscribe(); // Unsubscribe from previous listener
        firestoreListenerUnsubscribe = null;
    }

    loadGroupVisibilityState();

    // 1. Populate Month Filter (based on all projects, regardless of current month filter)
    const allProjectsForMonthFilterQuery = db.collection("projects").orderBy("creationTimestamp", "desc");
    try {
        const allProjectsSnapshot = await allProjectsForMonthFilterQuery.get();
        const availableMonths = new Set();
        allProjectsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.creationTimestamp && data.creationTimestamp.toDate) {
                const date = data.creationTimestamp.toDate();
                const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                availableMonths.add(monthYear);
            }
        });

        monthFilter.innerHTML = '<option value="">All Months</option>'; // Reset
        Array.from(availableMonths).sort((a, b) => b.localeCompare(a)).forEach(monthYear => { // Sort descending
            const [year, monthNum] = monthYear.split('-');
            const date = new Date(year, parseInt(monthNum) - 1, 1);
            const option = document.createElement('option');
            option.value = monthYear;
            option.textContent = date.toLocaleString('en-US', { year: 'numeric', month: 'long' });
            monthFilter.appendChild(option);
        });

        if (currentSelectedMonth && availableMonths.has(currentSelectedMonth)) {
            monthFilter.value = currentSelectedMonth;
        } else {
            currentSelectedMonth = ""; // Reset if saved month is no longer valid
            monthFilter.value = "";
            localStorage.setItem("currentSelectedMonth", "");
        }
    } catch (error) {
        console.error("Error populating month filter:", error);
    }


    // 2. Populate Batch ID Filter (based on selected month, or all if no month selected)
    let projectsForBatchFilterQuery = db.collection("projects");
    if (currentSelectedMonth) {
        const [year, monthNum] = currentSelectedMonth.split('-');
        const startDate = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
        const endDate = new Date(parseInt(year), parseInt(monthNum), 0, 23, 59, 59, 999);
        projectsForBatchFilterQuery = projectsForBatchFilterQuery
            .where("creationTimestamp", ">=", startDate)
            .where("creationTimestamp", "<=", endDate);
    }
    projectsForBatchFilterQuery = projectsForBatchFilterQuery.orderBy("creationTimestamp", "desc");


    try {
        const batchProjectsSnapshot = await projectsForBatchFilterQuery.get();
        const availableBatchIds = new Map(); // Store batchId -> { baseProjectName, latestTimestamp }
        batchProjectsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.batchId) {
                const currentTimestamp = data.creationTimestamp ? data.creationTimestamp.toMillis() : 0;
                if (!availableBatchIds.has(data.batchId) || currentTimestamp > (availableBatchIds.get(data.batchId).latestTimestamp || 0) ) {
                     availableBatchIds.set(data.batchId, {
                        baseProjectName: data.baseProjectName || "Unknown Project",
                        latestTimestamp: currentTimestamp
                    });
                }
            }
        });
        
        batchIdSelect.innerHTML = '<option value="">All Batches</option>'; // Reset
        if (availableBatchIds.size === 0 && currentSelectedMonth) { // Only show "No batches" if a month is selected
             const option = document.createElement('option');
             option.value = "";
             option.textContent = "No batches in this month";
             option.disabled = true;
             batchIdSelect.appendChild(option);
        } else {
            // Sort batches by their latest creation timestamp (descending)
            const sortedBatches = Array.from(availableBatchIds.entries())
                .sort(([, a], [, b]) => (b.latestTimestamp || 0) - (a.latestTimestamp || 0));

            sortedBatches.forEach(([batchId, batchData]) => {
                const option = document.createElement('option');
                option.value = batchId;
                option.textContent = `${batchData.baseProjectName}`;
                batchIdSelect.appendChild(option);
            });
        }


        if (currentSelectedBatchId && availableBatchIds.has(currentSelectedBatchId)) {
            batchIdSelect.value = currentSelectedBatchId;
        } else if (availableBatchIds.size > 0 && !currentSelectedMonth) { // Default to first if no month and no specific batch
             // currentSelectedBatchId = Array.from(availableBatchIds.keys())[0]; // This might not be the one with latest timestamp
             // batchIdSelect.value = currentSelectedBatchId;
             // localStorage.setItem("currentSelectedBatchId", currentSelectedBatchId);
             currentSelectedBatchId = ""; // Default to "All Batches" if no specific selection
             batchIdSelect.value = "";
             localStorage.setItem("currentSelectedBatchId", "");
        } else {
            currentSelectedBatchId = "";
            batchIdSelect.value = "";
            localStorage.setItem("currentSelectedBatchId", "");
        }

    } catch (error) {
        console.error("Error populating batch ID filter:", error);
        batchIdSelect.innerHTML = '<option value="">Error loading batches</option>';
    }
    
    // 3. Setup the main projects listener with all filters
    let query = db.collection("projects");

    if (currentSelectedMonth) {
        const [year, monthNum] = currentSelectedMonth.split('-');
        const startDate = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
        const endDate = new Date(parseInt(year), parseInt(monthNum), 0, 23, 59, 59, 999);
        query = query.where("creationTimestamp", ">=", startDate).where("creationTimestamp", "<=", endDate);
    }

    if (currentSelectedBatchId) {
        query = query.where("batchId", "==", currentSelectedBatchId);
    }
    if (currentSelectedFixCategory) {
        query = query.where("fixCategory", "==", currentSelectedFixCategory);
    }

    // Add default sorting. Firestore requires the first orderBy to match the inequality if one exists.
    // If filtering by month (creationTimestamp inequality), it must be the first orderBy.
    if (currentSelectedMonth) {
        query = query.orderBy("creationTimestamp", "desc").orderBy("fixCategory").orderBy("areaTask");
    } else {
         query = query.orderBy("creationTimestamp", "desc").orderBy("fixCategory").orderBy("areaTask"); // Default sort
    }


    try {
        firestoreListenerUnsubscribe = query.onSnapshot(querySnapshot => {
            let currentProjectsData = [];
            querySnapshot.forEach(doc => {
                if (doc.exists && typeof doc.data === "function") {
                    currentProjectsData.push({
                        id: doc.id,
                        ...doc.data()
                    });
                }
            });

            // --- BEGIN NEW BELL NOTIFICATION LOGIC within project listener ---
            if (auth && auth.currentUser) {
                let newlyAvailableFix2to6ProjectNames = new Set();

                currentProjectsData.forEach(proj => {
                    const isFix2to6 = ["Fix2", "Fix3", "Fix4", "Fix5", "Fix6"].includes(proj.fixCategory);
                    const isAvailable = proj.status === "Available";

                    if (isFix2to6 && isAvailable) {
                        // A more robust check for "newly available" would compare against the 'projects'
                        // array *before* it's updated by currentProjectsData.
                        // For simplicity, we check if this project ID was not in the previous 'projects' list
                        // or if its status/category has changed to meet the criteria.
                        const previousVersion = projects.find(p => p.id === proj.id);
                        if (!previousVersion || // It's a brand new task
                            (previousVersion.status !== "Available" && isAvailable) || // Status changed to available
                            (!["Fix2", "Fix3", "Fix4", "Fix5", "Fix6"].includes(previousVersion.fixCategory) && isFix2to6) // Category changed into Fix2-6
                           ) {
                            if (proj.baseProjectName) {
                                newlyAvailableFix2to6ProjectNames.add(proj.baseProjectName);
                            }
                        }
                    }
                });
                
                if (newlyAvailableFix2to6ProjectNames.size > 0) {
                    newlyAvailableFix2to6ProjectNames.forEach(projectName => {
                        if (!processedProjectReleasesForBell.has(projectName)) {
                            triggerBellNotificationUpdate(projectName);
                            processedProjectReleasesForBell.add(projectName);
                        }
                    });
                    // Clear the set after a short delay to allow for multiple snapshot events for the same logical release
                    setTimeout(() => processedProjectReleasesForBell.clear(), 2000); 
                }
            }
            // --- END NEW BELL NOTIFICATION LOGIC ---

            projects = currentProjectsData; // Assign the fetched projects
            projects.forEach(proj => {
                const groupKey = `${proj.batchId}_${proj.fixCategory}`;
                if (typeof groupVisibilityState[groupKey] === "undefined") {
                    groupVisibilityState[groupKey] = { isExpanded: true };
                }
                // Ensure default values for newer fields if they are missing
                if (typeof proj.breakDurationMinutes === "undefined") proj.breakDurationMinutes = 0;
                if (typeof proj.additionalMinutesManual === "undefined") proj.additionalMinutesManual = 0;
                if (typeof proj.startTimeDay3 === "undefined") proj.startTimeDay3 = null;
                if (typeof proj.finishTimeDay3 === "undefined") proj.finishTimeDay3 = null;
                if (typeof proj.durationDay3Ms === "undefined") proj.durationDay3Ms = null;
            });
            refreshAllViews();
            hideLoading();
        }, err => {
            console.error("Error fetching projects: ", err);
            projects = [];
            refreshAllViews();
            alert("Error loading projects: " + err.message);
            hideLoading();
        });
    } catch (error) {
        console.error("Error setting up Firebase listener: ", error);
        alert("CRITICAL ERROR: Could not set up real-time project updates. Error: " + error.message);
        hideLoading();
    }
}


// --- DOM Setup and Event Listeners ---
function setupDOMReferences() {
    // Auth elements
    signInBtn = document.getElementById("signInBtn");
    signOutBtn = document.getElementById("signOutBtn");
    userInfoDisplayDiv = document.getElementById("user-info-display");
    userNameP = document.getElementById("userName");
    userEmailP = document.getElementById("userEmail");
    userPhotoImg = document.getElementById("userPhoto");
    appContentDiv = document.getElementById("app-content");
    loadingAuthMessageDiv = document.getElementById("loading-auth-message");
    loadingOverlay = document.getElementById("loadingOverlay");

    // Action bar buttons
    openAddNewProjectBtn = document.getElementById("openAddNewProjectBtn");
    openTlDashboardBtn = document.getElementById("openTlDashboardBtn");
    openSettingsBtn = document.getElementById("openSettingsBtn");
    openTlSummaryBtn = document.getElementById("openTlSummaryBtn");

    // Modals
    projectFormModal = document.getElementById("projectFormModal");
    tlDashboardModal = document.getElementById("tlDashboardModal");
    settingsModal = document.getElementById("settingsModal");
    tlSummaryModal = document.getElementById("tlSummaryModal");

    // Modal close buttons
    closeProjectFormBtn = document.getElementById("closeProjectFormBtn");
    closeTlDashboardBtn = document.getElementById("closeTlDashboardBtn");
    closeSettingsBtn = document.getElementById("closeSettingsBtn");
    closeTlSummaryBtn = document.getElementById("closeTlSummaryBtn");

    // Forms and content areas
    newProjectForm = document.getElementById("newProjectForm");
    projectTableBody = document.getElementById("projectTableBody");
    tlDashboardContentElement = document.getElementById("tlDashboardContent");
    allowedEmailsList = document.getElementById("allowedEmailsList");
    addEmailInput = document.getElementById("addEmailInput");
    addEmailBtn = document.getElementById("addEmailBtn");
    tlSummaryContent = document.getElementById("tlSummaryContent");

    // Filters
    batchIdSelect = document.getElementById("batchIdSelect");
    fixCategoryFilter = document.getElementById("fixCategoryFilter");
    monthFilter = document.getElementById("monthFilter");

    // NEW: Notification Bell DOM References
    notificationBellArea = document.getElementById("notificationBellArea");
    notificationBellIcon = document.getElementById("notificationBellIcon");
    notificationBadge = document.getElementById("notificationBadge");
    notificationList = document.getElementById("notificationList");
    notificationListItems = document.getElementById("notificationListItems");
    noNotificationsText = document.getElementById("noNotificationsText");
}

function attachEventListeners() {
    // Modal open buttons
    if (openAddNewProjectBtn) openAddNewProjectBtn.onclick = () => {
        const pin = prompt("Enter PIN to add new tracker:");
        if (pin === TL_DASHBOARD_PIN) projectFormModal.style.display = "block";
        else if (pin !== null) alert("Incorrect PIN.");
    };
    if (openTlDashboardBtn) openTlDashboardBtn.onclick = () => {
        const pin = prompt("Enter PIN to access Project Settings:");
        if (pin === TL_DASHBOARD_PIN) {
            tlDashboardModal.style.display = "block";
            renderTLDashboard();
        } else if (pin !== null) alert("Incorrect PIN.");
    };
    if (openSettingsBtn) openSettingsBtn.onclick = () => {
         const pin = prompt("Enter PIN to access User Settings:");
         if (pin === TL_DASHBOARD_PIN) {
            settingsModal.style.display = "block";
            renderAllowedEmailsList();
        } else if (pin !== null) alert("Incorrect PIN.");
    };
    if (openTlSummaryBtn) openTlSummaryBtn.onclick = () => {
        tlSummaryModal.style.display = "block";
        generateTlSummaryData();
    };

    // Modal close buttons
    if (closeProjectFormBtn) closeProjectFormBtn.onclick = () => { newProjectForm.reset(); projectFormModal.style.display = "none"; };
    if (closeTlDashboardBtn) closeTlDashboardBtn.onclick = () => tlDashboardModal.style.display = "none";
    if (closeSettingsBtn) closeSettingsBtn.onclick = () => settingsModal.style.display = "none";
    if (closeTlSummaryBtn) closeTlSummaryBtn.onclick = () => tlSummaryModal.style.display = "none";

    // Settings modal
    if (addEmailBtn) addEmailBtn.onclick = handleAddEmail;

    // Filters
    if (batchIdSelect) batchIdSelect.onchange = (e) => {
        currentSelectedBatchId = e.target.value;
        localStorage.setItem("currentSelectedBatchId", currentSelectedBatchId);
        initializeFirebaseAndLoadData(); // Reload data based on new batch
    };
    if (fixCategoryFilter) fixCategoryFilter.onchange = (e) => {
        currentSelectedFixCategory = e.target.value;
        localStorage.setItem("currentSelectedFixCategory", currentSelectedFixCategory);
        initializeFirebaseAndLoadData(); // Reload data
    };
    if (monthFilter) monthFilter.onchange = (e) => {
        currentSelectedMonth = e.target.value;
        localStorage.setItem("currentSelectedMonth", currentSelectedMonth);
        // When month changes, reset batch ID to "All Batches" for that month
        currentSelectedBatchId = ""; 
        localStorage.setItem("currentSelectedBatchId", "");
        initializeFirebaseAndLoadData(); // Reload data
    };
    
    // Close modals on outside click
    if (typeof window !== "undefined") {
        window.onclick = (event) => {
            if (event.target == projectFormModal) { newProjectForm.reset(); projectFormModal.style.display = "none"; }
            if (event.target == tlDashboardModal) tlDashboardModal.style.display = "none";
            if (event.target == settingsModal) settingsModal.style.display = "none";
            if (event.target == tlSummaryModal) tlSummaryModal.style.display = "none";
            // Close notification list if click is outside of it and not on the bell area
            if (notificationList && notificationBellArea &&
                notificationList.style.display === "block" &&
                !notificationBellArea.contains(event.target) &&
                !notificationList.contains(event.target)) {
                notificationList.style.display = "none";
            }
        };
    }

    // Form submission
    if (newProjectForm) newProjectForm.addEventListener("submit", handleAddProjectSubmit);

    // NEW: Notification Bell Event Listener
    if (notificationBellArea) {
        notificationBellArea.addEventListener("click", handleBellClick);
    }

    setupAuthEventListeners(); // Auth listeners
}

// --- Notification Bell Functions ---
async function handleBellClick() {
    if (!auth || !auth.currentUser || !db || !notificationList || !notificationBadge) return;

    const isListVisible = notificationList.style.display === "block";
    notificationList.style.display = isListVisible ? "none" : "block";

    // If opening the list and there were unread notifications, mark them as read
    if (!isListVisible && notificationBadge.style.display !== "none" && parseInt(notificationBadge.textContent) > 0) {
        try {
            const bellStatusRef = db.doc(`user_notifications/${auth.currentUser.uid}/bell_status`);
            // Set unreadCount to 0, but keep recentProjects
            await bellStatusRef.set({ unreadCount: 0 }, { merge: true }); 
            console.log("Notifications marked as read by resetting count.");
            // The onSnapshot listener for bell_status will handle UI updates (hide badge)
        } catch (error) {
            console.error("Error marking notifications as read:", error);
        }
    }
}

function listenForBellNotifications() {
    if (!auth || !auth.currentUser || !db) {
        console.warn("Cannot listen for bell notifications: Auth or DB not ready.");
        if (notificationBadge) notificationBadge.style.display = "none";
        return;
    }
    if (bellStatusListenerUnsubscribe) {
        bellStatusListenerUnsubscribe();
        bellStatusListenerUnsubscribe = null;
    }

    const bellStatusRef = db.doc(`user_notifications/${auth.currentUser.uid}/bell_status`);

    bellStatusListenerUnsubscribe = bellStatusRef.onSnapshot(doc => {
        if (!notificationBadge || !notificationListItems || !noNotificationsText) return; // Ensure UI elements exist

        if (doc.exists) {
            const data = doc.data();
            const unreadCount = data.unreadCount || 0;
            const recentProjects = data.recentProjects || [];

            if (unreadCount > 0) {
                notificationBadge.textContent = unreadCount;
                notificationBadge.style.display = "inline-block";
            } else {
                notificationBadge.style.display = "none";
            }

            notificationListItems.innerHTML = ""; // Clear previous items
            if (recentProjects.length > 0) {
                recentProjects.forEach(projectName => {
                    const li = document.createElement("li");
                    li.textContent = `${projectName} is ready for Fix now`;
                    notificationListItems.appendChild(li);
                });
                noNotificationsText.style.display = "none";
            } else {
                noNotificationsText.style.display = "block";
            }
        } else {
            // No bell_status document yet, so no unread notifications
            notificationBadge.style.display = "none";
            notificationListItems.innerHTML = "";
            noNotificationsText.style.display = "block";
        }
    }, error => {
        console.error("Error listening to bell status:", error);
        if (notificationBadge) notificationBadge.style.display = "none";
    });
}

async function triggerBellNotificationUpdate(projectName) {
    if (!auth || !auth.currentUser || !db || !projectName) return;

    const uid = auth.currentUser.uid;
    const bellStatusRef = db.doc(`user_notifications/${uid}/bell_status`);

    try {
        await db.runTransaction(async (transaction) => {
            const bellDoc = await transaction.get(bellStatusRef);
            let currentUnread = 0;
            let currentRecent = [];

            if (bellDoc.exists) {
                currentUnread = bellDoc.data().unreadCount || 0;
                currentRecent = bellDoc.data().recentProjects || [];
            }

            let newUnreadCount = currentUnread;
            let projectAlreadyInRecent = currentRecent.includes(projectName);

            // Only increment unread count if this project isn't already the most recent one
            // OR if the list was empty/all read.
            if (!projectAlreadyInRecent || currentRecent.length === 0 || currentRecent[0] !== projectName || currentUnread === 0) {
                 if (!projectAlreadyInRecent) { // Only increment if it's a truly new project for the list
                    newUnreadCount++;
                 } else if (currentRecent[0] !== projectName) { // It's in the list but not at front, effectively new news
                    newUnreadCount++;
                 } else if (currentUnread === 0 && currentRecent.length > 0 && currentRecent[0] === projectName) {
                     // List was read, now this same project is "new" again
                     newUnreadCount = 1;
                 } else if (currentUnread === 0 && currentRecent.length === 0) {
                     newUnreadCount = 1; // First notification
                 }
            }
            
            // Remove project if it exists to move it to the front
            const index = currentRecent.indexOf(projectName);
            if (index > -1) {
                currentRecent.splice(index, 1);
            }
            currentRecent.unshift(projectName); // Add to the beginning

            if (currentRecent.length > MAX_RECENT_PROJECTS_IN_BELL) {
                currentRecent.length = MAX_RECENT_PROJECTS_IN_BELL;
            }
            
            transaction.set(bellStatusRef, {
                unreadCount: newUnreadCount,
                recentProjects: currentRecent,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        });
        console.log(`Bell notification triggered/updated for project: ${projectName}`);
    } catch (error) {
        console.error("Error triggering bell notification update for " + projectName + ": ", error);
    }
}


// --- Core Application Logic Functions ---
async function handleAddProjectSubmit(event) {
    event.preventDefault();
    showLoading("Adding project(s)...");
    if (!db) {
        alert("Database not initialized!");
        hideLoading();
        return;
    }

    const fixCategory = document.getElementById("fixCategorySelect").value;
    const numRows = parseInt(document.getElementById("numRows").value, 10);
    const baseProjectName = document.getElementById("baseProjectName").value.trim();
    const gsd = document.getElementById("gsd").value;

    if (!baseProjectName || isNaN(numRows) || numRows < 1) {
        alert("Invalid input. Please ensure Project Name is not empty and Number of Tasks is at least 1.");
        hideLoading();
        return;
    }

    const batchId = "batch_" + generateId();
    const creationTimestamp = firebase.firestore.FieldValue.serverTimestamp(); // Firestore server timestamp
    const batch = db.batch();

    try {
        for (let i = 1; i <= numRows; i++) {
            const projectData = {
                batchId: batchId,
                creationTimestamp: creationTimestamp,
                fixCategory: fixCategory,
                baseProjectName: baseProjectName,
                areaTask: `Area${String(i).padStart(2, '0')}`,
                gsd: gsd,
                assignedTo: "",
                techNotes: "",
                status: "Available", // New projects start as "Available"
                startTimeDay1: null, finishTimeDay1: null, durationDay1Ms: null,
                startTimeDay2: null, finishTimeDay2: null, durationDay2Ms: null,
                startTimeDay3: null, finishTimeDay3: null, durationDay3Ms: null, // Day 3 fields
                releasedToNextStage: false,
                lastModifiedTimestamp: creationTimestamp,
                isReassigned: false,
                originalProjectId: null,
                breakDurationMinutes: 0,
                additionalMinutesManual: 0
            };
            batch.set(db.collection("projects").doc(), projectData);
        }
        await batch.commit();
        newProjectForm.reset();
        // Set current filters to show the newly added batch
        currentSelectedBatchId = batchId;
        localStorage.setItem("currentSelectedBatchId", currentSelectedBatchId);
        currentSelectedMonth = ""; // Reset month filter to ensure new batch is visible
        localStorage.setItem("currentSelectedMonth", "");
        currentSelectedFixCategory = ""; // Reset fix category
        localStorage.setItem("currentSelectedFixCategory", "");

        projectFormModal.style.display = "none"; // Close modal
        initializeFirebaseAndLoadData(); // This will re-render and show the new batch
    } catch (error) {
        console.error("Error adding projects: ", error);
        alert("Error adding projects: " + error.message);
    } finally {
        hideLoading();
    }
}

async function getManageableBatches() {
    if (!db) {
        console.error("DB not initialized for getManageableBatches.");
        return [];
    }
    showLoading("Loading batches for dashboard...");
    try {
        const projectsSnapshot = await db.collection("projects").get();
        const batches = {};
        projectsSnapshot.forEach(doc => {
            const project = doc.data();
            if (project && project.batchId) {
                if (!batches[project.batchId]) {
                    batches[project.batchId] = {
                        batchId: project.batchId,
                        baseProjectName: project.baseProjectName || "N/A",
                        tasksByFix: {},
                        creationTimestamp: project.creationTimestamp // Store for sorting
                    };
                }
                if (project.fixCategory) {
                    if (!batches[project.batchId].tasksByFix[project.fixCategory]) {
                        batches[project.batchId].tasksByFix[project.fixCategory] = [];
                    }
                    batches[project.batchId].tasksByFix[project.fixCategory].push(project);
                }
                // Update creationTimestamp if this project is newer (for sorting batches)
                if (project.creationTimestamp && (!batches[project.batchId].creationTimestamp || project.creationTimestamp.toMillis() > batches[project.batchId].creationTimestamp.toMillis())) {
                    batches[project.batchId].creationTimestamp = project.creationTimestamp;
                }
            }
        });
        // Sort batches by creationTimestamp descending
        return Object.values(batches).sort((a, b) => {
            const tsA = a.creationTimestamp ? a.creationTimestamp.toMillis() : 0;
            const tsB = b.creationTimestamp ? b.creationTimestamp.toMillis() : 0;
            return tsB - tsA;
        });
    } catch (error) {
        console.error("Error fetching batches for dashboard:", error);
        alert("Error fetching batches for dashboard: " + error.message);
        return [];
    } finally {
        hideLoading();
    }
}

async function renderTLDashboard() {
    if (!tlDashboardContentElement) {
        console.error("tlDashboardContentElement not found.");
        return;
    }
    tlDashboardContentElement.innerHTML = ""; // Clear previous content
    const manageableBatches = await getManageableBatches();

    if (manageableBatches.length === 0) {
        tlDashboardContentElement.innerHTML = "<p>No project batches found.</p>";
        return;
    }

    manageableBatches.forEach(batch => {
        if (!batch || !batch.batchId) return;

        const batchItemDiv = document.createElement("div");
        batchItemDiv.classList.add("dashboard-batch-item");

        const titleH4 = document.createElement("h4");
        titleH4.textContent = `Batch: ${batch.baseProjectName || "Unknown"} (ID: ${batch.batchId.split("_")[1] || "N/A"})`;
        batchItemDiv.appendChild(titleH4);

        const stagesP = document.createElement("p");
        const presentFixCategories = batch.tasksByFix ? Object.keys(batch.tasksByFix).sort((a, b) => FIX_CATEGORIES_ORDER.indexOf(a) - FIX_CATEGORIES_ORDER.indexOf(b)) : [];
        stagesP.innerHTML = `<strong>Stages Present:</strong> ${presentFixCategories.join(", ") || "None"}`;
        batchItemDiv.appendChild(stagesP);

        // Release Actions
        const releaseActionsDiv = document.createElement("div");
        releaseActionsDiv.classList.add("dashboard-batch-actions-release");

        let currentHighestActiveFix = "";
        let allTasksInHighestFixReleased = false;
        let allTasksInHighestFixCompletable = true; // Assume completable until proven otherwise

        // Find the highest fix category that has tasks not yet fully released
        FIX_CATEGORIES_ORDER.slice().reverse().forEach(fixCat => {
            if (batch.tasksByFix[fixCat] && batch.tasksByFix[fixCat].length > 0 && !currentHighestActiveFix) {
                 const activeTasksInFix = batch.tasksByFix[fixCat].filter(p => p.status !== "Reassigned_TechAbsent");
                 if (activeTasksInFix.length > 0) {
                    currentHighestActiveFix = fixCat;
                    allTasksInHighestFixReleased = activeTasksInFix.every(p => p.releasedToNextStage);
                    allTasksInHighestFixCompletable = activeTasksInFix.every(p =>
                        p.status === "Completed" || p.status === "Day1Ended_AwaitingNext" || p.status === "Day2Ended_AwaitingNext"
                    );
                 }
            }
        });
        
        if (currentHighestActiveFix && !allTasksInHighestFixReleased) {
            const currentFixIndex = FIX_CATEGORIES_ORDER.indexOf(currentHighestActiveFix);
            if (currentFixIndex < FIX_CATEGORIES_ORDER.length - 1) { // If not the last fix category
                const nextFixCategory = FIX_CATEGORIES_ORDER[currentFixIndex + 1];
                const releaseBtn = document.createElement("button");
                releaseBtn.textContent = `Release to ${nextFixCategory}`;
                releaseBtn.classList.add("btn", "btn-release");
                if (!allTasksInHighestFixCompletable) {
                    releaseBtn.disabled = true;
                    releaseBtn.title = `Not all active tasks in ${currentHighestActiveFix} are 'Completed' or 'Day 1/2 Ended'.`;
                }
                releaseBtn.onclick = () => {
                    if (confirm(`Are you sure you want to release all completable tasks from ${currentHighestActiveFix} to ${nextFixCategory} for batch '${batch.baseProjectName || "Unknown"}'?`)) {
                         releaseBatchToNextFix(batch.batchId, currentHighestActiveFix, nextFixCategory);
                    }
                }
                releaseActionsDiv.appendChild(releaseBtn);
            }
        } else if (allTasksInHighestFixReleased && currentHighestActiveFix && FIX_CATEGORIES_ORDER.indexOf(currentHighestActiveFix) < FIX_CATEGORIES_ORDER.length - 1) {
            const releasedMsgP = document.createElement("p");
            releasedMsgP.innerHTML = `<small><em>(All active tasks released from ${currentHighestActiveFix})</em></small>`;
            releaseActionsDiv.appendChild(releasedMsgP);
        }
        batchItemDiv.appendChild(releaseActionsDiv);


        // Delete Actions
        const deleteActionsDiv = document.createElement("div");
        deleteActionsDiv.classList.add("dashboard-batch-actions-delete");
        presentFixCategories.forEach(fixCat => {
            const deleteFixBtn = document.createElement("button");
            deleteFixBtn.textContent = `Delete ${fixCat} Tasks`;
            deleteFixBtn.classList.add("btn", "btn-danger");
            deleteFixBtn.onclick = () => {
                if (confirm(`Are you sure you want to delete all ${fixCat} tasks for batch '${batch.baseProjectName || "Unknown"}'? This is IRREVERSIBLE.`)) {
                    deleteSpecificFixTasksForBatch(batch.batchId, fixCat);
                }
            };
            deleteActionsDiv.appendChild(deleteFixBtn);
        });

        const deleteAllBtn = document.createElement("button");
        deleteAllBtn.textContent = "Delete ALL Tasks for this Batch";
        deleteAllBtn.classList.add("btn", "btn-danger");
        deleteAllBtn.style.marginTop = "5px"; // Add some space
        deleteAllBtn.onclick = () => {
            if (confirm(`Are you ABSOLUTELY sure you want to delete ALL tasks for batch '${batch.baseProjectName || "Unknown"}'? This is IRREVERSIBLE and will remove everything associated with this batch ID.`)) {
                deleteProjectBatch(batch.batchId);
            }
        };
        deleteActionsDiv.appendChild(deleteAllBtn);
        batchItemDiv.appendChild(deleteActionsDiv);

        tlDashboardContentElement.appendChild(batchItemDiv);
    });
}

async function releaseBatchToNextFix(batchId, currentFixCategory, nextFixCategory) {
    showLoading(`Releasing ${currentFixCategory} tasks to ${nextFixCategory}...`);
    if (!db) {
        alert("Database not initialized!");
        hideLoading();
        return;
    }

    try {
        const projectsToReleaseQuery = db.collection("projects")
            .where("batchId", "==", batchId)
            .where("fixCategory", "==", currentFixCategory)
            .where("releasedToNextStage", "==", false); // Only get tasks not yet released

        const snapshot = await projectsToReleaseQuery.get();
        if (snapshot.empty) {
            alert("No active tasks to release in the current stage for this batch.");
            hideLoading();
            renderTLDashboard(); // Refresh dashboard
            return;
        }

        const tasksToProcess = [];
        snapshot.forEach(doc => {
            const task = doc.data();
            // Only consider tasks that are completable or already completed for release
            if (task.status !== "Reassigned_TechAbsent" && 
                (task.status === "Completed" || task.status === "Day1Ended_AwaitingNext" || task.status === "Day2Ended_AwaitingNext")) {
                tasksToProcess.push({ id: doc.id, ...task });
            }
        });

        if (tasksToProcess.length === 0) {
            alert(`No tasks in ${currentFixCategory} are in a releasable state (Completed, Day 1 Ended, or Day 2 Ended) or they are reassigned.`);
            hideLoading();
            renderTLDashboard();
            return;
        }

        const firestoreBatch = db.batch();
        const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();

        for (const oldTask of tasksToProcess) {
            // Check if a task for this area already exists in the next fix category
            const existingNextFixTaskQuery = db.collection("projects")
                .where("batchId", "==", oldTask.batchId)
                .where("areaTask", "==", oldTask.areaTask)
                .where("fixCategory", "==", nextFixCategory);
            
            const existingNextFixSnapshot = await existingNextFixTaskQuery.get();

            if (existingNextFixSnapshot.empty) { // Only create if it doesn't exist
                const newProjectData = {
                    batchId: oldTask.batchId,
                    creationTimestamp: oldTask.creationTimestamp, // Keep original batch creation time
                    fixCategory: nextFixCategory,
                    baseProjectName: oldTask.baseProjectName,
                    areaTask: oldTask.areaTask,
                    gsd: oldTask.gsd,
                    assignedTo: oldTask.assignedTo, // Carry over assignee
                    techNotes: "", // Reset tech notes for new stage
                    status: "Available",
                    startTimeDay1: null, finishTimeDay1: null, durationDay1Ms: null,
                    startTimeDay2: null, finishTimeDay2: null, durationDay2Ms: null,
                    startTimeDay3: null, finishTimeDay3: null, durationDay3Ms: null,
                    releasedToNextStage: false,
                    lastModifiedTimestamp: serverTimestamp,
                    isReassigned: false, // New task is not a reassignment itself
                    originalProjectId: oldTask.id, // Link to the task it came from
                    breakDurationMinutes: 0, // Reset break for new stage
                    additionalMinutesManual: 0 // Reset additional minutes
                };
                firestoreBatch.set(db.collection("projects").doc(), newProjectData);
            } else {
                console.log(`Task for ${oldTask.areaTask} in ${nextFixCategory} already exists. Skipping creation.`);
                // Optionally, update the existing task if needed, e.g., reset its status to "Available" if it was something else.
                // For now, we just skip creating a duplicate.
            }

            // Mark the old task as released
            firestoreBatch.update(db.collection("projects").doc(oldTask.id), {
                releasedToNextStage: true,
                lastModifiedTimestamp: serverTimestamp
            });
        }

        await firestoreBatch.commit();
        alert(`${tasksToProcess.length} task(s) from ${currentFixCategory} processed for release to ${nextFixCategory}.`);
        initializeFirebaseAndLoadData(); // Refresh main view
        renderTLDashboard(); // Refresh dashboard
    } catch (error) {
        console.error("Error releasing batch:", error);
        alert("Error releasing batch: " + error.message);
    } finally {
        hideLoading();
    }
}

async function deleteProjectBatch(batchId) {
    showLoading("Deleting batch...");
    if (!db || !batchId) {
        alert("Invalid request to delete batch.");
        hideLoading();
        return;
    }
    try {
        const projectsToDeleteQuery = db.collection("projects").where("batchId", "==", batchId);
        const snapshot = await projectsToDeleteQuery.get();

        if (snapshot.empty) {
            console.log("No tasks found for batch ID to delete:", batchId);
            hideLoading();
            renderTLDashboard();
            return;
        }

        const firestoreBatch = db.batch();
        snapshot.forEach(doc => firestoreBatch.delete(doc.ref));
        await firestoreBatch.commit();

        alert(`Batch ${batchId} and all its tasks have been deleted.`);
        if (currentSelectedBatchId === batchId) {
            currentSelectedBatchId = ""; // Reset filter if the deleted batch was selected
            localStorage.setItem("currentSelectedBatchId", "");
        }
        initializeFirebaseAndLoadData(); // Refresh main view
        renderTLDashboard(); // Refresh dashboard
    } catch (error) {
        console.error(`Error deleting batch ${batchId}:`, error);
        alert("Error deleting batch: " + error.message);
    } finally {
        hideLoading();
    }
}

async function deleteSpecificFixTasksForBatch(batchId, fixCategory) {
    showLoading(`Deleting ${fixCategory} tasks...`);
    if (!db || !batchId || !fixCategory) {
        alert("Invalid request to delete specific fix tasks.");
        hideLoading();
        return;
    }
    try {
        const tasksToDeleteQuery = db.collection("projects")
            .where("batchId", "==", batchId)
            .where("fixCategory", "==", fixCategory);
        const snapshot = await tasksToDeleteQuery.get();

        if (snapshot.empty) {
            console.log(`No ${fixCategory} tasks found for batch ID ${batchId} to delete.`);
            hideLoading();
            renderTLDashboard();
            return;
        }

        const firestoreBatch = db.batch();
        snapshot.forEach(doc => firestoreBatch.delete(doc.ref));
        await firestoreBatch.commit();

        alert(`All ${fixCategory} tasks for batch ${batchId} have been deleted.`);
        initializeFirebaseAndLoadData(); // Refresh main view
        renderTLDashboard(); // Refresh dashboard
    } catch (error) {
        console.error(`Error deleting ${fixCategory} for batch ${batchId}:`, error);
        alert("Error deleting specific fix tasks: " + error.message);
    } finally {
        hideLoading();
    }
}


// --- UI Rendering Functions ---
function renderProjects() {
    if (!projectTableBody) {
        console.error("CRITICAL: projectTableBody not found. Cannot render projects.");
        return;
    }
    projectTableBody.innerHTML = ""; // Clear existing rows

    const sortedProjects = [...projects]; // Use the globally filtered 'projects' array
    // Sorting is now primarily handled by Firestore query, but client-side can refine if needed
    // For example, if Firestore couldn't sort by all desired fields due to composite index limits.
    // Here, we assume Firestore handles the main sorting.

    let currentBatchIdHeader = null;
    let currentFixCategoryHeader = null;

    sortedProjects.forEach(project => {
        if (!project || !project.id || !project.batchId || !project.fixCategory) {
            console.warn("Skipping rendering of invalid project object:", project);
            return;
        }

        // Batch Header Row
        if (project.batchId !== currentBatchIdHeader) {
            currentBatchIdHeader = project.batchId;
            currentFixCategoryHeader = null; // Reset fix category header when batch changes
            const batchHeaderRow = projectTableBody.insertRow();
            batchHeaderRow.classList.add("batch-header-row");
            const cell = batchHeaderRow.insertCell();
            cell.setAttribute("colspan", NUM_TABLE_COLUMNS.toString());
            cell.textContent = `Project Batch: ${project.baseProjectName || "Unknown"} (ID: ${project.batchId.split("_")[1] || "N/A"})`;
        }

        // Fix Category Group Header Row
        const groupKey = `${project.batchId}_${project.fixCategory}`;
        if (project.fixCategory !== currentFixCategoryHeader) {
            currentFixCategoryHeader = project.fixCategory;
            if (typeof groupVisibilityState[groupKey] === "undefined") {
                groupVisibilityState[groupKey] = { isExpanded: true }; // Default to expanded
            }

            const fixHeaderRow = projectTableBody.insertRow();
            fixHeaderRow.classList.add("fix-group-header");
            const cell = fixHeaderRow.insertCell();
            cell.setAttribute("colspan", NUM_TABLE_COLUMNS.toString());

            const toggleBtn = document.createElement("button");
            toggleBtn.classList.add("btn", "btn-group-toggle");
            const isExpanded = groupVisibilityState[groupKey]?.isExpanded !== false;
            toggleBtn.textContent = isExpanded ? "−" : "+";
            toggleBtn.title = isExpanded ? `Collapse ${project.fixCategory}` : `Expand ${project.fixCategory}`;
            
            cell.appendChild(document.createTextNode(`${project.fixCategory} `));
            cell.appendChild(toggleBtn);

            fixHeaderRow.onclick = (e) => { // Attach to row for easier clicking
                if (groupVisibilityState[groupKey]) {
                    groupVisibilityState[groupKey].isExpanded = !groupVisibilityState[groupKey].isExpanded;
                    saveGroupVisibilityState();
                    renderProjects(); // Re-render to reflect visibility change
                }
            };
        }

        // Project Data Row
        const row = projectTableBody.insertRow();
        if (groupVisibilityState[groupKey]?.isExpanded === false) {
            row.classList.add("hidden-group-row");
        }
        if (project.fixCategory) row.classList.add(`${project.fixCategory.toLowerCase()}-row`);
        if (project.isReassigned) row.classList.add("reassigned-task-highlight");

        // Helper to format timestamp to HH:MM string or empty if null
        function formatTime(timestamp) {
            if (!timestamp) return "";
            let date;
            try {
                date = typeof timestamp.toDate === 'function' ? timestamp.toDate() : new Date(timestamp);
                if (isNaN(date.getTime())) return ""; // Invalid date
            } catch (e) { return ""; } // Error during conversion
            return date.toTimeString().slice(0, 5);
        }
        
        // Helper function to create time input cells
        function createTimeInputCell(value, fieldName, isDisabled) {
            const cell = row.insertCell();
            const input = document.createElement("input");
            input.type = "time";
            input.value = formatTime(value);
            input.disabled = isDisabled;
            input.onchange = (e) => updateProjectTimestamp(project.id, fieldName, e.target.value, project);
            cell.appendChild(input);
            return cell;
        }


        row.insertCell().textContent = project.fixCategory || "N/A";
        const nameCell = row.insertCell();
        nameCell.textContent = project.baseProjectName || "N/A";
        nameCell.classList.add("wrap-text");
        row.insertCell().textContent = project.areaTask || "N/A";
        row.insertCell().textContent = project.gsd || "N/A";

        // Assigned To
        const assignedToCell = row.insertCell();
        const assignedToSelect = document.createElement("select");
        assignedToSelect.classList.add("assigned-to-select");
        assignedToSelect.disabled = project.status === "Reassigned_TechAbsent";
        const defaultOption = document.createElement("option");
        defaultOption.value = "";
        defaultOption.textContent = "Select Tech ID";
        assignedToSelect.appendChild(defaultOption);
        TECH_IDS.forEach(techId => {
            const option = document.createElement("option");
            option.value = techId;
            option.textContent = techId;
            assignedToSelect.appendChild(option);
        });
        assignedToSelect.value = project.assignedTo || "";
        assignedToSelect.onchange = async (e) => {
            showLoading("Updating assignment...");
            const newAssignedTo = e.target.value;
            const oldAssignedTo = project.assignedTo || "";
            if (!db || !project.id) {
                alert("Database or project ID missing. Cannot update assignment.");
                e.target.value = oldAssignedTo; // Revert UI
                hideLoading();
                return;
            }
            try {
                await db.collection("projects").doc(project.id).update({
                    assignedTo: newAssignedTo,
                    lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
                project.assignedTo = newAssignedTo; // Update local data for immediate UI reflection if needed
            } catch (error) {
                console.error("Error updating assignedTo:", error);
                alert("Error updating assignment: " + error.message);
                e.target.value = oldAssignedTo; // Revert UI on error
            } finally {
                hideLoading();
            }
        };
        assignedToCell.appendChild(assignedToSelect);

        // Status
        const statusCell = row.insertCell();
        const statusSpan = document.createElement("span");
        statusSpan.classList.add("status");
        let statusText = (project.status || "Unknown").replace(/([A-Z])(?=[a-z0-9_])/g, ' $1').trim(); // Add spaces
        if (project.status === "Day1Ended_AwaitingNext") statusText = "Started Day 1 Ended";
        if (project.status === "Day2Ended_AwaitingNext") statusText = "Started Day 2 Ended";
        if (project.status === "Reassigned_TechAbsent") statusText = "Re-Assigned";
        statusSpan.textContent = statusText;
        statusSpan.classList.add(`status-${(project.status || "unknown").toLowerCase()}`);
        statusCell.appendChild(statusSpan);
        
        const isTaskDisabled = project.status === "Reassigned_TechAbsent";

        // Time Inputs
        createTimeInputCell(project.startTimeDay1, "startTimeDay1", isTaskDisabled);
        createTimeInputCell(project.finishTimeDay1, "finishTimeDay1", isTaskDisabled);
        createTimeInputCell(project.startTimeDay2, "startTimeDay2", isTaskDisabled);
        createTimeInputCell(project.finishTimeDay2, "finishTimeDay2", isTaskDisabled);
        createTimeInputCell(project.startTimeDay3, "startTimeDay3", isTaskDisabled); // Day 3 Start
        createTimeInputCell(project.finishTimeDay3, "finishTimeDay3", isTaskDisabled); // Day 3 End

        // Total Duration
        const totalDurationMsDay1 = project.durationDay1Ms || 0;
        const totalDurationMsDay2 = project.durationDay2Ms || 0;
        const totalDurationMsDay3 = project.durationDay3Ms || 0; // Day 3 duration
        const totalWorkTimeMs = totalDurationMsDay1 + totalDurationMsDay2 + totalDurationMsDay3;
        const breakMs = (project.breakDurationMinutes || 0) * 60000;
        const additionalMs = (project.additionalMinutesManual || 0) * 60000;
        let netDurationMs = Math.max(0, totalWorkTimeMs - breakMs) + additionalMs;
        if (totalWorkTimeMs === 0 && breakMs === 0 && additionalMs === 0) {
            netDurationMs = null; // Show N/A if no time logged
        }
        const totalDurationCell = row.insertCell();
        totalDurationCell.textContent = formatMillisToMinutes(netDurationMs);
        totalDurationCell.classList.add("total-duration-column");


        // Tech Notes
        const techNotesCell = row.insertCell();
        const techNotesInput = document.createElement("textarea");
        techNotesInput.value = project.techNotes || "";
        techNotesInput.placeholder = "Notes";
        techNotesInput.classList.add("tech-notes-input");
        techNotesInput.rows = 1;
        techNotesInput.id = `techNotes_${project.id}`;
        techNotesInput.disabled = isTaskDisabled;
        techNotesInput.onchange = async (e) => {
            showLoading("Updating tech notes...");
            const newNotes = e.target.value;
            const oldNotes = project.techNotes || "";
             if (!db || !project.id) {
                alert("Database or project ID missing. Cannot update notes.");
                e.target.value = oldNotes;
                hideLoading();
                return;
            }
            try {
                await db.collection("projects").doc(project.id).update({
                    techNotes: newNotes,
                    lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
                project.techNotes = newNotes;
            } catch (error) {
                console.error("Error updating techNotes:", error);
                alert("Error updating tech notes: " + error.message);
                e.target.value = oldNotes;
            } finally {
                hideLoading();
            }
        };
        techNotesCell.appendChild(techNotesInput);

        // Action Buttons Cell
        const actionsCell = row.insertCell();
        const actionsContainer = document.createElement("div");
        actionsContainer.classList.add("action-buttons-container"); // For potential flex styling

        // Break Select
        const breakSelect = document.createElement("select");
        breakSelect.classList.add("break-select");
        breakSelect.id = `breakSelect_${project.id}`;
        breakSelect.title = "Select break time to deduct";
        breakSelect.disabled = isTaskDisabled;
        ["0", "15", "60", "90"].forEach(minutes => {
            const option = document.createElement("option");
            option.value = minutes;
            option.textContent = minutes === "0" ? "No Break" : (minutes === "60" ? "1h Break" : (minutes === "90" ? "1h30m Break" : `${minutes}m Break`));
            breakSelect.appendChild(option);
        });
        breakSelect.value = typeof project.breakDurationMinutes === 'number' ? project.breakDurationMinutes.toString() : "0";
        breakSelect.onchange = async (e) => {
            showLoading("Updating break duration...");
            const newBreakMinutes = parseInt(e.target.value, 10);
            const oldBreakMinutes = project.breakDurationMinutes || 0;
            if (!db || !project.id) {
                alert("Database or project ID missing.");
                e.target.value = oldBreakMinutes.toString();
                hideLoading();
                return;
            }
            try {
                await db.collection("projects").doc(project.id).update({
                    breakDurationMinutes: newBreakMinutes,
                    lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
                // No need to manually update local 'project' object, onSnapshot will refresh
            } catch (error) {
                console.error("Error updating break duration:", error);
                alert("Error updating break duration: " + error.message);
                e.target.value = oldBreakMinutes.toString();
            } finally {
                hideLoading();
            }
        };
        actionsContainer.appendChild(breakSelect);


        // Action Buttons (Start D1, End D1, etc.)
        const createActionButton = (text, action, disabledCondition, btnClass = "btn-primary") => {
            const button = document.createElement("button");
            button.textContent = text;
            button.classList.add("btn", btnClass);
            button.disabled = isTaskDisabled || disabledCondition;
            button.onclick = () => project.id && updateProjectState(project.id, action);
            actionsContainer.appendChild(button);
        };

        createActionButton("Start D1", "startDay1", !["Available"].includes(project.status), "btn-day-start");
        createActionButton("End D1", "endDay1", project.status !== "InProgressDay1", "btn-day-end");
        createActionButton("Start D2", "startDay2", !["Day1Ended_AwaitingNext"].includes(project.status), "btn-day-start");
        createActionButton("End D2", "endDay2", project.status !== "InProgressDay2", "btn-day-end");
        createActionButton("Start D3", "startDay3", !["Day2Ended_AwaitingNext"].includes(project.status), "btn-day-start"); // Day 3 Start
        createActionButton("End D3", "endDay3", project.status !== "InProgressDay3", "btn-day-end");       // Day 3 End
        createActionButton("Done", "markDone", project.status === "Completed", "btn-mark-done");
        
        const reassignBtn = document.createElement("button");
        reassignBtn.textContent = "Re-Assign";
        reassignBtn.classList.add("btn", "btn-warning");
        reassignBtn.title = "Re-assign task by creating a new entry.";
        reassignBtn.disabled = project.status === "Completed" || isTaskDisabled;
        reassignBtn.onclick = () => {
            const currentProjectData = projects.find(p => p.id === project.id); // Get fresh data
            if (currentProjectData) handleReassignment(currentProjectData);
        };
        actionsContainer.appendChild(reassignBtn);
        actionsCell.appendChild(actionsContainer);
    });
}

async function updateProjectTimestamp(projectId, fieldName, timeValue, projectData) {
    showLoading(`Updating ${fieldName}...`);
    if (!db || !projectId) {
        alert("Database or project ID missing. Cannot update time.");
        hideLoading();
        return;
    }

    let newTimestamp = null;
    if (timeValue) { // If timeValue is not empty
        const now = new Date(); // Use current date, only time is from input
        const [hours, minutes] = timeValue.split(':').map(Number);
        now.setHours(hours, minutes, 0, 0); // Set hours and minutes, seconds and ms to 0
        newTimestamp = firebase.firestore.Timestamp.fromDate(now);
    }

    try {
        const updateData = {
            [fieldName]: newTimestamp,
            lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        // Calculate duration if this is a finish time
        let durationField = null;
        let startTimeForDuration = null;

        if (fieldName === "finishTimeDay1" && (newTimestamp || projectData.startTimeDay1)) {
            durationField = "durationDay1Ms";
            startTimeForDuration = projectData.startTimeDay1;
        } else if (fieldName === "finishTimeDay2" && (newTimestamp || projectData.startTimeDay2)) {
            durationField = "durationDay2Ms";
            startTimeForDuration = projectData.startTimeDay2;
        } else if (fieldName === "finishTimeDay3" && (newTimestamp || projectData.startTimeDay3)) {
            durationField = "durationDay3Ms";
            startTimeForDuration = projectData.startTimeDay3;
        }


        if (durationField && (newTimestamp || startTimeForDuration) ) { // Ensure start time exists if finish time is being cleared
             const duration = calculateDurationMs(
                fieldName.startsWith("finish") ? startTimeForDuration : newTimestamp, // if updating start, newTimestamp is start
                fieldName.startsWith("finish") ? newTimestamp : (projectData[fieldName.replace("start","finish")] || null) // if updating start, use existing finish
            );
            updateData[durationField] = duration;
        } else if (durationField && !newTimestamp && fieldName.startsWith("finish")) { // Clearing a finish time
            updateData[durationField] = null; // Set duration to null
        }


        // Also recalculate if a start time is changed
         if (fieldName === "startTimeDay1" && (newTimestamp || projectData.finishTimeDay1)) {
            updateData["durationDay1Ms"] = calculateDurationMs(newTimestamp, projectData.finishTimeDay1);
        } else if (fieldName === "startTimeDay2" && (newTimestamp || projectData.finishTimeDay2)) {
            updateData["durationDay2Ms"] = calculateDurationMs(newTimestamp, projectData.finishTimeDay2);
        } else if (fieldName === "startTimeDay3" && (newTimestamp || projectData.finishTimeDay3)) {
            updateData["durationDay3Ms"] = calculateDurationMs(newTimestamp, projectData.finishTimeDay3);
        }


        await db.collection("projects").doc(projectId).update(updateData);
        // Data will be re-rendered by onSnapshot
    } catch (error) {
        console.error(`Error updating ${fieldName}:`, error);
        alert(`Error updating ${fieldName}: ` + error.message);
    } finally {
        hideLoading();
    }
}


async function updateProjectState(projectId, action) {
    showLoading("Updating project state...");
    if (!db || !projectId) {
        alert("Database not initialized or project ID missing for state update.");
        hideLoading();
        return;
    }

    const projectRef = db.collection("projects").doc(projectId);
    let currentProjectData;
    try {
        const docSnap = await projectRef.get();
        if (!docSnap.exists) {
            console.warn("Project document not found for state update:", projectId);
            hideLoading();
            return;
        }
        currentProjectData = docSnap.data();
    } catch (error) {
        console.error("Error fetching current project data for update:", error);
        alert("Error fetching project data: " + error.message);
        hideLoading();
        return;
    }

    if (!currentProjectData || currentProjectData.status === "Reassigned_TechAbsent") {
        console.warn("Attempted to update a reassigned or invalid project.");
        hideLoading();
        return;
    }

    const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();
    const nowForCalc = new Date(); // For duration calculation if needed immediately
    let updates = { lastModifiedTimestamp: serverTimestamp };
    let oldStatus = currentProjectData.status;

    switch (action) {
        case "startDay1":
            if (["Available"].includes(oldStatus)) {
                updates = { ...updates, status: "InProgressDay1", startTimeDay1: serverTimestamp, 
                            finishTimeDay1: null, durationDay1Ms: null, 
                            startTimeDay2: null, finishTimeDay2: null, durationDay2Ms: null,
                            startTimeDay3: null, finishTimeDay3: null, durationDay3Ms: null };
            } break;
        case "endDay1":
            if (oldStatus === "InProgressDay1" && currentProjectData.startTimeDay1) {
                updates = { ...updates, status: "Day1Ended_AwaitingNext", finishTimeDay1: serverTimestamp, 
                            durationDay1Ms: calculateDurationMs(currentProjectData.startTimeDay1, nowForCalc) };
            } else alert("Cannot end Day 1. Task is not 'In Progress Day 1' or start time is missing.");
            break;
        case "startDay2":
            if (["Day1Ended_AwaitingNext"].includes(oldStatus)) {
                updates = { ...updates, status: "InProgressDay2", startTimeDay2: serverTimestamp, 
                            finishTimeDay2: null, durationDay2Ms: null,
                            startTimeDay3: null, finishTimeDay3: null, durationDay3Ms: null };
            } break;
        case "endDay2":
            if (oldStatus === "InProgressDay2" && currentProjectData.startTimeDay2) {
                updates = { ...updates, status: "Day2Ended_AwaitingNext", finishTimeDay2: serverTimestamp, 
                            durationDay2Ms: calculateDurationMs(currentProjectData.startTimeDay2, nowForCalc) };
            } else alert("Cannot end Day 2. Task is not 'In Progress Day 2' or start time is missing.");
            break;
        case "startDay3": // Day 3 Start
            if (["Day2Ended_AwaitingNext"].includes(oldStatus)) {
                updates = { ...updates, status: "InProgressDay3", startTimeDay3: serverTimestamp, 
                            finishTimeDay3: null, durationDay3Ms: null };
            } break;
        case "endDay3": // Day 3 End
            if (oldStatus === "InProgressDay3" && currentProjectData.startTimeDay3) {
                updates = { ...updates, status: "Completed", finishTimeDay3: serverTimestamp, 
                            durationDay3Ms: calculateDurationMs(currentProjectData.startTimeDay3, nowForCalc) };
            } else alert("Cannot end Day 3. Task is not 'In Progress Day 3' or start time is missing.");
            break;
        case "markDone":
            if (oldStatus !== "Completed") {
                updates.status = "Completed";
                // If any day was started but not ended, end it now
                if (currentProjectData.startTimeDay1 && !currentProjectData.finishTimeDay1) {
                    updates.finishTimeDay1 = serverTimestamp;
                    updates.durationDay1Ms = calculateDurationMs(currentProjectData.startTimeDay1, nowForCalc);
                }
                if (currentProjectData.startTimeDay2 && !currentProjectData.finishTimeDay2) {
                    updates.finishTimeDay2 = serverTimestamp;
                    updates.durationDay2Ms = calculateDurationMs(currentProjectData.startTimeDay2, nowForCalc);
                }
                if (currentProjectData.startTimeDay3 && !currentProjectData.finishTimeDay3) { // Day 3
                    updates.finishTimeDay3 = serverTimestamp;
                    updates.durationDay3Ms = calculateDurationMs(currentProjectData.startTimeDay3, nowForCalc);
                }
                // If task was 'Available' and marked done, all durations should be null or 0
                if (oldStatus === "Available") {
                    updates.durationDay1Ms = null; updates.durationDay2Ms = null; updates.durationDay3Ms = null;
                }
            }
            break;
        default:
            hideLoading();
            return; // No valid action
    }

    if (Object.keys(updates).length > 1) { // More than just lastModifiedTimestamp
        try {
            await projectRef.update(updates);
            // onSnapshot will handle UI update
        } catch (error) {
            console.error(`Error updating project ${projectId} for action ${action}:`, error);
            alert("Error updating project status: " + error.message);
        }
    }
    hideLoading();
}

async function handleReassignment(projectToReassign) {
    if (!projectToReassign || !projectToReassign.id || projectToReassign.status === "Reassigned_TechAbsent" || projectToReassign.status === "Completed") {
        alert("Cannot re-assign. Task is already reassigned, completed, or invalid.");
        return;
    }

    const newTechId = prompt(`Task for '${projectToReassign.areaTask}'. Enter New Tech ID:`);
    if (newTechId === null || newTechId.trim() === "") {
        alert("Reassignment cancelled. Tech ID cannot be empty.");
        return;
    }

    if (confirm(`Create NEW task for '${newTechId.trim()}'? Current task for '${projectToReassign.assignedTo || "Unassigned"}' will be closed and marked as 'Re-assigned'.`)) {
        showLoading("Reassigning task...");
        if (!db) {
            alert("Database not initialized! Cannot re-assign.");
            hideLoading();
            return;
        }

        const firestoreBatch = db.batch();
        const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();

        const newProjectData = {
            batchId: projectToReassign.batchId,
            baseProjectName: projectToReassign.baseProjectName,
            areaTask: projectToReassign.areaTask,
            gsd: projectToReassign.gsd,
            fixCategory: projectToReassign.fixCategory,
            assignedTo: newTechId.trim(),
            status: "Available", // New task starts as available
            startTimeDay1: null, finishTimeDay1: null, durationDay1Ms: null,
            startTimeDay2: null, finishTimeDay2: null, durationDay2Ms: null,
            startTimeDay3: null, finishTimeDay3: null, durationDay3Ms: null,
            techNotes: `Reassigned from ${projectToReassign.assignedTo || "N/A"}. Original Task ID: ${projectToReassign.id}`,
            creationTimestamp: projectToReassign.creationTimestamp, // Keep original batch creation time
            lastModifiedTimestamp: serverTimestamp,
            isReassigned: true, // Mark this new task as a result of reassignment
            originalProjectId: projectToReassign.id,
            releasedToNextStage: false, // Reset release status
            breakDurationMinutes: 0,
            additionalMinutesManual: 0
        };
        const newProjectRef = db.collection("projects").doc(); // Generate new ID
        firestoreBatch.set(newProjectRef, newProjectData);

        // Update the old project
        firestoreBatch.update(db.collection("projects").doc(projectToReassign.id), {
            status: "Reassigned_TechAbsent",
            lastModifiedTimestamp: serverTimestamp
            // Optionally, clear out time fields if it shouldn't contribute to metrics anymore
        });

        try {
            await firestoreBatch.commit();
            alert("Task successfully reassigned.");
            initializeFirebaseAndLoadData(); // Refresh view
        } catch (error) {
            console.error("Error in re-assignment:", error);
            alert("Error during re-assignment: " + error.message);
        } finally {
            hideLoading();
        }
    }
}

function refreshAllViews() {
    try {
        renderProjects();
        // If TL Dashboard is open, refresh it too (optional, or do it on open)
        // if (tlDashboardModal && tlDashboardModal.style.display === "block") {
        //     renderTLDashboard();
        // }
    } catch (error) {
        console.error("Error during refreshAllViews:", error);
        alert("An error occurred while refreshing the project display. Please check the console.");
    }
}

// --- Settings Modal Functions ---
async function renderAllowedEmailsList() {
    if (!allowedEmailsList) {
        console.error("allowedEmailsList element not found.");
        return;
    }
    showLoading("Rendering allowed emails...");
    // await fetchAllowedEmails(); // Already fetched on init and on auth change, ensure it's up-to-date if needed
    
    allowedEmailsList.innerHTML = ""; // Clear list
    if (allowedEmailsFromFirestore.length === 0) {
        allowedEmailsList.innerHTML = "<li>No allowed emails configured. Please add at least one.</li>";
        hideLoading();
        return;
    }
    allowedEmailsFromFirestore.forEach(email => {
        const li = document.createElement("li");
        li.textContent = email;
        const removeBtn = document.createElement("button");
        removeBtn.textContent = "Remove";
        removeBtn.classList.add("btn", "btn-danger", "btn-small"); // Ensure .btn-small is styled
        removeBtn.onclick = () => handleRemoveEmail(email);
        li.appendChild(removeBtn);
        allowedEmailsList.appendChild(li);
    });
    hideLoading();
}

async function handleAddEmail() {
    showLoading("Adding email...");
    if (!addEmailInput) {
        hideLoading();
        return;
    }
    const emailToAdd = addEmailInput.value.trim().toLowerCase();
    if (!emailToAdd || !emailToAdd.includes("@") || !emailToAdd.includes(".")) {
        alert("Please enter a valid email address (e.g., user@example.com).");
        hideLoading();
        return;
    }
    if (allowedEmailsFromFirestore.map(e => e.toLowerCase()).includes(emailToAdd)) {
        alert("This email is already in the allowed list.");
        hideLoading();
        return;
    }
    const updatedEmails = [...allowedEmailsFromFirestore, emailToAdd].sort();
    const success = await updateAllowedEmailsInFirestore(updatedEmails);
    if (success) {
        addEmailInput.value = ""; // Clear input
        renderAllowedEmailsList(); // Re-render the list
    }
    // hideLoading() is handled by updateAllowedEmailsInFirestore
}

async function handleRemoveEmail(emailToRemove) {
    if (confirm(`Are you sure you want to remove ${emailToRemove} from the allowed list? This will prevent them from logging in.`)) {
        showLoading("Removing email...");
        const updatedEmails = allowedEmailsFromFirestore.filter(email => email !== emailToRemove);
        const success = await updateAllowedEmailsInFirestore(updatedEmails);
        if (success) {
            renderAllowedEmailsList(); // Re-render the list
        }
        // hideLoading() is handled by updateAllowedEmailsInFirestore
    }
}

// --- TL Summary Function ---
async function generateTlSummaryData() {
    if (!tlSummaryContent) {
        console.error("tlSummaryContent element not found.");
        return;
    }
    showLoading("Generating TL Summary...");
    tlSummaryContent.innerHTML = "<p>Loading summary...</p>";
    if (!db) {
        tlSummaryContent.innerHTML = '<p style="color:red;">Database not initialized. Cannot generate summary.</p>';
        hideLoading();
        return;
    }

    try {
        const projectsSnapshot = await db.collection("projects").get(); // Get all projects
        let allProjectsData = [];
        projectsSnapshot.forEach(doc => {
            if (doc.exists && typeof doc.data === "function") {
                allProjectsData.push({ id: doc.id, ...doc.data() });
            }
        });

        const totalsByProjectFix = {};
        const overallProjectTotals = {};

        allProjectsData.forEach(p => {
            const dur1 = typeof p.durationDay1Ms === 'number' ? p.durationDay1Ms : 0;
            const dur2 = typeof p.durationDay2Ms === 'number' ? p.durationDay2Ms : 0;
            const dur3 = typeof p.durationDay3Ms === 'number' ? p.durationDay3Ms : 0;
            const breakMins = typeof p.breakDurationMinutes === 'number' ? p.breakDurationMinutes : 0;
            const additionalMins = typeof p.additionalMinutesManual === 'number' ? p.additionalMinutesManual : 0;

            const totalWorkMs = dur1 + dur2 + dur3;
            const breakMs = breakMins * 60000;
            const additionalMs = additionalMins * 60000;
            let netMs = Math.max(0, totalWorkMs - breakMs) + additionalMs;

            if (netMs <= 0 && breakMins === 0 && additionalMins === 0 && totalWorkMs === 0) return; // Skip if no time logged

            const netMinutes = Math.floor(netMs / 60000);

            // Totals by Project and Fix Category
            const projectFixKey = `${p.baseProjectName || "Unknown Project"}_${p.fixCategory || "Unknown Fix"}`;
            if (!totalsByProjectFix[projectFixKey]) {
                totalsByProjectFix[projectFixKey] = {
                    projectName: p.baseProjectName || "Unknown Project",
                    fixCategory: p.fixCategory || "Unknown Fix",
                    totalMinutes: 0
                };
            }
            totalsByProjectFix[projectFixKey].totalMinutes += netMinutes;

            // Overall Project Totals
            const projectKey = p.baseProjectName || "Unknown Project";
            if (!overallProjectTotals[projectKey]) {
                overallProjectTotals[projectKey] = {
                    projectName: projectKey,
                    totalMinutes: 0
                };
            }
            overallProjectTotals[projectKey].totalMinutes += netMinutes;
        });

        let summaryHtml = '<ul style="list-style: none; padding: 0;">';
        const sortedOverallProjects = Object.keys(overallProjectTotals).sort();

        if (sortedOverallProjects.length > 0) {
            summaryHtml += "<h3>Overall Project Totals (All Fix Categories)</h3>";
            sortedOverallProjects.forEach(key => {
                const data = overallProjectTotals[key];
                const hoursDecimal = (data.totalMinutes / 60).toFixed(2);
                summaryHtml += `
                    <li class="tl-summary-overall-total">
                        <strong>Project:</strong> ${data.projectName}<br>
                        <strong>Total Across All Fixes:</strong> ${data.totalMinutes} minutes<br>
                        <strong>Decimal:</strong> ${hoursDecimal} hours
                    </li>
                `;
            });
            summaryHtml += '<hr style="margin: 20px 0;">';
        }

        summaryHtml += "<h3>Totals by Project and Fix Category</h3>";
        const sortedProjectFixKeys = Object.keys(totalsByProjectFix).sort();
        if (sortedProjectFixKeys.length > 0) {
            sortedProjectFixKeys.forEach(key => {
                const data = totalsByProjectFix[key];
                const hoursDecimal = (data.totalMinutes / 60).toFixed(2);
                summaryHtml += `
                    <li style="margin-bottom: 8px; padding-bottom: 5px; border-bottom: 1px dotted #eee;">
                        <strong>Project Name:</strong> ${data.projectName} (${data.fixCategory})<br>
                        <strong>Total:</strong> ${data.totalMinutes} minutes<br>
                        <strong>Decimal:</strong> ${hoursDecimal} hours
                    </li>
                `;
            });
        }
        
        if (sortedOverallProjects.length === 0 && sortedProjectFixKeys.length === 0) {
            summaryHtml = "<p>No project time data found to generate a summary.</p>";
        } else {
            summaryHtml += "</ul>";
        }
        tlSummaryContent.innerHTML = summaryHtml;

    } catch (error) {
        console.error("Error generating TL Summary:", error);
        tlSummaryContent.innerHTML = '<p style="color:red;">Error generating summary: ' + error.message + "</p>";
        alert("Error generating TL Summary: " + error.message);
    } finally {
        hideLoading();
    }
}


// --- Authentication Functions and Listeners ---
function setupAuthEventListeners() {
    if (!auth) {
        console.error("Auth not initialized, cannot set up auth event listeners.");
        return;
    }
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('email'); // Ensure email scope is requested

    if (signInBtn) {
        signInBtn.addEventListener("click", () => {
            showLoading("Signing in...");
            auth.signInWithPopup(provider)
                .then((result) => {
                    console.log("Sign-in attempt successful for: ", result.user.email);
                    // onAuthStateChanged will handle UI updates
                })
                .catch((error) => {
                    console.error("Sign-in error: ", error);
                    let errorMessage = "Error signing in: " + error.message;
                    if (error.code === 'auth/popup-closed-by-user') errorMessage = "Sign-in process was cancelled.";
                    else if (error.code === 'auth/cancelled-popup-request') errorMessage = "Sign-in process was interrupted.";
                    else if (error.code === 'auth/popup-blocked') errorMessage = "Sign-in pop-up was blocked. Please allow pop-ups.";
                    else if (error.code === 'auth/network-request-failed') errorMessage = "Network error. Check internet connection.";
                    alert(errorMessage);
                    // Ensure UI reflects signed-out state if sign-in fails catastrophically
                    if (userInfoDisplayDiv && signInBtn && appContentDiv && loadingAuthMessageDiv) {
                        userInfoDisplayDiv.style.display = "none";
                        signInBtn.style.display = "block";
                        appContentDiv.style.display = "none";
                        loadingAuthMessageDiv.innerHTML = "<p>Please sign in to access the Project Tracker.</p>";
                        loadingAuthMessageDiv.style.display = "block";
                    }
                    hideLoading();
                });
        });
    } else {
        console.error("Sign-in button not found during event listener setup.");
    }

    if (signOutBtn) {
        signOutBtn.addEventListener("click", () => {
            showLoading("Signing out...");
            auth.signOut()
                .then(() => {
                    console.log("User signed out successfully by clicking button.");
                    // onAuthStateChanged will handle UI updates and listener cleanup
                })
                .catch((error) => {
                    console.error("Sign-out error: ", error);
                    alert("Error signing out: " + error.message);
                    hideLoading();
                });
        });
    } else {
        console.error("Sign-out button not found during event listener setup.");
    }
}

function initializeAppComponents() {
    if (isAppInitialized && firestoreListenerUnsubscribe) { // Check if listener exists
        console.log("Re-initializing data load (filters might have changed).");
        initializeFirebaseAndLoadData(); // This will set up a new listener
    } else {
        console.log("Initializing app components (DOM refs, event listeners, Firestore data)...");
        // DOM refs are set up on DOMContentLoaded or by onAuthStateChanged
        // Event listeners are attached on DOMContentLoaded or by onAuthStateChanged
        initializeFirebaseAndLoadData();
        isAppInitialized = true;
    }
}

// Auth state change listener - This is a critical part of the app
if (auth) {
    auth.onAuthStateChanged(async (user) => {
        // Ensure DOM references related to auth are always fresh inside this callback
        // as it might be called before DOMContentLoaded in some scenarios or after.
        setupDOMReferences(); // Call it here to be safe, or ensure it's called before this.

        if (!userNameP || !userEmailP || !userPhotoImg || !userInfoDisplayDiv || !signInBtn || !appContentDiv || !loadingAuthMessageDiv || !openSettingsBtn || !notificationBellArea) {
            console.error("One or more critical UI elements for auth state change not found. Aborting UI update.");
            hideLoading();
            return;
        }

        if (user) {
            showLoading("Checking authorization...");
            await fetchAllowedEmails(); // Make sure we have the latest list
            const userEmailLower = user.email ? user.email.toLowerCase() : "";

            if (user.email && allowedEmailsFromFirestore.map(e => e.toLowerCase()).includes(userEmailLower)) {
                console.log("Auth state changed: User is SIGNED IN and ALLOWED - ", user.displayName, user.email);
                userNameP.textContent = user.displayName || "Name not available";
                userEmailP.textContent = user.email || "Email not available";
                userPhotoImg.src = user.photoURL || "default-user.png"; // Provide a default image
                userInfoDisplayDiv.style.display = "flex";
                signInBtn.style.display = "none";
                loadingAuthMessageDiv.style.display = "none";
                appContentDiv.style.display = "block";
                openSettingsBtn.style.display = "inline-block"; // Show settings for authorized users
                notificationBellArea.style.display = "inline-block"; // Show bell

                listenForBellNotifications(); // Start listening for this user's bell updates
                initializeAppComponents(); // Load project data etc.
            } else {
                console.warn("Auth state changed: User SIGNED IN but NOT ALLOWED - ", user.email);
                alert("Access Denied: Your email address (" + (user.email || "N/A") + ") is not authorized to use this application. You will be signed out.");
                
                if (bellStatusListenerUnsubscribe) {
                    bellStatusListenerUnsubscribe(); bellStatusListenerUnsubscribe = null;
                    console.log("Bell status listener detached for unauthorized user.");
                }
                if (notificationBadge) notificationBadge.style.display = "none";
                if (notificationListItems) notificationListItems.innerHTML = "";
                if (noNotificationsText && notificationList) {
                    noNotificationsText.style.display = "block";
                    notificationList.style.display = "none";
                }
                notificationBellArea.style.display = "none";


                auth.signOut().then(() => {
                    console.log("Unauthorized user automatically signed out.");
                    // UI is handled by the 'else' block of onAuthStateChanged below
                }).catch(signOutError => {
                    console.error("Error signing out unauthorized user:", signOutError);
                    // Still update UI to reflect signed-out state
                }).finally(() => {
                    // This block will be entered after sign out, effectively like the 'else' below
                    // but ensures cleanup even if signOut had an error during this specific flow.
                    userInfoDisplayDiv.style.display = "none";
                    signInBtn.style.display = "block";
                    appContentDiv.style.display = "none";
                    openSettingsBtn.style.display = "none";
                    notificationBellArea.style.display = "none";
                    loadingAuthMessageDiv.innerHTML = "<p>Access Denied. Please sign in with an authorized account.</p>";
                    loadingAuthMessageDiv.style.display = "block";
                    projects = [];
                    if (projectTableBody) projectTableBody.innerHTML = "";
                    if (tlDashboardContentElement) tlDashboardContentElement.innerHTML = "";
                    if (allowedEmailsList) allowedEmailsList.innerHTML = "";
                    if (firestoreListenerUnsubscribe) {
                        firestoreListenerUnsubscribe(); firestoreListenerUnsubscribe = null;
                        console.log("Firestore listener detached for unauthorized user sign out.");
                    }
                    isAppInitialized = false;
                    hideLoading();
                });
            }
        } else { // User is signed out
            console.log("Auth state changed: User is SIGNED OUT");
            userNameP.textContent = "";
            userEmailP.textContent = "";
            userPhotoImg.src = ""; // Clear photo
            userInfoDisplayDiv.style.display = "none";
            signInBtn.style.display = "block";
            appContentDiv.style.display = "none";
            openSettingsBtn.style.display = "none";
            notificationBellArea.style.display = "none"; // Hide bell on sign out

            // Only set default sign-in message if not already showing an access denied message
            if (loadingAuthMessageDiv.innerHTML.indexOf("Access Denied") === -1) {
                loadingAuthMessageDiv.innerHTML = "<p>Please sign in to access the Project Tracker.</p>";
            }
            loadingAuthMessageDiv.style.display = "block";

            // Cleanup listeners and data
            if (firestoreListenerUnsubscribe) {
                firestoreListenerUnsubscribe();
                firestoreListenerUnsubscribe = null;
                console.log("Firestore listener detached on sign out.");
            }
            if (bellStatusListenerUnsubscribe) {
                bellStatusListenerUnsubscribe();
                bellStatusListenerUnsubscribe = null;
                console.log("Bell status listener detached on sign out.");
            }
            if(notificationBadge) notificationBadge.style.display = "none";
            if(notificationListItems) notificationListItems.innerHTML = "";
            if(noNotificationsText && notificationList) {
                 noNotificationsText.style.display = "block";
                 notificationList.style.display = "none";
            }


            projects = []; // Clear projects data
            if (projectTableBody) projectTableBody.innerHTML = ""; // Clear table
            if (tlDashboardContentElement) tlDashboardContentElement.innerHTML = "";
            if (allowedEmailsList) allowedEmailsList.innerHTML = "";
            isAppInitialized = false; // Reset app initialization state
            console.log("App content hidden, project data cleared, and listeners detached.");
            hideLoading();
        }
    });
} else {
    console.error("Firebase Auth is not initialized. UI updates based on auth state will not occur.");
    const loadingMsgDiv = document.getElementById("loading-auth-message");
    if (loadingMsgDiv) { // Check if element exists before trying to modify
        loadingMsgDiv.innerHTML = '<p style="color:red; font-weight:bold;">Authentication services could not be loaded. Please check the console and refresh.</p>';
        loadingMsgDiv.style.display = "block";
    }
}


// DOMContentLoaded listener
document.addEventListener("DOMContentLoaded", () => {
    console.log("DOM fully loaded.");
    setupDOMReferences(); // Setup all DOM references once DOM is ready
    attachEventListeners(); // Attach general event listeners

    // Initial UI state before auth check completes (auth might already have a user)
    if (appContentDiv) appContentDiv.style.display = "none"; // Hide main content initially
    if (loadingAuthMessageDiv) loadingAuthMessageDiv.style.display = "block"; // Show loading/sign-in message
    if (notificationBellArea) notificationBellArea.style.display = "none"; // Hide bell initially


    if (!auth) { // If Firebase auth failed to initialize earlier
        console.error("Firebase Auth not available on DOMContentLoaded. Auth UI setup skipped.");
        if (loadingAuthMessageDiv) {
            loadingAuthMessageDiv.innerHTML = '<p style="color:red; font-weight:bold;">CRITICAL: Authentication services failed to load. App cannot function. Please check console and refresh.</p>';
            loadingAuthMessageDiv.style.display = "block";
        }
        if (signInBtn) signInBtn.style.display = "none"; // Hide sign-in button if auth is broken
    }
    // The onAuthStateChanged listener will handle showing the correct UI once auth state is known.
});

