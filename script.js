const firebaseConfig = {
  apiKey: "AIzaSyAblGk1BHPF3J6w--Ii1pfDyKqcN-MFZyQ",
  authDomain: "time-tracker-41701.firebaseapp.com",
  projectId: "time-tracker-41701",
  storageBucket: "time-tracker-41701.firebasestorage.app",
  messagingSenderId: "401097667777",
  appId: "1:401097667777:web:d6c0c6e7741a2046945040",
  measurementId: "G-BY9CV5ZQ11"
};

let app, db, auth;
let signInBtn, signOutBtn, userInfoDisplayDiv, userNameP, userEmailP, userPhotoImg;
let appContentDiv, loadingAuthMessageDiv, loadingOverlay;

const TL_DASHBOARD_PIN = "1234";
const ALLOWED_EMAILS_DOC_REF_PATH = "settings/allowedEmails";
let allowedEmailsFromFirestore = [];

const TECH_IDS = ["4232JD", "7248AA", "4426KV", "4472JS", "7236LE", "4475JT", "7039NO", "7231NR", "7240HH", "7247JA", "7249SS", "7244AA", "7314VP"];
TECH_IDS.sort();

try {
    if (typeof firebase === 'undefined' || typeof firebase.initializeApp === 'undefined') {
        throw new Error("Firebase SDK not loaded. Ensure Firebase scripts are correctly included.");
    }
    app = firebase.initializeApp(firebaseConfig);

    if (typeof app.firestore === 'undefined') {
        throw new Error("Firestore SDK not loaded or initialized correctly with the app.");
    }
    db = firebase.firestore();

    if (typeof app.auth === 'undefined') {
        throw new Error("Firebase Auth SDK not loaded or initialized correctly with the app.");
    }
    auth = firebase.auth();
    console.log("Firebase initialized successfully (App, Firestore, Auth)!");
    fetchAllowedEmails(); // Initial fetch

} catch (error) {
    console.error("CRITICAL: Error initializing Firebase: ", error.message);
    const loadingMessageElement = document.getElementById('loading-auth-message');
    if (loadingMessageElement) {
        loadingMessageElement.innerHTML = `<p style="color:red;">CRITICAL ERROR: Could not connect to Firebase. App will not function correctly. Error: ${error.message}</p>`;
    } else {
        // Fallback if the specific element isn't found, though less ideal.
        alert("CRITICAL ERROR: Could not connect to Firebase. App will not function correctly. Error: " + error.message);
    }
}


const FIX_CATEGORIES_ORDER = ["Fix1", "Fix2", "Fix3", "Fix4", "Fix5", "Fix6"];
const STATUS_ORDER = {
    "Available": 1,
    "InProgressDay1": 2,
    "Day1Ended_AwaitingNext": 3,
    "InProgressDay2": 4,
    "Day2Ended_AwaitingNext": 5,
    "InProgressDay3": 6,
    "Day3Ended_AwaitingNext": 7,
    "Completed": 8,
    "Reassigned_TechAbsent": 9
};
const NUM_TABLE_COLUMNS = 15; // Number of columns in the main projects table

// DOM Elements - these will be assigned in setupDOMReferences
let openAddNewProjectBtn, openTlDashboardBtn, openSettingsBtn;
let projectFormModal, tlDashboardModal, settingsModal;
let closeProjectFormBtn, closeTlDashboardBtn, closeSettingsBtn;
let newProjectForm, projectTableBody, tlDashboardContentElement;
let allowedEmailsList, addEmailInput, addEmailBtn;
let tlSummaryModal, closeTlSummaryBtn, tlSummaryContent, openTlSummaryBtn;

let projects = [];
let groupVisibilityState = {};
let isAppInitialized = false;
let firestoreListenerUnsubscribe = null;

// Filter elements
let batchIdSelect, fixCategoryFilter, monthFilter;
let currentSelectedBatchId = localStorage.getItem('currentSelectedBatchId') || "";
let currentSelectedFixCategory = ""; // Not stored in localStorage, reset on load
let currentSelectedMonth = localStorage.getItem('currentSelectedMonth') || "";


function showLoading(message = "Loading...") {
    if (loadingOverlay) {
        const p = loadingOverlay.querySelector('p');
        if (p) p.textContent = message;
        loadingOverlay.style.display = 'flex';
    }
}

function hideLoading() {
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
    }
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function formatMillisToMinutes(millis) {
    if (millis === null || typeof millis !== 'number' || millis < 0) {
        return "N/A";
    }
    return Math.floor(millis / 60000);
}

function calculateDurationMs(startTime, finishTime) {
    let startMillis = startTime;
    let finishMillis = finishTime;

    // Convert Firestore Timestamps to millis if they are objects with toMillis
    if (startTime && typeof startTime.toMillis === 'function') {
        startMillis = startTime.toMillis();
    }
    if (finishTime && typeof finishTime.toMillis === 'function') {
        finishMillis = finishTime.toMillis();
    } else if (typeof startTime === 'number' && typeof finishTime === 'number') {
        // Already numbers, do nothing
    } else if (startTime && typeof startTime.toMillis === 'function' && typeof finishTime === 'number') {
        // start is Timestamp, finish is number (likely Date.now())
    } else if (typeof startTime === 'number' && finishTime && typeof finishTime.toMillis === 'function') {
        // start is number, finish is Timestamp
    } else {
         // Handle cases where one or both might be date strings or null before conversion
        if (startTime && ! (typeof startTime === 'number') && !isNaN(new Date(startTime).getTime())) {
            startMillis = new Date(startTime).getTime();
        }
        if (finishTime && ! (typeof finishTime === 'number') && !isNaN(new Date(finishTime).getTime())) {
            finishMillis = new Date(finishTime).getTime();
        }
    }


    if (!startMillis || !finishMillis || finishMillis < startMillis || isNaN(startMillis) || isNaN(finishMillis)) {
        return null; // Or 0, depending on how you want to handle invalid/incomplete durations
    }
    return finishMillis - startMillis;
}


function loadGroupVisibilityState() {
    try {
        const storedState = localStorage.getItem('projectTrackerGroupVisibility');
        groupVisibilityState = storedState ? JSON.parse(storedState) : {};
    } catch (error) {
        console.error("Error parsing group visibility state from localStorage:", error);
        groupVisibilityState = {}; // Reset to default if parsing fails
    }
}

function saveGroupVisibilityState() {
    try {
        localStorage.setItem('projectTrackerGroupVisibility', JSON.stringify(groupVisibilityState));
    } catch (error) {
        console.error("Error saving group visibility state to localStorage:", error);
        alert("Warning: Could not save your group visibility preferences.");
    }
}

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
        if (docSnap.exists) {
            allowedEmailsFromFirestore = docSnap.data().emails || [];
        } else {
            // If the document doesn't exist, perhaps initialize with a default admin
            console.warn(`Document ${ALLOWED_EMAILS_DOC_REF_PATH} does not exist. No emails loaded initially.`);
            allowedEmailsFromFirestore = ["ev.lorens.ebrado@gmail.com"]; // Fallback or default
        }
    } catch (error) {
        console.error("Error fetching allowed emails:", error);
        // Fallback to a default if fetching fails to prevent locking out
        allowedEmailsFromFirestore = ["ev.lorens.ebrado@gmail.com"];
    } finally {
        hideLoading();
    }
}

