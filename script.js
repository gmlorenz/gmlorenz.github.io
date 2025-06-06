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
    // Check if Firebase and its services are loaded
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
    fetchAllowedEmails(); // Initial fetch of allowed emails

} catch (error) {
    console.error("CRITICAL: Error initializing Firebase: ", error.message);
    const loadingMessageElement = document.getElementById('loading-auth-message');
    if (loadingMessageElement) {
        // Display error message to the user if Firebase fails to initialize
        loadingMessageElement.innerHTML = `<p style="color:red;">CRITICAL ERROR: Could not connect to Firebase. App will not function correctly. Error: ${error.message}</p>`;
    } else {
        // Fallback alert if the specific loading message element isn't found
        alert("CRITICAL ERROR: Could not connect to Firebase. App will not function correctly. Error: " + error.message);
    }
}

// Define the order of fix categories for sorting and display
const FIX_CATEGORIES_ORDER = ["Fix1", "Fix2", "Fix3", "Fix4", "Fix5", "Fix6"];
// Define colors for each fix category for row highlighting
const FIX_CATEGORY_COLORS = {
    "Fix1": "#FFFFE0", // Light Yellow
    "Fix2": "#ADD8E6", // Light Blue
    "Fix3": "#90EE90", // Light Green
    "Fix4": "#FFB6C1", // Light Pink
    "Fix5": "#FFDAB9", // Peach Puff (Light Orange)
    "Fix6": "#E6E6FA", // Lavender (Light Purple)
    "default": "#FFFFFF" // White for any unspecified category
};

// Define order for project statuses, mainly for potential future sorting or logic
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
const NUM_TABLE_COLUMNS = 15; // Number of columns in the main project table, used for colspan

// DOM Element variables
let openAddNewProjectBtn, openTlDashboardBtn, openSettingsBtn;
let projectFormModal, tlDashboardModal, settingsModal;
let closeProjectFormBtn, closeTlDashboardBtn, closeSettingsBtn;
let newProjectForm, projectTableBody, tlDashboardContentElement;
let allowedEmailsList, addEmailInput, addEmailBtn;
let tlSummaryModal, closeTlSummaryBtn, tlSummaryContent, openTlSummaryBtn;

let projects = []; // Array to hold project data fetched from Firestore
let groupVisibilityState = {}; // Object to store the expanded/collapsed state of project groups
let isAppInitialized = false; // Flag to track if the main app components have been initialized
let firestoreListenerUnsubscribe = null; // Function to unsubscribe from Firestore listener

// Filter element variables and their current selected values
let batchIdSelect, fixCategoryFilter, monthFilter;
let currentSelectedBatchId = localStorage.getItem('currentSelectedBatchId') || "";
let currentSelectedFixCategory = "";
let currentSelectedMonth = localStorage.getItem('currentSelectedMonth') || "";

// Function to show a loading overlay with a message
function showLoading(message = "Loading...") {
    if (loadingOverlay) {
        const p = loadingOverlay.querySelector('p');
        if (p) p.textContent = message;
        loadingOverlay.style.display = 'flex';
    }
}

// Function to hide the loading overlay
function hideLoading() {
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
    }
}

// Function to generate a simple unique ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// Function to format milliseconds into minutes string
function formatMillisToMinutes(millis) {
    if (millis === null || typeof millis !== 'number' || millis < 0) {
        return "N/A"; // Return "N/A" for invalid input
    }
    return Math.floor(millis / 60000); // Convert milliseconds to minutes
}

// Function to calculate duration in milliseconds between a start and finish time
function calculateDurationMs(startTime, finishTime) {
    let startMillis = startTime;
    let finishMillis = finishTime;

    // Convert Firestore Timestamps to milliseconds if necessary
    if (startTime && typeof startTime.toMillis === 'function') {
        startMillis = startTime.toMillis();
    }
    if (finishTime && typeof finishTime.toMillis === 'function') {
        finishMillis = finishTime.toMillis();
    }
    
    // Validate inputs before calculation
    if (typeof startMillis !== 'number' || typeof finishMillis !== 'number' || finishMillis < startMillis) {
        return null; // Return null if inputs are invalid or finish is before start
    }
    return finishMillis - startMillis; // Calculate duration
}

// Function to load the visibility state of project groups from localStorage
function loadGroupVisibilityState() {
    try {
        const storedState = localStorage.getItem('projectTrackerGroupVisibility');
        groupVisibilityState = storedState ? JSON.parse(storedState) : {};
    } catch (error) {
        console.error("Error parsing group visibility state from localStorage:", error);
        groupVisibilityState = {}; // Default to empty state on error
    }
}

// Function to save the visibility state of project groups to localStorage
function saveGroupVisibilityState() {
    try {
        localStorage.setItem('projectTrackerGroupVisibility', JSON.stringify(groupVisibilityState));
    } catch (error) {
        console.error("Error saving group visibility state to localStorage:", error);
        alert("Warning: Could not save your group visibility preferences.");
    }
}

// Function to fetch the list of allowed email addresses from Firestore
async function fetchAllowedEmails() {
    showLoading("Fetching allowed emails...");
    if (!db) {
        console.error("Firestore (db) not initialized. Cannot fetch allowed emails.");
        hideLoading();
        return;
    }
    try {
        const docRef = db.doc(ALLOWED_EMAILS_DOC_REF_PATH); // Firestore document path
        const docSnap = await docRef.get();
        if (docSnap.exists) {
            allowedEmailsFromFirestore = docSnap.data().emails || [];
        } else {
            // Default list if the document doesn't exist (e.g., first run)
            console.warn(`Document ${ALLOWED_EMAILS_DOC_REF_PATH} does not exist. No emails loaded initially.`);
            allowedEmailsFromFirestore = ["ev.lorens.ebrado@gmail.com"]; // Example default
        }
    } catch (error) {
        console.error("Error fetching allowed emails:", error);
        allowedEmailsFromFirestore = ["ev.lorens.ebrado@gmail.com"]; // Fallback on error
    } finally {
        hideLoading();
    }
}

