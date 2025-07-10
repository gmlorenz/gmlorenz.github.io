/**
 * =================================================================
 * Project Tracker Application - Refactored and Bug-Fixed
 * =================================================================
 * This script has been fully refactored to encapsulate all logic
 * within the `ProjectTrackerApp` object. This approach eliminates
 * global variables, improves performance, and ensures correct
 * timezone handling.
 *
 * @version 3.0.0
 * @author Gemini AI Refactor & Bug-Fix
 * @changeLog
 * - MODIFIED: (User Request) The "Add Extra Area" button in Project Settings is now only available for projects with an active Fix1 stage.
 * - ADDED: (User Request) In User Settings, users can now save their Full Name and Tech ID. New Tech IDs are dynamically added to the "Assigned To" dropdown.
 * - MODIFIED: (User Request) The Refresh button in the TL Summary has been redesigned for a better UI and spacing.
 * - MODIFIED: (User Request) The font size for project names in the TL Summary is now smaller to fit longer names.
 * - MODIFIED: Progress bar now changes color from green to red based on time consumed (out of 8 hours).
 * - FIXED: Expand/Collapse functionality now correctly reapplies column visibility settings.
 * - ADDED: Professional TL Summary with project and tech info.
 * - ADDED: "Refresh" button to the TL Summary modal.
 * - ADDED: "Copy" button for decimal hours in the TL Summary.
 * - MODIFIED: Redesigned TL Summary UI with a modern card-based layout.
 * - ADDED: Checkboxes for showing/hiding "Project Title", "Day 2", and "Day 3" columns.
 * - FIXED: Checkbox states are now saved to localStorage and restored on page refresh.
 * - ADDED: A "Recalc Totals" button in Project Settings to fix old tasks with missing duration calculations in a single batch.
 * - FIXED: Corrected a critical bug in `updateProjectState` where `serverTimestamp` was used for client-side calculations, causing "End Day" and "Mark Done" buttons to fail. Replaced with `firebase.firestore.Timestamp.now()` for consistent and correct duration calculation.
 * - MODIFIED: Implemented group-level locking. In Project Settings, users can now lock/unlock an entire Fix stage (e.g., "Lock All Fix1").
 * - MODIFIED: Added status icons (🔒, 🔑, 🔓) to the main table's Fix group headers to show if a group is fully locked, unlocked, or partially locked.
 * - MODIFIED: Ensured that when tasks are released to a new Fix stage, they are always created in an unlocked state, regardless of the original task's status.
 * - REMOVED: The per-task "Reset" and "Lock" functionality from the dashboard has been removed in favor of the group-level controls.
 * - Integrated new login UI. Script now handles showing/hiding the login screen and the main dashboard.
 * - ADDED: Real-time notification system for new project creation and Fix stage releases.
 * - ADDED: Export project data to CSV feature.
 * - ADDED: Visual progress bar for each project in the main table.
 * - MODIFIED: CSV Export now exports ALL projects from the database.
 * - FIXED: Replaced Unicode lock icons with standard emojis (🔒, 🔓, 🔑).
 * - ADDED: Import CSV feature for adding new projects from a file.
 * - MODIFIED: Import CSV now explicitly matches export headers and skips calculated/generated fields.
 * - FIXED: Changed CSV export of timestamps to ISO format for reliable import, ensuring time data and calculated totals are correct after import.
 * - FIXED: Corrected scope issue in setupAuthActions where 'self' was undefined, now uses 'this'.
 * - FIXED: Ensured imported projects group correctly by assigning a consistent batchId based on Project Name during import.
 * - MODIFIED: TL Summary project name now shows full name on hover using a bubble/tooltip, triggered by hovering over the entire project name area.
 * - FIXED: `ReferenceError: year is not defined` in `populateMonthFilter` by explicitly parsing `year` as an integer.
 * - MODIFIED: Changed TL Summary full project name display from hover tooltip to click-on-info-icon alert.
 */