async function updateAllowedEmailsInFirestore(emailsArray) {
    showLoading("Updating allowed emails...");
    if (!db) {
        alert("Database not initialized! Cannot update allowed emails.");
        hideLoading();
        return false;
    }
    const docRef = db.doc(ALLOWED_EMAILS_DOC_REF_PATH);
    try {
        await docRef.set({ emails: emailsArray });
        allowedEmailsFromFirestore = emailsArray; // Update local cache
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
        projects = []; // Clear projects if db is not available
        refreshAllViews();
        hideLoading();
        return;
    }

    // Unsubscribe from previous listener if it exists
    if (firestoreListenerUnsubscribe) {
        firestoreListenerUnsubscribe();
        firestoreListenerUnsubscribe = null; // Clear it
    }

    loadGroupVisibilityState(); // Load visibility preferences

    // 1. Populate Month Filter based on ALL projects first
    let allProjectsQuery = db.collection("projects").orderBy("creationTimestamp", "desc");
    try {
        const allProjectsSnapshot = await allProjectsQuery.get();
        const uniqueMonths = new Set();
        allProjectsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.creationTimestamp && data.creationTimestamp.toDate) {
                const date = data.creationTimestamp.toDate();
                const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                uniqueMonths.add(monthYear);
            }
        });

        if (monthFilter) {
            monthFilter.innerHTML = '<option value="">All Months</option>'; // Reset
            Array.from(uniqueMonths).sort((a, b) => b.localeCompare(a)).forEach(monthYear => { // Sort descending
                const [year, month] = monthYear.split('-');
                const date = new Date(year, parseInt(month) - 1, 1);
                const option = document.createElement('option');
                option.value = monthYear;
                option.textContent = date.toLocaleString('en-US', { year: 'numeric', month: 'long' });
                monthFilter.appendChild(option);
            });

            // Restore selected month or default to ""
            if (currentSelectedMonth && Array.from(uniqueMonths).includes(currentSelectedMonth)) {
                monthFilter.value = currentSelectedMonth;
            } else {
                currentSelectedMonth = ""; // If stored month is no longer valid
                monthFilter.value = "";
                localStorage.setItem('currentSelectedMonth', "");
            }
        }
    } catch (error) {
        console.error("Error populating month filter:", error);
    }

    // 2. Populate Batch ID Filter based on (potentially) month-filtered projects
    let batchQuery = db.collection("projects");
    if (currentSelectedMonth && monthFilter && monthFilter.value) {
        const [year, month] = currentSelectedMonth.split('-');
        const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
        const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999); // Last moment of the month
        batchQuery = batchQuery.where("creationTimestamp", ">=", startDate)
                               .where("creationTimestamp", "<=", endDate);
    }
    batchQuery = batchQuery.orderBy("creationTimestamp", "desc");


    try {
        const batchSnapshot = await batchQuery.get();
        const batchIdMap = {}; // Stores batchId -> baseProjectName
        batchSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.batchId && !batchIdMap[data.batchId]) {
                batchIdMap[data.batchId] = data.baseProjectName || "Unknown Project";
            }
        });

        const sortedBatchIds = Object.keys(batchIdMap).sort((a, b) => {
            // Try to find the original creation timestamp for sorting batches if complex sort is needed
            // For now, simple alphabetical or by discovery order (which is already by creationTimestamp desc)
            const docA = batchSnapshot.docs.find(d => d.data().batchId === a);
            const docB = batchSnapshot.docs.find(d => d.data().batchId === b);
            if (docA && docB && docA.data().creationTimestamp && docB.data().creationTimestamp) {
                return docB.data().creationTimestamp.toMillis() - docA.data().creationTimestamp.toMillis();
            }
            return b.localeCompare(a); // Fallback sort
        });


        if (batchIdSelect) {
            batchIdSelect.innerHTML = ''; // Clear previous options
            if (sortedBatchIds.length === 0) {
                const option = document.createElement('option');
                option.value = "";
                option.textContent = "No batches available";
                option.disabled = true;
                option.selected = true;
                batchIdSelect.appendChild(option);
                currentSelectedBatchId = ""; // Reset if no batches
                localStorage.setItem('currentSelectedBatchId', "");
                 projects = []; // Clear projects if no batches for this month
                 refreshAllViews();
                 hideLoading();
                 return; // Stop further processing if no batches
            } else {
                 const allBatchesOption = document.createElement('option');
                 allBatchesOption.value = "";
                 allBatchesOption.textContent = "All Batches";
                 batchIdSelect.appendChild(allBatchesOption);

                sortedBatchIds.forEach(batchId => {
                    const option = document.createElement('option');
                    option.value = batchId;
                    option.textContent = `${batchIdMap[batchId]} (${batchId.split('_')[1] || 'ID N/A'})`;
                    batchIdSelect.appendChild(option);
                });

                if (currentSelectedBatchId && batchIdMap[currentSelectedBatchId]) {
                    batchIdSelect.value = currentSelectedBatchId;
                } else if (sortedBatchIds.length > 0 && !currentSelectedBatchId) { // If no batch was selected, default to "All Batches"
                    batchIdSelect.value = ""; // Default to "All Batches"
                    currentSelectedBatchId = "";
                    localStorage.setItem('currentSelectedBatchId', currentSelectedBatchId);
                } else { // If selected batch is no longer valid
                    currentSelectedBatchId = "";
                    batchIdSelect.value = "";
                    localStorage.setItem('currentSelectedBatchId', "");
                }
            }
        }
    } catch (error) {
        console.error("Error populating batch ID filter:", error);
        if (batchIdSelect) {
            batchIdSelect.innerHTML = '<option value="" disabled selected>Error loading batches</option>';
        }
    }


    // 3. Construct the main query for projects table based on all filters
    let projectsQuery = db.collection("projects");

    if (currentSelectedMonth && monthFilter && monthFilter.value) {
        const [year, month] = currentSelectedMonth.split('-');
        const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
        const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999);
        projectsQuery = projectsQuery.where("creationTimestamp", ">=", startDate)
                                     .where("creationTimestamp", "<=", endDate);
    }

    if (currentSelectedBatchId && batchIdSelect && batchIdSelect.value) {
        projectsQuery = projectsQuery.where("batchId", "==", currentSelectedBatchId);
    }

    if (currentSelectedFixCategory && fixCategoryFilter && fixCategoryFilter.value) {
        projectsQuery = projectsQuery.where("fixCategory", "==", currentSelectedFixCategory);
    }

    // Add default sorting
    projectsQuery = projectsQuery.orderBy("fixCategory").orderBy("areaTask"); // Firestore requires composite index for this

    try {
        firestoreListenerUnsubscribe = projectsQuery.onSnapshot(snapshot => {
            const newProjects = [];
            snapshot.forEach(doc => {
                if (doc.exists && typeof doc.data === 'function') {
                    newProjects.push({ id: doc.id, ...doc.data() });
                }
            });

            projects = newProjects; // Update global projects array
            projects.forEach(project => {
                const groupKey = `${project.batchId}_${project.fixCategory}`;
                if (typeof groupVisibilityState[groupKey] === 'undefined') {
                    groupVisibilityState[groupKey] = { isExpanded: true }; // Default to expanded
                }
                // Ensure default values for potentially missing duration/time fields
                if (typeof project.breakDurationMinutes === 'undefined') project.breakDurationMinutes = 0;
                if (typeof project.additionalMinutesManual === 'undefined') project.additionalMinutesManual = 0;
                if (typeof project.startTimeDay3 === 'undefined') project.startTimeDay3 = null;
                if (typeof project.finishTimeDay3 === 'undefined') project.finishTimeDay3 = null;
                if (typeof project.durationDay3Ms === 'undefined') project.durationDay3Ms = null;

            });
            refreshAllViews(); // Re-render the table
        }, error => {
            console.error("Error fetching projects with onSnapshot: ", error);
            projects = []; // Clear projects on error
            refreshAllViews();
            alert("Error loading projects: " + error.message);
        });
    } catch (error) {
        console.error("Error setting up Firebase listener (projectsQuery.onSnapshot): ", error);
        alert("CRITICAL ERROR: Could not set up real-time project updates. Error: " + error.message);
    } finally {
        hideLoading();
    }
}


function setupDOMReferences() {
    // Buttons for opening modals
    openAddNewProjectBtn = document.getElementById('openAddNewProjectBtn');
    openTlDashboardBtn = document.getElementById('openTlDashboardBtn');
    openSettingsBtn = document.getElementById('openSettingsBtn');
    openTlSummaryBtn = document.getElementById('openTlSummaryBtn');

    // Modals
    projectFormModal = document.getElementById('projectFormModal');
    tlDashboardModal = document.getElementById('tlDashboardModal');
    settingsModal = document.getElementById('settingsModal');
    tlSummaryModal = document.getElementById('tlSummaryModal');


    // Close buttons for modals
    closeProjectFormBtn = document.getElementById('closeProjectFormBtn');
    closeTlDashboardBtn = document.getElementById('closeTlDashboardBtn');
    closeSettingsBtn = document.getElementById('closeSettingsBtn');
    closeTlSummaryBtn = document.getElementById('closeTlSummaryBtn');

    // Forms and content areas
    newProjectForm = document.getElementById('newProjectForm');
    projectTableBody = document.getElementById('projectTableBody');
    tlDashboardContentElement = document.getElementById('tlDashboardContent');
    allowedEmailsList = document.getElementById('allowedEmailsList');
    addEmailInput = document.getElementById('addEmailInput');
    addEmailBtn = document.getElementById('addEmailBtn');
    tlSummaryContent = document.getElementById('tlSummaryContent');

    // Loading overlay
    loadingOverlay = document.getElementById('loadingOverlay');

    // Filters
    batchIdSelect = document.getElementById('batchIdSelect');
    fixCategoryFilter = document.getElementById('fixCategoryFilter');
    monthFilter = document.getElementById('monthFilter');
}

function setupAuthRelatedDOMReferences() {
    signInBtn = document.getElementById('signInBtn');
    signOutBtn = document.getElementById('signOutBtn');
    userInfoDisplayDiv = document.getElementById('user-info-display');
    userNameP = document.getElementById('userName');
    userEmailP = document.getElementById('userEmail');
    userPhotoImg = document.getElementById('userPhoto');
    appContentDiv = document.getElementById('app-content');
    loadingAuthMessageDiv = document.getElementById('loading-auth-message');
}


function attachEventListeners() {
    // Modal Openers
    if (openAddNewProjectBtn) {
        openAddNewProjectBtn.onclick = () => {
            const pin = prompt("Enter PIN to add new tracker:");
            if (pin !== TL_DASHBOARD_PIN) { // Assuming same PIN for now
                alert("Incorrect PIN.");
                return;
            }
            if (projectFormModal) projectFormModal.style.display = 'block';
        };
    }

    if (openTlDashboardBtn) {
        openTlDashboardBtn.onclick = () => {
            const pin = prompt("Enter PIN to access Project Settings:");
            if (pin === TL_DASHBOARD_PIN) {
                if (tlDashboardModal) tlDashboardModal.style.display = 'block';
                renderTLDashboard();
            } else {
                alert("Incorrect PIN.");
            }
        };
    }

    if (openSettingsBtn) {
        openSettingsBtn.onclick = () => {
            const pin = prompt("Enter PIN to access User Settings:");
            if (pin === TL_DASHBOARD_PIN) { // Assuming same PIN
                if (settingsModal) settingsModal.style.display = 'block';
                renderAllowedEmailsList();
            } else {
                alert("Incorrect PIN.");
            }
        };
    }
     if (openTlSummaryBtn) {
        openTlSummaryBtn.onclick = () => {
            if (tlSummaryModal) tlSummaryModal.style.display = 'block';
            generateTlSummaryData();
        };
    }


    // Modal Closers
    if (closeProjectFormBtn && projectFormModal && newProjectForm) {
        closeProjectFormBtn.onclick = () => {
            newProjectForm.reset();
            projectFormModal.style.display = 'none';
        };
    }
    if (closeTlDashboardBtn && tlDashboardModal) {
        closeTlDashboardBtn.onclick = () => {
            tlDashboardModal.style.display = 'none';
        };
    }
    if (closeSettingsBtn && settingsModal) {
        closeSettingsBtn.onclick = () => {
            settingsModal.style.display = 'none';
        };
    }
    if (closeTlSummaryBtn && tlSummaryModal) {
        closeTlSummaryBtn.onclick = () => {
            tlSummaryModal.style.display = 'none';
        };
    }


    // Settings Modal - Add Email
    if (addEmailBtn) {
        addEmailBtn.onclick = handleAddEmail;
    }


    // Filter changes
    if (batchIdSelect) {
        batchIdSelect.onchange = (event) => {
            currentSelectedBatchId = event.target.value;
            localStorage.setItem('currentSelectedBatchId', currentSelectedBatchId);
            initializeFirebaseAndLoadData(); // Reload data based on new batch
        };
    }
    if (fixCategoryFilter) {
        fixCategoryFilter.onchange = (event) => {
            currentSelectedFixCategory = event.target.value;
            // No localStorage for fixCategoryFilter, it's ephemeral
            initializeFirebaseAndLoadData(); // Reload data
        };
    }
     if (monthFilter) {
        monthFilter.onchange = (event) => {
            currentSelectedMonth = event.target.value;
            localStorage.setItem('currentSelectedMonth', currentSelectedMonth);
            // When month changes, batch ID might become invalid, so reset it and its storage
            currentSelectedBatchId = "";
            localStorage.setItem('currentSelectedBatchId', "");
            initializeFirebaseAndLoadData(); // Reload data, which will repopulate batchIdSelect
        };
    }


    // Close modals if clicked outside
    if (typeof window !== 'undefined') {
        window.onclick = (event) => {
            if (projectFormModal && event.target == projectFormModal) {
                projectFormModal.style.display = 'none';
            }
            if (tlDashboardModal && event.target == tlDashboardModal) {
                tlDashboardModal.style.display = 'none';
            }
            if (settingsModal && event.target == settingsModal) {
                settingsModal.style.display = 'none';
            }
            if (tlSummaryModal && event.target == tlSummaryModal) {
                tlSummaryModal.style.display = 'none';
            }
        };
    }

    // Form submission
    if (newProjectForm) {
        newProjectForm.addEventListener('submit', handleAddProjectSubmit);
    }

    setupAuthEventListeners(); // Auth specific listeners
}