// Function to update the list of allowed email addresses in Firestore
async function updateAllowedEmailsInFirestore(emailsArray) {
    showLoading("Updating allowed emails...");
    if (!db) {
        alert("Database not initialized! Cannot update allowed emails.");
        hideLoading();
        return false;
    }
    const docRef = db.doc(ALLOWED_EMAILS_DOC_REF_PATH);
    try {
        await docRef.set({ emails: emailsArray }); // Set the new array of emails
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

// Main function to initialize Firebase listeners and load project data based on filters
async function initializeFirebaseAndLoadData() {
    showLoading("Loading projects...");
    if (!db) {
        console.error("Firestore (db) not initialized. Cannot load project data.");
        projects = [];
        refreshAllViews();
        hideLoading();
        return;
    }

    // Unsubscribe from any existing listener to prevent duplicates
    if (firestoreListenerUnsubscribe) {
        firestoreListenerUnsubscribe();
        firestoreListenerUnsubscribe = null;
    }

    loadGroupVisibilityState(); // Load group visibility preferences

    // Populate Month Filter: Fetch all projects to determine unique months
    let allProjectsForMonthFilterQuery = db.collection("projects").orderBy("creationTimestamp", "desc");
    try {
        const allProjectsSnapshot = await allProjectsForMonthFilterQuery.get();
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
            monthFilter.innerHTML = '<option value="">All Months</option>'; // Default option
            Array.from(uniqueMonths).sort((a, b) => b.localeCompare(a)).forEach(monthYear => { // Sort newest first
                const [year, month] = monthYear.split('-');
                const date = new Date(year, parseInt(month) - 1, 1);
                const option = document.createElement('option');
                option.value = monthYear;
                option.textContent = date.toLocaleString('en-US', { year: 'numeric', month: 'long' });
                monthFilter.appendChild(option);
            });
            // Restore previously selected month if it exists
            if (currentSelectedMonth && Array.from(uniqueMonths).includes(currentSelectedMonth)) {
                monthFilter.value = currentSelectedMonth;
            } else {
                currentSelectedMonth = ""; // Reset if not found
                monthFilter.value = "";
                localStorage.setItem('currentSelectedMonth', "");
            }
        }
    } catch (error) {
        console.error("Error populating month filter:", error);
    }

    // Populate Project Name (Batch ID) Filter: Based on selected month (if any)
    let queryForProjectNames = db.collection("projects");
    if (currentSelectedMonth && monthFilter && monthFilter.value) {
        const [year, month] = currentSelectedMonth.split('-');
        const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
        const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999); // End of the month
        queryForProjectNames = queryForProjectNames.where("creationTimestamp", ">=", startDate)
                                                  .where("creationTimestamp", "<=", endDate);
    }

    try {
        const projectNamesSnapshot = await queryForProjectNames.get();
        const uniqueBaseProjectNames = new Set();
        projectNamesSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.baseProjectName) {
                uniqueBaseProjectNames.add(data.baseProjectName);
            }
        });
        const sortedBaseProjectNames = Array.from(uniqueBaseProjectNames).sort();

        if (batchIdSelect) {
            batchIdSelect.innerHTML = '<option value="">All Projects</option>'; // Default option
            sortedBaseProjectNames.forEach(projectName => {
                const option = document.createElement('option');
                option.value = projectName;
                option.textContent = projectName;
                batchIdSelect.appendChild(option);
            });
            // Restore previously selected project name if it exists
            if (currentSelectedBatchId && sortedBaseProjectNames.includes(currentSelectedBatchId)) {
                batchIdSelect.value = currentSelectedBatchId;
            } else {
                batchIdSelect.value = ""; // Reset if not found
                currentSelectedBatchId = "";
                localStorage.setItem('currentSelectedBatchId', "");
            }
        }
    } catch (error) {
        console.error("Error populating project name filter:", error);
        if (batchIdSelect) {
            batchIdSelect.innerHTML = '<option value="" disabled selected>Error loading projects</option>';
        }
    }

    // Construct the main query for fetching projects based on all active filters
    let projectsQuery = db.collection("projects");
    if (currentSelectedMonth && monthFilter && monthFilter.value) {
        const [year, month] = currentSelectedMonth.split('-');
        const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
        const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999);
        projectsQuery = projectsQuery.where("creationTimestamp", ">=", startDate).where("creationTimestamp", "<=", endDate);
    }
    if (currentSelectedBatchId && batchIdSelect && batchIdSelect.value !== "") {
        projectsQuery = projectsQuery.where("baseProjectName", "==", currentSelectedBatchId);
    }
    if (currentSelectedFixCategory && fixCategoryFilter && fixCategoryFilter.value) {
        projectsQuery = projectsQuery.where("fixCategory", "==", currentSelectedFixCategory);
    }
    projectsQuery = projectsQuery.orderBy("creationTimestamp", "desc"); // Order by creation time

    // Set up Firestore real-time listener
    try {
        firestoreListenerUnsubscribe = projectsQuery.onSnapshot(snapshot => {
            const newProjects = [];
            snapshot.forEach(doc => {
                if (doc.exists && typeof doc.data === 'function') {
                    newProjects.push({ id: doc.id, ...doc.data() });
                }
            });
            projects = newProjects; // Update local projects array
            // Ensure essential project fields have default values if undefined
            projects.forEach(project => {
                if (typeof project.breakDurationMinutes === 'undefined') project.breakDurationMinutes = 0;
                if (typeof project.additionalMinutesManual === 'undefined') project.additionalMinutesManual = 0;
                if (typeof project.startTimeDay3 === 'undefined') project.startTimeDay3 = null;
                if (typeof project.finishTimeDay3 === 'undefined') project.finishTimeDay3 = null;
                if (typeof project.durationDay3Ms === 'undefined') project.durationDay3Ms = null;
            });
            refreshAllViews(); // Re-render the UI with new data
        }, error => {
            console.error("Error fetching projects with onSnapshot: ", error);
            projects = []; // Clear projects on error
            refreshAllViews();
            alert("Error loading projects: " + error.message);
        });
    } catch (error) {
        console.error("Error setting up Firebase listener: ", error);
        alert("CRITICAL ERROR: Could not set up real-time project updates. Error: " + error.message);
    } finally {
        hideLoading();
    }
}

// Function to get references to all necessary DOM elements
function setupDOMReferences() {
    openAddNewProjectBtn = document.getElementById('openAddNewProjectBtn');
    openTlDashboardBtn = document.getElementById('openTlDashboardBtn');
    openSettingsBtn = document.getElementById('openSettingsBtn');
    openTlSummaryBtn = document.getElementById('openTlSummaryBtn');
    projectFormModal = document.getElementById('projectFormModal');
    tlDashboardModal = document.getElementById('tlDashboardModal');
    settingsModal = document.getElementById('settingsModal');
    tlSummaryModal = document.getElementById('tlSummaryModal');
    closeProjectFormBtn = document.getElementById('closeProjectFormBtn');
    closeTlDashboardBtn = document.getElementById('closeTlDashboardBtn');
    closeSettingsBtn = document.getElementById('closeSettingsBtn');
    closeTlSummaryBtn = document.getElementById('closeTlSummaryBtn');
    newProjectForm = document.getElementById('newProjectForm');
    projectTableBody = document.getElementById('projectTableBody');
    tlDashboardContentElement = document.getElementById('tlDashboardContent');
    allowedEmailsList = document.getElementById('allowedEmailsList');
    addEmailInput = document.getElementById('addEmailInput');
    addEmailBtn = document.getElementById('addEmailBtn');
    tlSummaryContent = document.getElementById('tlSummaryContent');
    loadingOverlay = document.getElementById('loadingOverlay');
    batchIdSelect = document.getElementById('batchIdSelect');
    fixCategoryFilter = document.getElementById('fixCategoryFilter');
    monthFilter = document.getElementById('monthFilter');
}

// Function to get references to DOM elements related to authentication
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

// Function to attach event listeners to interactive elements
function attachEventListeners() {
    // Button to open "Add New Project" modal (PIN protected)
    if (openAddNewProjectBtn) {
        openAddNewProjectBtn.onclick = () => {
            const pin = prompt("Enter PIN to add new tracker:");
            if (pin !== TL_DASHBOARD_PIN) {
                alert("Incorrect PIN.");
                return;
            }
            if (projectFormModal) projectFormModal.style.display = 'block';
        };
    }

    // Button to open "Project Settings" (TL Dashboard) modal (PIN protected)
    if (openTlDashboardBtn) {
        openTlDashboardBtn.onclick = () => {
            const pin = prompt("Enter PIN to access Project Settings:");
            if (pin === TL_DASHBOARD_PIN) {
                if (tlDashboardModal) tlDashboardModal.style.display = 'block';
                renderTLDashboard(); // Render dashboard content
            } else {
                alert("Incorrect PIN.");
            }
        };
    }

    // Button to open "User Settings" modal (PIN protected)
    if (openSettingsBtn) {
        openSettingsBtn.onclick = () => {
            const pin = prompt("Enter PIN to access User Settings:");
            if (pin === TL_DASHBOARD_PIN) {
                if (settingsModal) settingsModal.style.display = 'block';
                renderAllowedEmailsList(); // Render allowed emails list
            } else {
                alert("Incorrect PIN.");
            }
        };
    }

    // Button to open "TL Summary" modal
     if (openTlSummaryBtn) {
        openTlSummaryBtn.onclick = () => {
            if (tlSummaryModal) tlSummaryModal.style.display = 'block';
            generateTlSummaryData(); // Generate and display summary
        };
    }

    // Close buttons for modals
    if (closeProjectFormBtn) {
        closeProjectFormBtn.onclick = () => {
            if (newProjectForm) newProjectForm.reset(); // Reset form on close
            if (projectFormModal) projectFormModal.style.display = 'none';
        };
    }
    if (closeTlDashboardBtn) {
        closeTlDashboardBtn.onclick = () => {
            if (tlDashboardModal) tlDashboardModal.style.display = 'none';
        };
    }
    if (closeSettingsBtn) {
        closeSettingsBtn.onclick = () => {
            if (settingsModal) settingsModal.style.display = 'none';
        };
    }
    if (closeTlSummaryBtn) {
        closeTlSummaryBtn.onclick = () => {
            if (tlSummaryModal) tlSummaryModal.style.display = 'none';
        };
    }

    // Button to add a new allowed email
    if (addEmailBtn) {
        addEmailBtn.onclick = handleAddEmail;
    }

    // Filter change event listeners
    if (batchIdSelect) {
        batchIdSelect.onchange = (event) => {
            currentSelectedBatchId = event.target.value;
            localStorage.setItem('currentSelectedBatchId', currentSelectedBatchId); // Save preference
            initializeFirebaseAndLoadData(); // Reload data with new filter
        };
    }
    if (fixCategoryFilter) {
        fixCategoryFilter.onchange = (event) => {
            currentSelectedFixCategory = event.target.value;
            // No localStorage for this filter as it's less persistent
            initializeFirebaseAndLoadData();
        };
    }
     if (monthFilter) {
        monthFilter.onchange = (event) => {
            currentSelectedMonth = event.target.value;
            localStorage.setItem('currentSelectedMonth', currentSelectedMonth);
            currentSelectedBatchId = ""; // Reset project name filter when month changes
            localStorage.setItem('currentSelectedBatchId', "");
            initializeFirebaseAndLoadData();
        };
    }

    // Close modals if user clicks outside of them
    if (typeof window !== 'undefined') {
        window.onclick = (event) => {
            if (event.target == projectFormModal) projectFormModal.style.display = 'none';
            if (event.target == tlDashboardModal) tlDashboardModal.style.display = 'none';
            if (event.target == settingsModal) settingsModal.style.display = 'none';
            if (event.target == tlSummaryModal) tlSummaryModal.style.display = 'none';
        };
    }

    // Event listener for new project form submission
    if (newProjectForm) {
        newProjectForm.addEventListener('submit', handleAddProjectSubmit);
    }

    setupAuthEventListeners(); // Set up Firebase Auth event listeners
}