document.addEventListener('DOMContentLoaded', () => {

    const ProjectTrackerApp = {
        // --- 1. CONFIGURATION AND CONSTANTS ---
        config: {
            firebase: {
               apiKey: "AIzaSyAblGk1BHPF3J6w--Ii1pfDyKqcN-MFZyQ",
                authDomain: "time-tracker-41701.firebaseapp.com",
                projectId: "time-tracker-41701",
                storageBucket: "time-tracker-41701.firebasestorage.app",
                messagingSenderId: "401097667777",
                appId: "1:401097667777:web:d6c0c6e7741a2046945040",
                measurementId: "G-BY9CV5ZQ11"

            },
            pins: {
                TL_DASHBOARD_PIN: "1234"
            },
            firestorePaths: {
                ALLOWED_EMAILS: "settings/allowedEmails",
                TECH_IDS: "settings/techIds", // NEW: Firestore path for dynamic Tech IDs
                USERS: "users", // NEW: Firestore path for user-specific data
                NOTIFICATIONS: "notifications"
            },
            // MODIFIED: This is now a fallback list. The app will prioritize fetching from Firestore.
            TECH_IDS: ["4232JD", "7248AA", "4426KV", "4472JS", "7236LE", "4475JT", "7039NO", "7231NR", "7240HH", "7247JA", "7249SS", "7244AA", "7314VP"].sort(),
            FIX_CATEGORIES: {
                ORDER: ["Fix1", "Fix2", "Fix3", "Fix4", "Fix5", "Fix6"],
                COLORS: {
                    "Fix1": "#FFFFE0",
                    "Fix2": "#ADD8E6",
                    "Fix3": "#90EE90",
                    "Fix4": "#FFB6C1",
                    "Fix5": "#FFDAB9",
                    "Fix6": "#E6E6FA",
                    "default": "#FFFFFF"
                }
            },
            NUM_TABLE_COLUMNS: 19, // UPDATED for Progress column
            // UPDATED: Expected headers for CSV import, matching export order
            CSV_HEADERS_FOR_IMPORT: [
                "Fix Cat", "Project Name", "Area/Task", "GSD", "Assigned To", "Status",
                "Day 1 Start", "Day 1 Finish", "Day 1 Break",
                "Day 2 Start", "Day 2 Finish", "Day 2 Break",
                "Day 3 Start", "Day 3 Finish", "Day 3 Break",
                "Total (min)", "Tech Notes", "Creation Date", "Last Modified"
            ],
            // UPDATED: Map CSV headers to Firestore field names (if they differ)
            CSV_HEADER_TO_FIELD_MAP: {
                "Fix Cat": "fixCategory",
                "Project Name": "baseProjectName",
                "Area/Task": "areaTask",
                "GSD": "gsd",
                "Assigned To": "assignedTo",
                "Status": "status",
                "Day 1 Start": "startTimeDay1",
                "Day 1 Finish": "finishTimeDay1",
                "Day 1 Break": "breakDurationMinutesDay1",
                "Day 2 Start": "startTimeDay2",
                "Day 2 Finish": "finishTimeDay2",
                "Day 2 Break": "breakDurationMinutesDay2",
                "Day 3 Start": "startTimeDay3",
                "Day 3 Finish": "finishTimeDay3",
                "Day 3 Break": "breakDurationMinutesDay3",
                "Total (min)": null, // This is calculated, not directly imported, set to null to ignore
                "Tech Notes": "techNotes",
                "Creation Date": null, // This is generated, not imported, set to null to ignore
                "Last Modified": null // This is generated, not imported, set to null to ignore
            }
        },

        // --- 2. FIREBASE SERVICES ---
        app: null,
        db: null,
        auth: null,
        firestoreListenerUnsubscribe: null,
        notificationListenerUnsubscribe: null,

        // --- 3. APPLICATION STATE ---
        state: {
            projects: [],
            groupVisibilityState: {},
            allowedEmails: [],
            isAppInitialized: false,
            filters: {
                batchId: localStorage.getItem('currentSelectedBatchId') || "",
                fixCategory: "",
                month: localStorage.getItem('currentSelectedMonth') || "",
                sortBy: localStorage.getItem('currentSortBy') || 'newest'
            },
            pagination: {
                currentPage: 1,
                projectsPerPage: 2,
                paginatedProjectNameList: [],
                totalPages: 0,
                sortOrderForPaging: 'newest',
                monthForPaging: '' // Track which month the list was built for
            },
            isSummaryPopupListenerAttached: false // Initialize the flag
        },

        // --- 4. DOM ELEMENT REFERENCES ---
        elements: {},

        /**
         * =================================================================
         * INITIALIZATION METHOD
         * =================================================================
         */
        init() {
            try {
                if (typeof firebase === 'undefined' || typeof firebase.initializeApp === 'undefined') {
                    throw new Error("Firebase SDK not loaded.");
                }
                this.app = firebase.initializeApp(this.config.firebase);
                this.db = firebase.firestore();
                this.auth = firebase.auth();
                console.log("Firebase initialized successfully!");

                this.methods.setupDOMReferences.call(this);
                this.methods.loadColumnVisibilityState.call(this);
                this.methods.setupAuthRelatedDOMReferences.call(this);
                this.methods.attachEventListeners.call(this);
                this.methods.setupAuthActions.call(this);
                this.methods.listenForAuthStateChanges.call(this);

            } catch (error) {
                console.error("CRITICAL: Error initializing Firebase:", error.message);
                const loadingMessageElement = document.getElementById('loading-auth-message');
                if (loadingMessageElement) {
                    loadingMessageElement.innerHTML = `<p style="color:red;">CRITICAL ERROR: Could not connect to Firebase. App will not function correctly. Error: ${error.message}</p>`;
                } else {
                    alert("CRITICAL ERROR: Could not connect to Firebase. Error: " + error.message);
                }
            }
        },

        /**
         * =================================================================
         * ALL APPLICATION METHODS
         * =================================================================
         */
        methods: {

            // --- SETUP AND EVENT LISTENERS ---

            setupDOMReferences() {
                this.elements = {
                    ...this.elements,
                    openAddNewProjectBtn: document.getElementById('openAddNewProjectBtn'),
                    openTlDashboardBtn: document.getElementById('openTlDashboardBtn'),
                    openSettingsBtn: document.getElementById('openSettingsBtn'),
                    openTlSummaryBtn: document.getElementById('openTlSummaryBtn'),
                    exportCsvBtn: document.getElementById('exportCsvBtn'),
                    openImportCsvBtn: document.getElementById('openImportCsvBtn'),
                    projectFormModal: document.getElementById('projectFormModal'),
                    tlDashboardModal: document.getElementById('tlDashboardModal'),
                    settingsModal: document.getElementById('settingsModal'),
                    tlSummaryModal: document.getElementById('tlSummaryModal'),
                    importCsvModal: document.getElementById('importCsvModal'),
                    closeProjectFormBtn: document.getElementById('closeProjectFormBtn'),
                    closeTlDashboardBtn: document.getElementById('closeTlDashboardBtn'),
                    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
                    closeTlSummaryBtn: document.getElementById('closeTlSummaryBtn'),
                    closeImportCsvBtn: document.getElementById('closeImportCsvBtn'),
                    csvFileInput: document.getElementById('csvFileInput'),
                    processCsvBtn: document.getElementById('processCsvBtn'),
                    csvImportStatus: document.getElementById('csvImportStatus'),
                    newProjectForm: document.getElementById('newProjectForm'),
                    projectTableBody: document.getElementById('projectTableBody'),
                    loadingOverlay: document.getElementById('loadingOverlay'),
                    batchIdSelect: document.getElementById('batchIdSelect'),
                    fixCategoryFilter: document.getElementById('fixCategoryFilter'),
                    monthFilter: document.getElementById('monthFilter'),
                    sortByFilter: document.getElementById('sortByFilter'),
                    paginationControls: document.getElementById('paginationControls'),
                    prevPageBtn: document.getElementById('prevPageBtn'),
                    nextPageBtn: document.getElementById('nextPageBtn'),
                    pageInfo: document.getElementById('pageInfo'),
                    tlDashboardContentElement: document.getElementById('tlDashboardContent'),
                    allowedEmailsList: document.getElementById('allowedEmailsList'),
                    addEmailInput: document.getElementById('addEmailInput'),
                    addEmailBtn: document.getElementById('addEmailBtn'),
                    tlSummaryContent: document.getElementById('tlSummaryContent'),
                    toggleTitleCheckbox: document.getElementById('toggleTitleCheckbox'),
                    toggleDay2Checkbox: document.getElementById('toggleDay2Checkbox'),
                    toggleDay3Checkbox: document.getElementById('toggleDay3Checkbox'),
                    // REMOVED: tlSummaryRefreshBtn is now generated dynamically
                    // tlSummaryRefreshBtn: document.getElementById('tlSummaryRefreshBtn'),

                    // ADDED: (User Request) New DOM elements for User Settings.
                    // IMPORTANT: You must add these elements to your HTML file inside the 'settingsModal'.
                    userFullNameInput: document.getElementById('userFullNameInput'), // e.g., <input type="text" id="userFullNameInput">
                    userTechIdInput: document.getElementById('userTechIdInput'), // e.g., <input type="text" id="userTechIdInput">
                    saveUserInfoBtn: document.getElementById('saveUserInfoBtn'), // e.g., <button id="saveUserInfoBtn">Save My Info</button>
                };
            },

            setupAuthRelatedDOMReferences() {
                this.elements = {
                    ...this.elements,
                    body: document.body,
                    authWrapper: document.getElementById('auth-wrapper'),
                    mainContainer: document.querySelector('.container'),
                    signInBtn: document.getElementById('signInBtn'),
                    signOutBtn: document.getElementById('signOutBtn'),
                    clearDataBtn: document.getElementById('clearDataBtn'),
                    userInfoDisplayDiv: document.getElementById('user-info-display'),
                    userNameP: document.getElementById('userName'),
                    userEmailP: document.getElementById('userEmail'),
                    userPhotoImg: document.getElementById('userPhoto'),
                    appContentDiv: document.getElementById('app-content'),
                    loadingAuthMessageDiv: document.getElementById('loading-auth-message'),
                };
            },

            attachEventListeners() {
                const self = this;

                const attachClick = (element, handler) => {
                    if (element) element.onclick = handler;
                };

                attachClick(self.elements.openAddNewProjectBtn, () => {
                    const pin = prompt("Enter PIN to add new tracker:");
                    if (pin === self.config.pins.TL_DASHBOARD_PIN) self.elements.projectFormModal.style.display = 'block';
                    else if (pin) alert("Incorrect PIN.");
                });

                attachClick(self.elements.openTlDashboardBtn, () => {
                    const pin = prompt("Enter PIN to access Project Settings:");
                    if (pin === self.config.pins.TL_DASHBOARD_PIN) {
                        self.elements.tlDashboardModal.style.display = 'block';
                        self.methods.renderTLDashboard.call(self);
                    } else if (pin) alert("Incorrect PIN.");
                });

                attachClick(self.elements.openSettingsBtn, () => {
                    const pin = prompt("Enter PIN to access User Settings:");
                    if (pin === self.config.pins.TL_DASHBOARD_PIN) {
                        self.elements.settingsModal.style.display = 'block';
                        // MODIFIED: (User Request) Call new function to render all user settings
                        self.methods.renderUserSettings.call(self);
                    } else if (pin) alert("Incorrect PIN.");
                });

                attachClick(self.elements.openTlSummaryBtn, () => {
                    self.elements.tlSummaryModal.style.display = 'block';
                    self.methods.generateTlSummaryData.call(self);
                });

                // REMOVED: Refresh button is now created dynamically in generateTlSummaryData
                // attachClick(self.elements.tlSummaryRefreshBtn, self.methods.generateTlSummaryData.bind(self));

                attachClick(self.elements.exportCsvBtn, self.methods.handleExportCsv.bind(self));

                attachClick(self.elements.openImportCsvBtn, () => {
                    const pin = prompt("Enter PIN to import CSV:");
                    if (pin === self.config.pins.TL_DASHBOARD_PIN) {
                        self.elements.importCsvModal.style.display = 'block';
                        if (self.elements.csvFileInput) self.elements.csvFileInput.value = '';
                        if (self.elements.processCsvBtn) self.elements.processCsvBtn.disabled = true;
                        if (self.elements.csvImportStatus) self.elements.csvImportStatus.textContent = '';
                    } else if (pin) alert("Incorrect PIN.");
                });
                attachClick(self.elements.closeImportCsvBtn, () => {
                    self.elements.importCsvModal.style.display = 'none';
                });
                if (self.elements.csvFileInput) {
                    self.elements.csvFileInput.onchange = (event) => {
                        if (event.target.files.length > 0) {
                            self.elements.processCsvBtn.disabled = false;
                            self.elements.csvImportStatus.textContent = `File selected: ${event.target.files[0].name}`;
                        } else {
                            self.elements.processCsvBtn.disabled = true;
                            self.elements.csvImportStatus.textContent = '';
                        }
                    };
                }
                attachClick(self.elements.processCsvBtn, self.methods.handleProcessCsvImport.bind(self));

                attachClick(self.elements.closeProjectFormBtn, () => {
                    if (self.elements.newProjectForm) self.elements.newProjectForm.reset();
                    self.elements.projectFormModal.style.display = 'none';
                });
                attachClick(self.elements.closeTlDashboardBtn, () => {
                    self.elements.tlDashboardModal.style.display = 'none';
                });
                attachClick(self.elements.closeSettingsBtn, () => {
                    self.elements.settingsModal.style.display = 'none';
                });
                attachClick(self.elements.closeTlSummaryBtn, () => {
                    self.elements.tlSummaryModal.style.display = 'none';
                });

                attachClick(self.elements.addEmailBtn, self.methods.handleAddEmail.bind(self));
                // ADDED: (User Request) Attach listener for the new "Save User Info" button
                attachClick(self.elements.saveUserInfoBtn, self.methods.handleSaveUserInfo.bind(self));
                attachClick(self.elements.clearDataBtn, self.methods.handleClearData.bind(self));
                attachClick(self.elements.nextPageBtn, self.methods.handleNextPage.bind(self));
                attachClick(self.elements.prevPageBtn, self.methods.handlePrevPage.bind(self));


                if (self.elements.newProjectForm) {
                    self.elements.newProjectForm.addEventListener('submit', self.methods.handleAddProjectSubmit.bind(self));
                }

                const resetPaginationAndReload = () => {
                    self.state.pagination.currentPage = 1;
                    self.state.pagination.paginatedProjectNameList = [];
                    self.methods.initializeFirebaseAndLoadData.call(self);
                };

                if (self.elements.batchIdSelect) {
                    self.elements.batchIdSelect.onchange = (e) => {
                        self.state.filters.batchId = e.target.value;
                        localStorage.setItem('currentSelectedBatchId', self.state.filters.batchId);
                        resetPaginationAndReload();
                    };
                }
                if (self.elements.fixCategoryFilter) {
                    self.elements.fixCategoryFilter.onchange = (e) => {
                        self.state.filters.fixCategory = e.target.value;
                        resetPaginationAndReload();
                    };
                }
                if (self.elements.monthFilter) {
                    self.elements.monthFilter.onchange = (e) => {
                        self.state.filters.month = e.target.value;
                        localStorage.setItem('currentSelectedMonth', self.state.filters.month);
                        self.state.filters.batchId = "";
                        localStorage.setItem('currentSelectedBatchId', "");
                        resetPaginationAndReload();
                    };
                }

                if (self.elements.sortByFilter) {
                    self.elements.sortByFilter.value = self.state.filters.sortBy;
                    self.elements.sortByFilter.onchange = (e) => {
                        self.state.filters.sortBy = e.target.value;
                        localStorage.setItem('currentSortBy', e.target.value);
                        resetPaginationAndReload();
                    };
                }

                if (self.elements.toggleTitleCheckbox) {
                    self.elements.toggleTitleCheckbox.onchange = () => {
                        self.methods.saveColumnVisibilityState.call(self);
                        self.methods.applyColumnVisibility.call(self);
                    };
                }
                if (self.elements.toggleDay2Checkbox) {
                    self.elements.toggleDay2Checkbox.onchange = () => {
                        self.methods.saveColumnVisibilityState.call(self);
                        self.methods.applyColumnVisibility.call(self);
                    };
                }
                if (self.elements.toggleDay3Checkbox) {
                    self.elements.toggleDay3Checkbox.onchange = () => {
                        self.methods.saveColumnVisibilityState.call(self);
                        self.methods.applyColumnVisibility.call(self);
                    };
                }

                window.onclick = (event) => {
                    if (event.target == self.elements.tlDashboardModal) self.elements.tlDashboardModal.style.display = 'none';
                    if (event.target == self.elements.settingsModal) self.elements.settingsModal.style.display = 'none';
                    if (event.target == self.elements.tlSummaryModal) self.elements.tlSummaryModal.style.display = 'none';
                    if (event.target == self.elements.importCsvModal) self.elements.importCsvModal.style.display = 'none';
                };
            },


            handleNextPage() {
                if (this.state.pagination.currentPage < this.state.pagination.totalPages) {
                    this.state.pagination.currentPage++;
                    this.methods.initializeFirebaseAndLoadData.call(this);
                }
            },

            handlePrevPage() {
                if (this.state.pagination.currentPage > 1) {
                    this.state.pagination.currentPage--;
                    this.methods.initializeFirebaseAndLoadData.call(this);
                }
            },


            listenForAuthStateChanges() {
                if (!this.auth) {
                    console.error("Firebase Auth is not initialized. Application cannot function.");
                    return;
                }
                this.auth.onAuthStateChanged(async (user) => {
                    if (user) {
                        this.methods.showLoading.call(this, "Checking authorization...");
                        await this.methods.fetchAllowedEmails.call(this);
                        const userEmailLower = user.email ? user.email.toLowerCase() : "";

                        if (this.state.allowedEmails.map(e => e.toLowerCase()).includes(userEmailLower)) {
                            this.methods.handleAuthorizedUser.call(this, user);
                        } else {
                            alert("Access Denied: Your email address is not authorized for this application.");
                            this.auth.signOut();
                        }
                    } else {
                        this.methods.handleSignedOutUser.call(this);
                    }
                    this.methods.hideLoading.call(this);
                });
            },

            async handleAuthorizedUser(user) { // MODIFIED: Added async
                this.elements.body.classList.remove('login-view-active');
                this.elements.authWrapper.style.display = 'none';
                this.elements.mainContainer.style.display = 'block';

                this.elements.userNameP.textContent = user.displayName || "N/A";
                this.elements.userEmailP.textContent = user.email || "N/A";
                if (this.elements.userPhotoImg) this.elements.userPhotoImg.src = user.photoURL || 'default-user.png';

                this.elements.userInfoDisplayDiv.style.display = 'flex';
                if (this.elements.clearDataBtn) this.elements.clearDataBtn.style.display = 'none';
                this.elements.appContentDiv.style.display = 'block';
                this.elements.loadingAuthMessageDiv.style.display = 'none';
                if (this.elements.openSettingsBtn) this.elements.openSettingsBtn.style.display = 'block';

                if (!this.state.isAppInitialized) {
                    // ADDED: (User Request) Fetch dynamic tech IDs before loading data
                    await this.methods.fetchTechIds.call(this);
                    this.methods.initializeFirebaseAndLoadData.call(this);
                    this.state.isAppInitialized = true;
                    this.methods.listenForNotifications.call(this);
                }
            },

            handleSignedOutUser() {
                this.elements.body.classList.add('login-view-active');
                this.elements.authWrapper.style.display = 'block';
                this.elements.mainContainer.style.display = 'none';

                this.elements.userInfoDisplayDiv.style.display = 'none';
                if (this.elements.clearDataBtn) this.elements.clearDataBtn.style.display = 'block';
                this.elements.appContentDiv.style.display = 'none';
                this.elements.loadingAuthMessageDiv.innerHTML = "<p>Please sign in to access the Project Tracker.</p>";
                this.elements.loadingAuthMessageDiv.style.display = 'block';
                if (this.elements.openSettingsBtn) this.elements.openSettingsBtn.style.display = 'none';

                if (this.firestoreListenerUnsubscribe) {
                    this.firestoreListenerUnsubscribe();
                    this.firestoreListenerUnsubscribe = null;
                }
                // Stop listening to notifications on sign out
                if (this.notificationListenerUnsubscribe) {
                    this.notificationListenerUnsubscribe();
                    this.notificationListenerUnsubscribe = null;
                }
                this.state.isAppInitialized = false;
            },

            setupAuthActions() {
                const provider = new firebase.auth.GoogleAuthProvider();
                provider.addScope('email');

                if (this.elements.signInBtn) {
                    this.elements.signInBtn.onclick = () => {
                        this.methods.showLoading.call(this, "Signing in...");
                        this.auth.signInWithPopup(provider).catch((error) => {
                            console.error("Sign-in error:", error);
                            alert("Error signing in: " + error.message);
                            this.methods.hideLoading.call(this);
                        });
                    };
                }

                if (this.elements.signOutBtn) {
                    this.elements.signOutBtn.onclick = () => { // FIXED: Changed from self.elements.signOutBtn to this.elements.signOutBtn
                        this.methods.showLoading.call(this, "Signing out...");
                        this.auth.signOut().catch((error) => {
                            console.error("Sign-out error:", error);
                            alert("Error signing out: " + error.message);
                            this.methods.hideLoading.call(this);
                        });
                    };
                }
            },


            async initializeFirebaseAndLoadData() {
                this.methods.showLoading.call(this, "Loading projects...");
                if (!this.db || !this.elements.paginationControls) {
                    console.error("Firestore or crucial UI elements not initialized.");
                    this.methods.hideLoading.call(this);
                    return;
                }
                if (this.firestoreListenerUnsubscribe) this.firestoreListenerUnsubscribe();

                this.methods.loadGroupVisibilityState.call(this);
                await this.methods.populateMonthFilter.call(this);
                await this.methods.populateProjectNameFilter.call(this);

                const sortDirection = this.state.filters.sortBy === 'oldest' ? 'asc' : 'desc';
                const shouldPaginate = !this.state.filters.batchId && !this.state.filters.fixCategory;

                let projectsQuery = this.db.collection("projects");

                if (shouldPaginate) {
                    this.elements.paginationControls.style.display = 'block';

                    if (this.state.pagination.paginatedProjectNameList.length === 0 ||
                        this.state.pagination.sortOrderForPaging !== this.state.filters.sortBy ||
                        this.state.pagination.monthForPaging !== this.state.filters.month) {

                        this.methods.showLoading.call(this, "Building project list for pagination...");

                        let nameQuery = this.db.collection("projects");

                        if (this.state.filters.month) {
                            const [year, month] = this.state.filters.month.split('-');
                            const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
                            const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999);
                            nameQuery = nameQuery.where("creationTimestamp", ">=", startDate).where("creationTimestamp", "<=", endDate);
                        }

                        const allTasksSnapshot = await nameQuery.orderBy("creationTimestamp", sortDirection).get();
                        const uniqueNames = new Set();
                        const sortedNames = [];
                        allTasksSnapshot.forEach(doc => {
                            const name = doc.data().baseProjectName;
                            if (name && !uniqueNames.has(name)) {
                                uniqueNames.add(name);
                                sortedNames.push(name);
                            }
                        });

                        this.state.pagination.paginatedProjectNameList = sortedNames;
                        this.state.pagination.totalPages = Math.ceil(sortedNames.length / this.state.pagination.projectsPerPage);
                        this.state.pagination.sortOrderForPaging = this.state.filters.sortBy;
                        this.state.pagination.monthForPaging = this.state.filters.month;
                    }

                    const startIndex = (this.state.pagination.currentPage - 1) * this.state.pagination.projectsPerPage;
                    const endIndex = startIndex + this.state.pagination.projectsPerPage;
                    const projectsToDisplay = this.state.pagination.paginatedProjectNameList.slice(startIndex, endIndex);

                    if (projectsToDisplay.length > 0) {
                        projectsQuery = projectsQuery.where("baseProjectName", "in", projectsToDisplay);
                    } else {
                        projectsQuery = projectsQuery.where("baseProjectName", "==", "no-projects-exist-yet-dummy-value");
                    }
                } else {
                    this.elements.paginationControls.style.display = 'none';
                    if (this.state.filters.month) {
                        const [year, month] = this.state.filters.month.split('-');
                        const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
                        const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999);
                        projectsQuery = projectsQuery.where("creationTimestamp", ">=", startDate).where("creationTimestamp", "<=", endDate);
                    }
                    if (this.state.filters.batchId) {
                        projectsQuery = projectsQuery.where("baseProjectName", "==", this.state.filters.batchId);
                    }
                    if (this.state.filters.fixCategory) {
                        projectsQuery = projectsQuery.where("fixCategory", "==", this.state.filters.fixCategory);
                    }
                }

                projectsQuery = projectsQuery.orderBy("creationTimestamp", sortDirection);

                this.firestoreListenerUnsubscribe = projectsQuery.onSnapshot(snapshot => {
                    let newProjects = [];
                    snapshot.forEach(doc => {
                        if (doc.exists) newProjects.push({
                            id: doc.id,
                            ...doc.data()
                        });
                    });

                    if (shouldPaginate) {
                        newProjects = newProjects.filter(p => this.state.pagination.paginatedProjectNameList.includes(p.baseProjectName));
                    }

                    this.state.projects = newProjects.map(p => ({
                        breakDurationMinutesDay1: 0,
                        breakDurationMinutesDay2: 0,
                        breakDurationMinutesDay3: 0,
                        additionalMinutesManual: 0,
                        isLocked: p.isLocked || false, // Ensure isLocked defaults to false
                        ...p
                    }));
                    this.methods.refreshAllViews.call(this);
                }, error => {
                    console.error("Error fetching projects:", error);
                    this.state.projects = [];
                    this.methods.refreshAllViews.call(this);
                    alert("Error loading projects: " + error.message);
                });
            },

            async populateMonthFilter() {
                try {
                    const snapshot = await this.db.collection("projects").orderBy("creationTimestamp", "desc").get();
                    const uniqueMonths = new Set();
                    snapshot.forEach(doc => {
                        const data = doc.data();
                        if (data.creationTimestamp?.toDate) {
                            const date = data.creationTimestamp.toDate();
                            uniqueMonths.add(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
                        }
                    });

                    this.elements.monthFilter.innerHTML = '<option value="">All Months</option>';
                    Array.from(uniqueMonths).sort((a, b) => b.localeCompare(a)).forEach(monthYear => {
                        const [year, month] = monthYear.split('-');
                        const option = document.createElement('option');
                        option.value = monthYear;
                        option.textContent = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString('en-US', { // FIX: parseInt(year)
                            year: 'numeric',
                            month: 'long'
                        });
                        this.elements.monthFilter.appendChild(option);
                    });

                    if (this.state.filters.month && Array.from(uniqueMonths).includes(this.state.filters.month)) {
                        this.elements.monthFilter.value = this.state.filters.month;
                    } else {
                        this.elements.monthFilter.value = "";
                        this.elements.monthFilter.value = "";
                        localStorage.setItem('currentSelectedMonth', "");
                    }
                } catch (error) {
                    console.error("Error populating month filter:", error);
                }
            },

            async populateProjectNameFilter() {
                let query = this.db.collection("projects");
                if (this.state.filters.month) {
                    const [year, month] = this.state.filters.month.split('-');
                    const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
                    const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999);
                    query = query.where("creationTimestamp", ">=", startDate).where("creationTimestamp", "<=", endDate);
                }

                try {
                    const snapshot = await query.get();
                    const uniqueNames = new Set();
                    snapshot.forEach(doc => {
                        if (doc.data().baseProjectName) uniqueNames.add(doc.data().baseProjectName);
                    });
                    const sortedNames = Array.from(uniqueNames).sort();

                    this.elements.batchIdSelect.innerHTML = '<option value="">All Projects</option>';
                    sortedNames.forEach(name => {
                        const option = document.createElement('option');
                        option.value = name;
                        option.textContent = name;
                        this.elements.batchIdSelect.appendChild(option);
                    });

                    if (this.state.filters.batchId && sortedNames.includes(this.state.filters.batchId)) {
                        this.elements.batchIdSelect.value = this.state.filters.batchId;
                    } else {
                        this.elements.batchIdSelect.value = "";
                        this.state.filters.batchId = "";
                        localStorage.setItem('currentSelectedBatchId', "");
                    }
                } catch (error) {
                    console.error("Error populating project name filter:", error);
                    this.elements.batchIdSelect.innerHTML = '<option value="" disabled selected>Error</option>';
                }
            },

            async handleAddProjectSubmit(event) {
                event.preventDefault();
                this.methods.showLoading.call(this, "Adding project(s)...");

                const fixCategory = "Fix1";
                const numRows = parseInt(document.getElementById('numRows').value, 10);
                const baseProjectName = document.getElementById('baseProjectName').value.trim();
                const gsd = document.getElementById('gsd').value;

                if (!baseProjectName || isNaN(numRows) || numRows < 1) {
                    alert("Invalid input.");
                    this.methods.hideLoading.call(this);
                    return;
                }

                const batchId = `batch_${this.methods.generateId.call(this)}`;
                const creationTimestamp = firebase.firestore.FieldValue.serverTimestamp();
                const batch = this.db.batch();

                try {
                    for (let i = 1; i <= numRows; i++) {
                        const projectData = {
                            batchId,
                            creationTimestamp,
                            fixCategory,
                            baseProjectName,
                            gsd,
                            areaTask: `Area${String(i).padStart(2, '0')}`,
                            assignedTo: "",
                            techNotes: "",
                            status: "Available",
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
                            isReassigned: false,
                            originalProjectId: null,
                            lastModifiedTimestamp: creationTimestamp,
                            breakDurationMinutesDay1: 0,
                            breakDurationMinutesDay2: 0,
                            breakDurationMinutesDay3: 0,
                            additionalMinutesManual: 0,
                            isLocked: false,
                        };
                        const newProjectRef = this.db.collection("projects").doc();
                        batch.set(newProjectRef, projectData);
                    }
                    await batch.commit();

                    await this.db.collection(this.config.firestorePaths.NOTIFICATIONS).add({
                        message: `A new project "${baseProjectName}" with ${numRows} areas has been added!`,
                        type: "new_project",
                        timestamp: firebase.firestore.FieldValue.serverTimestamp()
                    });

                    this.elements.newProjectForm.reset();
                    this.elements.projectFormModal.style.display = 'none';

                    this.state.filters.batchId = baseProjectName;
                    localStorage.setItem('currentSelectedBatchId', baseProjectName);
                    this.state.filters.month = "";
                    localStorage.setItem('currentSelectedMonth', "");
                    this.state.filters.fixCategory = "";

                    this.methods.initializeFirebaseAndLoadData.call(this);

                } catch (error) {
                    console.error("Error adding projects:", error);
                    alert("Error adding projects: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            async updateTimeField(projectId, fieldName, newValue) {
                this.methods.showLoading.call(this, `Updating ${fieldName}...`);
                try {
                    const projectRef = this.db.collection("projects").doc(projectId);

                    await this.db.runTransaction(async (transaction) => {
                        const doc = await transaction.get(projectRef);
                        if (!doc.exists) {
                            throw new Error("Document not found.");
                        }

                        const projectData = doc.data();

                        if (projectData.isLocked) {
                            alert("This task is locked. Please unlock it in Project Settings to make changes.");
                            return;
                        }

                        let firestoreTimestamp = null;
                        const dayMatch = fieldName.match(/Day(\d)/);

                        if (!dayMatch) {
                            throw new Error("Invalid field name for time update.");
                        }

                        const dayNum = dayMatch[1];
                        const startFieldForDay = `startTimeDay${dayNum}`;
                        const finishFieldForDay = `finishTimeDay${dayNum}`;

                        if (newValue) {
                            const [hours, minutes] = newValue.split(':').map(Number);
                            if (isNaN(hours) || isNaN(minutes)) {
                                return;
                            }
                            const existingTimestamp = projectData[fieldName]?.toDate();
                            const fallbackTimestamp = projectData[startFieldForDay]?.toDate() ||
                                projectData[finishFieldForDay]?.toDate() ||
                                projectData.creationTimestamp?.toDate() ||
                                new Date();

                            const baseDate = existingTimestamp || fallbackTimestamp;

                            const yearForDate = baseDate.getFullYear();
                            const mm = String(baseDate.getMonth() + 1).padStart(2, '0');
                            const dd = String(baseDate.getDate()).padStart(2, '0');
                            const defaultDateString = `${yearForDate}-${mm}-${dd}`;

                            const dateInput = prompt(`Please confirm or enter the date for this time entry (YYYY-MM-DD):`, defaultDateString);

                            if (!dateInput) {
                                console.log("Time update cancelled by user.");
                                return;
                            }

                            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                            if (!dateRegex.test(dateInput)) {
                                alert("Invalid date format. Please use APAC-MM-DD. Aborting update.");
                                return;
                            }

                            const finalDate = new Date(`${dateInput}T${newValue}:00`);
                            if (isNaN(finalDate.getTime())) {
                                alert("Invalid date or time provided. Aborting update.");
                                return;
                            }

                            firestoreTimestamp = firebase.firestore.Timestamp.fromDate(finalDate);
                        }

                        let newStartTime, newFinishTime;

                        if (fieldName.includes("startTime")) {
                            newStartTime = firestoreTimestamp;
                            newFinishTime = projectData[finishFieldForDay];
                        } else {
                            newStartTime = projectData[startFieldForDay];
                            newFinishTime = firestoreTimestamp;
                        }

                        const durationFieldToUpdate = `durationDay${dayNum}Ms`;
                        const newDuration = this.methods.calculateDurationMs.call(this, newStartTime, newFinishTime);

                        transaction.update(projectRef, {
                            [fieldName]: firestoreTimestamp,
                            [durationFieldToUpdate]: newDuration,
                            lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    });

                } catch (error) {
                    console.error(`Error updating ${fieldName}:`, error);
                    alert(`Error updating time: ${error.message}`);
                    this.methods.refreshAllViews.call(this);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            async updateProjectState(projectId, action) {
                this.methods.showLoading.call(this, "Updating project state...");
                const projectRef = this.db.collection("projects").doc(projectId);

                try {
                    const docSnap = await projectRef.get();
                    if (!docSnap.exists) throw new Error("Project document not found.");

                    const project = docSnap.data();
                    if (project.isLocked) {
                        alert("This task is locked and cannot be updated. Please unlock it in Project Settings.");
                        this.methods.hideLoading.call(this);
                        return;
                    }

                    const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();
                    let updates = {
                        lastModifiedTimestamp: serverTimestamp
                    };

                    switch (action) {
                        case "startDay1":
                            updates.status = "InProgressDay1";
                            updates.startTimeDay1 = serverTimestamp;
                            break;
                        case "endDay1":
                            updates.status = "Day1Ended_AwaitingNext";
                            const finishTimeD1 = firebase.firestore.Timestamp.now();
                            updates.finishTimeDay1 = finishTimeD1;
                            updates.durationDay1Ms = this.methods.calculateDurationMs.call(this, project.startTimeDay1, finishTimeD1);
                            break;
                        case "startDay2":
                            updates.status = "InProgressDay2";
                            updates.startTimeDay2 = serverTimestamp;
                            break;
                        case "endDay2":
                            updates.status = "Day2Ended_AwaitingNext";
                            const finishTimeD2 = firebase.firestore.Timestamp.now();
                            updates.finishTimeDay2 = finishTimeD2;
                            updates.durationDay2Ms = this.methods.calculateDurationMs.call(this, project.startTimeDay2, finishTimeD2);
                            break;
                        case "startDay3":
                            updates.status = "InProgressDay3";
                            updates.startTimeDay3 = serverTimestamp;
                            break;
                        case "endDay3":
                            updates.status = "Day3Ended_AwaitingNext";
                            const finishTimeD3 = firebase.firestore.Timestamp.now();
                            updates.finishTimeDay3 = finishTimeD3;
                            updates.durationDay3Ms = this.methods.calculateDurationMs.call(this, project.startTimeDay3, finishTimeD3);
                            break;
                        case "markDone":
                            updates.status = "Completed";
                            if (project.status === "InProgressDay1" && !project.finishTimeDay1) {
                                const finishTime = firebase.firestore.Timestamp.now();
                                updates.finishTimeDay1 = finishTime;
                                updates.durationDay1Ms = this.methods.calculateDurationMs.call(this, project.startTimeDay1, finishTime);
                            } else if (project.status === "InProgressDay2" && !project.finishTimeDay2) {
                                const finishTime = firebase.firestore.Timestamp.now();
                                updates.finishTimeDay2 = finishTime;
                                updates.durationDay2Ms = this.methods.calculateDurationMs.call(this, project.startTimeDay2, finishTime);
                            } else if (project.status === "InProgressDay3" && !project.finishTimeDay3) {
                                const finishTime = firebase.firestore.Timestamp.now();
                                updates.finishTimeDay3 = finishTime;
                                updates.durationDay3Ms = this.methods.calculateDurationMs.call(this, project.startTimeDay3, finishTime);
                            }
                            break;
                        default:
                            this.methods.hideLoading.call(this);
                            return;
                    }

                    await projectRef.update(updates);
                } catch (error) {
                    console.error(`Error updating project for action ${action}:`, error);
                    alert("Error updating project status: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },


            refreshAllViews() {
                try {
                    this.methods.renderProjects.call(this);
                    this.methods.updatePaginationUI.call(this);
                    this.methods.applyColumnVisibility.call(this);
                } catch (error) {
                    console.error("Error during refreshAllViews:", error);
                    if (this.elements.projectTableBody) this.elements.projectTableBody.innerHTML = `<tr><td colspan="${this.config.NUM_TABLE_COLUMNS}" style="color:red;text-align:center;">Error loading projects.</td></tr>`;
                }
                this.methods.hideLoading.call(this);
            },

            updatePaginationUI() {
                if (!this.elements.paginationControls || this.elements.paginationControls.style.display === 'none') {
                    return;
                }
                const {
                    currentPage,
                    totalPages
                } = this.state.pagination;
                if (totalPages > 0) {
                    this.elements.pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
                } else {
                    this.elements.pageInfo.textContent = "No projects found";
                }
                this.elements.prevPageBtn.disabled = currentPage <= 1;
                this.elements.nextPageBtn.disabled = currentPage >= totalPages;
            },

            getProgressBarColor(percentage) {
                if (percentage < 50) {
                    return '#2ecc71'; // Green
                } else if (percentage < 85) {
                    return '#f1c40f'; // Yellow
                } else {
                    return '#e74c3c'; // Red
                }
            },

            renderProjects() {
                if (!this.elements.projectTableBody) return;
                this.elements.projectTableBody.innerHTML = "";
            
                const sortedProjects = [...this.state.projects].sort((a, b) => {
                    const nameA = a.baseProjectName || "";
                    const nameB = b.baseProjectName || "";
                    const fixA = this.config.FIX_CATEGORIES.ORDER.indexOf(a.fixCategory || "");
                    const fixB = this.config.FIX_CATEGORIES.ORDER.indexOf(b.fixCategory || "");
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
            
                // Pre-calculate lock status for each group
                const groupLockStatus = {};
                sortedProjects.forEach(p => {
                    const groupKey = `${p.baseProjectName}_${p.fixCategory}`;
                    if (!groupLockStatus[groupKey]) {
                        groupLockStatus[groupKey] = {
                            locked: 0,
                            total: 0
                        };
                    }
                    groupLockStatus[groupKey].total++;
                    if (p.isLocked) {
                        groupLockStatus[groupKey].locked++;
                    }
                });
            
                let currentBaseProjectNameHeader = null,
                    currentFixCategoryHeader = null;
            
                if (sortedProjects.length === 0) {
                    const row = this.elements.projectTableBody.insertRow();
                    row.innerHTML = `<td colspan="${this.config.NUM_TABLE_COLUMNS}" style="text-align:center; padding: 20px;">No projects to display for the current filter or page.</td>`;
                    return;
                }
            
                sortedProjects.forEach(project => {
                    if (!project?.id || !project.baseProjectName || !project.fixCategory) return;
            
                    if (project.baseProjectName !== currentBaseProjectNameHeader) {
                        currentBaseProjectNameHeader = project.baseProjectName;
                        currentFixCategoryHeader = null;
                        const headerRow = this.elements.projectTableBody.insertRow();
                        headerRow.className = "batch-header-row";
                        headerRow.innerHTML = `<td colspan="${this.config.NUM_TABLE_COLUMNS}"># ${project.baseProjectName}</td>`;
                    }
            
                    if (project.fixCategory !== currentFixCategoryHeader) {
                        currentFixCategoryHeader = project.fixCategory;
                        const groupKey = `${currentBaseProjectNameHeader}_${currentFixCategoryHeader}`;
                        if (this.state.groupVisibilityState[groupKey] === undefined) {
                            this.state.groupVisibilityState[groupKey] = {
                                isExpanded: true
                            };
                        }
                        const isExpanded = this.state.groupVisibilityState[groupKey]?.isExpanded !== false;
            
                        const status = groupLockStatus[groupKey];
                        let lockIcon = '';
                        if (status && status.total > 0) {
                            if (status.locked === status.total) {
                                lockIcon = ' 🔒';
                            } else if (status.locked > 0) {
                                lockIcon = ' 🔑';
                            } else {
                                lockIcon = ' 🔓';
                            }
                        }
            
                        const groupHeaderRow = this.elements.projectTableBody.insertRow();
                        groupHeaderRow.className = "fix-group-header";
                        groupHeaderRow.innerHTML = `<td colspan="${this.config.NUM_TABLE_COLUMNS}">${currentFixCategoryHeader}${lockIcon} <button class="btn btn-group-toggle">${isExpanded ? "Collapse" : "Expand"}</button></td>`;
                        groupHeaderRow.onclick = () => {
                            this.state.groupVisibilityState[groupKey].isExpanded = !isExpanded;
                            this.methods.saveGroupVisibilityState.call(this);
                            this.methods.renderProjects.call(this);
                            this.methods.applyColumnVisibility.call(this);
                        };
                    }
            
                    const row = this.elements.projectTableBody.insertRow();
                    row.style.backgroundColor = this.config.FIX_CATEGORIES.COLORS[project.fixCategory] || this.config.FIX_CATEGORIES.COLORS.default;
                    const groupKey = `${currentBaseProjectNameHeader}_${project.fixCategory}`;
                    if (this.state.groupVisibilityState[groupKey]?.isExpanded === false) row.classList.add("hidden-group-row");
                    if (project.isReassigned) row.classList.add("reassigned-task-highlight");
                    if (project.isLocked) row.classList.add("locked-task-highlight");
            
                    row.insertCell().textContent = project.fixCategory;
                    const projectNameCell = row.insertCell();
                    projectNameCell.textContent = project.baseProjectName;
                    projectNameCell.className = 'column-project-name';
                    row.insertCell().textContent = project.areaTask;
                    row.insertCell().textContent = project.gsd;
            
                    const assignedToCell = row.insertCell();
                    const assignedToSelect = document.createElement('select');
                    assignedToSelect.className = 'assigned-to-select';
                    assignedToSelect.disabled = project.status === "Reassigned_TechAbsent" || project.isLocked;
                    assignedToSelect.innerHTML = `<option value="">Select Tech ID</option>` + this.config.TECH_IDS.map(id => `<option value="${id}">${id}</option>`).join('');
                    assignedToSelect.value = project.assignedTo || "";
                    assignedToSelect.onchange = (e) => this.db.collection("projects").doc(project.id).update({
                        assignedTo: e.target.value,
                        lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    assignedToCell.appendChild(assignedToSelect);
            
                    const statusCell = row.insertCell();
                    let displayStatus = project.status || "Unknown";
                    if (displayStatus === "Day1Ended_AwaitingNext" || displayStatus === "Day2Ended_AwaitingNext" || displayStatus === "Day3Ended_AwaitingNext") {
                        displayStatus = "Started Available";
                    } else {
                        displayStatus = displayStatus.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim();
                    }
                    statusCell.innerHTML = `<span class="status status-${(project.status || "unknown").toLowerCase()}">${displayStatus}</span>`;
            
                    const formatTime = (ts) => ts?.toDate ? ts.toDate().toTimeString().slice(0, 5) : "";
            
                    const createTimeInput = (timeValue, fieldName, dayClass) => {
                        const cell = row.insertCell();
                        cell.className = dayClass || '';
                        const input = document.createElement('input');
                        input.type = 'time';
                        input.value = formatTime(timeValue);
                        input.disabled = project.status === "Reassigned_TechAbsent" || project.isLocked;
                        input.onchange = (e) => this.methods.updateTimeField.call(this, project.id, fieldName, e.target.value);
                        cell.appendChild(input);
                    };
            
                    const createBreakSelect = (day, currentProject, dayClass) => {
                        const cell = row.insertCell();
                        cell.className = `break-cell ${dayClass || ''}`;
                        const select = document.createElement('select');
                        select.className = 'break-select';
                        select.disabled = currentProject.status === "Reassigned_TechAbsent" || currentProject.isLocked;
                        select.innerHTML = `<option value="0">No Break</option><option value="15">15m</option><option value="60">1h</option><option value="75">1h15m</option><option value="90">1h30m</option>`;
                        select.value = currentProject[`breakDurationMinutesDay${day}`] || 0;
                        select.onchange = (e) => this.db.collection("projects").doc(currentProject.id).update({
                            [`breakDurationMinutesDay${day}`]: parseInt(e.target.value, 10),
                            lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
                        });
                        cell.appendChild(select);
                    };
            
                    createTimeInput(project.startTimeDay1, 'startTimeDay1');
                    createTimeInput(project.finishTimeDay1, 'finishTimeDay1');
                    createBreakSelect(1, project);
            
                    createTimeInput(project.startTimeDay2, 'startTimeDay2', 'column-day2');
                    createTimeInput(project.finishTimeDay2, 'finishTimeDay2', 'column-day2');
                    createBreakSelect(2, project, 'column-day2');
            
                    createTimeInput(project.startTimeDay3, 'startTimeDay3', 'column-day3');
                    createTimeInput(project.finishTimeDay3, 'finishTimeDay3', 'column-day3');
                    createBreakSelect(3, project, 'column-day3');
            
                    const totalDurationMs = (project.durationDay1Ms || 0) + (project.durationDay2Ms || 0) + (project.durationDay3Ms || 0);
                    const totalBreakMs = ((project.breakDurationMinutesDay1 || 0) + (project.breakDurationMinutesDay2 || 0) + (project.breakDurationMinutesDay3 || 0)) * 60000;
                    const additionalMs = (project.additionalMinutesManual || 0) * 60000;
                    const finalAdjustedDurationMs = Math.max(0, totalDurationMs - totalBreakMs) + additionalMs;
                    const totalMinutes = this.methods.formatMillisToMinutes.call(this, finalAdjustedDurationMs);
                    const progressPercentage = totalMinutes === "N/A" ? 0 : Math.min(100, (totalMinutes / 480) * 100);
            
                    const progressBarCell = row.insertCell();
                    const progressBarColor = this.methods.getProgressBarColor(progressPercentage);
                    progressBarCell.innerHTML = `
                        <div style="background-color: #e0e0e0; border-radius: 5px; height: 15px; width: 100%; overflow: hidden;">
                            <div style="background-color: ${progressBarColor}; height: 100%; width: ${progressPercentage}%; border-radius: 5px; text-align: center; color: white; font-size: 0.7em;">
                                ${Math.round(progressPercentage)}%
                            </div>
                        </div>
                    `;
            
                    const totalDurationCell = row.insertCell();
                    totalDurationCell.textContent = totalMinutes;
                    totalDurationCell.className = 'total-duration-column';
            
                    const techNotesCell = row.insertCell();
                    const techNotesInput = document.createElement('textarea');
                    techNotesInput.value = project.techNotes || "";
                    techNotesInput.className = 'tech-notes-input';
                    techNotesInput.disabled = project.status === "Reassigned_TechAbsent" || project.isLocked;
                    techNotesInput.onchange = (e) => this.db.collection("projects").doc(project.id).update({
                        techNotes: e.target.value,
                        lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    techNotesCell.appendChild(techNotesInput);
            
                    const actionsCell = row.insertCell();
                    const actionButtonsDiv = document.createElement('div');
                    actionButtonsDiv.className = 'action-buttons-container';
            
                    const createActionButton = (text, className, disabled, action) => {
                        const button = document.createElement('button');
                        button.textContent = text;
                        button.className = `btn ${className}`;
                        button.disabled = project.status === "Reassigned_TechAbsent" || disabled || project.isLocked;
                        button.onclick = () => this.methods.updateProjectState.call(this, project.id, action);
                        return button;
                    };
            
                    actionButtonsDiv.appendChild(createActionButton("Start D1", "btn-day-start", project.status !== "Available", "startDay1"));
                    actionButtonsDiv.appendChild(createActionButton("End D1", "btn-day-end", project.status !== "InProgressDay1", "endDay1"));
                    actionButtonsDiv.appendChild(createActionButton("Start D2", "btn-day-start", project.status !== "Day1Ended_AwaitingNext", "startDay2"));
                    actionButtonsDiv.appendChild(createActionButton("End D2", "btn-day-end", project.status !== "InProgressDay2", "endDay2"));
                    actionButtonsDiv.appendChild(createActionButton("Start D3", "btn-day-start", project.status !== "Day2Ended_AwaitingNext", "startDay3"));
                    actionButtonsDiv.appendChild(createActionButton("End D3", "btn-day-end", project.status !== "InProgressDay3", "endD3"));
                    actionButtonsDiv.appendChild(createActionButton("Done", "btn-mark-done", project.status === "Completed" || project.status === "Reassigned_TechAbsent" || (project.status === "Available" && !(project.durationDay1Ms || project.durationDay2Ms || project.durationDay3Ms)), "markDone"));
            
                    const reassignBtn = createActionButton("Re-Assign", "btn-warning", project.status === "Completed" || project.status === "Reassigned_TechAbsent", "reassign");
                    reassignBtn.onclick = () => this.methods.handleReassignment.call(this, project);
                    actionButtonsDiv.appendChild(reassignBtn);
            
                    actionsCell.appendChild(actionButtonsDiv);
                });
            },

            showLoading(message = "Loading...") {
                if (this.elements.loadingOverlay) {
                    this.elements.loadingOverlay.querySelector('p').textContent = message;
                    this.elements.loadingOverlay.style.display = 'flex';
                }
            },
            hideLoading() {
                if (this.elements.loadingOverlay) {
                    this.elements.loadingOverlay.style.display = 'none';
                }
            },
            generateId() {
                return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
            },
            formatMillisToMinutes(ms) {
                return (ms === null || typeof ms !== 'number' || ms < 0) ? "N/A" : Math.floor(ms / 60000);
            },
            calculateDurationMs(start, finish) {
                const startMs = start?.toMillis ? start.toMillis() : start;
                const finishMs = finish?.toMillis ? finish.toMillis() : finish;
                return (typeof startMs !== 'number' || typeof finishMs !== 'number' || finishMs < startMs) ? null : finishMs - startMs;
            },
            loadGroupVisibilityState() {
                this.state.groupVisibilityState = JSON.parse(localStorage.getItem('projectTrackerGroupVisibility') || '{}');
            },
            saveGroupVisibilityState() {
                localStorage.setItem('projectTrackerGroupVisibility', JSON.stringify(this.state.groupVisibilityState));
            },
            loadColumnVisibilityState() {
                const showTitle = localStorage.getItem('showTitleColumn') !== 'false'; // Default to true
                const showDay2 = localStorage.getItem('showDay2Column') !== 'false';   // Default to true
                const showDay3 = localStorage.getItem('showDay3Column') !== 'false';   // Default to true
            
                if (this.elements.toggleTitleCheckbox) {
                    this.elements.toggleTitleCheckbox.checked = showTitle;
                }
                if (this.elements.toggleDay2Checkbox) {
                    this.elements.toggleDay2Checkbox.checked = showDay2;
                }
                if (this.elements.toggleDay3Checkbox) {
                    this.elements.toggleDay3Checkbox.checked = showDay3;
                }
            },
            saveColumnVisibilityState() {
                if (this.elements.toggleTitleCheckbox) {
                    localStorage.setItem('showTitleColumn', this.elements.toggleTitleCheckbox.checked);
                }
                if (this.elements.toggleDay2Checkbox) {
                    localStorage.setItem('showDay2Column', this.elements.toggleDay2Checkbox.checked);
                }
                if (this.elements.toggleDay3Checkbox) {
                    localStorage.setItem('showDay3Column', this.elements.toggleDay3Checkbox.checked);
                }
            },
            applyColumnVisibility() {
                const showTitle = this.elements.toggleTitleCheckbox.checked;
                const showDay2 = this.elements.toggleDay2Checkbox.checked;
                const showDay3 = this.elements.toggleDay3Checkbox.checked;
            
                document.querySelectorAll('#projectTable .column-project-name').forEach(el => el.classList.toggle('column-hidden', !showTitle));
                document.querySelectorAll('#projectTable .column-day2').forEach(el => el.classList.toggle('column-hidden', !showDay2));
                document.querySelectorAll('#projectTable .column-day3').forEach(el => el.classList.toggle('column-hidden', !showDay3));
            },

            async fetchAllowedEmails() {
                try {
                    const docSnap = await this.db.doc(this.config.firestorePaths.ALLOWED_EMAILS).get();
                    this.state.allowedEmails = docSnap.exists ? docSnap.data().emails || [] : ["ev.lorens.ebrado@gmail.com"];
                } catch (error) {
                    console.error("Error fetching allowed emails:", error);
                    this.state.allowedEmails = ["ev.lorens.ebrado@gmail.com"];
                }
            },
            
            /**
             * ADDED: (User Request) Fetches the dynamic list of Tech IDs from Firestore.
             * Falls back to the hardcoded list if the Firestore document doesn't exist.
             */
            async fetchTechIds() {
                try {
                    const docSnap = await this.db.doc(this.config.firestorePaths.TECH_IDS).get();
                    if (docSnap.exists) {
                        const ids = docSnap.data().ids || [];
                        if (ids.length > 0) {
                            this.config.TECH_IDS = ids.sort();
                            console.log("Successfully fetched dynamic Tech IDs from Firestore.");
                        }
                    }
                } catch (error) {
                    console.error("Error fetching dynamic Tech IDs. Falling back to local list.", error);
                }
            },

            async updateAllowedEmailsInFirestore(emailsArray) {
                this.methods.showLoading.call(this, "Updating allowed emails...");
                try {
                    await this.db.doc(this.config.firestorePaths.ALLOWED_EMAILS).set({
                        emails: emailsArray
                    });
                    this.state.allowedEmails = emailsArray;
                    return true;
                } catch (error) {
                    console.error("Error updating allowed emails:", error);
                    alert("Error saving allowed emails: " + error.message);
                    return false;
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            async getManageableBatches() {
                this.methods.showLoading.call(this, "Loading batches for dashboard...");
                try {
                    const snapshot = await this.db.collection("projects").get();
                    const batches = {};
                    snapshot.forEach(doc => {
                        const task = doc.data();
                        if (task?.batchId) {
                            if (!batches[task.batchId]) {
                                batches[task.batchId] = {
                                    batchId: task.batchId,
                                    baseProjectName: task.baseProjectName || "N/A",
                                    tasksByFix: {},
                                    // Add creationTimestamp to the batch object (assuming first task represents batch creation)
                                    creationTimestamp: task.creationTimestamp || null
                                };
                            }
                            if (task.fixCategory) {
                                if (!batches[task.batchId].tasksByFix[task.fixCategory]) batches[task.batchId].tasksByFix[task.fixCategory] = [];
                                batches[task.batchId].tasksByFix[task.fixCategory].push({
                                    id: doc.id,
                                    ...task
                                });
                            }
                        }
                    });

                    // Sort batches by creationTimestamp (newest first)
                    let sortedBatches = Object.values(batches).sort((a, b) => {
                        const tsA = a.creationTimestamp?.toMillis ? a.creationTimestamp.toMillis() : 0;
                        const tsB = b.creationTimestamp?.toMillis ? b.creationTimestamp.toMillis() : 0;
                        return tsB - tsA; // Descending order
                    });

                    return sortedBatches;
                } catch (error) {
                    console.error("Error fetching batches for dashboard:", error);
                    alert("Error fetching batches: " + error.message);
                    return [];
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            // --- Start of script.js modifications ---

            // MODIFIED: 'renderTLDashboard' function updated with new logic for "Add Extra Area" button.
            async renderTLDashboard() {
                if (!this.elements.tlDashboardContentElement) return;
                this.elements.tlDashboardContentElement.innerHTML = "";
                const batches = await this.methods.getManageableBatches.call(this);

                if (batches.length === 0) {
                    this.elements.tlDashboardContentElement.innerHTML = "<p>No project batches found.</p>";
                    return;
                }

                batches.forEach(batch => {
                    if (!batch?.batchId) return;
                    const batchItemDiv = document.createElement('div');
                    batchItemDiv.className = 'dashboard-batch-item';

                    batchItemDiv.innerHTML = `<h4># ${batch.baseProjectName || "Unknown"}</h4>`;
                    const allFixStages = this.config.FIX_CATEGORIES.ORDER;
                    const stagesPresent = batch.tasksByFix ? Object.keys(batch.tasksByFix).sort((a, b) => allFixStages.indexOf(a) - allFixStages.indexOf(b)) : [];

                    const actionsContainer = document.createElement('div');
                    actionsContainer.className = 'dashboard-actions-grid';

                    const releaseGroup = document.createElement('div');
                    releaseGroup.className = 'dashboard-actions-group';
                    releaseGroup.innerHTML = '<h6>Release Tasks:</h6>';
                    const releaseActionsDiv = document.createElement('div');
                    releaseActionsDiv.className = 'dashboard-action-buttons';
                    allFixStages.forEach((currentFix, index) => {
                        const nextFix = allFixStages[index + 1];
                        if (!nextFix) return;

                        const hasCurrentFix = batch.tasksByFix && batch.tasksByFix[currentFix];
                        const hasNextFix = batch.tasksByFix && batch.tasksByFix[nextFix];

                        if (hasCurrentFix && !hasNextFix) {
                            const unreleasedTasks = batch.tasksByFix[currentFix].filter(task => !task.releasedToNextStage && task.status !== "Reassigned_TechAbsent");

                            if (unreleasedTasks.length > 0) {
                                const releaseBtn = document.createElement('button');
                                releaseBtn.textContent = `Release ${currentFix} to ${nextFix}`;
                                releaseBtn.className = 'btn btn-primary';
                                releaseBtn.onclick = () => {
                                    if (confirm(`Are you sure you want to release all remaining tasks from ${currentFix} to ${nextFix} for project '${batch.baseProjectName}'?`)) {
                                        this.methods.releaseBatchToNextFix.call(this, batch.batchId, currentFix, nextFix);
                                    }
                                };
                                releaseActionsDiv.appendChild(releaseBtn);
                            }
                        }
                    });
                    const addAreaBtn = document.createElement('button');
                    addAreaBtn.textContent = 'Add Extra Area';
                    addAreaBtn.className = 'btn btn-success';
                    addAreaBtn.style.marginLeft = '10px';
                    // --- MODIFIED: (User Request) "Add Extra Area" button logic ---
                    // The button is now disabled if 'Fix1' is not one of the present stages.
                    addAreaBtn.disabled = !stagesPresent.includes('Fix1');
                    addAreaBtn.title = addAreaBtn.disabled ? 'Adding areas is only enabled for projects with a Fix1 stage.' : 'Add a new task area to the latest Fix stage.';
                    // --- End of modification ---
                    addAreaBtn.onclick = () => this.methods.handleAddExtraArea.call(this, batch.batchId, batch.baseProjectName);
                    releaseActionsDiv.appendChild(addAreaBtn);
                    releaseGroup.appendChild(releaseActionsDiv);
                    actionsContainer.appendChild(releaseGroup);

                    // Lock Actions Group
                    const lockGroup = document.createElement('div');
                    lockGroup.className = 'dashboard-actions-group';
                    lockGroup.innerHTML = '<h6>Manage Locking:</h6>';
                    const lockActionsDiv = document.createElement('div');
                    lockActionsDiv.className = 'dashboard-action-buttons';
                    if (batch.tasksByFix) {
                        stagesPresent.forEach(fixCat => {
                            const tasksInFix = batch.tasksByFix[fixCat];
                            const areAllLocked = tasksInFix.every(t => t.isLocked);
                            const shouldLock = !areAllLocked;

                            const lockBtn = document.createElement('button');
                            lockBtn.textContent = `${shouldLock ? 'Lock ' : 'Unlock '} ${fixCat}`;
                            lockBtn.className = `btn ${shouldLock ? 'btn-warning' : 'btn-secondary'} btn-small`;
                            lockBtn.onclick = () => {
                                const action = shouldLock ? 'lock' : 'unlock';
                                if (confirm(`Are you sure you want to ${action} all tasks in ${fixCat} for this project?`)) {
                                    this.methods.toggleLockStateForFixGroup.call(this, batch.batchId, fixCat, shouldLock);
                                }
                            };
                            lockActionsDiv.appendChild(lockBtn);
                        });
                    }
                    lockGroup.appendChild(lockActionsDiv);
                    actionsContainer.appendChild(lockGroup);

                    // NEW: Delete Entire Project Group - Moved here
                    const deleteEntireProjectGroup = document.createElement('div');
                    deleteEntireProjectGroup.className = 'dashboard-actions-group';
                    deleteEntireProjectGroup.innerHTML = '<h6>Delete Current Project:</h6>';

                    const deleteEntireProjectButtonsDiv = document.createElement('div');
                    deleteEntireProjectButtonsDiv.className = 'dashboard-action-buttons';

                    const deleteAllBtn = document.createElement('button');
                    deleteAllBtn.textContent = 'DELETE PROJECT';
                    deleteAllBtn.className = 'btn btn-danger btn-delete-project';
                    deleteAllBtn.style.width = '100%';
                    deleteAllBtn.onclick = () => this.methods.handleDeleteEntireProject.call(this, batch.batchId, batch.baseProjectName);
                    deleteEntireProjectButtonsDiv.appendChild(deleteAllBtn);
                    deleteEntireProjectGroup.appendChild(deleteEntireProjectButtonsDiv);
                    actionsContainer.appendChild(deleteEntireProjectGroup);

                    // Delete Specific Fix Stages Group
                    const deleteGroup = document.createElement('div');
                    deleteGroup.className = 'dashboard-actions-group';
                    deleteGroup.innerHTML = '<h6>Delete Specific Fix Stages:</h6>';
                    const deleteActionsDiv = document.createElement('div');
                    deleteActionsDiv.className = 'dashboard-action-buttons';
                    if (batch.tasksByFix && stagesPresent.length > 0) {
                        const highestStagePresent = stagesPresent[stagesPresent.length - 1];
                        stagesPresent.forEach(fixCat => {
                            const btn = document.createElement('button');
                            btn.textContent = `Delete ${fixCat} Tasks`;
                            btn.className = 'btn btn-danger';
                            if (fixCat !== highestStagePresent) {
                                btn.disabled = true;
                                btn.title = `You must first delete the '${highestStagePresent}' tasks to enable this.`;
                            }
                            btn.onclick = () => {
                                if (confirm(`Are you sure you want to delete all ${fixCat} tasks for project '${batch.baseProjectName}'? This is IRREVERSIBLE.`)) {
                                    this.methods.deleteSpecificFixTasksForBatch.call(this, batch.batchId, fixCat);
                                }
                            };
                            deleteActionsDiv.appendChild(btn);
                        });
                    }
                    deleteGroup.appendChild(deleteActionsDiv);
                    actionsContainer.appendChild(deleteGroup);

                    batchItemDiv.appendChild(actionsContainer);

                    this.elements.tlDashboardContentElement.appendChild(batchItemDiv);
                });
            },
            // --- End of script.js modifications ---

            async recalculateFixStageTotals(batchId, fixCategory) {
                this.methods.showLoading.call(this, `Recalculating totals for ${fixCategory}...`);
                try {
                    const snapshot = await this.db.collection("projects")
                        .where("batchId", "==", batchId)
                        .where("fixCategory", "==", fixCategory)
                        .get();

                    if (snapshot.empty) {
                        alert(`No tasks found for ${fixCategory} in this project.`);
                        return;
                    }

                    const batch = this.db.batch();
                    let tasksToUpdate = 0;

                    snapshot.forEach(doc => {
                        const task = doc.data();

                        const newDurationDay1 = this.methods.calculateDurationMs.call(this, task.startTimeDay1, task.finishTimeDay1);
                        const newDurationDay2 = this.methods.calculateDurationMs.call(this, task.startTimeDay2, task.finishTimeDay2);
                        const newDurationDay3 = this.methods.calculateDurationMs.call(this, task.startTimeDay3, task.finishTimeDay3);

                        let needsUpdate = false;
                        if ((newDurationDay1 || null) !== (task.durationDay1Ms || null)) needsUpdate = true;
                        if ((newDurationDay2 || null) !== (task.durationDay2Ms || null)) needsUpdate = true;
                        if ((newDurationDay3 || null) !== (task.durationDay3Ms || null)) needsUpdate = true;

                        if (needsUpdate) {
                            tasksToUpdate++;
                            const updates = {
                                durationDay1Ms: newDurationDay1,
                                durationDay2Ms: newDurationDay2,
                                durationDay3Ms: newDurationDay3,
                                lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
                            };
                            batch.update(doc.ref, updates);
                        }
                    });

                    if (tasksToUpdate > 0) {
                        await batch.commit();
                        alert(`Success! Recalculated and updated ${tasksToUpdate} task(s) in ${fixCategory}.`);
                    } else {
                        alert(`No tasks in ${fixCategory} required an update.`);
                    }

                } catch (error) {
                    console.error("Error recalculating totals:", error);
                    alert("An error occurred during recalculation: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            async toggleLockStateForFixGroup(batchId, fixCategory, shouldBeLocked) {
                this.methods.showLoading.call(this, `${shouldBeLocked ? 'Locking' : 'Unlocking'} all ${fixCategory} tasks...`);
                try {
                    const snapshot = await this.db.collection("projects")
                        .where("batchId", "==", batchId)
                        .where("fixCategory", "==", fixCategory)
                        .get();

                    if (snapshot.empty) {
                        throw new Error("No tasks found for this Fix category.");
                    }

                    const batch = this.db.batch();
                    snapshot.forEach(doc => {
                        batch.update(doc.ref, {
                            isLocked: shouldBeLocked,
                            lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    });
                    await batch.commit();

                    // Refresh the dashboard to show the new button state
                    await this.methods.renderTLDashboard.call(this);
                } catch (error) {
                    console.error("Error toggling lock state:", error);
                    alert("Error updating lock state: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            async handleAddExtraArea(batchId, baseProjectName) {
                this.methods.showLoading.call(this, 'Analyzing project...');
                try {
                    const projectTasksSnapshot = await this.db.collection("projects")
                        .where("batchId", "==", batchId)
                        .get();

                    if (projectTasksSnapshot.empty) {
                        throw new Error("Could not find any tasks for this project.");
                    }

                    const allTasks = [];
                    projectTasksSnapshot.forEach(doc => allTasks.push(doc.data()));

                    const fixOrder = this.config.FIX_CATEGORIES.ORDER;
                    let latestFixCategory = allTasks.reduce((latest, task) => {
                        const currentIndex = fixOrder.indexOf(task.fixCategory);
                        const latestIndex = fixOrder.indexOf(latest);
                        return currentIndex > latestIndex ? task.fixCategory : latest;
                    }, 'Fix1');

                    const tasksInLatestFix = allTasks.filter(task => task.fixCategory === latestFixCategory);

                    let lastTask, lastAreaNumber = 0;
                    if (tasksInLatestFix.length > 0) {
                        lastTask = tasksInLatestFix.reduce((latest, task) => {
                            const currentNum = parseInt(task.areaTask.replace('Area', ''), 10) || 0;
                            const latestNum = parseInt(latest.areaTask.replace('Area', ''), 10) || 0;
                            return currentNum > latestNum ? task : latest;
                        });
                        lastAreaNumber = parseInt(lastTask.areaTask.replace('Area', ''), 10) || 0;
                    } else {
                        // If no tasks in the latest fix category, fall back to the first task found for project
                        // This assumes at least one task exists for the project, which is checked earlier.
                        lastTask = allTasks[0];
                    }

                    const numToAdd = parseInt(prompt(`Adding extra areas to "${baseProjectName}" - ${latestFixCategory}.\nLast known area number is ${lastAreaNumber}.\n\nHow many extra areas do you want to add?`), 10);

                    if (isNaN(numToAdd) || numToAdd < 1) {
                        if (numToAdd !== null) alert("Invalid number. Please enter a positive number.");
                        return;
                    }

                    this.methods.showLoading.call(this, `Adding ${numToAdd} extra area(s)...`);

                    const firestoreBatch = this.db.batch();
                    const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();

                    for (let i = 1; i <= numToAdd; i++) {
                        const newAreaNumber = lastAreaNumber + i;
                        const newAreaTask = `Area${String(newAreaNumber).padStart(2, '0')}`;

                        const newTaskData = {
                            ...lastTask,
                            fixCategory: latestFixCategory,
                            areaTask: newAreaTask,
                            assignedTo: "",
                            techNotes: "",
                            status: "Available",
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
                            isReassigned: false,
                            originalProjectId: null,
                            isLocked: false,
                            breakDurationMinutesDay1: 0,
                            breakDurationMinutesDay2: 0,
                            breakDurationMinutesDay3: 0,
                            additionalMinutesManual: 0,
                            creationTimestamp: serverTimestamp,
                            lastModifiedTimestamp: serverTimestamp
                        };
                        delete newTaskData.id; // FIX: Changed from newNextFixTask.id to newTaskData.id

                        const newDocRef = this.db.collection("projects").doc();
                        firestoreBatch.set(newDocRef, newTaskData);
                    }

                    await firestoreBatch.commit();
                    alert(`${numToAdd} extra area(s) added successfully to ${latestFixCategory}!`);

                    await this.methods.initializeFirebaseAndLoadData.call(this);
                    await this.methods.renderTLDashboard.call(this);

                } catch (error) {
                    console.error("Error adding extra area:", error);
                    alert("Error adding extra area: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            async handleDeleteEntireProject(batchId, baseProjectName) {
                const confirmationText = 'confirm';
                const userInput = prompt(`This action is irreversible and will delete ALL tasks (Fix1-Fix6) associated with the project "${baseProjectName}".\n\nTo proceed, please type "${confirmationText}" in the box below.`);

                if (userInput === confirmationText) {
                    await this.methods.deleteEntireProjectByBatchId.call(this, batchId, baseProjectName);
                } else {
                    alert('Deletion cancelled. The confirmation text did not match.');
                }
            },

            async deleteEntireProjectByBatchId(batchId, baseProjectName) {
                this.methods.showLoading.call(this, `Deleting all tasks for project "${baseProjectName}"...`);
                try {
                    const snapshot = await this.db.collection("projects").where("batchId", "==", batchId).get();

                    if (snapshot.empty) {
                        alert("No tasks found for this project batch. It might have been deleted already.");
                        return;
                    }

                    const batch = this.db.batch();
                    snapshot.forEach(doc => {
                        batch.delete(doc.ref);
                    });

                    await batch.commit();

                    this.methods.initializeFirebaseAndLoadData.call(this);
                    this.methods.renderTLDashboard.call(this);

                } catch (error) {
                    console.error(`Error deleting entire project (batchId: ${batchId}):`, error);
                    alert("An error occurred while deleting the project: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            async releaseBatchToNextFix(batchId, currentFixCategory, nextFixCategory) {
                this.methods.showLoading.call(this, `Releasing ${currentFixCategory} tasks...`);
                try {
                    const snapshot = await this.db.collection("projects").where("batchId", "==", batchId).where("fixCategory", "==", currentFixCategory).where("releasedToNextStage", "==", false).get();
                    const firestoreBatch = this.db.batch();
                    const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();

                    let projectNameForNotification = "";

                    for (const doc of snapshot.docs) {
                        const task = {
                            id: doc.id,
                            ...doc.data()
                        };
                        if (task.status === "Reassigned_TechAbsent") continue;

                        projectNameForNotification = task.baseProjectName;

                        const newNextFixTask = {
                            ...task,
                            fixCategory: nextFixCategory,
                            status: "Available",
                            techNotes: "",
                            additionalMinutesManual: 0,
                            breakDurationMinutesDay1: 0,
                            breakDurationMinutesDay2: 0,
                            breakDurationMinutesDay3: 0,
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
                            isReassigned: false,
                            isLocked: false,
                            lastModifiedTimestamp: serverTimestamp,
                            originalProjectId: task.id,
                        };
                        delete newNextFixTask.id;

                        const newDocRef = this.db.collection("projects").doc();
                        firestoreBatch.set(newDocRef, newNextFixTask);

                        firestoreBatch.update(doc.ref, {
                            releasedToNextStage: true,
                            lastModifiedTimestamp: serverTimestamp
                        });
                    }
                    await firestoreBatch.commit();

                    if (projectNameForNotification) {
                        await this.db.collection(this.config.firestorePaths.NOTIFICATIONS).add({
                            message: `Tasks from ${currentFixCategory} for project "${projectNameForNotification}" have been released to ${nextFixCategory}!`,
                            type: "fix_release",
                            timestamp: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    }

                    alert(`Release Successful! Tasks from ${currentFixCategory} have been moved to ${nextFixCategory}. The dashboard will now refresh.`);

                    this.methods.initializeFirebaseAndLoadData.call(this);
                    await this.methods.renderTLDashboard.call(this);

                } catch (error) {
                    console.error("Error releasing batch:", error);
                    alert("Error releasing batch: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            async deleteSpecificFixTasksForBatch(batchId, fixCategory) {
                this.methods.showLoading.call(this, `Deleting ${fixCategory} tasks...`);
                try {
                    const firestoreBatch = this.db.batch();
                    const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();

                    const fixOrder = this.config.FIX_CATEGORIES.ORDER;
                    const currentFixIndex = fixOrder.indexOf(fixCategory);

                    if (currentFixIndex > 0) {
                        const previousFixCategory = fixOrder[currentFixIndex - 1];

                        const previousStageSnapshot = await this.db.collection("projects")
                            .where("batchId", "==", batchId)
                            .where("fixCategory", "==", previousFixCategory)
                            .get();

                        previousStageSnapshot.forEach(doc => {
                            firestoreBatch.update(doc.ref, {
                                releasedToNextStage: false,
                                lastModifiedTimestamp: serverTimestamp
                            });
                        });
                    }

                    const snapshot = await this.db.collection("projects").where("batchId", "==", batchId).where("fixCategory", "==", fixCategory).get();
                    snapshot.forEach(doc => firestoreBatch.delete(doc.ref));

                    await firestoreBatch.commit();

                    this.methods.initializeFirebaseAndLoadData.call(this);
                    this.methods.renderTLDashboard.call(this);

                } catch (error) {
                    console.error(`Error deleting tasks:`, error);
                    alert("Error deleting tasks: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            async handleReassignment(projectToReassign) {
                if (!projectToReassign || projectToReassign.status === "Reassigned_TechAbsent") return alert("Cannot re-assign this task.");
                if (projectToReassign.isLocked) return alert("This task is locked. Please unlock its group in Project Settings before reassigning.");

                const newTechId = prompt(`Re-assigning task '${projectToReassign.areaTask}'. Enter NEW Tech ID:`, projectToReassign.assignedTo || "");
                if (!newTechId) return;

                if (confirm(`Create a NEW task for '${newTechId.trim()}'? The current task will be closed.`)) {
                    this.methods.showLoading.call(this, "Reassigning task...");
                    const batch = this.db.batch();
                    const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();

                    const newProjectData = {
                        ...projectToReassign,
                        assignedTo: newTechId.trim(),
                        status: "Available",
                        techNotes: `Reassigned from ${projectToReassign.assignedTo || "N/A"}. Original ID: ${projectToReassign.id}`,
                        creationTimestamp: serverTimestamp,
                        lastModifiedTimestamp: serverTimestamp,
                        isReassigned: true,
                        originalProjectId: null,
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
                        isLocked: false,
                        breakDurationMinutesDay1: 0,
                        breakDurationMinutesDay2: 0,
                        breakDurationMinutesDay3: 0,
                        additionalMinutesManual: 0,
                    };
                    delete newProjectData.id;

                    batch.set(this.db.collection("projects").doc(), newProjectData);
                    batch.update(this.db.collection("projects").doc(projectToReassign.id), {
                        status: "Reassigned_TechAbsent",
                        lastModifiedTimestamp: serverTimestamp
                    });

                    try {
                        await batch.commit();
                    } catch (error) {
                        console.error("Error in re-assignment:", error);
                        alert("Error during re-assignment: " + error.message);
                    } finally {
                        this.methods.hideLoading.call(this);
                    }
                }
            },

            /**
             * ADDED: (User Request) New function to render all components within the User Settings modal.
             * It populates the user's name/Tech ID and the allowed emails list.
             */
            async renderUserSettings() {
                // First, render the allowed emails list as usual
                this.methods.renderAllowedEmailsList.call(this);

                // Second, fetch and display the current user's info
                if (!this.auth.currentUser) return;
                const uid = this.auth.currentUser.uid;
                const userDocRef = this.db.collection(this.config.firestorePaths.USERS).doc(uid);

                try {
                    const docSnap = await userDocRef.get();
                    if (docSnap.exists) {
                        const userData = docSnap.data();
                        if (this.elements.userFullNameInput) this.elements.userFullNameInput.value = userData.fullName || '';
                        if (this.elements.userTechIdInput) this.elements.userTechIdInput.value = userData.techId || '';
                    }
                } catch (error) {
                    console.error("Error fetching user data:", error);
                }
            },

            /**
             * ADDED: (User Request) New handler to save user's custom info (Full Name, Tech ID).
             * Also updates the global Tech ID list in Firestore.
             */
            async handleSaveUserInfo() {
                if (!this.auth.currentUser) {
                    alert("You must be logged in to save user info.");
                    return;
                }
                const uid = this.auth.currentUser.uid;
                const fullName = this.elements.userFullNameInput ? this.elements.userFullNameInput.value.trim() : '';
                const techId = this.elements.userTechIdInput ? this.elements.userTechIdInput.value.trim().toUpperCase() : '';

                if (!fullName || !techId) {
                    alert("Please fill in both your Full Name and Tech ID.");
                    return;
                }

                this.methods.showLoading.call(this, "Saving your info...");

                try {
                    // Save the user-specific info
                    const userDocRef = this.db.collection(this.config.firestorePaths.USERS).doc(uid);
                    await userDocRef.set({
                        fullName,
                        techId,
                        email: this.auth.currentUser.email
                    }, {
                        merge: true
                    });

                    // Update the global list of Tech IDs if the new one is unique
                    if (!this.config.TECH_IDS.includes(techId)) {
                        const updatedTechIds = [...this.config.TECH_IDS, techId].sort();
                        await this.db.doc(this.config.firestorePaths.TECH_IDS).set({
                            ids: updatedTechIds
                        });
                        // Update the local config immediately for instant refresh
                        this.config.TECH_IDS = updatedTechIds;
                        // Refresh the main project view to repopulate dropdowns with the new ID
                        this.methods.renderProjects.call(this);
                    }

                    alert("Your information has been saved successfully!");

                } catch (error) {
                    console.error("Error saving user info:", error);
                    alert("An error occurred while saving your info: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            async renderAllowedEmailsList() {
                if (!this.elements.allowedEmailsList) return;
                this.methods.showLoading.call(this, "Rendering allowed emails...");
                this.elements.allowedEmailsList.innerHTML = "";
                if (this.state.allowedEmails.length === 0) {
                    this.elements.allowedEmailsList.innerHTML = "<li>No allowed emails configured.</li>";
                } else {
                    this.state.allowedEmails.forEach(email => {
                        const li = document.createElement('li');
                        li.textContent = email;
                        const removeBtn = document.createElement('button');
                        removeBtn.textContent = "Remove";
                        removeBtn.className = 'btn btn-danger btn-small';
                        removeBtn.onclick = () => this.methods.handleRemoveEmail.call(this, email);
                        li.appendChild(removeBtn);
                        this.elements.allowedEmailsList.appendChild(li);
                    });
                }
                this.methods.hideLoading.call(this);
            },

            async handleAddEmail() {
                this.methods.showLoading.call(this, "Adding email...");
                const emailToAdd = this.elements.addEmailInput.value.trim().toLowerCase();
                if (!emailToAdd || !emailToAdd.includes('@')) return alert("Please enter a valid email address.");
                if (this.state.allowedEmails.map(e => e.toLowerCase()).includes(emailToAdd)) return alert("This email is already in the list.");

                const success = await this.methods.updateAllowedEmailsInFirestore.call(this, [...this.state.allowedEmails, emailToAdd].sort());
                if (success) {
                    this.elements.addEmailInput.value = "";
                    this.methods.renderAllowedEmailsList.call(this);
                }
                this.methods.hideLoading.call(this);
            },

            async handleRemoveEmail(emailToRemove) {
                if (confirm(`Are you sure you want to remove ${emailToRemove}?`)) {
                    this.methods.showLoading.call(this, "Removing email...");
                    const success = await this.methods.updateAllowedEmailsInFirestore.call(this, this.state.allowedEmails.filter(e => e !== emailToRemove));
                    if (success) this.methods.renderAllowedEmailsList.call(this);
                }
            },

            handleClearData() {
                if (confirm("Are you sure you want to clear all locally stored application data? This will reset your filters and view preferences but will not affect any data on the server.")) {
                    try {
                        localStorage.removeItem('currentSelectedBatchId');
                        localStorage.removeItem('currentSelectedMonth');
                        localStorage.removeItem('projectTrackerGroupVisibility');
                        localStorage.removeItem('currentSortBy');
                        localStorage.removeItem('showTitleColumn');
                        localStorage.removeItem('showDay2Column');
                        localStorage.removeItem('showDay3Column');
                        alert("Local application data has been cleared. The page will now reload.");
                        window.location.reload();
                    } catch (e) {
                        console.error("Error clearing local storage:", e);
                        alert("Could not clear application data. See the console for more details.");
                    }
                }
            },

            async generateTlSummaryData() {
                if (!this.elements.tlSummaryContent) {
                    console.error("TL Summary content element not found.");
                    return;
                }
                this.methods.showLoading.call(this, "Generating TL Summary...");
                this.elements.tlSummaryContent.innerHTML = "";
            
                // --- MODIFIED: (User Request) UI Refresh for TL Summary Header ---
                const summaryHeader = document.createElement('div');
                summaryHeader.style.display = 'flex';
                summaryHeader.style.justifyContent = 'space-between';
                summaryHeader.style.alignItems = 'center';
                summaryHeader.style.marginBottom = '20px';
                summaryHeader.style.paddingBottom = '10px';
                summaryHeader.style.borderBottom = '1px solid #ddd';
            
                const summaryTitle = document.createElement('h3');
                summaryTitle.textContent = 'Team Lead Summary';
                summaryTitle.style.margin = '0';
            
                const refreshButton = document.createElement('button');
                refreshButton.className = 'btn btn-primary';
                // Using a refresh icon (assuming Font Awesome is available, otherwise text)
                refreshButton.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
                refreshButton.onclick = () => this.methods.generateTlSummaryData.call(this);
            
                summaryHeader.appendChild(summaryTitle);
                summaryHeader.appendChild(refreshButton);
                this.elements.tlSummaryContent.appendChild(summaryHeader);
                // --- End of UI Refresh modification ---
            
                try {
                    const snapshot = await this.db.collection("projects").get();
                    const projectTotals = {};
                    const projectCreationTimestamps = {};
                    const techData = {
                        assigned: new Set(),
                        withTime: new Set()
                    };
            
                    snapshot.forEach(doc => {
                        const p = doc.data();
                        const totalWorkMs = (p.durationDay1Ms || 0) + (p.durationDay2Ms || 0) + (p.durationDay3Ms || 0);
                        const breakMs = ((p.breakDurationMinutesDay1 || 0) + (p.breakDurationMinutesDay2 || 0) + (p.breakDurationMinutesDay3 || 0)) * 60000;
                        const additionalMs = (p.additionalMinutesManual || 0) * 60000;
                        const adjustedNetMs = Math.max(0, totalWorkMs - breakMs) + additionalMs;
            
                        if (p.assignedTo) {
                            techData.assigned.add(p.assignedTo);
                        }
            
                        if (adjustedNetMs > 0) {
                            const minutes = Math.floor(adjustedNetMs / 60000);
                            const projName = p.baseProjectName || "Unknown Project";
                            const fixCat = p.fixCategory || "Unknown Fix";
            
                            if (!projectTotals[projName]) {
                                projectTotals[projName] = {};
                                if (p.creationTimestamp) {
                                    projectCreationTimestamps[projName] = p.creationTimestamp;
                                }
                            }
                            projectTotals[projName][fixCat] = (projectTotals[projName][fixCat] || 0) + minutes;
            
                            if (p.assignedTo) {
                                techData.withTime.add(p.assignedTo);
                            }
                        }
                    });
            
                    const sortedProjectNames = Object.keys(projectTotals).sort((a, b) => {
                        const tsA = projectCreationTimestamps[a]?.toMillis ? projectCreationTimestamps[a].toMillis() : 0;
                        const tsB = projectCreationTimestamps[b]?.toMillis ? projectCreationTimestamps[b].toMillis() : 0;
                        return tsB - tsA;
                    });
            
                    if (sortedProjectNames.length > 0) {
                        const summaryContainer = document.createElement('div');
                        summaryContainer.className = 'summary-container';
            
                        sortedProjectNames.forEach(projName => {
                            const projectCard = document.createElement('div');
                            projectCard.className = 'project-summary-card';
            
                            // --- MODIFIED: (User Request) Smaller font size for project name ---
                            let cardHtml = `<h4 class="project-name-header" style="font-size: 1.1rem; margin-bottom: 12px;">${projName}</h4><div class="fix-categories-grid">`;
                            const fixCategoryTotals = projectTotals[projName];
                            const sortedFixCategories = Object.keys(fixCategoryTotals).sort((a, b) => this.config.FIX_CATEGORIES.ORDER.indexOf(a) - this.config.FIX_CATEGORIES.ORDER.indexOf(b));
            
                            sortedFixCategories.forEach(fixCat => {
                                const totalMinutes = fixCategoryTotals[fixCat];
                                const hoursDecimal = (totalMinutes / 60).toFixed(2);
                                const bgColor = this.config.FIX_CATEGORIES.COLORS[fixCat] || this.config.FIX_CATEGORIES.COLORS.default;
            
                                cardHtml += `
                                    <div class="fix-category-item" style="background-color: ${bgColor};">
                                        <span class="fix-category-name">${fixCat}</span>
                                        <div class="fix-category-data">
                                            <span class="fix-category-minutes">${totalMinutes} mins</span>
                                            <span class="fix-category-hours" id="hours-to-copy-${projName}-${fixCat}">${hoursDecimal} hrs</span>
                                            <button class="btn btn-sm btn-info btn-copy-hours" data-target-id="hours-to-copy-${projName}-${fixCat}"><i class="fas fa-copy"></i></button>
                                        </div>
                                    </div>
                                `;
                            });
            
                            cardHtml += '</div>';
                            projectCard.innerHTML = cardHtml;
                            summaryContainer.appendChild(projectCard);
                        });
            
                        this.elements.tlSummaryContent.appendChild(summaryContainer);
            
                        this.elements.tlSummaryContent.querySelectorAll('.btn-copy-hours').forEach(button => {
                            button.addEventListener('click', (event) => {
                                const targetId = event.currentTarget.dataset.targetId;
                                const hoursElement = document.getElementById(targetId);
                                if (hoursElement) {
                                    const hoursText = hoursElement.textContent.replace(' hrs', '').trim();
                                    navigator.clipboard.writeText(hoursText).then(() => {
                                        alert('Copied to clipboard: ' + hoursText);
                                    }).catch(err => {
                                        console.error('Failed to copy: ', err);
                                        alert('Failed to copy hours.');
                                    });
                                }
                            });
                        });
                    }
            
                    const techsWithNoTime = [...techData.assigned].filter(tech => !techData.withTime.has(tech));
            
                    if (techsWithNoTime.length > 0) {
                        const techInfoSection = document.createElement('div');
                        techInfoSection.className = 'tech-info-section';
                        let techInfoHtml = '<h3 class="tech-info-header">Techs with No Time Logged</h3><ul class="tech-info-list">';
                        techsWithNoTime.forEach(tech => {
                            techInfoHtml += `<li>${tech}</li>`;
                        });
                        techInfoHtml += '</ul>';
                        techInfoSection.innerHTML = techInfoHtml;
                        this.elements.tlSummaryContent.appendChild(techInfoSection);
                    }
            
                    if (sortedProjectNames.length === 0 && techsWithNoTime.length === 0) {
                        const noDataMessage = document.createElement('p');
                        noDataMessage.className = 'no-data-message';
                        noDataMessage.textContent = 'No project time data or unlogged tech information found.';
                        this.elements.tlSummaryContent.appendChild(noDataMessage);
                    }
            
                } catch (error) {
                    console.error("Error generating TL summary:", error);
                    const errorMessage = document.createElement('p');
                    errorMessage.className = 'error-message';
                    errorMessage.textContent = `Error generating summary: ${error.message}`;
                    this.elements.tlSummaryContent.appendChild(errorMessage);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            listenForNotifications() {
                if (!this.db) {
                    console.error("Firestore not initialized for notifications.");
                    return;
                }
                if (this.notificationListenerUnsubscribe) {
                    this.notificationListenerUnsubscribe();
                }
                this.notificationListenerUnsubscribe = this.db.collection(this.config.firestorePaths.NOTIFICATIONS)
                    .orderBy("timestamp", "desc")
                    .limit(1)
                    .onSnapshot(
                        snapshot => {
                            snapshot.docChanges().forEach(change => {
                                if (change.type === "added") {
                                    const notification = change.doc.data();
                                    const fiveSecondsAgo = firebase.firestore.Timestamp.now().toMillis() - 5000;
                                    if (notification.timestamp && notification.timestamp.toMillis() > fiveSecondsAgo) {
                                        alert(`🔔 New Update: ${notification.message}`);
                                    }
                                }
                            });
                        },
                        error => {
                            console.error("Error listening for notifications:", error);
                        }
                    );
            },

            async handleExportCsv() {
                this.methods.showLoading.call(this, "Generating CSV for all projects...");
                try {
                    const allProjectsSnapshot = await this.db.collection("projects").get();
                    let allProjectsData = [];
                    allProjectsSnapshot.forEach(doc => {
                        if (doc.exists) allProjectsData.push(doc.data());
                    });

                    if (allProjectsData.length === 0) {
                        alert("No project data to export.");
                        return;
                    }

                    const headers = [
                        "Fix Cat", "Project Name", "Area/Task", "GSD", "Assigned To", "Status",
                        "Day 1 Start", "Day 1 Finish", "Day 1 Break",
                        "Day 2 Start", "Day 2 Finish", "Day 2 Break",
                        "Day 3 Start", "Day 3 Finish", "Day 3 Break",
                        "Total (min)", "Tech Notes",
                        "Creation Date", "Last Modified"
                    ];

                    const rows = [headers.join(',')];

                    allProjectsData.forEach(project => {
                        const formatTimeCsv = (ts) => ts?.toDate ? `"${ts.toDate().toISOString()}"` : "";
                        const formatNotesCsv = (notes) => notes ? `"${notes.replace(/"/g, '""')}"` : "";

                        const totalDurationMs = (project.durationDay1Ms || 0) + (project.durationDay2Ms || 0) + (project.durationDay3Ms || 0);
                        const totalBreakMs = ((project.breakDurationMinutesDay1 || 0) +
                            (project.breakDurationMinutesDay2 || 0) +
                            (project.breakDurationMinutesDay3 || 0)) * 60000;
                        const additionalMs = (project.additionalMinutesManual || 0) * 60000;
                        const finalAdjustedDurationMs = Math.max(0, totalDurationMs - totalBreakMs) + additionalMs;
                        const totalMinutes = this.methods.formatMillisToMinutes.call(this, finalAdjustedDurationMs);


                        const rowData = [
                            project.fixCategory || "",
                            project.baseProjectName || "",
                            project.areaTask || "",
                            project.gsd || "",
                            project.assignedTo || "",
                            (project.status || "").replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim(),
                            formatTimeCsv(project.startTimeDay1),
                            formatTimeCsv(project.finishTimeDay1),
                            project.breakDurationMinutesDay1 || "0",
                            formatTimeCsv(project.startTimeDay2),
                            formatTimeCsv(project.finishTimeDay2),
                            project.breakDurationMinutesDay2 || "0",
                            formatTimeCsv(project.startTimeDay3),
                            formatTimeCsv(project.finishTimeDay3),
                            project.breakDurationMinutesDay3 || "0",
                            totalMinutes,
                            formatNotesCsv(project.techNotes),
                            formatTimeCsv(project.creationTimestamp),
                            formatTimeCsv(project.lastModifiedTimestamp)
                        ];
                        rows.push(rowData.join(','));
                    });

                    const csvContent = "data:text/csv;charset=utf-8," + rows.join('\n');
                    const encodedUri = encodeURI(csvContent);
                    const link = document.createElement("a");
                    link.setAttribute("href", encodedUri);
                    link.setAttribute("download", `ProjectTracker_AllData_${new Date().toISOString().slice(0, 10)}.csv`);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    alert("All project data exported successfully!");

                } catch (error) {
                    console.error("Error exporting CSV:", error);
                    alert("Failed to export data: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            async handleProcessCsvImport() {
                const file = this.elements.csvFileInput.files[0];
                if (!file) {
                    alert("Please select a CSV file to import.");
                    return;
                }

                this.methods.showLoading.call(this, "Processing CSV file...");
                this.elements.processCsvBtn.disabled = true;
                this.elements.csvImportStatus.textContent = 'Reading file...';

                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const csvText = e.target.result;
                        const parsedProjects = this.methods.parseCsvToProjects.call(this, csvText);

                        if (parsedProjects.length === 0) {
                            alert("No valid project data found in the CSV file. Please ensure it matches the export format and contains data.");
                            this.elements.csvImportStatus.textContent = 'No valid data found.';
                            return;
                        }

                        if (!confirm(`Found ${parsedProjects.length} project(s) in CSV. Do you want to import them? This will add new tasks to your tracker.`)) {
                            this.elements.csvImportStatus.textContent = 'Import cancelled.';
                            return;
                        }

                        this.elements.csvImportStatus.textContent = `Importing ${parsedProjects.length} project(s)...`;
                        this.methods.showLoading.call(this, `Importing ${parsedProjects.length} project(s)...`);

                        const batch = this.db.batch();
                        const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();
                        let importedCount = 0;

                        const projectNameBatchIds = {};

                        parsedProjects.forEach(projectData => {
                            let currentBatchId;
                            if (projectNameBatchIds[projectData.baseProjectName]) {
                                currentBatchId = projectNameBatchIds[projectData.baseProjectName];
                            } else {
                                currentBatchId = `batch_${this.methods.generateId()}`;
                                projectNameBatchIds[projectData.baseProjectName] = currentBatchId;
                            }

                            const newProjectRef = this.db.collection("projects").doc();
                            batch.set(newProjectRef, {
                                batchId: currentBatchId,
                                creationTimestamp: serverTimestamp,
                                lastModifiedTimestamp: serverTimestamp,
                                isLocked: false,
                                releasedToNextStage: false,
                                isReassigned: false,
                                originalProjectId: null,
                                breakDurationMinutesDay1: projectData.breakDurationMinutesDay1 || 0,
                                breakDurationMinutesDay2: projectData.breakDurationMinutesDay2 || 0,
                                breakDurationMinutesDay3: projectData.breakDurationMinutesDay3 || 0,
                                additionalMinutesManual: projectData.additionalMinutesManual || 0,
                                fixCategory: projectData.fixCategory || "Fix1",
                                baseProjectName: projectData.baseProjectName || "IMPORTED_PROJ",
                                areaTask: projectData.areaTask || `Area${String(importedCount + 1).padStart(2, '0')}`,
                                gsd: projectData.gsd || "3in",
                                assignedTo: projectData.assignedTo || "",
                                status: projectData.status || "Available",
                                techNotes: projectData.techNotes || "",
                                startTimeDay1: projectData.startTimeDay1 || null,
                                finishTimeDay1: projectData.finishTimeDay1 || null,
                                durationDay1Ms: this.methods.calculateDurationMs(projectData.startTimeDay1, projectData.finishTimeDay1),
                                startTimeDay2: projectData.startTimeDay2 || null,
                                finishTimeDay2: projectData.finishTimeDay2 || null,
                                durationDay2Ms: this.methods.calculateDurationMs(projectData.startTimeDay2, projectData.finishTimeDay2),
                                startTimeDay3: projectData.startTimeDay3 || null,
                                finishTimeDay3: projectData.finishTimeDay3 || null,
                                durationDay3Ms: this.methods.calculateDurationMs(projectData.startTimeDay3, projectData.finishTimeDay3),
                            });
                            importedCount++;
                        });

                        await batch.commit();
                        this.elements.csvImportStatus.textContent = `Successfully imported ${importedCount} project(s)!`;
                        alert(`Successfully imported ${importedCount} project(s)!`);
                        this.elements.importCsvModal.style.display = 'none';
                        this.methods.initializeFirebaseAndLoadData.call(this);

                    } catch (error) {
                        console.error("Error processing CSV import:", error);
                        this.elements.csvImportStatus.textContent = `Error: ${error.message}`;
                        alert(`Error importing CSV: ${error.message}`);
                    } finally {
                        this.methods.hideLoading.call(this);
                        this.elements.processCsvBtn.disabled = false;
                    }
                };
                reader.onerror = () => {
                    this.elements.csvImportStatus.textContent = 'Error reading file.';
                    alert('Error reading file. Please try again.');
                    this.methods.hideLoading.call(this);
                    this.elements.processCsvBtn.disabled = false;
                };
                reader.readAsText(file);
            },

            parseCsvToProjects(csvText) {
                const lines = csvText.split('\n').filter(line => line.trim() !== '');
                if (lines.length === 0) return [];

                const headers = lines[0].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(h => h.trim().replace(/^"|"$/g, ''));

                const missingHeaders = this.config.CSV_HEADERS_FOR_IMPORT.filter(expected => !headers.includes(expected));
                if (missingHeaders.length > 0) {
                    throw new Error(`CSV is missing required headers: ${missingHeaders.join(', ')}. Please use the exact headers from the export format.`);
                }

                const projects = [];
                for (let i = 1; i < lines.length; i++) {
                    const values = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.trim().replace(/^"|"$/g, ''));

                    if (values.length !== headers.length) {
                        console.warn(`Skipping row ${i + 1} due to column count mismatch. Expected ${headers.length}, got ${values.length}. Row: "${lines[i]}"`);
                        continue;
                    }

                    let projectData = {};
                    for (let j = 0; j < headers.length; j++) {
                        const header = headers[j];
                        const fieldName = this.config.CSV_HEADER_TO_FIELD_MAP[header];

                        if (fieldName === null) {
                            continue;
                        }

                        let value = values[j];

                        if (fieldName.startsWith('breakDurationMinutes')) {
                            projectData[fieldName] = parseInt(value, 10) || 0;
                        } else if (fieldName.startsWith('startTimeDay') || fieldName.startsWith('finishTimeDay')) {
                            try {
                                if (typeof value === 'string' && value.trim() !== '') {
                                    const date = new Date(value);
                                    if (isNaN(date.getTime())) {
                                        console.warn(`Row ${i + 1}: Could not parse date for field '${fieldName}'. Value: "${value}"`);
                                        projectData[fieldName] = null;
                                    } else {
                                        projectData[fieldName] = firebase.firestore.Timestamp.fromDate(date);
                                    }
                                } else {
                                    projectData[fieldName] = null;
                                }
                            } catch (e) {
                                console.error(`Row ${i + 1}: Error parsing date for field '${fieldName}' with value "${value}":`, e);
                                projectData[fieldName] = null;
                            }
                        } else if (fieldName === 'status') {
                            let cleanedStatus = (value || "").replace(/\s/g, '').toLowerCase();

                            // --- MODIFICATION START ---
                            if (cleanedStatus.includes('startedavailable')) { // If CSV has "Started Available"
                                // Map it to Day1Ended_AwaitingNext or similar, depending on what state you want it to represent internally
                                // For simplicity, let's map it to "Available" for new imports unless specific logic is needed.
                                // If you want it to represent 'Day1Ended_AwaitingNext' you can set that.
                                cleanedStatus = 'Available'; // Or 'Day1Ended_AwaitingNext' if that's the intended internal state after "Started Available"
                            } else if (cleanedStatus.includes('inprogressday1')) cleanedStatus = 'InProgressDay1';
                            else if (cleanedStatus.includes('day1ended_awaitingnext')) cleanedStatus = 'Day1Ended_AwaitingNext';
                            else if (cleanedStatus.includes('inprogressday2')) cleanedStatus = 'InProgressDay2';
                            else if (cleanedStatus.includes('day2ended_awaitingnext')) cleanedStatus = 'Day2Ended_AwaitingNext';
                            else if (cleanedStatus.includes('inprogressday3')) cleanedStatus = 'InProgressDay3';
                            else if (cleanedStatus.includes('day3ended_awaitingnext')) cleanedStatus = 'Day3Ended_AwaitingNext';
                            else if (cleanedStatus.includes('completed')) cleanedStatus = 'Completed';
                            else if (cleanedStatus.includes('reassigned_techabsent')) cleanedStatus = 'Reassigned_TechAbsent';
                            else cleanedStatus = 'Available';

                            projectData[fieldName] = cleanedStatus;
                            // --- MODIFICATION END ---
                        } else {
                            projectData[fieldName] = value;
                        }
                    }

                    const requiredFieldsCheck = ["baseProjectName", "areaTask", "fixCategory", "gsd"];
                    let isValidProject = true;
                    for (const field of requiredFieldsCheck) {
                        if (!projectData[field] || projectData[field].trim() === "") {
                            console.warn(`Skipping row ${i + 1}: Missing required field '${field}'. Row: "${lines[i]}"`);
                            isValidProject = false;
                            break;
                        }
                    }

                    if (isValidProject) {
                        projects.push(projectData);
                    }
                }
                return projects;
            },
        }
    };

    // --- KICK OFF THE APPLICATION ---
    ProjectTrackerApp.init();

});