async function handleAddProjectSubmit(event) {
    event.preventDefault();
    showLoading("Adding project(s)...");

    if (!db) {
        alert("Database not initialized!");
        hideLoading();
        return;
    }

    const fixCategory = document.getElementById('fixCategorySelect').value;
    const numRows = parseInt(document.getElementById('numRows').value, 10);
    const baseProjectName = document.getElementById('baseProjectName').value.trim();
    const gsd = document.getElementById('gsd').value;

    if (!baseProjectName || isNaN(numRows) || numRows < 1) {
        alert("Invalid input. Please ensure Project Name is not empty and Number of Tasks is at least 1.");
        hideLoading();
        return;
    }

    const batchId = `batch_${generateId()}`;
    const creationTimestamp = firebase.firestore.FieldValue.serverTimestamp();
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
                status: "Available", // Initial status
                startTimeDay1: null,
                finishTimeDay1: null,
                durationDay1Ms: null,
                startTimeDay2: null,
                finishTimeDay2: null,
                durationDay2Ms: null,
                startTimeDay3: null,
                finishTimeDay3: null,
                durationDay3Ms: null,
                releasedToNextStage: false,
                lastModifiedTimestamp: creationTimestamp,
                isReassigned: false,
                originalProjectId: null,
                breakDurationMinutes: 0,
                additionalMinutesManual: 0,
            };
            const newProjectRef = db.collection("projects").doc(); // Auto-generate ID
            batch.set(newProjectRef, projectData);
        }

        await batch.commit();
        if (newProjectForm) newProjectForm.reset();

        // Set filters to show the newly added batch
        currentSelectedBatchId = batchId;
        localStorage.setItem('currentSelectedBatchId', currentSelectedBatchId);
        currentSelectedMonth = ""; // Clear month filter to ensure new batch might be visible
        localStorage.setItem('currentSelectedMonth', "");
        if (monthFilter) monthFilter.value = "";
        if (fixCategoryFilter) fixCategoryFilter.value = fixCategory; // Optionally select the fix category of added items
        currentSelectedFixCategory = fixCategory;


        initializeFirebaseAndLoadData(); // Refresh to show new projects

    } catch (error) {
        console.error("Error adding projects: ", error);
        alert("Error adding projects: " + error.message);
    } finally {
        if (projectFormModal) projectFormModal.style.display = 'none';
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
        const batches = {}; // Use an object to group tasks by batchId

        projectsSnapshot.forEach(doc => {
            const task = doc.data();
            if (task && task.batchId) {
                if (!batches[task.batchId]) {
                    batches[task.batchId] = {
                        batchId: task.batchId,
                        baseProjectName: task.baseProjectName || "N/A",
                        tasksByFix: {} // Initialize tasksByFix for each batch
                    };
                }
                if (task.fixCategory) {
                    if (!batches[task.batchId].tasksByFix[task.fixCategory]) {
                        batches[task.batchId].tasksByFix[task.fixCategory] = [];
                    }
                    batches[task.batchId].tasksByFix[task.fixCategory].push(task);
                }
            }
        });
        return Object.values(batches); // Convert the batches object to an array
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

    const batches = await getManageableBatches();

    if (batches.length === 0) {
        tlDashboardContentElement.innerHTML = "<p>No project batches found.</p>";
        return;
    }

    batches.forEach(batch => {
        if (!batch || !batch.batchId) return; // Skip if batch or batchId is undefined

        const batchItemDiv = document.createElement('div');
        batchItemDiv.classList.add('dashboard-batch-item');

        const title = document.createElement('h4');
        title.textContent = `Batch: ${batch.baseProjectName || "Unknown"} (ID: ${batch.batchId.split('_')[1] || "N/A"})`;
        batchItemDiv.appendChild(title);

        const stagesPresent = batch.tasksByFix ? Object.keys(batch.tasksByFix).sort((a,b) => FIX_CATEGORIES_ORDER.indexOf(a) - FIX_CATEGORIES_ORDER.indexOf(b)) : [];
        const stagesP = document.createElement('p');
        stagesP.innerHTML = `<strong>Stages Present:</strong> ${stagesPresent.join(', ') || "None"}`;
        batchItemDiv.appendChild(stagesP);


        // Release Logic Section
        const releaseActionsDiv = document.createElement('div');
        releaseActionsDiv.classList.add('dashboard-batch-actions-release');

        let currentHighestActiveFix = "";
        let allTasksInHighestFixReleased = false;
        let allTasksInHighestFixCompletable = true; // Assume true until a non-completable task is found

        if (batch.tasksByFix) {
            // Find the highest fix category that has tasks and is not fully released
            FIX_CATEGORIES_ORDER.slice().reverse().forEach(fixCat => {
                if (!currentHighestActiveFix && batch.tasksByFix[fixCat] && batch.tasksByFix[fixCat].length > 0) {
                    currentHighestActiveFix = fixCat;
                    const activeTasksInFix = batch.tasksByFix[fixCat].filter(p => p.status !== "Reassigned_TechAbsent");

                    if (activeTasksInFix.length > 0) {
                        allTasksInHighestFixReleased = activeTasksInFix.every(p => p && p.releasedToNextStage);
                        allTasksInHighestFixCompletable = activeTasksInFix.every(p =>
                            p && (
                                p.status === "Completed" ||
                                p.status === "Day1Ended_AwaitingNext" ||
                                p.status === "Day2Ended_AwaitingNext" ||
                                p.status === "Day3Ended_AwaitingNext"
                            )
                        );
                    } else { // If all tasks were reassigned, consider it releasable but also effectively released
                        allTasksInHighestFixReleased = true;
                        allTasksInHighestFixCompletable = true;
                    }
                }
            });
        }


        if (currentHighestActiveFix && !allTasksInHighestFixReleased) {
            const currentFixIndex = FIX_CATEGORIES_ORDER.indexOf(currentHighestActiveFix);
            if (currentFixIndex < FIX_CATEGORIES_ORDER.length - 1) { // Check if there's a next stage
                const nextFixCategory = FIX_CATEGORIES_ORDER[currentFixIndex + 1];
                const releaseBtn = document.createElement('button');
                releaseBtn.textContent = `Release to ${nextFixCategory}`;
                releaseBtn.classList.add('btn', 'btn-release');
                if (!allTasksInHighestFixCompletable) {
                    releaseBtn.disabled = true;
                    releaseBtn.title = `Not all active tasks in ${currentHighestActiveFix} are 'Completed' or 'Day X Ended'.`;
                }
                releaseBtn.onclick = () => releaseBatchToNextFix(batch.batchId, currentHighestActiveFix, nextFixCategory);
                releaseActionsDiv.appendChild(releaseBtn);
            }
        } else if (allTasksInHighestFixReleased && currentHighestActiveFix && FIX_CATEGORIES_ORDER.indexOf(currentHighestActiveFix) < FIX_CATEGORIES_ORDER.length - 1) {
             const releasedMsg = document.createElement('p');
             releasedMsg.innerHTML = `<small><em>(Active tasks released from ${currentHighestActiveFix})</em></small>`;
             releaseActionsDiv.appendChild(releasedMsg);
        }
        batchItemDiv.appendChild(releaseActionsDiv);


        // Delete Logic Section
        const deleteActionsDiv = document.createElement('div');
        deleteActionsDiv.classList.add('dashboard-batch-actions-delete');
        if (batch.tasksByFix) {
            FIX_CATEGORIES_ORDER.forEach(fixCat => {
                if (batch.tasksByFix[fixCat] && batch.tasksByFix[fixCat].length > 0) {
                    const deleteFixBtn = document.createElement('button');
                    deleteFixBtn.textContent = `Delete ${fixCat} Tasks`;
                    deleteFixBtn.classList.add('btn', 'btn-danger');
                    deleteFixBtn.onclick = () => {
                        if (confirm(`Are you sure you want to delete all ${fixCat} tasks for batch '${batch.baseProjectName || "Unknown"}'? This is IRREVERSIBLE.`)) {
                            deleteSpecificFixTasksForBatch(batch.batchId, fixCat);
                        }
                    };
                    deleteActionsDiv.appendChild(deleteFixBtn);
                }
            });
        }
        const deleteAllBtn = document.createElement('button');
        deleteAllBtn.textContent = "Delete ALL Tasks for this Batch";
        deleteAllBtn.classList.add('btn', 'btn-danger');
        deleteAllBtn.onclick = () => {
            if (confirm(`Are you sure you want to delete ALL tasks for batch '${batch.baseProjectName || "Unknown"}'? This is IRREVERSIBLE.`)) {
                deleteProjectBatch(batch.batchId);
            }
        };
        deleteActionsDiv.appendChild(deleteAllBtn);
        batchItemDiv.appendChild(deleteActionsDiv);

        tlDashboardContentElement.appendChild(batchItemDiv);
    });
}