// Handles submission of the "Add New Project" form
async function handleAddProjectSubmit(event) {
    event.preventDefault(); // Prevent default form submission
    showLoading("Adding project(s)...");

    if (!db) {
        alert("Database not initialized!");
        hideLoading();
        return;
    }

    // Get form values
    const fixCategory = document.getElementById('fixCategorySelect').value;
    const numRows = parseInt(document.getElementById('numRows').value, 10);
    const baseProjectName = document.getElementById('baseProjectName').value.trim();
    const gsd = document.getElementById('gsd').value;

    if (!baseProjectName || isNaN(numRows) || numRows < 1) {
        alert("Invalid input. Please ensure Project Name is not empty and Number of Tasks is at least 1.");
        hideLoading();
        return;
    }

    const batchId = `batch_${generateId()}`; // Generate a unique batch ID
    const creationTimestamp = firebase.firestore.FieldValue.serverTimestamp(); // Use server timestamp
    const batch = db.batch(); // Create a Firestore batch for atomic writes

    try {
        // Create multiple project documents in the batch
        for (let i = 1; i <= numRows; i++) {
            const projectData = {
                batchId: batchId,
                creationTimestamp: creationTimestamp,
                fixCategory: fixCategory,
                baseProjectName: baseProjectName,
                areaTask: `Area${String(i).padStart(2, '0')}`, // e.g., Area01, Area02
                gsd: gsd,
                assignedTo: "",
                techNotes: "",
                status: "Available", // Initial status
                startTimeDay1: null, finishTimeDay1: null, durationDay1Ms: null,
                startTimeDay2: null, finishTimeDay2: null, durationDay2Ms: null,
                startTimeDay3: null, finishTimeDay3: null, durationDay3Ms: null,
                releasedToNextStage: false,
                lastModifiedTimestamp: creationTimestamp,
                isReassigned: false,
                originalProjectId: null,
                breakDurationMinutes: 0,
                additionalMinutesManual: 0,
            };
            const newProjectRef = db.collection("projects").doc(); // Create a new document reference
            batch.set(newProjectRef, projectData);
        }

        await batch.commit(); // Commit the batch
        if (newProjectForm) newProjectForm.reset(); // Reset the form
        
        // Automatically select the newly created project and category in filters
        currentSelectedBatchId = baseProjectName;
        localStorage.setItem('currentSelectedBatchId', currentSelectedBatchId);
        currentSelectedMonth = ""; // Clear month filter to show all months
        localStorage.setItem('currentSelectedMonth', "");
        if (monthFilter) monthFilter.value = "";
        currentSelectedFixCategory = fixCategory;
        if (fixCategoryFilter) fixCategoryFilter.value = fixCategory;

        initializeFirebaseAndLoadData(); // Reload projects

    } catch (error) {
        console.error("Error adding projects: ", error);
        alert("Error adding projects: " + error.message);
    } finally {
        if (projectFormModal) projectFormModal.style.display = 'none'; // Close modal
        hideLoading();
    }
}