async function releaseBatchToNextFix(batchId, currentFixCategory, nextFixCategory) {
    showLoading(`Releasing ${currentFixCategory} tasks...`);
    if (!db) {
        alert("Database not initialized!");
        hideLoading();
        return;
    }

    try {
        // Get all tasks in the current fix category for the batch that are not yet released
        const querySnapshot = await db.collection("projects")
            .where("batchId", "==", batchId)
            .where("fixCategory", "==", currentFixCategory)
            .where("releasedToNextStage", "==", false) // Only consider tasks not yet released
            .get();

        if (querySnapshot.empty) {
            alert("No active tasks to release in the current stage for this batch.");
            refreshAllViews(); // Refresh in case UI is out of sync
            return;
        }

        const tasksToProcess = [];
        querySnapshot.forEach(doc => {
            const taskData = doc.data();
            // Exclude tasks marked as 'Reassigned_TechAbsent' from being processed for new stage creation
            // but still mark them as 'releasedToNextStage' to clear them from the current stage view.
            if (taskData.status !== "Reassigned_TechAbsent") {
                 tasksToProcess.push({ id: doc.id, ...taskData });
            }
        });

        if (tasksToProcess.length === 0 && !querySnapshot.empty) { // All were reassigned
             alert("All remaining tasks in this stage were reassigned. Marking them as released.");
        } else if (tasksToProcess.length > 0 && !tasksToProcess.every(task =>
            task && (task.status === "Completed" ||
                     task.status === "Day1Ended_AwaitingNext" ||
                     task.status === "Day2Ended_AwaitingNext" ||
                     task.status === "Day3Ended_AwaitingNext")
        )) {
            alert(`Not all active (non-reassigned) tasks in ${currentFixCategory} are 'Completed', 'Day 1 Ended', 'Day 2 Ended', or 'Day 3 Ended'. Cannot release.`);
            return;
        }


        const firestoreBatch = db.batch();
        const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();

        for (const task of tasksToProcess) { // These are the non-reassigned ones
            if (task && task.id) {
                // Check if a task for the next fix category already exists for this areaTask
                const existingNextFixQuery = await db.collection("projects")
                    .where("batchId", "==", task.batchId)
                    .where("areaTask", "==", task.areaTask)
                    .where("fixCategory", "==", nextFixCategory)
                    .limit(1)
                    .get();

                if (existingNextFixQuery.empty) {
                    // Create new task for the next fix category
                    const newNextFixTask = {
                        batchId: task.batchId,
                        creationTimestamp: task.creationTimestamp, // Preserve original batch creation time
                        fixCategory: nextFixCategory,
                        baseProjectName: task.baseProjectName,
                        areaTask: task.areaTask,
                        gsd: task.gsd,
                        assignedTo: task.assignedTo, // Carry over assignee
                        techNotes: "", // Reset notes
                        status: "Available",
                        startTimeDay1: null, finishTimeDay1: null, durationDay1Ms: null,
                        startTimeDay2: null, finishTimeDay2: null, durationDay2Ms: null,
                        startTimeDay3: null, finishTimeDay3: null, durationDay3Ms: null,
                        releasedToNextStage: false,
                        lastModifiedTimestamp: serverTimestamp,
                        isReassigned: false, // New task is not a reassignment itself
                        originalProjectId: task.id, // Link to the task from the previous stage
                        breakDurationMinutes: 0, // Reset break
                        additionalMinutesManual: 0, // Reset additional time
                    };
                    const newDocRef = db.collection("projects").doc();
                    firestoreBatch.set(newDocRef, newNextFixTask);
                }
                // Mark current task as released (regardless of whether a new one was created)
                 const currentTaskRef = db.collection("projects").doc(task.id);
                 firestoreBatch.update(currentTaskRef, {
                    releasedToNextStage: true,
                    lastModifiedTimestamp: serverTimestamp
                });
            }
        }
         // Also mark any 'Reassigned_TechAbsent' tasks in the current stage as released
        querySnapshot.forEach(doc => {
            if (doc.data().status === "Reassigned_TechAbsent") {
                const reassignedTaskRef = db.collection("projects").doc(doc.id);
                firestoreBatch.update(reassignedTaskRef, {
                    releasedToNextStage: true,
                    lastModifiedTimestamp: serverTimestamp
                });
            }
        });


        await firestoreBatch.commit();
        initializeFirebaseAndLoadData(); // Refresh data and UI
        // renderTLDashboard(); // Also refresh the dashboard view

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
        const querySnapshot = await db.collection("projects").where("batchId", "==", batchId).get();
        if (querySnapshot.empty) {
            console.log("No tasks found for batch ID to delete:", batchId);
            hideLoading();
            return;
        }

        const batch = db.batch();
        querySnapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();

        if (currentSelectedBatchId === batchId) {
            currentSelectedBatchId = ""; // Reset filter if current batch was deleted
            localStorage.setItem('currentSelectedBatchId', "");
        }
        initializeFirebaseAndLoadData(); // Refresh main view
        renderTLDashboard(); // Refresh TL dashboard

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
        const querySnapshot = await db.collection("projects")
            .where("batchId", "==", batchId)
            .where("fixCategory", "==", fixCategory)
            .get();

        if (querySnapshot.empty) {
            console.log(`No ${fixCategory} tasks found for batch ID ${batchId} to delete.`);
            hideLoading();
            return;
        }

        const batch = db.batch();
        querySnapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        initializeFirebaseAndLoadData(); // Refresh main view
        renderTLDashboard(); // Refresh TL dashboard

    } catch (error) {
        console.error(`Error deleting ${fixCategory} for batch ${batchId}:`, error);
        alert("Error deleting specific fix tasks: " + error.message);
    } finally {
        hideLoading();
    }
}