// Function to fetch and group projects by batch for the TL Dashboard
async function getManageableBatches() {
    if (!db) return [];
    showLoading("Loading batches for dashboard...");
    try {
        const projectsSnapshot = await db.collection("projects").get();
        const batches = {}; // Object to hold batches, keyed by batchId

        projectsSnapshot.forEach(doc => {
            const task = doc.data();
            if (task && task.batchId) {
                if (!batches[task.batchId]) {
                    // Initialize batch if not already present
                    batches[task.batchId] = {
                        batchId: task.batchId,
                        baseProjectName: task.baseProjectName || "N/A",
                        tasksByFix: {} // Group tasks within batch by fix category
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
        return Object.values(batches); // Return array of batch objects
    } catch (error) {
        console.error("Error fetching batches for dashboard:", error);
        alert("Error fetching batches for dashboard: " + error.message);
        return [];
    } finally {
        hideLoading();
    }
}

// Function to render the content of the TL Dashboard (Project Settings)
async function renderTLDashboard() {
    if (!tlDashboardContentElement) return;
    tlDashboardContentElement.innerHTML = ""; // Clear previous content
    const batches = await getManageableBatches(); // Fetch current batches

    if (batches.length === 0) {
        tlDashboardContentElement.innerHTML = "<p>No project batches found for TL dashboard.</p>";
        return;
    }

    batches.forEach(batch => {
        if (!batch || !batch.batchId) return;

        const batchItemDiv = document.createElement('div');
        batchItemDiv.classList.add('dashboard-batch-item');

        const title = document.createElement('h4');
        title.textContent = `Project: ${batch.baseProjectName || "Unknown"} (Batch ID: ${batch.batchId.split('_')[1] || "N/A"})`;
        batchItemDiv.appendChild(title);

        // Display stages (fix categories) present in the batch
        const stagesPresent = batch.tasksByFix ? Object.keys(batch.tasksByFix).sort((a,b) => FIX_CATEGORIES_ORDER.indexOf(a) - FIX_CATEGORIES_ORDER.indexOf(b)) : [];
        const stagesP = document.createElement('p');
        stagesP.innerHTML = `<strong>Stages Present:</strong> ${stagesPresent.join(', ') || "None"}`;
        batchItemDiv.appendChild(stagesP);

        // Actions for releasing batch to the next fix stage
        const releaseActionsDiv = document.createElement('div');
        releaseActionsDiv.classList.add('dashboard-batch-actions-release');
        let currentHighestActiveFix = "";
        if (batch.tasksByFix) {
            // Find the highest active fix category that hasn't been fully released
            FIX_CATEGORIES_ORDER.slice().reverse().forEach(fixCat => {
                if (!currentHighestActiveFix && batch.tasksByFix[fixCat] && batch.tasksByFix[fixCat].length > 0) {
                    const tasksInFix = batch.tasksByFix[fixCat].filter(p => p.status !== "Reassigned_TechAbsent");
                    if (tasksInFix.length > 0 && !tasksInFix.every(p => p.releasedToNextStage)) {
                        currentHighestActiveFix = fixCat;
                    }
                }
            });
        }
        
        if (currentHighestActiveFix) {
            const activeTasksInFix = batch.tasksByFix[currentHighestActiveFix].filter(p => p.status !== "Reassigned_TechAbsent");
            const allTasksInHighestFixReleased = activeTasksInFix.every(p => p.releasedToNextStage);
            
            if (!allTasksInHighestFixReleased) {
                // Check if all tasks in the current highest fix are completable (ready for release)
                const allTasksInHighestFixCompletable = activeTasksInFix.every(p =>
                    p.status === "Completed" || p.status.includes("Ended_AwaitingNext")
                );

                const currentFixIndex = FIX_CATEGORIES_ORDER.indexOf(currentHighestActiveFix);
                if (currentFixIndex < FIX_CATEGORIES_ORDER.length - 1) { // If not the last fix category
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
            }
        }
        batchItemDiv.appendChild(releaseActionsDiv);

        // Actions for deleting all tasks of a specific fix category within a batch
        const deleteActionsDiv = document.createElement('div');
        deleteActionsDiv.classList.add('dashboard-batch-actions-delete');
        if (batch.tasksByFix) {
            Object.keys(batch.tasksByFix).forEach(fixCat => {
                const deleteFixBtn = document.createElement('button');
                deleteFixBtn.textContent = `Delete ${fixCat} Tasks`;
                deleteFixBtn.classList.add('btn', 'btn-danger');
                deleteFixBtn.onclick = () => {
                    if (confirm(`Are you sure you want to delete all ${fixCat} tasks for project '${batch.baseProjectName}'? This is IRREVERSIBLE.`)) {
                        deleteSpecificFixTasksForBatch(batch.batchId, fixCat);
                    }
                };
                deleteActionsDiv.appendChild(deleteFixBtn);
            });
        }
        batchItemDiv.appendChild(deleteActionsDiv);

        // Section for managing (resetting, adding manual time to) individual tasks
        const resetActionsDiv = document.createElement('div');
        resetActionsDiv.classList.add('dashboard-batch-actions-reset');
        resetActionsDiv.style.marginTop = '10px';
        resetActionsDiv.innerHTML = '<strong>Manage Individual Tasks:</strong>';

        const taskResetContainer = document.createElement('div'); // Container for task list
        taskResetContainer.className = 'task-reset-container';
        taskResetContainer.style.display = 'none'; // Initially hidden
        taskResetContainer.style.marginTop = '10px';
        taskResetContainer.style.padding = '10px';
        taskResetContainer.style.border = '1px solid #ccc';

        if (batch.tasksByFix) {
            stagesPresent.forEach(fixCat => {
                const manageBtn = document.createElement('button');
                manageBtn.textContent = `Manage ${fixCat}`;
                manageBtn.className = 'btn btn-secondary btn-small';
                manageBtn.style.marginLeft = '5px';
                manageBtn.onclick = () => {
                    // Toggle visibility of task list for this fix category
                    if (taskResetContainer.style.display === 'block' && taskResetContainer.dataset.activeFix === fixCat) {
                        taskResetContainer.style.display = 'none';
                        taskResetContainer.dataset.activeFix = '';
                    } else {
                        taskResetContainer.dataset.activeFix = fixCat;
                        taskResetContainer.style.display = 'block';
                        renderResettableTasksForBatchFix(taskResetContainer, batch.batchId, fixCat); // Render task list
                    }
                };
                resetActionsDiv.appendChild(manageBtn);
            });
        }

        batchItemDiv.appendChild(resetActionsDiv);
        batchItemDiv.appendChild(taskResetContainer);

        tlDashboardContentElement.appendChild(batchItemDiv);
    });
}

// Function to release all completable tasks of a batch from current fix to the next
async function releaseBatchToNextFix(batchId, currentFixCategory, nextFixCategory) {
    showLoading(`Releasing ${currentFixCategory} tasks...`);
    if (!db) {
        alert("Database not initialized!");
        hideLoading();
        return;
    }

    try {
        // Query for tasks in the current batch and fix category that are not yet released
        const querySnapshot = await db.collection("projects")
            .where("batchId", "==", batchId)
            .where("fixCategory", "==", currentFixCategory)
            .where("releasedToNextStage", "==", false)
            .get();

        const firestoreBatch = db.batch(); // Use Firestore batch for atomic operations
        const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();

        for (const doc of querySnapshot.docs) {
            const task = { id: doc.id, ...doc.data() };
            if (task.status === "Reassigned_TechAbsent") continue; // Skip reassigned tasks

            // Create a new task document for the next fix category
            const newNextFixTask = { ...task,
                fixCategory: nextFixCategory,
                status: "Available", // Reset status and times
                startTimeDay1: null, finishTimeDay1: null, durationDay1Ms: null,
                startTimeDay2: null, finishTimeDay2: null, durationDay2Ms: null,
                startTimeDay3: null, finishTimeDay3: null, durationDay3Ms: null,
                releasedToNextStage: false, // Mark as not released yet in the new stage
                lastModifiedTimestamp: serverTimestamp,
                originalProjectId: task.id, // Link to the original task
            };
            delete newNextFixTask.id; // Remove old ID to generate a new one
            const newDocRef = db.collection("projects").doc();
            firestoreBatch.set(newDocRef, newNextFixTask);
            
            // Update the current task to mark it as released
            const currentTaskRef = db.collection("projects").doc(task.id);
            firestoreBatch.update(currentTaskRef, {
                releasedToNextStage: true,
                lastModifiedTimestamp: serverTimestamp
            });
        }

        await firestoreBatch.commit(); // Commit all changes
        initializeFirebaseAndLoadData(); // Refresh data

    } catch (error) {
        console.error("Error releasing batch:", error);
        alert("Error releasing batch: " + error.message);
    } finally {
        hideLoading();
    }
}

// Function to delete all tasks of a specific fix category for a given batch
async function deleteSpecificFixTasksForBatch(batchId, fixCategory) {
    showLoading(`Deleting ${fixCategory} tasks...`);
    if (!db || !batchId || !fixCategory) {
        alert("Invalid request.");
        hideLoading();
        return;
    }
    try {
        const querySnapshot = await db.collection("projects")
            .where("batchId", "==", batchId)
            .where("fixCategory", "==", fixCategory)
            .get();

        const batch = db.batch(); // Use Firestore batch for atomic deletes
        querySnapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        initializeFirebaseAndLoadData(); // Refresh data
        renderTLDashboard(); // Re-render dashboard as batch structure might change

    } catch (error) {
        console.error(`Error deleting ${fixCategory} for batch ${batchId}:`, error);
        alert("Error deleting specific fix tasks: " + error.message);
    } finally {
        hideLoading();
    }
}

// Function to reset a specific project task to its initial "Available" state
async function resetProjectTask(projectId) {
    showLoading("Resetting task...");
    if (!db || !projectId) {
        alert("Database not initialized or project ID missing.");
        hideLoading();
        return;
    }
    const projectRef = db.collection("projects").doc(projectId);

    try {
        const doc = await projectRef.get();
        if (!doc.exists) {
            throw new Error("Project document not found.");
        }
        const projectData = doc.data();

        const today = new Date().toLocaleDateString('en-US');
        const originalNotes = projectData.techNotes || "";
        const resetNotes = `Task Reset by TL on ${today}. Original Notes: "${originalNotes}"`;

        // Data to update for resetting the task
        const updateData = {
            status: "Available",
            assignedTo: "",
            startTimeDay1: null, finishTimeDay1: null, durationDay1Ms: null,
            startTimeDay2: null, finishTimeDay2: null, durationDay2Ms: null,
            startTimeDay3: null, finishTimeDay3: null, durationDay3Ms: null,
            techNotes: resetNotes, // Add a note about the reset
            breakDurationMinutes: 0,
            additionalMinutesManual: 0, // Also reset manual minutes
            lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        await projectRef.update(updateData);
    } catch (error) {
        console.error(`Error resetting project ${projectId}:`, error);
        alert("Error resetting the task: " + error.message);
    } finally {
        hideLoading();
    }
}

// Function to render the list of tasks for a specific batch and fix category in the TL Dashboard
// This list allows TLs to reset tasks or add manual minutes.
async function renderResettableTasksForBatchFix(containerElement, batchId, fixCategory) {
    if (!db || !containerElement) return;
    containerElement.innerHTML = `<p>Loading tasks for ${fixCategory}...</p>`;

    try {
        const querySnapshot = await db.collection("projects")
            .where("batchId", "==", batchId)
            .where("fixCategory", "==", fixCategory)
            .orderBy("areaTask") // Order by area/task name
            .get();

        if (querySnapshot.empty) {
            containerElement.innerHTML = `<p>No tasks found for ${fixCategory}.</p>`;
            return;
        }

        containerElement.innerHTML = ''; // Clear loading message
        const taskListUl = document.createElement('ul');
        taskListUl.className = 'resettable-tasks-list';

        querySnapshot.forEach(doc => {
            const project = { id: doc.id, ...doc.data() };
            const li = document.createElement('li');
            // Styling for list items for better layout
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.alignItems = 'center';
            li.style.marginBottom = '8px';

            const taskInfoDiv = document.createElement('div');
            taskInfoDiv.innerHTML = `
                <strong>${project.areaTask}</strong> - 
                Status: ${project.status.replace(/([A-Z])/g, ' $1').trim()} - 
                Assigned: ${project.assignedTo || 'N/A'}
            `;

            const taskActionsDiv = document.createElement('div'); // Container for action buttons/inputs

            // Input field for manually adding minutes
            const manualMinutesContainer = document.createElement('span');
            manualMinutesContainer.style.marginRight = '10px';
            const manualMinutesLabel = document.createElement('label');
            manualMinutesLabel.textContent = "Manual Mins: ";
            manualMinutesLabel.htmlFor = `tl-manual-mins-${project.id}`;
            const manualMinutesInput = document.createElement('input');
            manualMinutesInput.type = 'number';
            manualMinutesInput.id = `tl-manual-mins-${project.id}`;
            manualMinutesInput.value = project.additionalMinutesManual || 0;
            manualMinutesInput.style.width = '60px';
            manualMinutesInput.onchange = (event) => { // Update Firestore on change
                const newMinutes = parseInt(event.target.value, 10);
                if (isNaN(newMinutes) || newMinutes < 0) {
                    alert("Please enter a valid, non-negative number.");
                    event.target.value = project.additionalMinutesManual || 0; // Revert if invalid
                    return;
                }
                showLoading("Updating manual minutes...");
                db.collection("projects").doc(project.id).update({
                    additionalMinutesManual: newMinutes,
                    lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
                }).catch(error => {
                    alert("Failed to update minutes. Error: " + error.message);
                }).finally(() => {
                    hideLoading();
                });
            };
            manualMinutesContainer.appendChild(manualMinutesLabel);
            manualMinutesContainer.appendChild(manualMinutesInput);
            taskActionsDiv.appendChild(manualMinutesContainer);
            
            // Button to reset the task
            const resetButton = document.createElement('button');
            resetButton.textContent = "Reset Task";
            resetButton.className = 'btn btn-danger btn-small';
            // Disable reset if task is already available or has been released to next stage
            if (project.status === 'Available' || project.releasedToNextStage) {
                resetButton.disabled = true;
                resetButton.title = project.releasedToNextStage 
                    ? "Cannot reset a task that has been released." 
                    : "Task is already available.";
            }
            resetButton.onclick = async () => {
                if (confirm(`Are you sure you want to reset task '${project.areaTask}'? All progress will be lost.`)) {
                    await resetProjectTask(project.id);
                    // Re-render this list after reset to reflect changes
                    renderResettableTasksForBatchFix(containerElement, batchId, fixCategory); 
                }
            };
            taskActionsDiv.appendChild(resetButton);

            li.appendChild(taskInfoDiv);
            li.appendChild(taskActionsDiv);
            taskListUl.appendChild(li);
        });

        containerElement.appendChild(taskListUl);

    } catch (error) {
        console.error("Error rendering resettable tasks:", error);
        containerElement.innerHTML = `<p style="color:red;">Error loading tasks: ${error.message}</p>`;
    }
}

// Main function to render the project table in the UI
function renderProjects() {
    if (!projectTableBody) {
        console.error("CRITICAL: projectTableBody not found.");
        return;
    }
    projectTableBody.innerHTML = ""; // Clear existing table rows

    // Sort projects by base name, then fix category order, then area task
    const sortedProjects = [...projects].sort((a, b) => {
        const nameA = a.baseProjectName || "";
        const nameB = b.baseProjectName || "";
        const fixA = FIX_CATEGORIES_ORDER.indexOf(a.fixCategory || "");
        const fixB = FIX_CATEGORIES_ORDER.indexOf(b.fixCategory || "");
        const areaA = a.areaTask || "";
        const areaB = b.areaTask || "";

        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;
        if (fixA < fixB) return -1;
        if (fixA > fixB) return 1;
        if (areaA < areaB) return -1;
        if (areaA > areaB) return 1;
        return 0;
    });

    let currentBaseProjectNameHeader = null; // Track current project name for grouping
    let currentFixCategoryHeader = null; // Track current fix category for sub-grouping

    sortedProjects.forEach(project => {
        if (!project || !project.id || !project.baseProjectName || !project.fixCategory) {
             console.warn("Skipping rendering of invalid project:", project);
             return;
        }

        // Add a header row for each new base project name
        if (project.baseProjectName !== currentBaseProjectNameHeader) {
            currentBaseProjectNameHeader = project.baseProjectName;
            currentFixCategoryHeader = null; // Reset fix category header
            const projectNameHeaderRow = projectTableBody.insertRow();
            projectNameHeaderRow.classList.add("batch-header-row");
            const cell = projectNameHeaderRow.insertCell();
            cell.colSpan = NUM_TABLE_COLUMNS;
            cell.textContent = `Project: ${project.baseProjectName}`;
        }

        // Add a sub-header row for each new fix category within a project (collapsible)
        if (project.fixCategory !== currentFixCategoryHeader) {
            currentFixCategoryHeader = project.fixCategory;
            const groupKey = `${currentBaseProjectNameHeader}_${currentFixCategoryHeader}`;
            if (groupVisibilityState[groupKey] === undefined) {
                groupVisibilityState[groupKey] = { isExpanded: true }; // Default to expanded
            }
            const groupHeaderRow = projectTableBody.insertRow();
            groupHeaderRow.classList.add("fix-group-header");
            const cell = groupHeaderRow.insertCell();
            cell.colSpan = NUM_TABLE_COLUMNS;
            const isExpanded = groupVisibilityState[groupKey]?.isExpanded !== false;
            cell.innerHTML = `${currentFixCategoryHeader} <button class="btn btn-group-toggle">${isExpanded ? "−" : "+"}</button>`;
            cell.onclick = () => { // Toggle visibility on click
                groupVisibilityState[groupKey].isExpanded = !isExpanded;
                saveGroupVisibilityState(); // Save preference
                renderProjects(); // Re-render to apply change
            };
        }
        
        const row = projectTableBody.insertRow(); // Create row for the project task
        // Apply row highlighting based on fix category
        row.style.backgroundColor = FIX_CATEGORY_COLORS[project.fixCategory] || FIX_CATEGORY_COLORS["default"];

        const groupKey = `${currentBaseProjectNameHeader}_${project.fixCategory}`;
        if (groupVisibilityState[groupKey]?.isExpanded === false) {
            row.classList.add("hidden-group-row"); // Hide row if group is collapsed
        }
        if (project.isReassigned) {
            row.classList.add("reassigned-task-highlight"); // Highlight reassigned tasks
        }

        // Populate cells with project data
        row.insertCell().textContent = project.fixCategory;
        row.insertCell().textContent = project.baseProjectName;
        row.insertCell().textContent = project.areaTask;
        row.insertCell().textContent = project.gsd;

        // Cell for "Assigned To" dropdown
        const assignedToCell = row.insertCell();
        const assignedToSelect = document.createElement('select');
        assignedToSelect.className = 'assigned-to-select';
        assignedToSelect.disabled = project.status === "Reassigned_TechAbsent";
        assignedToSelect.innerHTML = `<option value="">Select Tech ID</option>` + TECH_IDS.map(id => `<option value="${id}">${id}</option>`).join('');
        assignedToSelect.value = project.assignedTo || "";
        assignedToSelect.onchange = (event) => { // Update Firestore on change
            db.collection("projects").doc(project.id).update({
                assignedTo: event.target.value,
                lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        };
        assignedToCell.appendChild(assignedToSelect);

        // Cell for project status
        const statusCell = row.insertCell();
        const statusSpan = document.createElement('span');
        statusSpan.className = `status status-${(project.status || "unknown").toLowerCase()}`;
        statusSpan.textContent = (project.status || "Unknown").replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim(); // Format status text
        statusCell.appendChild(statusSpan);
        
        // Helper to format Firestore Timestamp to HH:MM string
        function formatTime(timestamp) {
            if (!timestamp || !timestamp.toDate) return "";
            return timestamp.toDate().toTimeString().slice(0, 5);
        }

        // Helper to create a time input cell
        const createTimeInput = (timeValue, fieldName) => {
            const cell = row.insertCell();
            const input = document.createElement('input');
            input.type = 'time';
            input.value = formatTime(timeValue);
            input.disabled = project.status === "Reassigned_TechAbsent";
            input.onchange = (event) => updateTimeField(project.id, fieldName, event.target.value); // Update Firestore on change
            cell.appendChild(input);
        };
        
        // Create time input cells for Day 1, Day 2, Day 3 start/finish times
        createTimeInput(project.startTimeDay1, 'startTimeDay1');
        createTimeInput(project.finishTimeDay1, 'finishTimeDay1');
        createTimeInput(project.startTimeDay2, 'startTimeDay2');
        createTimeInput(project.finishTimeDay2, 'finishTimeDay2');
        createTimeInput(project.startTimeDay3, 'startTimeDay3');
        createTimeInput(project.finishTimeDay3, 'finishTimeDay3');

        // Calculate and display total duration
        const totalDurationMs = (project.durationDay1Ms || 0) + (project.durationDay2Ms || 0) + (project.durationDay3Ms || 0);
        const breakMs = (project.breakDurationMinutes || 0) * 60000;
        const additionalMs = (project.additionalMinutesManual || 0) * 60000;
        const finalAdjustedDurationMs = Math.max(0, totalDurationMs - breakMs) + additionalMs; // Ensure non-negative
        const totalDurationCell = row.insertCell();
        totalDurationCell.textContent = formatMillisToMinutes(finalAdjustedDurationMs);
        totalDurationCell.classList.add('total-duration-column');

        // Cell for tech notes (textarea)
        const techNotesCell = row.insertCell();
        const techNotesInput = document.createElement('textarea');
        techNotesInput.value = project.techNotes || "";
        techNotesInput.className = 'tech-notes-input';
        techNotesInput.disabled = project.status === "Reassigned_TechAbsent";
        techNotesInput.onchange = (event) => { // Update Firestore on change
            db.collection("projects").doc(project.id).update({
                techNotes: event.target.value,
                lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        };
        techNotesCell.appendChild(techNotesInput);

        // Cell for action buttons (Start/End Day, Done, Re-assign) and break selection
        const actionsCell = row.insertCell();
        const actionButtonsDiv = document.createElement('div');
        actionButtonsDiv.className = 'action-buttons-container';

        // Break duration dropdown
        const breakSelect = document.createElement('select');
        breakSelect.className = 'break-select';
        breakSelect.disabled = project.status === "Reassigned_TechAbsent";
        breakSelect.innerHTML = `
            <option value="0">No Break</option>
            <option value="15">15m Break</option>
            <option value="60">1h Break</option>
            <option value="90">1h30m Break</option>
        `;
        breakSelect.value = project.breakDurationMinutes || 0;
        breakSelect.onchange = (event) => { // Update Firestore on change
            db.collection("projects").doc(project.id).update({
                breakDurationMinutes: parseInt(event.target.value, 10),
                lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        };
        actionButtonsDiv.appendChild(breakSelect);
        
        // Helper to create an action button
        const createActionButton = (text, className, disabled, action) => {
            const button = document.createElement('button');
            button.textContent = text;
            button.className = `btn ${className}`;
            button.disabled = project.status === "Reassigned_TechAbsent" || disabled;
            button.onclick = () => updateProjectState(project.id, action); // Update project state on click
            return button;
        };

        // Create and append action buttons based on project status
        actionButtonsDiv.appendChild(createActionButton("Start D1", "btn-day-start", project.status !== "Available", "startDay1"));
        actionButtonsDiv.appendChild(createActionButton("End D1", "btn-day-end", project.status !== "InProgressDay1", "endDay1"));
        actionButtonsDiv.appendChild(createActionButton("Start D2", "btn-day-start", project.status !== "Day1Ended_AwaitingNext", "startDay2"));
        actionButtonsDiv.appendChild(createActionButton("End D2", "btn-day-end", project.status !== "InProgressDay2", "endDay2"));
        actionButtonsDiv.appendChild(createActionButton("Start D3", "btn-day-start", project.status !== "Day2Ended_AwaitingNext", "startDay3"));
        actionButtonsDiv.appendChild(createActionButton("End D3", "btn-day-end", project.status !== "InProgressDay3", "endDay3"));
        actionButtonsDiv.appendChild(createActionButton("Done", "btn-mark-done", project.status === "Completed" || project.status === "Reassigned_TechAbsent" || project.status === "Available" && (project.durationDay1Ms || project.durationDay2Ms || project.durationDay3Ms) , "markDone"));


        const reassignBtn = createActionButton("Re-Assign", "btn-warning", project.status === "Completed" || project.status === "Reassigned_TechAbsent", "reassign");
        reassignBtn.onclick = () => handleReassignment(project); // Handle reassignment
        actionButtonsDiv.appendChild(reassignBtn);

        actionsCell.appendChild(actionButtonsDiv);
    });
}

// Function to update a time field (start/finish) for a project and recalculate duration
async function updateTimeField(projectId, fieldName, newValue) {
    showLoading(`Updating ${fieldName}...`);
    if (!db || !projectId) {
        alert("Database or project ID missing. Cannot update time.");
        hideLoading();
        return;
    }

    const projectRef = db.collection("projects").doc(projectId);

    try {
        const doc = await projectRef.get();
        if (!doc.exists) {
            console.error("Document not found for update:", projectId);
            hideLoading();
            return;
        }
        const projectData = doc.data();

        let firestoreTimestamp = null;
        if (newValue) { // If a new time value is provided
            const [hours, minutes] = newValue.split(':').map(Number);
            if (!isNaN(hours) && !isNaN(minutes)) {
                let baseDate;
                const isStartField = fieldName.includes('startTime');
                // Extract day number (1, 2, or 3) from fieldName
                const dayMatch = fieldName.match(/Day(\d)/); 
                
                if (dayMatch) { // Ensure we are dealing with a DayX field
                    const day = dayMatch[1];
                    // Determine the corresponding start/finish field for the same day
                    const pairFieldName = isStartField ? `finishTimeDay${day}` : `startTimeDay${day}`;
                    
                    // Use the date of the paired field if it exists, otherwise use current date
                    if (projectData[pairFieldName] && projectData[pairFieldName].toDate) {
                        baseDate = projectData[pairFieldName].toDate();
                    } else {
                        baseDate = new Date(); // Fallback to current date
                    }
                } else {
                     baseDate = new Date(); // Fallback if not a DayX field (should not happen for these fields)
                }
                
                baseDate.setHours(hours, minutes, 0, 0); // Set time on the determined baseDate
                firestoreTimestamp = firebase.firestore.Timestamp.fromDate(baseDate);
            }
        }

        // Prepare variables to hold the potentially new start and finish times for duration calculation
        let newStartTime, newFinishTime;
        let durationFieldToUpdate = ''; // Firestore field name for the duration (e.g., durationDay1Ms)

        // Determine which day's duration needs updating based on the fieldName
        if (fieldName.includes("Day1")) {
            durationFieldToUpdate = "durationDay1Ms";
            // Assign the new timestamp to the correct variable (start or finish)
            newStartTime = fieldName.includes("startTime") ? firestoreTimestamp : projectData.startTimeDay1;
            newFinishTime = fieldName.includes("finishTime") ? firestoreTimestamp : projectData.finishTimeDay1;
        } else if (fieldName.includes("Day2")) {
            durationFieldToUpdate = "durationDay2Ms";
            newStartTime = fieldName.includes("startTime") ? firestoreTimestamp : projectData.startTimeDay2;
            newFinishTime = fieldName.includes("finishTime") ? firestoreTimestamp : projectData.finishTimeDay2;
        } else if (fieldName.includes("Day3")) {
            durationFieldToUpdate = "durationDay3Ms";
            newStartTime = fieldName.includes("startTime") ? firestoreTimestamp : projectData.startTimeDay3;
            newFinishTime = fieldName.includes("finishTime") ? firestoreTimestamp : projectData.finishTimeDay3;
        }

        let newDuration = calculateDurationMs(newStartTime, newFinishTime); // Recalculate duration

        // Update both the specific time field and its corresponding duration field in Firestore
        if (durationFieldToUpdate) {
            await projectRef.update({
                [fieldName]: firestoreTimestamp, // The changed time field (e.g., startTimeDay1)
                [durationFieldToUpdate]: newDuration, // The recalculated duration (e.g., durationDay1Ms)
                lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            // Fallback if no specific duration field to update (e.g., if logic changes)
             await projectRef.update({
                [fieldName]: firestoreTimestamp,
                lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

    } catch (error) {
        console.error(`Error updating ${fieldName}:`, error);
        alert(`Error updating ${fieldName}: ` + error.message);
    } finally {
        hideLoading();
    }
}

// Function to update the project's state (status, start/end times) based on an action
async function updateProjectState(projectId, action) {
    showLoading("Updating project state...");
    if (!db || !projectId) {
        alert("Database not initialized or project ID missing.");
        hideLoading();
        return;
    }
    const projectRef = db.collection("projects").doc(projectId);
    
    try {
        const docSnap = await projectRef.get();
        if (!docSnap.exists) {
            console.warn("Project document not found for update:", projectId);
            hideLoading();
            return;
        }
        
        const project = docSnap.data();
        const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();
        let updates = { lastModifiedTimestamp: serverTimestamp }; // Always update last modified time

        // Determine updates based on the action
        switch (action) {
            case "startDay1":
                updates.status = "InProgressDay1";
                updates.startTimeDay1 = serverTimestamp;
                break;
            case "endDay1":
                updates.status = "Day1Ended_AwaitingNext";
                updates.finishTimeDay1 = serverTimestamp;
                updates.durationDay1Ms = calculateDurationMs(project.startTimeDay1, serverTimestamp);
                break;
            case "startDay2":
                updates.status = "InProgressDay2";
                updates.startTimeDay2 = serverTimestamp;
                break;
            case "endDay2":
                updates.status = "Day2Ended_AwaitingNext";
                updates.finishTimeDay2 = serverTimestamp;
                updates.durationDay2Ms = calculateDurationMs(project.startTimeDay2, serverTimestamp);
                break;
            case "startDay3":
                updates.status = "InProgressDay3";
                updates.startTimeDay3 = serverTimestamp;
                break;
            case "endDay3":
                updates.status = "Day3Ended_AwaitingNext";
                updates.finishTimeDay3 = serverTimestamp;
                updates.durationDay3Ms = calculateDurationMs(project.startTimeDay3, serverTimestamp);
                break;
            case "markDone":
                updates.status = "Completed";
                // If marked done while in progress, set finish time and calculate duration for the active day
                if (project.status === "InProgressDay1" && !project.finishTimeDay1) {
                    updates.finishTimeDay1 = serverTimestamp;
                    updates.durationDay1Ms = calculateDurationMs(project.startTimeDay1, serverTimestamp);
                } else if (project.status === "InProgressDay2" && !project.finishTimeDay2) {
                    updates.finishTimeDay2 = serverTimestamp;
                    updates.durationDay2Ms = calculateDurationMs(project.startTimeDay2, serverTimestamp);
                } else if (project.status === "InProgressDay3" && !project.finishTimeDay3) {
                    updates.finishTimeDay3 = serverTimestamp;
                    updates.durationDay3Ms = calculateDurationMs(project.startTimeDay3, serverTimestamp);
                } else if (project.status.includes("Ended_AwaitingNext") || project.status === "Available") {
                    // If marked done from an "Ended" or "Available" state, ensure latest duration is captured
                    // This scenario handles cases where work was done, paused, then marked done.
                    // No explicit time update needed here as previous end times should be set.
                    // However, if the task was "Available" but had some prior work, it will now be "Completed".
                }
                break;
            default:
                hideLoading();
                return; // Unknown action
        }

        await projectRef.update(updates); // Apply updates to Firestore
    } catch(error) {
        console.error(`Error updating project ${projectId} for action ${action}:`, error);
        alert("Error updating project status: " + error.message);
    } finally {
        hideLoading();
    }
}

// Function to handle reassigning a task to a new tech
async function handleReassignment(projectToReassign) {
    if (!projectToReassign || projectToReassign.status === "Reassigned_TechAbsent") {
        alert("Cannot re-assign this task."); return;
    }
    const newTechId = prompt(`Re-assigning task '${projectToReassign.areaTask}'. Enter NEW Tech ID:`, projectToReassign.assignedTo || "");
    if (!newTechId) {
        alert("Reassignment cancelled."); return;
    }

    if (confirm(`Create a NEW task for '${newTechId.trim()}'? The current task will be closed as 'Reassigned_TechAbsent'.`)) {
        showLoading("Reassigning task...");
        if (!db) { alert("Database not initialized!"); hideLoading(); return; }
        const batch = db.batch(); // Use Firestore batch for atomic operations
        const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();
        
        // Create new project data for the reassigned task
        const newProjectData = {
            ...projectToReassign, // Copy most data from original task
            assignedTo: newTechId.trim(), // New tech ID
            status: "Available", // Reset status
            techNotes: `Reassigned from ${projectToReassign.assignedTo || "N/A"}. Original ID: ${projectToReassign.id}`, // Add note
            creationTimestamp: serverTimestamp, // New creation time
            lastModifiedTimestamp: serverTimestamp,
            isReassigned: true, // Mark as reassigned
            originalProjectId: projectToReassign.id, // Link to original task
            // Reset all time and duration fields
            startTimeDay1: null, finishTimeDay1: null, durationDay1Ms: null,
            startTimeDay2: null, finishTimeDay2: null, durationDay2Ms: null,
            startTimeDay3: null, finishTimeDay3: null, durationDay3Ms: null,
            releasedToNextStage: false, // Reset release status
            breakDurationMinutes: 0, // Reset breaks
            additionalMinutesManual: 0, // Reset manual minutes
        };
        delete newProjectData.id; // Remove old ID to generate a new one

        const newProjectRef = db.collection("projects").doc(); // New document reference
        batch.set(newProjectRef, newProjectData);
        
        // Update the old task to "Reassigned_TechAbsent"
        const oldProjectRef = db.collection("projects").doc(projectToReassign.id);
        batch.update(oldProjectRef, { status: "Reassigned_TechAbsent", lastModifiedTimestamp: serverTimestamp });
        
        try {
            await batch.commit(); // Commit changes
        } catch (error) {
            console.error("Error in re-assignment transaction:", error);
            alert("Error during re-assignment: " + error.message);
        } finally {
            hideLoading();
        }
    }
}

// Function to refresh all views (currently just the main project table)
function refreshAllViews() {
    try {
        renderProjects();
    } catch (error) {
        console.error("Error during refreshAllViews:", error);
        alert("An error occurred while refreshing the project display.");
        if (projectTableBody) projectTableBody.innerHTML = `<tr><td colspan="${NUM_TABLE_COLUMNS}" style="color:red;text-align:center;">Error loading projects.</td></tr>`;
    }
}

// Function to render the list of allowed emails in the User Settings modal
async function renderAllowedEmailsList() {
    if (!allowedEmailsList) return;
    showLoading("Rendering allowed emails...");
    allowedEmailsList.innerHTML = ""; // Clear previous list
    if (allowedEmailsFromFirestore.length === 0) {
        allowedEmailsList.innerHTML = "<li>No allowed emails configured.</li>";
        hideLoading();
        return;
    }
    allowedEmailsFromFirestore.forEach(email => {
        const li = document.createElement('li');
        li.textContent = email;
        const removeBtn = document.createElement('button');
        removeBtn.textContent = "Remove";
        removeBtn.className = 'btn btn-danger btn-small';
        removeBtn.onclick = () => handleRemoveEmail(email); // Handle email removal
        li.appendChild(removeBtn);
        allowedEmailsList.appendChild(li);
    });
    hideLoading();
}

// Function to handle adding a new email to the allowed list
async function handleAddEmail() {
    showLoading("Adding email...");
    if (!addEmailInput) { hideLoading(); return; }
    const emailToAdd = addEmailInput.value.trim().toLowerCase();
    if (!emailToAdd || !emailToAdd.includes('@')) { // Basic email validation
        alert("Please enter a valid email address.");
        hideLoading();
        return;
    }
    if (allowedEmailsFromFirestore.map(e => e.toLowerCase()).includes(emailToAdd)) { // Check for duplicates
        alert("This email is already in the allowed list.");
        hideLoading();
        return;
    }
    // Update Firestore and re-render list on success
    const success = await updateAllowedEmailsInFirestore([...allowedEmailsFromFirestore, emailToAdd].sort());
    if (success) {
        addEmailInput.value = ""; // Clear input field
        renderAllowedEmailsList();
    }
}

// Function to handle removing an email from the allowed list
async function handleRemoveEmail(emailToRemove) {
    if (confirm(`Are you sure you want to remove ${emailToRemove}?`)) {
        showLoading("Removing email...");
        // Update Firestore and re-render list on success
        const success = await updateAllowedEmailsInFirestore(allowedEmailsFromFirestore.filter(email => email !== emailToRemove));
        if (success) {
            renderAllowedEmailsList();
        }
    }
}

// Function to generate and display the TL Summary data
// Function to generate and display the TL Summary data with colored highlights
async function generateTlSummaryData() {
    if (!tlSummaryContent) return;
    showLoading("Generating TL Summary...");
    tlSummaryContent.innerHTML = "<p>Loading summary...</p>";
    if (!db) {
        tlSummaryContent.innerHTML = '<p style="color:red;">Database not initialized.</p>';
        hideLoading();
        return;
    }

    try {
        const projectsSnapshot = await db.collection("projects").get();
        let allProjectsData = projectsSnapshot.docs.map(doc => doc.data());

        const projectTotals = {}; // Format: { "ProjectName": { "FixCategory": totalMinutes } }

        allProjectsData.forEach(p => {
            const totalWorkMs = (p.durationDay1Ms || 0) + (p.durationDay2Ms || 0) + (p.durationDay3Ms || 0);
            const breakMs = (p.breakDurationMinutes || 0) * 60000;
            const additionalMs = (p.additionalMinutesManual || 0) * 60000;
            const adjustedNetMs = Math.max(0, totalWorkMs - breakMs) + additionalMs;

            if (adjustedNetMs <= 0) return;

            const minutes = Math.floor(adjustedNetMs / 60000);
            if (minutes <= 0) return;

            const projName = p.baseProjectName || "Unknown Project";
            const fixCat = p.fixCategory || "Unknown Fix";

            if (!projectTotals[projName]) {
                projectTotals[projName] = {};
            }
            projectTotals[projName][fixCat] = (projectTotals[projName][fixCat] || 0) + minutes;
        });

        let summaryHtml = '<ul style="list-style: none; padding: 0;">';
        summaryHtml += "<h3>Totals by Project and Fix Category</h3>";

        const sortedProjectNames = Object.keys(projectTotals).sort();
        
        if (sortedProjectNames.length === 0) {
            summaryHtml = "<p>No project time data found to generate a summary.</p>";
        } else {
            sortedProjectNames.forEach(projName => {
                const fixCategoryTotals = projectTotals[projName];
                const sortedFixCategories = Object.keys(fixCategoryTotals).sort((a, b) => {
                    const orderA = FIX_CATEGORIES_ORDER.indexOf(a);
                    const orderB = FIX_CATEGORIES_ORDER.indexOf(b);
                    return orderA - orderB;
                });

                sortedFixCategories.forEach(fixCat => {
                    const totalMinutes = fixCategoryTotals[fixCat];
                    const hoursDecimal = (totalMinutes / 60).toFixed(2);
                    
                    // *** This line gets the correct color for the fix category ***
                    const bgColor = FIX_CATEGORY_COLORS[fixCat] || FIX_CATEGORY_COLORS["default"];
                    
                    // *** The background color is applied directly to the <li> style ***
                    summaryHtml += `<li style="background-color: ${bgColor}; padding: 8px; margin-bottom: 5px; border-radius: 4px;"><strong>${projName} - ${fixCat}:</strong> ${totalMinutes} minutes (${hoursDecimal} hours)</li>`;
                });
            });
            summaryHtml += "</ul>";
        }
        
        tlSummaryContent.innerHTML = summaryHtml;

    } catch (error) {
        console.error("Error generating TL Summary:", error);
        tlSummaryContent.innerHTML = `<p style="color:red;">Error generating summary: ${error.message}</p>`;
    } finally {
        hideLoading();
    }
}


// --- AUTHENTICATION ---
// Function to set up Firebase Authentication event listeners (Sign In/Out)
function setupAuthEventListeners() {
    const provider = new firebase.auth.GoogleAuthProvider(); // Use Google Auth Provider
    provider.addScope('email'); // Request email scope

    if (signInBtn) {
        signInBtn.addEventListener('click', () => {
            showLoading("Signing in...");
            if (!auth) { console.error("Auth not initialized"); hideLoading(); return; }
            auth.signInWithPopup(provider).catch((error) => { // Sign in with popup
                console.error("Sign-in error: ", error);
                alert("Error signing in: " + error.message);
                hideLoading();
            });
        });
    }

    if (signOutBtn) {
        signOutBtn.addEventListener('click', () => {
            showLoading("Signing out...");
            if (!auth) { console.error("Auth not initialized"); hideLoading(); return; }
            auth.signOut().catch((error) => { // Sign out
                console.error("Sign-out error: ", error);
                alert("Error signing out: " + error.message);
                hideLoading();
            });
        });
    }
}

// Function to initialize application components after successful authentication
function initializeAppComponents() {
    if (isAppInitialized) {
        // If already initialized (e.g., filter change), just reload data
        initializeFirebaseAndLoadData(); 
    } else {
        // First-time initialization
        setupDOMReferences();       // Get all general DOM elements
        attachEventListeners();     // Attach general event listeners
        initializeFirebaseAndLoadData(); // Load initial project data
        isAppInitialized = true;    // Set flag
    }
}

// Firebase Auth state change listener: Handles user sign-in and sign-out
if (auth) {
    auth.onAuthStateChanged(async (user) => {
        // Always ensure auth-related DOM elements are set up
        setupDOMReferences(); // General DOM elements needed for visibility toggling
        setupAuthRelatedDOMReferences(); // Specific auth UI elements

        if (!userInfoDisplayDiv || !signInBtn || !appContentDiv || !loadingAuthMessageDiv) {
            console.error("Critical auth UI elements not found. Cannot update UI based on auth state.");
            return;
        }

        if (user) { // User is signed in
            showLoading("Checking authorization...");
            await fetchAllowedEmails(); // Fetch/refresh allowed emails list
            const userEmailLower = user.email ? user.email.toLowerCase() : "";

            // Check if signed-in user's email is in the allowed list
            if (allowedEmailsFromFirestore.map(e => e.toLowerCase()).includes(userEmailLower)) {
                // User is authorized: Display user info and app content
                userNameP.textContent = user.displayName || "Name not available";
                userEmailP.textContent = user.email || "Email not available";
                if (userPhotoImg) userPhotoImg.src = user.photoURL || 'default-user.png'; // Display user photo or default
                
                userInfoDisplayDiv.style.display = 'flex';
                signInBtn.style.display = 'none';
                appContentDiv.style.display = 'block';
                loadingAuthMessageDiv.style.display = 'none';
                if (openSettingsBtn) openSettingsBtn.style.display = 'block'; // Show settings button for TLs

                initializeAppComponents(); // Initialize or refresh app components
            } else {
                // User is not authorized: Show access denied and sign out
                alert("Access Denied: Your email address is not authorized for this application.");
                auth.signOut(); // Automatically sign out unauthorized user
            }
        } else { // User is signed out
            // Hide user info and app content, show sign-in button and message
            userInfoDisplayDiv.style.display = 'none';
            signInBtn.style.display = 'block';
            appContentDiv.style.display = 'none';
            loadingAuthMessageDiv.innerHTML = "<p>Please sign in to access the Project Tracker.</p>";
            loadingAuthMessageDiv.style.display = 'block';
            if (openSettingsBtn) openSettingsBtn.style.display = 'none'; // Hide settings button

            // Unsubscribe from Firestore listener if user signs out
            if (firestoreListenerUnsubscribe) {
                firestoreListenerUnsubscribe();
                firestoreListenerUnsubscribe = null;
            }
            isAppInitialized = false; // Reset app initialization flag
        }
        hideLoading();
    });
} else {
    // This case should ideally not be reached if Firebase initialized correctly
    console.error("Firebase Auth is not initialized. Application cannot function.");
    const loadingMessageElement = document.getElementById('loading-auth-message');
    if (loadingMessageElement) {
        loadingMessageElement.innerHTML = '<p style="color:red; font-weight:bold;">Authentication services could not be loaded. Please refresh the page or check console for errors.</p>';
        loadingMessageElement.style.display = 'block';
    }
}

// Initial setup on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    // These need to be available early for the auth listener to correctly show/hide elements.
    setupDOMReferences(); 
    setupAuthRelatedDOMReferences(); 
    if (auth) { // Auth should be initialized by now
        setupAuthEventListeners(); // Setup sign-in/out buttons
    } else {
        // This log helps if Firebase Auth itself fails to load/initialize early.
        console.error("Firebase Auth not available on DOMContentLoaded. Auth listeners not attached.");
    }
});