function renderProjects() {
    if (!projectTableBody) {
        console.error("CRITICAL: projectTableBody not found. Cannot render projects.");
        return;
    }
    projectTableBody.innerHTML = ""; // Clear existing rows

    // Sort projects by fix category order, then area task, then status order
    const sortedProjects = [...projects]; // Create a copy to sort
    sortedProjects.sort((a, b) => {
        if (!a || !b) return 0; // Should not happen if data is clean

        // Primary sort: Fix Category
        const fixCategoryIndexA = FIX_CATEGORIES_ORDER.indexOf(a.fixCategory || "");
        const fixCategoryIndexB = FIX_CATEGORIES_ORDER.indexOf(b.fixCategory || "");
        if (fixCategoryIndexA < fixCategoryIndexB) return -1;
        if (fixCategoryIndexA > fixCategoryIndexB) return 1;

        // Secondary sort: Area Task (alphanumerically)
        const areaTaskA = a.areaTask || "";
        const areaTaskB = b.areaTask || "";
        if (areaTaskA < areaTaskB) return -1;
        if (areaTaskA > areaTaskB) return 1;

        // Tertiary sort: Status
        const statusOrderA = STATUS_ORDER[a.status || ""] || 99; // Default to last if unknown
        const statusOrderB = STATUS_ORDER[b.status || ""] || 99;
        if (statusOrderA < statusOrderB) return -1;
        if (statusOrderA > statusOrderB) return 1;

        return 0; // Should be rare if IDs are unique
    });


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
            currentFixCategoryHeader = null; // Reset fix category when batch changes
            const batchRow = projectTableBody.insertRow();
            batchRow.classList.add("batch-header-row");
            const batchCell = batchRow.insertCell();
            batchCell.setAttribute("colspan", NUM_TABLE_COLUMNS.toString());
            batchCell.textContent = `Project Batch: ${project.baseProjectName || "Unknown"} (ID: ${project.batchId.split('_')[1] || "N/A"})`;
        }

        // Fix Category Group Header Row
        if (project.fixCategory !== currentFixCategoryHeader) {
            currentFixCategoryHeader = project.fixCategory;
            const groupKey = `${project.batchId}_${currentFixCategoryHeader}`;

            // Ensure groupVisibilityState has an entry for this new groupKey
            if (typeof groupVisibilityState[groupKey] === 'undefined') {
                groupVisibilityState[groupKey] = { isExpanded: true }; // Default to expanded
                // saveGroupVisibilityState(); // Optionally save immediately, or on toggle
            }


            const groupHeaderRow = projectTableBody.insertRow();
            groupHeaderRow.classList.add("fix-group-header");
            const groupHeaderCell = groupHeaderRow.insertCell();
            groupHeaderCell.setAttribute("colspan", NUM_TABLE_COLUMNS.toString());

            const toggleBtn = document.createElement('button');
            toggleBtn.classList.add('btn', 'btn-group-toggle');
            const isExpanded = groupVisibilityState[groupKey]?.isExpanded !== false; // Default to true if undefined
            toggleBtn.textContent = isExpanded ? "−" : "+"; // Minus for collapse, Plus for expand
            toggleBtn.title = isExpanded ? `Collapse ${currentFixCategoryHeader}` : `Expand ${currentFixCategoryHeader}`;

            groupHeaderCell.appendChild(document.createTextNode(`${currentFixCategoryHeader} `));
            groupHeaderCell.appendChild(toggleBtn);

            // Click listener for the entire cell to toggle
            groupHeaderCell.onclick = (event) => {
                 // Ensure the click is on the cell or the button itself, not other interactive elements if they were added
                if (event.target === groupHeaderCell || event.target === toggleBtn || groupHeaderCell.contains(event.target)) {
                    if (groupVisibilityState[groupKey]) {
                        groupVisibilityState[groupKey].isExpanded = !groupVisibilityState[groupKey].isExpanded;
                        saveGroupVisibilityState();
                        renderProjects(); // Re-render to reflect expanded/collapsed state
                    }
                }
            };
        }

        // Project Data Row
        const row = projectTableBody.insertRow();
        if (groupVisibilityState[`${project.batchId}_${project.fixCategory}`]?.isExpanded === false) {
            row.classList.add("hidden-group-row");
        }
        if (project.fixCategory) {
            row.classList.add(`${project.fixCategory.toLowerCase()}-row`);
        }
        if (project.isReassigned) {
            row.classList.add("reassigned-task-highlight");
        }


        // 1. Fix Category
        row.insertCell().textContent = project.fixCategory || "N/A";

        // 2. Base Project Name
        const projectNameCell = row.insertCell();
        projectNameCell.textContent = project.baseProjectName || "N/A";
        projectNameCell.classList.add("wrap-text"); // For potentially long names

        // 3. Area/Task
        row.insertCell().textContent = project.areaTask || "N/A";

        // 4. GSD
        row.insertCell().textContent = project.gsd || "N/A";

        // 5. Assigned To (Dropdown)
        const assignedToCell = row.insertCell();
        const assignedToSelect = document.createElement('select');
        assignedToSelect.classList.add('assigned-to-select');
        assignedToSelect.disabled = project.status === "Reassigned_TechAbsent";

        const defaultTechOption = document.createElement('option');
        defaultTechOption.value = "";
        defaultTechOption.textContent = "Select Tech ID";
        assignedToSelect.appendChild(defaultTechOption);

        TECH_IDS.forEach(techId => {
            const option = document.createElement('option');
            option.value = techId;
            option.textContent = techId;
            assignedToSelect.appendChild(option);
        });
        assignedToSelect.value = project.assignedTo || "";
        assignedToSelect.onchange = async (event) => {
            showLoading("Updating assignment...");
            const newTechId = event.target.value;
            const oldTechId = project.assignedTo || ""; // For reverting on error
            if (!db || !project.id) {
                alert("Database or project ID missing. Cannot update assignment.");
                event.target.value = oldTechId; // Revert UI
                hideLoading();
                return;
            }
            try {
                await db.collection("projects").doc(project.id).update({
                    assignedTo: newTechId,
                    lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
                project.assignedTo = newTechId; // Update local data for consistency if needed elsewhere
            } catch (error) {
                console.error("Error updating assignedTo:", error);
                alert("Error updating assignment: " + error.message);
                event.target.value = oldTechId; // Revert select value on error
            } finally {
                hideLoading();
            }
        };
        assignedToCell.appendChild(assignedToSelect);


        // 6. Status (Text)
        const statusCell = row.insertCell(); // <<< MODIFIED HERE: Capture the cell
        const statusSpan = document.createElement('span');
        statusSpan.classList.add('status');
        let statusText = (project.status || "Unknown").replace(/([A-Z])(?=[a-z0-9_])/g, ' $1').trim(); // Add spaces before caps

        // Custom status text transformations
        if (project.status === "Day1Ended_AwaitingNext") statusText = "Started Day 1 Ended";
        else if (project.status === "Day2Ended_AwaitingNext") statusText = "Started Day 2 Ended";
        else if (project.status === "Day3Ended_AwaitingNext") statusText = "Started Day 3 Ended";
        else if (project.status === "Reassigned_TechAbsent") statusText = "Re-Assigned";

        statusSpan.textContent = statusText;
        statusSpan.classList.add(`status-${(project.status || "unknown").toLowerCase()}`);
        statusCell.appendChild(statusSpan); // <<< MODIFIED HERE: Append status to its cell


        // Helper function to format Firestore Timestamp or JS Date to HH:MM string
        function formatTime(timestampOrDate) {
            if (!timestampOrDate) return "";
            let date;
            try {
                if (timestampOrDate.toDate && typeof timestampOrDate.toDate === 'function') {
                    date = timestampOrDate.toDate(); // Firestore Timestamp
                } else if (timestampOrDate instanceof Date) {
                    date = timestampOrDate; // JavaScript Date
                } else {
                     date = new Date(timestampOrDate); // Try parsing if string/number
                }
                if (isNaN(date.getTime())) return ""; // Invalid date
            } catch (e) {
                return ""; // Error during conversion
            }
            return date.toTimeString().slice(0, 5); // HH:MM
        }

        // Helper function to handle time input changes
        async function updateTimeField(projectId, fieldName, newValue, projectData) {
            showLoading(`Updating ${fieldName}...`);
            if (!db || !projectId) {
                alert("Database or project ID missing. Cannot update time.");
                hideLoading();
                return;
            }

            let firestoreTimestamp = null;
            if (newValue) { // If newValue is not empty (e.g., "10:30")
                const today = new Date();
                const [hours, minutes] = newValue.split(':').map(Number);
                today.setHours(hours, minutes, 0, 0); // Set seconds and ms to 0 for consistency
                firestoreTimestamp = firebase.firestore.Timestamp.fromDate(today);
            }

            try {
                await db.collection("projects").doc(projectId).update({
                    [fieldName]: firestoreTimestamp,
                    lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
                });

                // After updating time, recalculate duration if applicable
                let updatedProjectData = { ...projectData, [fieldName]: firestoreTimestamp }; // Simulate update
                let durationFieldToUpdate = "";
                let startTimeForCalc = null;
                let finishTimeForCalc = null;

                if (fieldName.includes("Day1")) {
                    durationFieldToUpdate = "durationDay1Ms";
                    startTimeForCalc = updatedProjectData.startTimeDay1;
                    finishTimeForCalc = updatedProjectData.finishTimeDay1;
                } else if (fieldName.includes("Day2")) {
                    durationFieldToUpdate = "durationDay2Ms";
                    startTimeForCalc = updatedProjectData.startTimeDay2;
                    finishTimeForCalc = updatedProjectData.finishTimeDay2;
                } else if (fieldName.includes("Day3")) {
                     durationFieldToUpdate = "durationDay3Ms";
                     startTimeForCalc = updatedProjectData.startTimeDay3;
                     finishTimeForCalc = updatedProjectData.finishTimeDay3;
                }

                if (durationFieldToUpdate && startTimeForCalc && finishTimeForCalc) {
                    const newDuration = calculateDurationMs(startTimeForCalc, finishTimeForCalc);
                    await db.collection("projects").doc(projectId).update({
                        [durationFieldToUpdate]: newDuration,
                        lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
                    });
                     // Note: The onSnapshot listener should pick this up and re-render the total duration.
                }


            } catch (error) {
                console.error(`Error updating ${fieldName}:`, error);
                alert(`Error updating ${fieldName}: ` + error.message);
                // Potentially revert UI input value here if needed
            } finally {
                hideLoading();
            }
        }
        const isTaskDisabled = project.status === "Reassigned_TechAbsent";

        // 7. Start Time Day 1
        const startTime1Cell = row.insertCell();
        const startTime1Input = document.createElement('input');
        startTime1Input.type = 'time';
        startTime1Input.value = formatTime(project.startTimeDay1);
        startTime1Input.disabled = isTaskDisabled;
        startTime1Input.onchange = (event) => updateTimeField(project.id, 'startTimeDay1', event.target.value, project);
        startTime1Cell.appendChild(startTime1Input);

        // 8. Finish Time Day 1
        const finishTime1Cell = row.insertCell();
        const finishTime1Input = document.createElement('input');
        finishTime1Input.type = 'time';
        finishTime1Input.value = formatTime(project.finishTimeDay1);
        finishTime1Input.disabled = isTaskDisabled;
        finishTime1Input.onchange = (event) => updateTimeField(project.id, 'finishTimeDay1', event.target.value, project);
        finishTime1Cell.appendChild(finishTime1Input);


        // 9. Start Time Day 2
        const startTime2Cell = row.insertCell();
        const startTime2Input = document.createElement('input');
        startTime2Input.type = 'time';
        startTime2Input.value = formatTime(project.startTimeDay2);
        startTime2Input.disabled = isTaskDisabled;
        startTime2Input.onchange = (event) => updateTimeField(project.id, 'startTimeDay2', event.target.value, project);
        startTime2Cell.appendChild(startTime2Input);

        // 10. Finish Time Day 2
        const finishTime2Cell = row.insertCell();
        const finishTime2Input = document.createElement('input');
        finishTime2Input.type = 'time';
        finishTime2Input.value = formatTime(project.finishTimeDay2);
        finishTime2Input.disabled = isTaskDisabled;
        finishTime2Input.onchange = (event) => updateTimeField(project.id, 'finishTimeDay2', event.target.value, project);
        finishTime2Cell.appendChild(finishTime2Input);

        // 11. Start Time Day 3
        const startTime3Cell = row.insertCell();
        const startTime3Input = document.createElement('input');
        startTime3Input.type = 'time';
        startTime3Input.value = formatTime(project.startTimeDay3);
        startTime3Input.disabled = isTaskDisabled;
        startTime3Input.onchange = (event) => updateTimeField(project.id, 'startTimeDay3', event.target.value, project);
        startTime3Cell.appendChild(startTime3Input);

        // 12. Finish Time Day 3
        const finishTime3Cell = row.insertCell();
        const finishTime3Input = document.createElement('input');
        finishTime3Input.type = 'time';
        finishTime3Input.value = formatTime(project.finishTimeDay3);
        finishTime3Input.disabled = isTaskDisabled;
        finishTime3Input.onchange = (event) => updateTimeField(project.id, 'finishTimeDay3', event.target.value, project);
        finishTime3Cell.appendChild(finishTime3Input);


        // 13. Total Duration (Calculated, includes breaks and additional time)
        const totalDurationMsDay1 = project.durationDay1Ms || 0;
        const totalDurationMsDay2 = project.durationDay2Ms || 0;
        const totalDurationMsDay3 = project.durationDay3Ms || 0;
        const totalWorkDurationMs = totalDurationMsDay1 + totalDurationMsDay2 + totalDurationMsDay3;
        const breakMs = (project.breakDurationMinutes || 0) * 60000;
        const additionalMs = (project.additionalMinutesManual || 0) * 60000;

        let finalAdjustedDurationMs = Math.max(0, totalWorkDurationMs - breakMs) + additionalMs;
        // If all inputs are zero/null, display N/A instead of 0
        if (totalWorkDurationMs === 0 && (project.breakDurationMinutes || 0) === 0 && (project.additionalMinutesManual || 0) === 0) {
            finalAdjustedDurationMs = null; // So formatMillisToMinutes shows N/A
        }


        const totalDurationCell = row.insertCell();
        totalDurationCell.textContent = formatMillisToMinutes(finalAdjustedDurationMs);
        totalDurationCell.classList.add('total-duration-column');


        // 14. Tech Notes (Textarea)
        const techNotesCell = row.insertCell();
        const techNotesInput = document.createElement('textarea');
        techNotesInput.value = project.techNotes || "";
        techNotesInput.placeholder = "Notes";
        techNotesInput.classList.add('tech-notes-input');
        techNotesInput.rows = 1; // Start small, can expand with CSS if needed
        techNotesInput.id = `techNotes_${project.id}`;
        techNotesInput.disabled = project.status === "Reassigned_TechAbsent";
        techNotesInput.onchange = async (event) => {
            showLoading("Updating tech notes...");
            const newNotes = event.target.value;
            const oldNotes = project.techNotes || "";
             if (!db || !project.id) {
                alert("Database or project ID missing. Cannot update notes.");
                event.target.value = oldNotes; // Revert UI
                hideLoading();
                return;
            }
            try {
                await db.collection("projects").doc(project.id).update({
                    techNotes: newNotes,
                    lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
                project.techNotes = newNotes; // Update local cache
            } catch (error) {
                console.error("Error updating techNotes:", error);
                alert("Error updating tech notes: " + error.message);
                event.target.value = oldNotes; // Revert on error
            } finally {
                hideLoading();
            }
        };
        techNotesCell.appendChild(techNotesInput);


        // 15. Action Buttons & Break Select
        const actionsCell = row.insertCell();
        const actionButtonsDiv = document.createElement('div');
        actionButtonsDiv.classList.add('action-buttons-container'); // For flex layout

        // Break Duration Select
        const breakSelect = document.createElement('select');
        breakSelect.classList.add('break-select');
        breakSelect.id = `breakSelect_${project.id}`;
        breakSelect.title = "Select break time to deduct";
        breakSelect.disabled = isTaskDisabled;
        [
            { value: "0", text: "No Break" },
            { value: "15", text: "15m Break" },
            // { value: "30", text: "30m Break" }, // Add if needed
            { value: "60", text: "1h Break" },
            { value: "90", text: "1h30m Break" }
        ].forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.text;
            breakSelect.appendChild(option);
        });
        breakSelect.value = typeof project.breakDurationMinutes === 'number' ? project.breakDurationMinutes.toString() : "0";
        breakSelect.onchange = async (event) => {
            showLoading("Updating break duration...");
            const newBreakMinutes = parseInt(event.target.value, 10);
            const oldBreakMinutes = project.breakDurationMinutes || 0;
            if (!db || !project.id) {
                alert("Database or project ID missing. Cannot update break duration.");
                event.target.value = oldBreakMinutes.toString();
                hideLoading();
                return;
            }
            try {
                await db.collection("projects").doc(project.id).update({
                    breakDurationMinutes: newBreakMinutes,
                    lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
                // The onSnapshot listener will trigger a re-render, updating total duration
                project.breakDurationMinutes = newBreakMinutes; // Update local cache

                // Manually update the displayed total duration in this row for immediate feedback
                const currentRow = event.target.closest('tr');
                if (currentRow) {
                    const durationDisplayCell = currentRow.querySelector('.total-duration-column');
                    if (durationDisplayCell) {
                        const currentTotalWorkMs = (project.durationDay1Ms || 0) + (project.durationDay2Ms || 0) + (project.durationDay3Ms || 0);
                        const currentAdditionalMs = (project.additionalMinutesManual || 0) * 60000;
                        let newAdjustedDuration = Math.max(0, currentTotalWorkMs - (newBreakMinutes * 60000)) + currentAdditionalMs;
                         if (currentTotalWorkMs === 0 && newBreakMinutes === 0 && (project.additionalMinutesManual || 0) === 0) {
                            newAdjustedDuration = null;
                        }
                        durationDisplayCell.textContent = formatMillisToMinutes(newAdjustedDuration);
                    }
                }


            } catch (error) {
                console.error("Error updating break duration:", error);
                alert("Error updating break duration: " + error.message);
                event.target.value = oldBreakMinutes.toString();
            } finally {
                hideLoading();
            }
        };
        actionButtonsDiv.appendChild(breakSelect);


        // Action Buttons (Start D1, End D1, etc.)
        const createActionButton = (text, className, disabledCondition, action) => {
            const button = document.createElement('button');
            button.textContent = text;
            button.classList.add('btn', className);
            button.disabled = isTaskDisabled || disabledCondition; // Also disable if task is reassigned
            button.onclick = () => { if (project.id) updateProjectState(project.id, action, project); };
            return button;
        };

        actionButtonsDiv.appendChild(createActionButton("Start D1", "btn-day-start", !["Available"].includes(project.status), "startDay1"));
        actionButtonsDiv.appendChild(createActionButton("End D1", "btn-day-end", project.status !== "InProgressDay1", "endDay1"));
        actionButtonsDiv.appendChild(createActionButton("Start D2", "btn-day-start", !["Day1Ended_AwaitingNext"].includes(project.status), "startDay2"));
        actionButtonsDiv.appendChild(createActionButton("End D2", "btn-day-end", project.status !== "InProgressDay2", "endDay2"));
        actionButtonsDiv.appendChild(createActionButton("Start D3", "btn-day-start", !["Day2Ended_AwaitingNext"].includes(project.status), "startDay3"));
        actionButtonsDiv.appendChild(createActionButton("End D3", "btn-day-end", project.status !== "InProgressDay3", "endDay3"));
        actionButtonsDiv.appendChild(createActionButton("Done", "btn-mark-done", project.status === "Completed", "markDone"));


        const reassignBtn = document.createElement('button');
        reassignBtn.textContent = "Re-Assign";
        reassignBtn.classList.add('btn', 'btn-warning');
        reassignBtn.title = "Re-assign task by creating a new entry. Current task will be closed.";
        reassignBtn.disabled = project.status === "Completed" || isTaskDisabled;
        reassignBtn.onclick = () => {
            const currentProjectData = projects.find(p => p.id === project.id); // Get fresh data
            if (currentProjectData) handleReassignment(currentProjectData);
        };
        actionButtonsDiv.appendChild(reassignBtn);

        actionsCell.appendChild(actionButtonsDiv);
    });
}

async function updateProjectState(projectId, action, currentProjectData) {
    showLoading("Updating project state...");
    if (!db || !projectId) {
        alert("Database not initialized or project ID missing for state update.");
        hideLoading();
        return;
    }

    const projectRef = db.collection("projects").doc(projectId);
    let projectSnapshotData;

    // Fetch the latest project data directly, or use provided currentProjectData if fresh enough
    // For critical state changes, always fetching might be safer.
    try {
        const docSnap = await projectRef.get();
        if (!docSnap.exists) {
            console.warn("Project document not found for update:", projectId);
            hideLoading();
            return;
        }
        projectSnapshotData = docSnap.data();
    } catch (error) {
        console.error("Error fetching current project data for state update:", error);
        alert("Error fetching project data: " + error.message);
        hideLoading();
        return;
    }


    if (!projectSnapshotData || projectSnapshotData.status === "Reassigned_TechAbsent") {
        console.warn("Attempted to update a reassigned or invalid project. State update cancelled.");
        hideLoading();
        return; // Do not update reassigned tasks
    }


    const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp(); // For setting times
    const currentTimeMs = Date.now(); // For calculating durations with current time

    let updates = { lastModifiedTimestamp: serverTimestamp };
    let newStatus = projectSnapshotData.status; // Start with current status

    switch (action) {
        case "startDay1":
            if (["Available"].includes(projectSnapshotData.status)) {
                updates = {
                    ...updates,
                    status: "InProgressDay1",
                    startTimeDay1: serverTimestamp,
                    finishTimeDay1: null, durationDay1Ms: null,
                    startTimeDay2: null, finishTimeDay2: null, durationDay2Ms: null, // Reset subsequent days
                    startTimeDay3: null, finishTimeDay3: null, durationDay3Ms: null,
                };
                newStatus = "InProgressDay1";
            }
            break;
        case "endDay1":
            if (projectSnapshotData.status === "InProgressDay1" && projectSnapshotData.startTimeDay1) {
                updates = {
                    ...updates,
                    status: "Day1Ended_AwaitingNext",
                    finishTimeDay1: serverTimestamp,
                    durationDay1Ms: calculateDurationMs(projectSnapshotData.startTimeDay1, currentTimeMs)
                };
                newStatus = "Day1Ended_AwaitingNext";
            } else {
                alert("Cannot end Day 1. Task is not in 'In Progress Day 1' status or start time is missing.");
            }
            break;
        case "startDay2":
            if (["Day1Ended_AwaitingNext"].includes(projectSnapshotData.status)) {
                updates = {
                    ...updates,
                    status: "InProgressDay2",
                    startTimeDay2: serverTimestamp,
                    finishTimeDay2: null, durationDay2Ms: null, // Reset current and subsequent day's end/duration
                    startTimeDay3: null, finishTimeDay3: null, durationDay3Ms: null,
                };
                newStatus = "InProgressDay2";
            }
            break;
        case "endDay2":
            if (projectSnapshotData.status === "InProgressDay2" && projectSnapshotData.startTimeDay2) {
                updates = {
                    ...updates,
                    status: "Day2Ended_AwaitingNext",
                    finishTimeDay2: serverTimestamp,
                    durationDay2Ms: calculateDurationMs(projectSnapshotData.startTimeDay2, currentTimeMs)
                };
                newStatus = "Day2Ended_AwaitingNext";
            } else {
                alert("Cannot end Day 2. Task is not in 'In Progress Day 2' status or start time is missing.");
            }
            break;
         case "startDay3":
            if (["Day2Ended_AwaitingNext"].includes(projectSnapshotData.status)) {
                updates = {
                    ...updates,
                    status: "InProgressDay3",
                    startTimeDay3: serverTimestamp,
                    finishTimeDay3: null, durationDay3Ms: null,
                };
                newStatus = "InProgressDay3";
            }
            break;
        case "endDay3":
            if (projectSnapshotData.status === "InProgressDay3" && projectSnapshotData.startTimeDay3) {
                updates = {
                    ...updates,
                    status: "Day3Ended_AwaitingNext", // Or directly to "Completed" if that's the flow
                    finishTimeDay3: serverTimestamp,
                    durationDay3Ms: calculateDurationMs(projectSnapshotData.startTimeDay3, currentTimeMs)
                };
                newStatus = "Day3Ended_AwaitingNext"; // Or "Completed"
            } else {
                alert("Cannot end Day 3. Task is not in 'In Progress Day 3' status or start time is missing.");
            }
            break;
        case "markDone":
            if (projectSnapshotData.status !== "Completed") {
                updates.status = "Completed";
                newStatus = "Completed";
                // If any day was started but not finished, finish it now.
                if (projectSnapshotData.startTimeDay1 && !projectSnapshotData.finishTimeDay1) {
                    updates.finishTimeDay1 = serverTimestamp;
                    updates.durationDay1Ms = calculateDurationMs(projectSnapshotData.startTimeDay1, currentTimeMs);
                }
                if (projectSnapshotData.startTimeDay2 && !projectSnapshotData.finishTimeDay2) {
                    updates.finishTimeDay2 = serverTimestamp;
                    updates.durationDay2Ms = calculateDurationMs(projectSnapshotData.startTimeDay2, currentTimeMs);
                }
                 if (projectSnapshotData.startTimeDay3 && !projectSnapshotData.finishTimeDay3) {
                    updates.finishTimeDay3 = serverTimestamp;
                    updates.durationDay3Ms = calculateDurationMs(projectSnapshotData.startTimeDay3, currentTimeMs);
                }
                // If task was 'Available' and marked done, all durations remain null unless explicitly set
                if (projectSnapshotData.status === "Available") {
                    updates.startTimeDay1 = updates.startTimeDay1 || null;
                    updates.finishTimeDay1 = updates.finishTimeDay1 || null;
                    updates.durationDay1Ms = updates.durationDay1Ms || null;
                     // etc. for day 2 & 3 ensure they are null if not started
                    updates.startTimeDay2 = null; updates.finishTimeDay2 = null; updates.durationDay2Ms = null;
                    updates.startTimeDay3 = null; updates.finishTimeDay3 = null; updates.durationDay3Ms = null;
                } else if (projectSnapshotData.status === "Day1Ended_AwaitingNext" || projectSnapshotData.status === "InProgressDay1" ) {
                    // if D1 was active or ended, but D2/D3 never started, ensure they are null
                    updates.startTimeDay2 = null; updates.finishTimeDay2 = null; updates.durationDay2Ms = null;
                    updates.startTimeDay3 = null; updates.finishTimeDay3 = null; updates.durationDay3Ms = null;
                } else if (projectSnapshotData.status === "Day2Ended_AwaitingNext" || projectSnapshotData.status === "InProgressDay2") {
                     updates.startTimeDay3 = null; updates.finishTimeDay3 = null; updates.durationDay3Ms = null;
                }


            }
            break;
        default:
            hideLoading();
            console.warn("Unknown action in updateProjectState:", action);
            return; // Don't proceed if action is unknown
    }

    if (Object.keys(updates).length > 1) { // Ensure there's more than just lastModifiedTimestamp
        try {
            await projectRef.update(updates);
            // onSnapshot will handle UI refresh
        } catch (error) {
            console.error(`Error updating project ${projectId} for action ${action}:`, error);
            alert("Error updating project status: " + error.message);
        } finally {
            hideLoading();
        }
    } else {
        hideLoading(); // No actual state change occurred
    }
}

async function handleReassignment(projectToReassign) {
    if (!projectToReassign || !projectToReassign.id ||
        projectToReassign.status === "Reassigned_TechAbsent" ||
        projectToReassign.status === "Completed") {
        alert("Cannot re-assign. Task is already reassigned, completed, or invalid.");
        return;
    }

    const newTechId = prompt(`Re-assigning task for '${projectToReassign.areaTask}'. Enter NEW Tech ID:`, projectToReassign.assignedTo || "");
    if (newTechId === null || newTechId.trim() === "") { // User cancelled or entered empty
        alert("Reassignment cancelled or Tech ID was empty.");
        return;
    }

    if (confirm(`Are you sure you want to create a NEW task for '${newTechId.trim()}' based on this one? The current task (${projectToReassign.areaTask} for ${projectToReassign.assignedTo || 'Unassigned'}) will be closed and marked as 'Re-assigned'.`)) {
        showLoading("Reassigning task...");
        if (!db) {
            alert("Database not initialized! Cannot re-assign.");
            hideLoading();
            return;
        }

        const batch = db.batch();
        const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();

        // 1. Create the new reassigned task
        const newProjectData = {
            batchId: projectToReassign.batchId,
            baseProjectName: projectToReassign.baseProjectName,
            areaTask: projectToReassign.areaTask, // Keep same area/task identifier
            gsd: projectToReassign.gsd,
            fixCategory: projectToReassign.fixCategory,
            assignedTo: newTechId.trim(),
            status: "Available", // New task starts as Available
            startTimeDay1: null, finishTimeDay1: null, durationDay1Ms: null,
            startTimeDay2: null, finishTimeDay2: null, durationDay2Ms: null,
            startTimeDay3: null, finishTimeDay3: null, durationDay3Ms: null,
            techNotes: `Reassigned from ${projectToReassign.assignedTo || "N/A"}. Original Project ID: ${projectToReassign.id}`,
            creationTimestamp: serverTimestamp, // New task has new creation time
            lastModifiedTimestamp: serverTimestamp,
            isReassigned: true, // Mark this new task as being a result of reassignment
            originalProjectId: projectToReassign.id, // Link to the old task
            releasedToNextStage: false, // Starts fresh in its stage
            breakDurationMinutes: 0, // Reset breaks
            additionalMinutesManual: 0, // Reset additional time
        };
        const newProjectRef = db.collection("projects").doc(); // New ID for the reassigned task
        batch.set(newProjectRef, newProjectData);

        // 2. Update the old task to "Reassigned_TechAbsent"
        const oldProjectRef = db.collection("projects").doc(projectToReassign.id);
        batch.update(oldProjectRef, {
            status: "Reassigned_TechAbsent",
            lastModifiedTimestamp: serverTimestamp,
            // Optionally, clear assignedTo or add a note like "Closed due to reassignment"
            // techNotes: (projectToReassign.techNotes || "") + "\nTask closed and reassigned on " + new Date().toLocaleString()
        });

        try {
            await batch.commit();
            initializeFirebaseAndLoadData(); // Refresh the view
        } catch (error) {
            console.error("Error in re-assignment transaction:", error);
            alert("Error during re-assignment: " + error.message);
        } finally {
            hideLoading();
        }
    }
}


function refreshAllViews() {
    try {
        renderProjects();
        // If TL Dashboard is open, refresh it too (optional, depends on desired behavior)
        // if (tlDashboardModal && tlDashboardModal.style.display === 'block') {
        //     renderTLDashboard();
        // }
    } catch (error) {
        console.error("Error during refreshAllViews:", error);
        alert("An error occurred while refreshing the project display. Please check the console.");
        // Potentially clear table body to indicate error state
        if (projectTableBody) projectTableBody.innerHTML = '<tr><td colspan="'+NUM_TABLE_COLUMNS+'" style="color:red; text-align:center;">Error loading projects.</td></tr>';
    }
}

async function renderAllowedEmailsList() {
    if (!allowedEmailsList) {
        console.error("allowedEmailsList element not found.");
        return;
    }
    showLoading("Rendering allowed emails...");
    // Fetch is now done on auth state change or initial load, so we use the cached list
    // await fetchAllowedEmails(); // No longer needed here if already fetched

    allowedEmailsList.innerHTML = ""; // Clear current list

    if (allowedEmailsFromFirestore.length === 0) {
        allowedEmailsList.innerHTML = "<li>No allowed emails configured. Please add at least one.</li>";
        hideLoading();
        return;
    }

    allowedEmailsFromFirestore.forEach(email => {
        const li = document.createElement('li');
        li.textContent = email;

        const removeBtn = document.createElement('button');
        removeBtn.textContent = "Remove";
        removeBtn.classList.add('btn', 'btn-danger', 'btn-small');
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

    if (!emailToAdd || !emailToAdd.includes('@') || !emailToAdd.includes('.')) { // Basic validation
        alert("Please enter a valid email address (e.g., user@example.com).");
        hideLoading();
        return;
    }

    if (allowedEmailsFromFirestore.map(e => e.toLowerCase()).includes(emailToAdd)) {
        alert("This email is already in the allowed list.");
        hideLoading();
        return;
    }

    const success = await updateAllowedEmailsInFirestore([...allowedEmailsFromFirestore, emailToAdd].sort());
    if (success) {
        addEmailInput.value = ""; // Clear input
        renderAllowedEmailsList(); // Re-render the list
    }
    // hideLoading() is called within updateAllowedEmailsInFirestore
}

async function handleRemoveEmail(emailToRemove) {
    if (confirm(`Are you sure you want to remove ${emailToRemove} from the allowed list? This will prevent them from logging in.`)) {
        showLoading("Removing email...");
        const success = await updateAllowedEmailsInFirestore(allowedEmailsFromFirestore.filter(email => email !== emailToRemove));
        if (success) {
            renderAllowedEmailsList(); // Re-render
        }
        // hideLoading() is called within updateAllowedEmailsInFirestore
    }
}

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
        const projectsSnapshot = await db.collection("projects").get();
        let allProjectsData = [];
        projectsSnapshot.forEach(doc => {
            if (doc.exists && typeof doc.data === 'function') {
                allProjectsData.push({ id: doc.id, ...doc.data() });
            }
        });

        const projectFixCategoryTotals = {}; // Key: projectname_fixcategory, Value: { projectName, fixCategory, totalMinutes }
        const overallProjectTotals = {}; // Key: projectname, Value: { projectName, totalMinutes }

        allProjectsData.forEach(p => {
            // Ensure numeric values for durations and adjustments
            const dur1 = typeof p.durationDay1Ms === 'number' ? p.durationDay1Ms : 0;
            const dur2 = typeof p.durationDay2Ms === 'number' ? p.durationDay2Ms : 0;
            const dur3 = typeof p.durationDay3Ms === 'number' ? p.durationDay3Ms : 0;
            const breakMins = typeof p.breakDurationMinutes === 'number' ? p.breakDurationMinutes : 0;
            const addMins = typeof p.additionalMinutesManual === 'number' ? p.additionalMinutesManual : 0;

            const totalWorkMs = dur1 + dur2 + dur3;
            const breakMs = breakMins * 60000;
            const additionalMs = addMins * 60000;
            let adjustedNetMs = Math.max(0, totalWorkMs - breakMs) + additionalMs;

            // Skip if no effective time contributed
            if (adjustedNetMs <= 0 && breakMins === 0 && addMins === 0 && totalWorkMs === 0) {
                return;
            }
            const minutes = Math.floor(adjustedNetMs / 60000);
            if (minutes <= 0) return; // Only count positive minutes

            const projName = p.baseProjectName || "Unknown Project";
            const fixCat = p.fixCategory || "Unknown Fix";
            const summaryKey = `${projName}_${fixCat}`;

            // Project + Fix Category Total
            if (!projectFixCategoryTotals[summaryKey]) {
                projectFixCategoryTotals[summaryKey] = { projectName: projName, fixCategory: fixCat, totalMinutes: 0 };
            }
            projectFixCategoryTotals[summaryKey].totalMinutes += minutes;

            // Overall Project Total
            if (!overallProjectTotals[projName]) {
                overallProjectTotals[projName] = { projectName: projName, totalMinutes: 0 };
            }
            overallProjectTotals[projName].totalMinutes += minutes;
        });

        let summaryHtml = '<ul style="list-style: none; padding: 0;">';

        // Overall Totals First
        const sortedOverallKeys = Object.keys(overallProjectTotals).sort();
        if (sortedOverallKeys.length > 0) {
            summaryHtml += "<h3>Overall Project Totals (All Fix Categories)</h3>";
            sortedOverallKeys.forEach(key => {
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
        const sortedFixCatKeys = Object.keys(projectFixCategoryTotals).sort();

        if (sortedFixCatKeys.length > 0) {
            sortedFixCatKeys.forEach(key => {
                const data = projectFixCategoryTotals[key];
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


        if (sortedFixCatKeys.length === 0 && sortedOverallKeys.length === 0) {
            summaryHtml = "<p>No project time data found to generate a summary.</p>";
        } else {
             summaryHtml += "</ul>";
        }


        tlSummaryContent.innerHTML = summaryHtml;

    } catch (error) {
        console.error("Error generating TL Summary:", error);
        tlSummaryContent.innerHTML = `<p style="color:red;">Error generating summary: ${error.message}</p>`;
        alert("Error generating TL Summary: " + error.message);
    } finally {
        hideLoading();
    }
}


// --- AUTHENTICATION ---
function setupAuthEventListeners() {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('email'); // Ensure email scope is requested

    if (signInBtn) {
        signInBtn.addEventListener('click', () => {
            showLoading("Signing in...");
            if (!auth) {
                console.error("Auth not initialized");
                hideLoading();
                return;
            }
            auth.signInWithPopup(provider)
                .then((result) => {
                    // This is handled by onAuthStateChanged, but good for logging
                    console.log("Sign-in attempt successful for: ", result.user.email);
                    // onAuthStateChanged will take care of UI updates and data loading
                })
                .catch((error) => {
                    console.error("Sign-in error: ", error);
                    let errorMessage = "Error signing in: " + error.message;
                    if (error.code === 'auth/popup-closed-by-user') {
                        errorMessage = "Sign-in process was cancelled. Please try again.";
                    } else if (error.code === 'auth/cancelled-popup-request') {
                         errorMessage = "Sign-in process was interrupted. Please try again.";
                    } else if (error.code === 'auth/popup-blocked') {
                        errorMessage = "Sign-in pop-up was blocked by the browser. Please allow pop-ups for this site and try again.";
                    } else if (error.code === 'auth/network-request-failed') {
                        errorMessage = "Network error. Please check your internet connection.";
                    }
                    alert(errorMessage);

                    // Ensure UI reflects signed-out state on critical sign-in failure
                    if (userInfoDisplayDiv && signInBtn && appContentDiv && loadingAuthMessageDiv) {
                        userInfoDisplayDiv.style.display = 'none';
                        signInBtn.style.display = 'block';
                        appContentDiv.style.display = 'none';
                        loadingAuthMessageDiv.innerHTML = "<p>Please sign in to access the Project Tracker.</p>";
                        loadingAuthMessageDiv.style.display = 'block';
                    }
                    hideLoading();
                });
        });
    } else {
        console.error("Sign-in button not found during event listener setup.");
    }

    if (signOutBtn) {
        signOutBtn.addEventListener('click', () => {
            showLoading("Signing out...");
            if (!auth) {
                console.error("Auth not initialized");
                hideLoading();
                return;
            }
            auth.signOut()
                .then(() => {
                    console.log("User signed out successfully by clicking button.");
                    // onAuthStateChanged will handle UI reset and data clearing.
                })
                .catch((error) => {
                    console.error("Sign-out error: ", error);
                    alert("Error signing out: " + error.message);
                    hideLoading(); // Still hide loading on error
                });
        });
    } else {
        console.error("Sign-out button not found during event listener setup.");
    }
}


function initializeAppComponents() {
    if (isAppInitialized) {
        console.log("App components already initialized. Re-initializing data load.");
        initializeFirebaseAndLoadData(); // Re-fetch data with current filters
    } else {
        console.log("Initializing app components (DOM refs, event listeners, Firestore data)...");
        setupDOMReferences(); // Ensure all DOM refs are fresh
        attachEventListeners(); // Attach all event listeners
        initializeFirebaseAndLoadData(); // Initial data load
        isAppInitialized = true;
    }
}


if (auth) { // Only proceed if Firebase Auth was initialized
    auth.onAuthStateChanged(async (user) => {
        // Ensure basic auth UI elements are set up before trying to use them
        setupDOMReferences(); // Call this first to ensure all general DOM elements are available
        setupAuthRelatedDOMReferences(); // Then setup specific auth-related ones

        // Critical check for UI elements needed for auth state changes
        if (!userNameP || !userEmailP || !userPhotoImg || !userInfoDisplayDiv ||
            !signInBtn || !appContentDiv || !loadingAuthMessageDiv || !openSettingsBtn) {
            console.error("One or more critical UI elements for auth state change not found. Aborting UI update.");
            const loadingMsgElem = document.getElementById('loading-auth-message') || loadingAuthMessageDiv;
            if(loadingMsgElem) {
                loadingMsgElem.innerHTML = '<p style="color:red; font-weight:bold;">UI Error: Critical elements missing. Please refresh.</p>';
                loadingMsgElem.style.display = 'block';
            }
            hideLoading();
            return;
        }


        if (user) {
            showLoading("Checking authorization...");
            await fetchAllowedEmails(); // Ensure we have the latest list
            const userEmailLower = user.email ? user.email.toLowerCase() : "";

            if (user.email && allowedEmailsFromFirestore.map(e => e.toLowerCase()).includes(userEmailLower)) {
                console.log("Auth state changed: User is SIGNED IN and ALLOWED - ", user.displayName, user.email);
                userNameP.textContent = user.displayName || "Name not available";
                userEmailP.textContent = user.email || "Email not available";
                if (userPhotoImg) userPhotoImg.src = user.photoURL || 'default-user.png'; // Simple default
                userInfoDisplayDiv.style.display = 'flex';
                signInBtn.style.display = 'none';
                loadingAuthMessageDiv.style.display = 'none';
                appContentDiv.style.display = 'block';
                if (openSettingsBtn) openSettingsBtn.style.display = 'block'; // Show settings if allowed

                initializeAppComponents(); // Load data, setup listeners etc.

            } else {
                console.warn("Auth state changed: User SIGNED IN but NOT ALLOWED - ", user.email);
                alert("Access Denied: Your email address (" + (user.email || "N/A") + ") is not authorized to use this application. You will be signed out.");
                auth.signOut().then(() => {
                    console.log("Unauthorized user automatically signed out.");
                    loadingAuthMessageDiv.innerHTML = "<p>Access Denied. Please sign in with an authorized account.</p>";
                    // Reset UI to signed-out state
                    userInfoDisplayDiv.style.display = 'none';
                    signInBtn.style.display = 'block';
                    appContentDiv.style.display = 'none';
                    loadingAuthMessageDiv.style.display = 'block';
                    if (openSettingsBtn) openSettingsBtn.style.display = 'none';

                    projects = []; // Clear data
                    if (projectTableBody) projectTableBody.innerHTML = "";
                    if (tlDashboardContentElement) tlDashboardContentElement.innerHTML = "";
                    if (allowedEmailsList) allowedEmailsList.innerHTML = "";

                    if (firestoreListenerUnsubscribe) {
                        firestoreListenerUnsubscribe();
                        firestoreListenerUnsubscribe = null;
                        console.log("Firestore listener detached for unauthorized user sign out.");
                    }
                    isAppInitialized = false; // Reset app state
                    hideLoading();
                }).catch(err => {
                    console.error("Error signing out unauthorized user:", err);
                    alert("Access Denied. Error during sign out: "+ err.message + " Please refresh.");
                    // Still try to reset UI
                    userInfoDisplayDiv.style.display = 'none';
                    signInBtn.style.display = 'block';
                    appContentDiv.style.display = 'none';
                    loadingAuthMessageDiv.innerHTML = "<p>Access Denied. Error during sign out. Please refresh.</p>";
                    loadingAuthMessageDiv.style.display = 'block';
                    if (openSettingsBtn) openSettingsBtn.style.display = 'none';
                    hideLoading();
                });
            }
        } else {
            // User is signed out
            console.log("Auth state changed: User is SIGNED OUT");
            userNameP.textContent = "";
            userEmailP.textContent = "";
            if (userPhotoImg) userPhotoImg.src = "";
            userInfoDisplayDiv.style.display = 'none';
            signInBtn.style.display = 'block';
            appContentDiv.style.display = 'none';
            if (openSettingsBtn) openSettingsBtn.style.display = 'none';

            // Only update loading message if it's not already showing an access denied message
            if (loadingAuthMessageDiv.innerHTML.indexOf("Access Denied") === -1) {
                 loadingAuthMessageDiv.innerHTML = "<p>Please sign in to access the Project Tracker.</p>";
            }
            loadingAuthMessageDiv.style.display = 'block';


            projects = []; // Clear data
            if (projectTableBody) projectTableBody.innerHTML = "";
            if (tlDashboardContentElement) tlDashboardContentElement.innerHTML = "";
            if (allowedEmailsList) allowedEmailsList.innerHTML = "";

            if (firestoreListenerUnsubscribe) {
                firestoreListenerUnsubscribe();
                firestoreListenerUnsubscribe = null;
                console.log("Firestore listener detached on sign out.");
            }
            isAppInitialized = false; // Reset app state
            console.log("App content hidden, project data cleared, and Firestore listener detached.");
            hideLoading();
        }
    });
} else {
    console.error("Firebase Auth is not initialized. UI updates based on auth state will not occur.");
    const loadingMessageElement = document.getElementById('loading-auth-message');
    if (loadingMessageElement) {
        loadingMessageElement.innerHTML = '<p style="color:red; font-weight:bold;">Authentication services could not be loaded. Please check the console and refresh.</p>';
        loadingMessageElement.style.display = 'block';
    }
}


// DOMContentLoaded listener to kick things off
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded.");
    setupDOMReferences(); // Initial DOM references setup
    setupAuthRelatedDOMReferences(); // Auth specific DOM references

    if (auth) { // Check if Firebase Auth was initialized successfully earlier
        setupAuthEventListeners(); // Setup sign-in/out button listeners
        console.log("Auth UI and event listeners set up on DOMContentLoaded.");
        // onAuthStateChanged will handle the rest based on current auth state
    } else {
        console.error("Firebase Auth not available on DOMContentLoaded. Auth UI setup skipped.");
        const authContainer = document.getElementById('auth-container'); // Or a more general app container
        const loadingMsg = loadingAuthMessageDiv || document.getElementById('loading-auth-message'); // Try to get it again
        if (authContainer && loadingMsg) {
            loadingMsg.innerHTML = '<p style="color:red; font-weight:bold;">Authentication services could not be loaded. Please check console and refresh.</p>';
            loadingMsg.style.display = 'block';
            if (signInBtn) signInBtn.style.display = 'none'; // Hide sign-in if auth failed to load
        }
    }
});
