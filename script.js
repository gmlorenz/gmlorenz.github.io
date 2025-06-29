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
                NOTIFICATIONS: "notifications"
            },
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
                    // NEW: Reference for the Delete Area button
                    deleteAreaBtn: document.getElementById('deleteAreaBtn'),
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
                        self.methods.renderAllowedEmailsList.call(self);
                    } else if (pin) alert("Incorrect PIN.");
                });

                attachClick(self.elements.openTlSummaryBtn, () => {
                    self.elements.tlSummaryModal.style.display = 'block';
                    self.methods.generateTlSummaryData.call(self);
                });

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
                attachClick(self.elements.clearDataBtn, self.methods.handleClearData.bind(self));
                attachClick(self.elements.nextPageBtn, self.methods.handleNextPage.bind(self));
                attachClick(self.elements.prevPageBtn, self.methods.handlePrevPage.bind(self));

                // NEW: Attach click listener for Delete Area button
                attachClick(self.elements.deleteAreaBtn, self.methods.handleDeleteArea.bind(self));


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

            handleAuthorizedUser(user) {
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

            async handleDeleteArea() {
                const pin = prompt("Enter PIN to delete an area:");
                if (pin !== this.config.pins.TL_DASHBOARD_PIN) {
                    if (pin) alert("Incorrect PIN.");
                    return;
                }

                const baseProjectName = prompt("Enter the Project Name of the area to delete:");
                if (!baseProjectName || baseProjectName.trim() === "") {
                    alert("Project Name cannot be empty.");
                    return;
                }

                const areaTask = prompt("Enter the Area/Task name to delete (e.g., Area01):");
                if (!areaTask || areaTask.trim() === "") {
                    alert("Area/Task name cannot be empty.");
                    return;
                }

                const confirmDelete = confirm(`Are you sure you want to permanently delete area "${areaTask}" from project "${baseProjectName}"? This action cannot be undone.`);
                if (!confirmDelete) {
                    alert("Delete operation cancelled.");
                    return;
                }

                this.methods.showLoading.call(this, "Deleting area...");
                try {
                    const querySnapshot = await this.db.collection("projects")
                        .where("baseProjectName", "==", baseProjectName)
                        .where("areaTask", "==", areaTask)
                        .get();

                    if (querySnapshot.empty) {
                        alert(`No project found with Project Name "${baseProjectName}" and Area/Task "${areaTask}".`);
                        return;
                    }

                    const batch = this.db.batch();
                    querySnapshot.forEach(doc => {
                        batch.delete(doc.ref);
                    });

                    await batch.commit();
                    alert(`Area "${areaTask}" from project "${baseProjectName}" deleted successfully.`);
                    this.methods.initializeFirebaseAndLoadData.call(this); // Refresh data
                } catch (error) {
                    console.error("Error deleting area:", error);
                    alert("Error deleting area: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            refreshAllViews() {
                try {
                    this.methods.renderProjects.call(this);
                    this.methods.updatePaginationUI.call(this);
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

            renderTLDashboard() {
                const self = this;
                if (!self.elements.tlDashboardContentElement) return;

                let tlDashboardHtml = `
                    <h2>Project Settings & Admin Dashboard</h2>
                    <div class="dashboard-section">
                        <h3>Release Tasks</h3>
                        <p>Release tasks to the next Fix stage. This will create new tasks in the next stage and mark current tasks as 'Released'.</p>
                        <div class="action-buttons">
                            <select id="releaseBatchIdSelect">
                                <option value="">Select Project to Release</option>
                                ${self.state.projects.filter(p => !p.releasedToNextStage && p.status === "Completed")
                                    .map(p => p.baseProjectName)
                                    .filter((value, index, self) => self.indexOf(value) === index)
                                    .sort()
                                    .map(name => `<option value="${name}">${name}</option>`)
                                    .join('')}
                            </select>
                            <button id="releaseToNextStageBtn" class="btn btn-primary">Release Selected Project to Next Stage</button>
                            <p class="warning-text">Only 'Completed' tasks can be released. Releasing will create new tasks in Fix[X+1] and mark current tasks as 'Released'.</p>
                        </div>
                    </div>

                    <div class="dashboard-section">
                        <h3>Batch Operations</h3>
                        <p>Perform batch operations on project groups.</p>
                        <div class="action-buttons">
                            <select id="batchProjectNameSelect">
                                <option value="">Select Project for Batch Op</option>
                                ${self.state.projects.map(p => p.baseProjectName)
                                    .filter((value, index, self) => self.indexOf(value) === index)
                                    .sort()
                                    .map(name => `<option value="${name}">${name}</option>`)
                                    .join('')}
                            </select>

                            <label for="fixStageSelect">Fix Stage:</label>
                            <select id="fixStageSelect">
                                <option value="">All Fix Stages</option>
                                ${self.config.FIX_CATEGORIES.ORDER.map(fixCat => `<option value="${fixCat}">${fixCat}</option>`).join('')}
                            </select>

                            <button id="lockGroupBtn" class="btn btn-warning">Lock All in Group 🔒</button>
                            <button id="unlockGroupBtn" class="btn btn-info">Unlock All in Group 🔓</button>
                            <button id="recalcTotalsBtn" class="btn btn-secondary">Recalculate All Totals</button>
                        </div>
                    </div>

                    <div class="dashboard-section">
                        <h3>Delete Area</h3>
                        <p>Permanently delete a specific area task from a project. This action cannot be undone.</p>
                        <div class="action-buttons">
                            <button id="deleteAreaBtn" class="btn btn-danger">Delete Area</button>
                        </div>
                    </div>
                    `;
                self.elements.tlDashboardContentElement.innerHTML = tlDashboardHtml;

                // Attach event listeners for dynamically created elements
                const releaseToNextStageBtn = document.getElementById('releaseToNextStageBtn');
                if (releaseToNextStageBtn) {
                    releaseToNextStageBtn.onclick = () => self.methods.handleReleaseToNextStage.call(self);
                }

                const lockGroupBtn = document.getElementById('lockGroupBtn');
                if (lockGroupBtn) {
                    lockGroupBtn.onclick = () => self.methods.handleLockGroup.call(self);
                }

                const unlockGroupBtn = document.getElementById('unlockGroupBtn');
                if (unlockGroupBtn) {
                    unlockGroupBtn.onclick = () => self.methods.handleUnlockGroup.call(self);
                }

                const recalcTotalsBtn = document.getElementById('recalcTotalsBtn');
                if (recalcTotalsBtn) {
                    recalcTotalsBtn.onclick = () => self.methods.handleRecalcTotals.call(self);
                }

                // NEW: Assign the deleteAreaBtn reference dynamically as it's created within innerHTML
                self.elements.deleteAreaBtn = document.getElementById('deleteAreaBtn');
                // The event listener is already attached via attachEventListeners
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
                // NEW: Pre-calculate lock status for each group
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
                        // UPDATED: Determine lock icon based on pre-calculated status, using emojis
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
                        };
                    }
                    const row = this.elements.projectTableBody.insertRow();
                    row.style.backgroundColor = this.config.FIX_CATEGORIES.COLORS[project.fixCategory] || this.config.FIX_CATEGORIES.COLORS.default;
                    const groupKey = `${currentBaseProjectNameHeader}_${project.fixCategory}`;
                    if (this.state.groupVisibilityState[groupKey]?.isExpanded === false) row.classList.add("hidden-group-row");
                    if (project.isReassigned) row.classList.add("reassigned-task-highlight");
                    if (project.isLocked) row.classList.add("locked-task-highlight");
                    row.insertCell().textContent = project.fixCategory;
                    row.insertCell().textContent = project.baseProjectName;
                    row.insertCell().textContent = project.areaTask;
                    row.insertCell().textContent = project.gsd;
                    const assignedToCell = row.insertCell();
                    const assignedToSelect = document.createElement('select');
                    assignedToSelect.className = 'assigned-to-select';
                    assignedToSelect.disabled = project.status === "Reassigned_TechAbsent" || project.isLocked;
                    assignedToSelect.innerHTML = `<option value="">Select Tech ID</option>` + this.config.TECH_IDS.map(id => `<option value="${id}">${id}</option>`).join('');
                    assignedToSelect.value = project.assignedTo || "";
                    assignedToSelect.onchange = (e) => {
                        this.methods.updateFirestoreField(project.id, 'assignedTo', e.target.value);
                    };
                    assignedToCell.appendChild(assignedToSelect);

                    const statusCell = row.insertCell();
                    const statusSelect = document.createElement('select');
                    statusSelect.className = 'status-select';
                    statusSelect.disabled = project.status.includes('InProgress') || project.isLocked;
                    const statuses = ["Available", "InProgressDay1", "Day1Ended_AwaitingNext", "InProgressDay2", "Day2Ended_AwaitingNext", "InProgressDay3", "Day3Ended_AwaitingNext", "Completed", "Reassigned_TechAbsent", "Cancelled"];
                    statusSelect.innerHTML = statuses.map(s => `<option value="${s}" ${project.status === s ? 'selected' : ''}>${s}</option>`).join('');
                    statusSelect.onchange = (e) => {
                        this.methods.updateFirestoreField(project.id, 'status', e.target.value);
                    };
                    statusCell.appendChild(statusSelect);

                    const createTimeInput = (value, fieldName) => {
                        const input = document.createElement('input');
                        input.type = 'time';
                        input.value = value ? new Date(value.toDate()).toTimeString().slice(0, 5) : '';
                        input.disabled = project.isLocked;
                        input.onchange = (e) => this.methods.updateTimeField(project.id, fieldName, e.target.value);
                        return input;
                    };

                    row.insertCell().appendChild(createTimeInput(project.startTimeDay1, 'startTimeDay1'));
                    row.insertCell().appendChild(createTimeInput(project.finishTimeDay1, 'finishTimeDay1'));
                    const break1Cell = row.insertCell();
                    const break1Input = document.createElement('input');
                    break1Input.type = 'number';
                    break1Input.placeholder = 'min';
                    break1Input.value = project.breakDurationMinutesDay1 || 0;
                    break1Input.disabled = project.isLocked;
                    break1Input.onchange = (e) => this.methods.updateFirestoreField(project.id, 'breakDurationMinutesDay1', parseInt(e.target.value) || 0);
                    break1Cell.appendChild(break1Input);

                    row.insertCell().appendChild(createTimeInput(project.startTimeDay2, 'startTimeDay2'));
                    row.insertCell().appendChild(createTimeInput(project.finishTimeDay2, 'finishTimeDay2'));
                    const break2Cell = row.insertCell();
                    const break2Input = document.createElement('input');
                    break2Input.type = 'number';
                    break2Input.placeholder = 'min';
                    break2Input.value = project.breakDurationMinutesDay2 || 0;
                    break2Input.disabled = project.isLocked;
                    break2Input.onchange = (e) => this.methods.updateFirestoreField(project.id, 'breakDurationMinutesDay2', parseInt(e.target.value) || 0);
                    break2Cell.appendChild(break2Input);

                    row.insertCell().appendChild(createTimeInput(project.startTimeDay3, 'startTimeDay3'));
                    row.insertCell().appendChild(createTimeInput(project.finishTimeDay3, 'finishTimeDay3'));
                    const break3Cell = row.insertCell();
                    const break3Input = document.createElement('input');
                    break3Input.type = 'number';
                    break3Input.placeholder = 'min';
                    break3Input.value = project.breakDurationMinutesDay3 || 0;
                    break3Input.disabled = project.isLocked;
                    break3Input.onchange = (e) => this.methods.updateFirestoreField(project.id, 'breakDurationMinutesDay3', parseInt(e.target.value) || 0);
                    break3Cell.appendChild(break3Input);

                    const totalDurationMinutes = this.methods.calculateTotalDurationMinutes.call(this, project);
                    const totalCell = row.insertCell();
                    totalCell.textContent = totalDurationMinutes;
                    totalCell.style.fontWeight = 'bold';
                    totalCell.style.backgroundColor = totalDurationMinutes > 0 ? '#d4edda' : 'transparent';

                    const additionalMinutesCell = row.insertCell();
                    const additionalMinutesInput = document.createElement('input');
                    additionalMinutesInput.type = 'number';
                    additionalMinutesInput.placeholder = 'Add min';
                    additionalMinutesInput.value = project.additionalMinutesManual || 0;
                    additionalMinutesInput.disabled = project.isLocked;
                    additionalMinutesInput.onchange = (e) => {
                        this.methods.updateFirestoreField(project.id, 'additionalMinutesManual', parseInt(e.target.value) || 0);
                    };
                    additionalMinutesCell.appendChild(additionalMinutesInput);

                    const progressCell = row.insertCell();
                    const progressBarContainer = document.createElement('div');
                    progressBarContainer.className = 'progress-bar-container';
                    const progressBar = document.createElement('div');
                    progressBar.className = 'progress-bar';
                    const progressPercentage = this.methods.calculateProgress.call(this, project);
                    progressBar.style.width = `${progressPercentage}%`;
                    progressBar.textContent = `${Math.round(progressPercentage)}%`;
                    progressBarContainer.appendChild(progressBar);
                    progressCell.appendChild(progressBarContainer);

                    const notesCell = row.insertCell();
                    const notesTextarea = document.createElement('textarea');
                    notesTextarea.className = 'tech-notes-textarea';
                    notesTextarea.value = project.techNotes || "";
                    notesTextarea.placeholder = "Enter notes...";
                    notesTextarea.disabled = project.isLocked;
                    notesTextarea.onchange = (e) => {
                        this.methods.updateFirestoreField(project.id, 'techNotes', e.target.value);
                    };
                    notesCell.appendChild(notesTextarea);

                    row.insertCell().textContent = project.creationTimestamp ? new Date(project.creationTimestamp.toDate()).toLocaleString() : 'N/A';
                    row.insertCell().textContent = project.lastModifiedTimestamp ? new Date(project.lastModifiedTimestamp.toDate()).toLocaleString() : 'N/A';


                    const actionsCell = row.insertCell();
                    actionsCell.className = "actions-cell";

                    const createButton = (text, className, actionType) => {
                        const button = document.createElement('button');
                        button.textContent = text;
                        button.className = `btn btn-sm ${className}`;
                        button.disabled = project.isLocked;
                        button.onclick = () => this.methods.updateProjectState(project.id, actionType);
                        return button;
                    };

                    const startDay1Btn = createButton('Start Day 1', 'btn-success', 'startDay1');
                    const endDay1Btn = createButton('End Day 1', 'btn-warning', 'endDay1');
                    const startDay2Btn = createButton('Start Day 2', 'btn-success', 'startDay2');
                    const endDay2Btn = createButton('End Day 2', 'btn-warning', 'endDay2');
                    const startDay3Btn = createButton('Start Day 3', 'btn-success', 'startDay3');
                    const endDay3Btn = createButton('End Day 3', 'btn-warning', 'endDay3');
                    const markDoneBtn = createButton('Mark Done', 'btn-info', 'markDone');
                    const reassignedBtn = createButton('Reassign', 'btn-danger', 'reassign');

                    const releaseToNextFixBtn = document.createElement('button');
                    releaseToNextFixBtn.textContent = 'Release to Next Fix';
                    releaseToNextFixBtn.className = 'btn btn-sm btn-primary';
                    releaseToNextFixBtn.disabled = project.releasedToNextStage || project.isLocked;
                    releaseToNextFixBtn.onclick = () => this.methods.handleReleaseSingleTaskToNextFix.call(this, project.id, project.baseProjectName, project.areaTask, project.fixCategory);

                    const releaseToAvailableBtn = document.createElement('button');
                    releaseToAvailableBtn.textContent = 'Release to Available (Fix1)';
                    releaseToAvailableBtn.className = 'btn btn-sm btn-secondary';
                    releaseToAvailableBtn.disabled = project.isLocked;
                    releaseToAvailableBtn.onclick = () => this.methods.handleReleaseToAvailable.call(this, project.id, project.baseProjectName, project.areaTask);

                    // Reassign Button (with logic to prevent reassigning tasks that are InProgress, Completed, or Reassigned)
                    const reassignBtn = document.createElement('button');
                    reassignBtn.textContent = 'Reassign';
                    reassignBtn.className = 'btn btn-sm btn-danger';
                    reassignBtn.disabled = project.status.includes('InProgress') || project.status === 'Completed' || project.status.includes('Reassigned') || project.isLocked;
                    reassignBtn.onclick = () => this.methods.handleReassignProject.call(this, project.id, project.baseProjectName, project.areaTask);


                    if (project.status === "Available") {
                        actionsCell.appendChild(startDay1Btn);
                    } else if (project.status === "InProgressDay1") {
                        actionsCell.appendChild(endDay1Btn);
                        actionsCell.appendChild(markDoneBtn);
                    } else if (project.status === "Day1Ended_AwaitingNext") {
                        actionsCell.appendChild(startDay2Btn);
                        actionsCell.appendChild(markDoneBtn);
                    } else if (project.status === "InProgressDay2") {
                        actionsCell.appendChild(endDay2Btn);
                        actionsCell.appendChild(markDoneBtn);
                    } else if (project.status === "Day2Ended_AwaitingNext") {
                        actionsCell.appendChild(startDay3Btn);
                        actionsCell.appendChild(markDoneBtn);
                    } else if (project.status === "InProgressDay3") {
                        actionsCell.appendChild(endDay3Btn);
                        actionsCell.appendChild(markDoneBtn);
                    } else if (project.status === "Day3Ended_AwaitingNext") {
                        actionsCell.appendChild(markDoneBtn);
                    } else if (project.status === "Completed") {
                        const statusText = document.createElement('span');
                        statusText.textContent = "Completed";
                        statusText.className = "status-completed";
                        actionsCell.appendChild(statusText);
                    }

                    if (project.status !== "Completed" && !project.releasedToNextStage) {
                        actionsCell.appendChild(releaseToNextFixBtn);
                        actionsCell.appendChild(reassignBtn);
                    }

                    if (project.status === "Reassigned_TechAbsent" || project.status === "Cancelled") {
                        actionsCell.appendChild(releaseToAvailableBtn);
                    }
                });
                this.methods.hideLoading.call(this); // Hide loading after rendering
            },
            // --- Helper methods ---
            generateId() {
                return Date.now().toString(36) + Math.random().toString(36).substr(2);
            },

            showLoading(message = "Loading...") {
                const loadingOverlay = this.elements.loadingOverlay;
                if (loadingOverlay) {
                    loadingOverlay.style.display = 'flex';
                    loadingOverlay.querySelector('p').textContent = message;
                }
            },

            hideLoading() {
                const loadingOverlay = this.elements.loadingOverlay;
                if (loadingOverlay) {
                    loadingOverlay.style.display = 'none';
                }
            },

            async updateFirestoreField(projectId, field, value) {
                this.methods.showLoading.call(this, `Updating ${field}...`);
                try {
                    const projectRef = this.db.collection("projects").doc(projectId);
                    const doc = await projectRef.get();
                    if (!doc.exists) {
                        throw new Error("Document not found for update.");
                    }
                    const projectData = doc.data();
                    if (projectData.isLocked) {
                        alert("This task is locked. Please unlock it in Project Settings to make changes.");
                        return;
                    }
                    await projectRef.update({
                        [field]: value,
                        lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
                    });
                } catch (error) {
                    console.error(`Error updating field ${field}:`, error);
                    alert(`Error updating ${field}: ` + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            calculateDurationMs(startTime, finishTime) {
                if (startTime && finishTime && startTime.toDate && finishTime.toDate) {
                    const startMs = startTime.toDate().getTime();
                    const finishMs = finishTime.toDate().getTime();
                    return finishMs - startMs;
                }
                return null;
            },

            calculateTotalDurationMinutes(project) {
                let totalMs = 0;
                if (project.durationDay1Ms) totalMs += project.durationDay1Ms;
                if (project.durationDay2Ms) totalMs += project.durationDay2Ms;
                if (project.durationDay3Ms) totalMs += project.durationDay3Ms;

                let totalMinutes = Math.round(totalMs / (1000 * 60)); // Convert milliseconds to minutes
                totalMinutes -= (project.breakDurationMinutesDay1 || 0);
                totalMinutes -= (project.breakDurationMinutesDay2 || 0);
                totalMinutes -= (project.breakDurationMinutesDay3 || 0);
                totalMinutes += (project.additionalMinutesManual || 0);

                return Math.max(0, totalMinutes); // Ensure total is not negative
            },

            calculateProgress(project) {
                // Define stages and their approximate weights for progress calculation
                // This is a simplified model, can be made more complex if needed.
                const stageWeights = {
                    "Available": 0,
                    "InProgressDay1": 20,
                    "Day1Ended_AwaitingNext": 30,
                    "InProgressDay2": 50,
                    "Day2Ended_AwaitingNext": 60,
                    "InProgressDay3": 80,
                    "Day3Ended_AwaitingNext": 90,
                    "Completed": 100,
                    "Reassigned_TechAbsent": 0, // Reassigned tasks are not 'in progress' in the traditional sense
                    "Cancelled": 0 // Cancelled tasks are not 'in progress'
                };

                // Base progress on status
                let progress = stageWeights[project.status] || 0;

                // Add a small percentage if assigned, as it shows commitment
                if (project.assignedTo && progress < 100) {
                    progress += 5; // A small bump for being assigned
                }

                // Further refine progress based on actual time logged, if any
                const totalLoggedDuration = (project.durationDay1Ms || 0) + (project.durationDay2Ms || 0) + (project.durationDay3Ms || 0);
                // Assuming a typical project might take, say, 180 minutes (3 hours) to be 'done' to make this scale
                const assumedMaxDurationMs = 3 * 60 * 60 * 1000;
                if (totalLoggedDuration > 0 && progress < 100) {
                    let timeBasedProgress = (totalLoggedDuration / assumedMaxDurationMs) * 100;
                    // Cap time-based progress to avoid exceeding overall progress expectation for a stage
                    timeBasedProgress = Math.min(timeBasedProgress, 95);
                    progress = Math.max(progress, timeBasedProgress);
                }

                // Ensure progress is between 0 and 100
                return Math.min(100, Math.max(0, progress));
            },

            async handleReleaseToNextStage() {
                const pin = prompt("Enter PIN to release project(s):");
                if (pin !== this.config.pins.TL_DASHBOARD_PIN) {
                    if (pin) alert("Incorrect PIN.");
                    return;
                }

                const batchProjectName = document.getElementById('releaseBatchIdSelect').value;
                if (!batchProjectName) {
                    alert("Please select a Project to Release.");
                    return;
                }

                this.methods.showLoading.call(this, `Releasing project ${batchProjectName} to next stage...`);
                try {
                    const batch = this.db.batch();
                    const projectsToReleaseSnapshot = await this.db.collection("projects")
                        .where("baseProjectName", "==", batchProjectName)
                        .where("status", "==", "Completed")
                        .where("releasedToNextStage", "==", false)
                        .get();

                    if (projectsToReleaseSnapshot.empty) {
                        alert(`No completed tasks found for project "${batchProjectName}" that haven't been released yet.`);
                        this.methods.hideLoading.call(this);
                        return;
                    }

                    const newProjects = [];
                    const updatePromises = [];
                    const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();

                    projectsToReleaseSnapshot.forEach(doc => {
                        const project = doc.data();
                        if (project.isLocked) {
                            console.log(`Skipping locked task ${project.id} from release.`);
                            return; // Skip locked tasks
                        }

                        const currentFixNum = parseInt(project.fixCategory.replace('Fix', ''));
                        if (isNaN(currentFixNum)) {
                            console.warn(`Invalid Fix Category for project ${project.id}: ${project.fixCategory}`);
                            return;
                        }

                        const nextFixCategory = `Fix${currentFixNum + 1}`;
                        if (!this.config.FIX_CATEGORIES.ORDER.includes(nextFixCategory)) {
                            // If it's the last fix stage, just mark as released without creating a new one
                            updatePromises.push(doc.ref.update({
                                releasedToNextStage: true,
                                lastModifiedTimestamp: serverTimestamp
                            }));
                            return;
                        }

                        // Mark current task as released
                        updatePromises.push(doc.ref.update({
                            releasedToNextStage: true,
                            lastModifiedTimestamp: serverTimestamp
                        }));

                        // Create new task for the next stage
                        const newProjectData = {
                            ...project,
                            id: undefined, // Let Firestore generate new ID
                            fixCategory: nextFixCategory,
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
                            originalProjectId: doc.id,
                            creationTimestamp: serverTimestamp, // New creation timestamp for the new task
                            lastModifiedTimestamp: serverTimestamp,
                            breakDurationMinutesDay1: 0,
                            breakDurationMinutesDay2: 0,
                            breakDurationMinutesDay3: 0,
                            additionalMinutesManual: 0,
                            isLocked: false, // Ensure new tasks are always unlocked
                        };
                        newProjects.push(newProjectData);
                    });

                    // Commit updates to existing projects
                    await Promise.all(updatePromises);

                    // Add new projects in a separate batch operation or individual adds if needed
                    // For simplicity, add them individually here, but a batch is better for many items.
                    for (const newProject of newProjects) {
                        const newProjectRef = this.db.collection("projects").doc();
                        batch.set(newProjectRef, newProject);
                    }
                    await batch.commit();

                    // Send notification
                    await this.db.collection(this.config.firestorePaths.NOTIFICATIONS).add({
                        message: `Project "${batchProjectName}" tasks have been released to the next stage!`,
                        type: "release_task",
                        timestamp: serverTimestamp
                    });

                    alert(`Project "${batchProjectName}" tasks successfully released to next stage.`);
                    this.methods.initializeFirebaseAndLoadData.call(this); // Refresh the dashboard
                } catch (error) {
                    console.error("Error releasing project to next stage:", error);
                    alert("Error releasing project to next stage: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            async handleReleaseSingleTaskToNextFix(projectId, baseProjectName, areaTask, currentFixCategory) {
                const pin = prompt("Enter PIN to release this task:");
                if (pin !== this.config.pins.TL_DASHBOARD_PIN) {
                    if (pin) alert("Incorrect PIN.");
                    return;
                }

                this.methods.showLoading.call(this, `Releasing task ${areaTask} to next stage...`);
                try {
                    const projectRef = this.db.collection("projects").doc(projectId);
                    const doc = await projectRef.get();
                    if (!doc.exists) throw new Error("Task not found.");

                    const project = doc.data();
                    if (project.isLocked) {
                        alert("This task is locked and cannot be released.");
                        this.methods.hideLoading.call(this);
                        return;
                    }
                    if (project.status !== "Completed") {
                        alert("Only 'Completed' tasks can be released to the next Fix stage.");
                        this.methods.hideLoading.call(this);
                        return;
                    }
                    if (project.releasedToNextStage) {
                        alert("This task has already been released to the next stage.");
                        this.methods.hideLoading.call(this);
                        return;
                    }

                    const currentFixNum = parseInt(currentFixCategory.replace('Fix', ''));
                    if (isNaN(currentFixNum)) throw new Error("Invalid Fix Category.");

                    const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();
                    const batch = this.db.batch();

                    const nextFixCategory = `Fix${currentFixNum + 1}`;
                    if (!this.config.FIX_CATEGORIES.ORDER.includes(nextFixCategory)) {
                        // If it's the last fix stage, just mark as released without creating a new one
                        batch.update(projectRef, {
                            releasedToNextStage: true,
                            lastModifiedTimestamp: serverTimestamp
                        });
                        alert(`Task "${areaTask}" from project "${baseProjectName}" marked as released (no further Fix stages).`);
                    } else {
                        // Mark current task as released
                        batch.update(projectRef, {
                            releasedToNextStage: true,
                            lastModifiedTimestamp: serverTimestamp
                        });

                        // Create new task for the next stage
                        const newProjectData = {
                            ...project,
                            id: undefined, // Let Firestore generate new ID
                            fixCategory: nextFixCategory,
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
                            originalProjectId: projectId, // Link to original task
                            creationTimestamp: serverTimestamp, // New creation timestamp for the new task
                            lastModifiedTimestamp: serverTimestamp,
                            breakDurationMinutesDay1: 0,
                            breakDurationMinutesDay2: 0,
                            breakDurationMinutesDay3: 0,
                            additionalMinutesManual: 0,
                            isLocked: false, // Ensure new tasks are always unlocked
                        };
                        const newProjectRef = this.db.collection("projects").doc();
                        batch.set(newProjectRef, newProjectData);
                        alert(`Task "${areaTask}" from project "${baseProjectName}" released to ${nextFixCategory}.`);
                    }
                    await batch.commit();

                    // Send notification
                    await this.db.collection(this.config.firestorePaths.NOTIFICATIONS).add({
                        message: `Task "${areaTask}" from project "${baseProjectName}" released to next stage!`,
                        type: "release_single_task",
                        timestamp: serverTimestamp
                    });

                    this.methods.initializeFirebaseAndLoadData.call(this); // Refresh the dashboard
                } catch (error) {
                    console.error("Error releasing single task:", error);
                    alert("Error releasing task: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            async handleReassignProject(projectId, baseProjectName, areaTask) {
                const pin = prompt("Enter PIN to reassign this task:");
                if (pin !== this.config.pins.TL_DASHBOARD_PIN) {
                    if (pin) alert("Incorrect PIN.");
                    return;
                }

                const techAbsentReason = prompt("Please provide a reason for reassigning (e.g., 'Tech Absent', 'Incorrect Assignment'):");
                if (!techAbsentReason || techAbsentReason.trim() === "") {
                    alert("Reassignment reason is required.");
                    return;
                }

                const confirmReassign = confirm(`Are you sure you want to reassign task "${areaTask}" from project "${baseProjectName}" due to: "${techAbsentReason}"?`);
                if (!confirmReassign) {
                    alert("Reassignment cancelled.");
                    return;
                }

                this.methods.showLoading.call(this, `Reassigning task ${areaTask}...`);
                try {
                    const projectRef = this.db.collection("projects").doc(projectId);
                    const doc = await projectRef.get();
                    if (!doc.exists) throw new Error("Task not found.");

                    const project = doc.data();
                    if (project.isLocked) {
                        alert("This task is locked and cannot be reassigned.");
                        this.methods.hideLoading.call(this);
                        return;
                    }
                    if (project.status.includes('InProgress') || project.status === 'Completed' || project.status.includes('Reassigned')) {
                        alert("This task cannot be reassigned as it is already In Progress, Completed, or previously Reassigned.");
                        this.methods.hideLoading.call(this);
                        return;
                    }

                    const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();

                    // Update the existing task to be marked as reassigned
                    await projectRef.update({
                        isReassigned: true,
                        reassignmentReason: techAbsentReason,
                        lastModifiedTimestamp: serverTimestamp,
                        status: "Reassigned_TechAbsent", // Set a specific status for reassigned tasks
                        assignedTo: "", // Clear assigned tech
                    });

                    // Create a new task that is a copy of the original but available
                    const newProjectData = {
                        ...project,
                        id: undefined, // Let Firestore generate new ID
                        isReassigned: false,
                        reassignmentReason: "",
                        originalProjectId: projectId, // Link to the original task that was reassigned
                        creationTimestamp: serverTimestamp, // New creation timestamp for the new task
                        lastModifiedTimestamp: serverTimestamp,
                        status: "Available", // New task is available
                        assignedTo: "", // New task has no assigned tech initially
                        isLocked: false, // Ensure new tasks are always unlocked
                    };

                    await this.db.collection("projects").add(newProjectData);

                    // Send notification
                    await this.db.collection(this.config.firestorePaths.NOTIFICATIONS).add({
                        message: `Task "${areaTask}" from project "${baseProjectName}" has been reassigned due to "${techAbsentReason}". A new available task has been created.`,
                        type: "reassign_task",
                        timestamp: serverTimestamp
                    });

                    alert(`Task "${areaTask}" from project "${baseProjectName}" successfully reassigned.`);
                    this.methods.initializeFirebaseAndLoadData.call(this); // Refresh the dashboard
                } catch (error) {
                    console.error("Error reassigning task:", error);
                    alert("Error reassigning task: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },


            async handleLockGroup() {
                const pin = prompt("Enter PIN to lock a group:");
                if (pin !== this.config.pins.TL_DASHBOARD_PIN) {
                    if (pin) alert("Incorrect PIN.");
                    return;
                }

                const batchProjectName = document.getElementById('batchProjectNameSelect').value;
                const fixStage = document.getElementById('fixStageSelect').value;

                if (!batchProjectName) {
                    alert("Please select a Project for batch operation.");
                    return;
                }

                if (!fixStage) {
                    alert("Please select a Fix Stage to lock.");
                    return;
                }

                const confirmLock = confirm(`Are you sure you want to LOCK ALL tasks in project "${batchProjectName}" for Fix Stage "${fixStage}"? This will prevent any changes to these tasks.`);
                if (!confirmLock) {
                    alert("Lock operation cancelled.");
                    return;
                }

                this.methods.showLoading.call(this, `Locking tasks for ${batchProjectName} - ${fixStage}...`);
                try {
                    const batch = this.db.batch();
                    const tasksToLockSnapshot = await this.db.collection("projects")
                        .where("baseProjectName", "==", batchProjectName)
                        .where("fixCategory", "==", fixStage)
                        .get();

                    if (tasksToLockSnapshot.empty) {
                        alert(`No tasks found for Project "${batchProjectName}" and Fix Stage "${fixStage}".`);
                        this.methods.hideLoading.call(this);
                        return;
                    }

                    tasksToLockSnapshot.forEach(doc => {
                        batch.update(doc.ref, {
                            isLocked: true,
                            lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    });

                    await batch.commit();
                    alert(`All tasks in project "${batchProjectName}" for Fix Stage "${fixStage}" have been LOCKED.`);

                    // Force refresh to show lock icons
                    this.methods.initializeFirebaseAndLoadData.call(this);
                } catch (error) {
                    console.error("Error locking group:", error);
                    alert("Error locking group: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            async handleUnlockGroup() {
                const pin = prompt("Enter PIN to unlock a group:");
                if (pin !== this.config.pins.TL_DASHBOARD_PIN) {
                    if (pin) alert("Incorrect PIN.");
                    return;
                }

                const batchProjectName = document.getElementById('batchProjectNameSelect').value;
                const fixStage = document.getElementById('fixStageSelect').value;

                if (!batchProjectName) {
                    alert("Please select a Project for batch operation.");
                    return;
                }

                if (!fixStage) {
                    alert("Please select a Fix Stage to unlock.");
                    return;
                }

                const confirmUnlock = confirm(`Are you sure you want to UNLOCK ALL tasks in project "${batchProjectName}" for Fix Stage "${fixStage}"?`);
                if (!confirmUnlock) {
                    alert("Unlock operation cancelled.");
                    return;
                }

                this.methods.showLoading.call(this, `Unlocking tasks for ${batchProjectName} - ${fixStage}...`);
                try {
                    const batch = this.db.batch();
                    const tasksToUnlockSnapshot = await this.db.collection("projects")
                        .where("baseProjectName", "==", batchProjectName)
                        .where("fixCategory", "==", fixStage)
                        .get();

                    if (tasksToUnlockSnapshot.empty) {
                        alert(`No tasks found for Project "${batchProjectName}" and Fix Stage "${fixStage}".`);
                        this.methods.hideLoading.call(this);
                        return;
                    }

                    tasksToUnlockSnapshot.forEach(doc => {
                        batch.update(doc.ref, {
                            isLocked: false,
                            lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    });

                    await batch.commit();
                    alert(`All tasks in project "${batchProjectName}" for Fix Stage "${fixStage}" have been UNLOCKED.`);

                    // Force refresh to show lock icons
                    this.methods.initializeFirebaseAndLoadData.call(this);
                } catch (error) {
                    console.error("Error unlocking group:", error);
                    alert("Error unlocking group: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            async handleRecalcTotals() {
                const pin = prompt("Enter PIN to recalculate totals:");
                if (pin !== this.config.pins.TL_DASHBOARD_PIN) {
                    if (pin) alert("Incorrect PIN.");
                    return;
                }

                const batchProjectName = document.getElementById('batchProjectNameSelect').value;
                const fixStage = document.getElementById('fixStageSelect').value;

                if (!batchProjectName) {
                    alert("Please select a Project for recalculation.");
                    return;
                }

                this.methods.showLoading.call(this, `Recalculating totals for ${batchProjectName} - ${fixStage || 'All Fix Stages'}...`);
                try {
                    let query = this.db.collection("projects").where("baseProjectName", "==", batchProjectName);
                    if (fixStage) {
                        query = query.where("fixCategory", "==", fixStage);
                    }

                    const snapshot = await query.get();
                    if (snapshot.empty) {
                        alert(`No projects found for the selected criteria.`);
                        this.methods.hideLoading.call(this);
                        return;
                    }

                    const batch = this.db.batch();
                    let updatedCount = 0;

                    snapshot.forEach(doc => {
                        const projectData = doc.data();
                        let updates = {};
                        let changed = false;

                        // Recalculate duration for each day if start and finish times exist
                        const days = [1, 2, 3];
                        days.forEach(dayNum => {
                            const startTimeField = `startTimeDay${dayNum}`;
                            const finishTimeField = `finishTimeDay${dayNum}`;
                            const durationField = `durationDay${dayNum}Ms`;

                            const newDuration = this.methods.calculateDurationMs.call(this, projectData[startTimeField], projectData[finishTimeField]);

                            if (newDuration !== projectData[durationField]) {
                                updates[durationField] = newDuration;
                                changed = true;
                            }
                        });

                        if (changed) {
                            updates.lastModifiedTimestamp = firebase.firestore.FieldValue.serverTimestamp();
                            batch.update(doc.ref, updates);
                            updatedCount++;
                        }
                    });

                    if (updatedCount > 0) {
                        await batch.commit();
                        alert(`${updatedCount} tasks had their totals recalculated for project "${batchProjectName}" in Fix Stage "${fixStage || 'All'}".`);
                    } else {
                        alert(`No tasks needed total recalculation for project "${batchProjectName}" in Fix Stage "${fixStage || 'All'}".`);
                    }
                    this.methods.initializeFirebaseAndLoadData.call(this); // Refresh the view
                } catch (error) {
                    console.error("Error recalculating totals:", error);
                    alert("Error recalculating totals: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },


            async fetchAllowedEmails() {
                try {
                    const doc = await this.db.doc(this.config.firestorePaths.ALLOWED_EMAILS).get();
                    if (doc.exists) {
                        this.state.allowedEmails = doc.data().emails || [];
                    } else {
                        console.warn("No 'allowedEmails' document found. All emails will be denied access by default.");
                        this.state.allowedEmails = [];
                    }
                } catch (error) {
                    console.error("Error fetching allowed emails:", error);
                    this.state.allowedEmails = [];
                }
            },

            async handleAddEmail() {
                const pin = prompt("Enter PIN to add allowed email:");
                if (pin !== this.config.pins.TL_DASHBOARD_PIN) {
                    if (pin) alert("Incorrect PIN.");
                    return;
                }

                const email = this.elements.addEmailInput.value.trim();
                if (email && !this.state.allowedEmails.includes(email)) {
                    this.state.allowedEmails.push(email);
                    await this.db.doc(this.config.firestorePaths.ALLOWED_EMAILS).set({
                        emails: this.state.allowedEmails
                    });
                    this.elements.addEmailInput.value = '';
                    this.methods.renderAllowedEmailsList.call(this);
                } else {
                    alert("Email is empty or already in the list.");
                }
            },

            async handleDeleteEmail(emailToDelete) {
                const pin = prompt("Enter PIN to delete allowed email:");
                if (pin !== this.config.pins.TL_DASHBOARD_PIN) {
                    if (pin) alert("Incorrect PIN.");
                    return;
                }

                const confirmDelete = confirm(`Are you sure you want to delete ${emailToDelete}?`);
                if (confirmDelete) {
                    this.state.allowedEmails = this.state.allowedEmails.filter(email => email !== emailToDelete);
                    await this.db.doc(this.config.firestorePaths.ALLOWED_EMAILS).set({
                        emails: this.state.allowedEmails
                    });
                    this.methods.renderAllowedEmailsList.call(this);
                }
            },

            renderAllowedEmailsList() {
                if (!this.elements.allowedEmailsList) return;
                this.elements.allowedEmailsList.innerHTML = '';
                this.state.allowedEmails.forEach(email => {
                    const li = document.createElement('li');
                    li.textContent = email;
                    const deleteBtn = document.createElement('button');
                    deleteBtn.textContent = 'Delete';
                    deleteBtn.className = 'btn btn-danger btn-sm ml-2';
                    deleteBtn.onclick = () => this.methods.handleDeleteEmail(email);
                    li.appendChild(deleteBtn);
                    this.elements.allowedEmailsList.appendChild(li);
                });
            },

            async handleClearData() {
                const confirmClear = confirm("Are you sure you want to clear ALL project data? This action cannot be undone.");
                if (!confirmClear) return;

                const pin = prompt("Enter PIN to confirm data deletion:");
                if (pin !== this.config.pins.TL_DASHBOARD_PIN) {
                    if (pin) alert("Incorrect PIN.");
                    return;
                }

                this.methods.showLoading.call(this, "Clearing all project data...");
                try {
                    const projectsRef = this.db.collection("projects");
                    const snapshot = await projectsRef.get();
                    const batch = this.db.batch();

                    snapshot.forEach(doc => {
                        batch.delete(doc.ref);
                    });

                    await batch.commit();

                    // Also clear notifications
                    const notificationsRef = this.db.collection(this.config.firestorePaths.NOTIFICATIONS);
                    const notificationSnapshot = await notificationsRef.get();
                    const notificationBatch = this.db.batch();
                    notificationSnapshot.forEach(doc => {
                        notificationBatch.delete(doc.ref);
                    });
                    await notificationBatch.commit();

                    alert("All project data and notifications cleared successfully.");
                    this.state.projects = [];
                    this.methods.refreshAllViews.call(this);
                } catch (error) {
                    console.error("Error clearing data:", error);
                    alert("Error clearing data: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            async handleExportCsv() {
                this.methods.showLoading.call(this, "Exporting data to CSV...");
                try {
                    // Fetch ALL projects, regardless of current filters or pagination
                    const allProjectsSnapshot = await this.db.collection("projects").orderBy("creationTimestamp", "asc").get();
                    let projects = [];
                    allProjectsSnapshot.forEach(doc => {
                        projects.push({
                            id: doc.id,
                            ...doc.data()
                        });
                    });

                    if (projects.length === 0) {
                        alert("No projects to export.");
                        this.methods.hideLoading.call(this);
                        return;
                    }

                    // Define the headers explicitly in the desired order
                    const headers = this.config.CSV_HEADERS_FOR_IMPORT;

                    // Map Firestore field names to CSV headers for output
                    const fieldToCsvHeaderMap = Object.keys(this.config.CSV_HEADER_TO_FIELD_MAP).reduce((acc, key) => {
                        const firestoreField = this.config.CSV_HEADER_TO_FIELD_MAP[key];
                        if (firestoreField) {
                            acc[firestoreField] = key;
                        }
                        return acc;
                    }, {});

                    // Add dynamic headers for calculated fields that are not directly from Firestore but are part of the export
                    // "Total (min)" will be calculated, not directly mapped.

                    let csvContent = headers.map(header => `"${header}"`).join(',') + '\n';

                    projects.forEach(project => {
                        const row = headers.map(header => {
                            let value;
                            switch (header) {
                                case "Fix Cat":
                                    value = project.fixCategory || "";
                                    break;
                                case "Project Name":
                                    value = project.baseProjectName || "";
                                    break;
                                case "Area/Task":
                                    value = project.areaTask || "";
                                    break;
                                case "GSD":
                                    value = project.gsd || "";
                                    break;
                                case "Assigned To":
                                    value = project.assignedTo || "";
                                    break;
                                case "Status":
                                    value = project.status || "";
                                    break;
                                case "Day 1 Start":
                                    value = project.startTimeDay1 ? new Date(project.startTimeDay1.toDate()).toISOString() : "";
                                    break;
                                case "Day 1 Finish":
                                    value = project.finishTimeDay1 ? new Date(project.finishTimeDay1.toDate()).toISOString() : "";
                                    break;
                                case "Day 1 Break":
                                    value = project.breakDurationMinutesDay1 || 0;
                                    break;
                                case "Day 2 Start":
                                    value = project.startTimeDay2 ? new Date(project.startTimeDay2.toDate()).toISOString() : "";
                                    break;
                                case "Day 2 Finish":
                                    value = project.finishTimeDay2 ? new Date(project.finishTimeDay2.toDate()).toISOString() : "";
                                    break;
                                case "Day 2 Break":
                                    value = project.breakDurationMinutesDay2 || 0;
                                    break;
                                case "Day 3 Start":
                                    value = project.startTimeDay3 ? new Date(project.startTimeDay3.toDate()).toISOString() : "";
                                    break;
                                case "Day 3 Finish":
                                    value = project.finishTimeDay3 ? new Date(project.finishTimeDay3.toDate()).toISOString() : "";
                                    break;
                                case "Day 3 Break":
                                    value = project.breakDurationMinutesDay3 || 0;
                                    break;
                                case "Total (min)":
                                    value = this.methods.calculateTotalDurationMinutes(project);
                                    break;
                                case "Tech Notes":
                                    value = project.techNotes || "";
                                    break;
                                case "Creation Date":
                                    value = project.creationTimestamp ? new Date(project.creationTimestamp.toDate()).toISOString() : "";
                                    break;
                                case "Last Modified":
                                    value = project.lastModifiedTimestamp ? new Date(project.lastModifiedTimestamp.toDate()).toISOString() : "";
                                    break;
                                default:
                                    value = ""; // Fallback for any unexpected headers
                            }
                            // Handle commas and quotes within the data
                            return `"${String(value).replace(/"/g, '""')}"`;
                        }).join(',');
                        csvContent += row + '\n';
                    });

                    const blob = new Blob([csvContent], {
                        type: 'text/csv;charset=utf-8;'
                    });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.setAttribute('href', url);
                    link.setAttribute('download', 'project_tracker_export.csv');
                    link.style.display = 'none';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                    alert("Project data exported successfully to project_tracker_export.csv!");
                } catch (error) {
                    console.error("Error exporting CSV:", error);
                    alert("Error exporting data: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            async handleProcessCsvImport() {
                const pin = prompt("Enter PIN to process CSV import:");
                if (pin !== this.config.pins.TL_DASHBOARD_PIN) {
                    if (pin) alert("Incorrect PIN.");
                    return;
                }

                if (!this.elements.csvFileInput || !this.elements.csvFileInput.files || this.elements.csvFileInput.files.length === 0) {
                    this.elements.csvImportStatus.textContent = 'Please select a CSV file.';
                    return;
                }

                const file = this.elements.csvFileInput.files[0];
                this.methods.showLoading.call(this, "Processing CSV import...");
                this.elements.csvImportStatus.textContent = 'Processing...';

                const reader = new FileReader();
                reader.onload = async (e) => {
                    const text = e.target.result;
                    try {
                        const projectsToImport = this.methods.parseCsv.call(this, text);
                        if (projectsToImport.length === 0) {
                            alert("No valid projects found in the CSV for import.");
                            this.elements.csvImportStatus.textContent = 'Import failed: No valid projects found.';
                            return;
                        }

                        const batch = this.db.batch();
                        const creationTimestamp = firebase.firestore.FieldValue.serverTimestamp();
                        let importCount = 0;

                        for (const projectData of projectsToImport) {
                            // Ensure required fields are present (already checked in parseCsv, but good for safety)
                            if (!projectData.baseProjectName || !projectData.areaTask || !projectData.fixCategory || !projectData.gsd) {
                                console.warn("Skipping project due to missing required fields:", projectData);
                                continue;
                            }

                            // Generate a consistent batchId for imported projects based on project name for easier filtering
                            const batchIdForImport = `imported_batch_${projectData.baseProjectName.replace(/\s+/g, '_').toLowerCase()}`;

                            // Create new document reference and set data
                            const newProjectRef = this.db.collection("projects").doc();
                            batch.set(newProjectRef, {
                                ...projectData,
                                batchId: batchIdForImport,
                                creationTimestamp: creationTimestamp, // Set a new creation timestamp for imported projects
                                lastModifiedTimestamp: creationTimestamp,
                                releasedToNextStage: false, // Imported tasks are not yet released
                                isReassigned: false, // Imported tasks are not reassigned
                                originalProjectId: null, // No original project for imported tasks
                                isLocked: false, // Imported tasks are unlocked by default
                                // Ensure durations are null initially for fresh import
                                durationDay1Ms: null,
                                durationDay2Ms: null,
                                durationDay3Ms: null,
                            });
                            importCount++;
                        }

                        if (importCount > 0) {
                            await batch.commit();
                            this.elements.csvImportStatus.textContent = `Successfully imported ${importCount} projects!`;
                            alert(`Successfully imported ${importCount} projects!`);
                            this.elements.importCsvModal.style.display = 'none';
                            this.methods.initializeFirebaseAndLoadData.call(this); // Refresh the dashboard
                        } else {
                            this.elements.csvImportStatus.textContent = 'No projects were imported. Check console for warnings.';
                        }

                    } catch (error) {
                        console.error("Error during CSV import:", error);
                        this.elements.csvImportStatus.textContent = `Import failed: ${error.message}`;
                        alert("Error importing CSV: " + error.message);
                    } finally {
                        this.methods.hideLoading.call(this);
                    }
                };
                reader.readAsText(file);
            },

            parseCsv(csvText) {
                const lines = csvText.trim().split('\n');
                if (lines.length === 0) return [];

                // Sanitize headers by removing BOM and trimming whitespace, handling quotes
                const headerLine = lines[0].trim();
                const headers = headerLine.split(',').map(h => h.replace(/\"/g, '').trim().replace(/^\ufeff/, '')); // Remove BOM

                const projects = [];

                for (let i = 1; i < lines.length; i++) {
                    // Use a simple regex to split by comma, ignoring commas inside double quotes
                    const values = lines[i].match(/(?:\"([^\"]*)\"|([^,]*))/g).map(v => v ? v.replace(/\"/g, '').trim() : "");

                    if (values.length !== headers.length) {
                        console.warn(`Skipping row ${i + 1}: Column count mismatch. Expected ${headers.length}, got ${values.length}. Row: "${lines[i]}"`);
                        continue;
                    }

                    const projectData = {};
                    for (let j = 0; j < headers.length; j++) {
                        const csvHeader = headers[j];
                        const fieldName = this.config.CSV_HEADER_TO_FIELD_MAP[csvHeader];
                        const value = values[j];

                        // Skip fields that are null in the map (calculated/generated fields)
                        if (fieldName === null) {
                            continue;
                        }

                        // Special handling for timestamp fields (ISO format from export)
                        if (fieldName && (fieldName.includes("TimeDay") || fieldName.includes("Timestamp"))) {
                            projectData[fieldName] = value ? firebase.firestore.Timestamp.fromDate(new Date(value)) : null;
                        }
                        // Special handling for break durations (ensure they are numbers)
                        else if (fieldName && fieldName.includes("breakDurationMinutes")) {
                            projectData[fieldName] = parseInt(value, 10) || 0;
                        }
                        // Special handling for status to clean up potential variations
                        else if (fieldName === 'status') {
                            let cleanedStatus = value.toLowerCase();
                            if (cleanedStatus.includes('in progress day1')) cleanedStatus = 'InProgressDay1';
                            else if (cleanedStatus.includes('day1ended_awaitingnext')) cleanedStatus = 'Day1Ended_AwaitingNext';
                            else if (cleanedStatus.includes('in progress day2')) cleanedStatus = 'InProgressDay2';
                            else if (cleanedStatus.includes('day2ended_awaitingnext')) cleanedStatus = 'Day2Ended_AwaitingNext';
                            else if (cleanedStatus.includes('in progress day3')) cleanedStatus = 'InProgressDay3';
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

    // --- KICK OFF THE APPLICATION ---\
    ProjectTrackerApp.init();

});
```I've updated the `script (3).js` file to include a "Delete Area" button in the Project Settings under the "Release Tasks" section.

Here's a summary of the changes:
* A new `deleteAreaBtn` element reference has been added to `ProjectTrackerApp.elements` in the `setupDOMReferences` method.
* An event listener for this new button has been added in `attachEventListeners`, which calls the `handleDeleteArea` method.
* The `renderTLDashboard` method has been modified to include the HTML for the "Delete Area" button within the Project Settings modal.
* A new asynchronous method `handleDeleteArea` has been implemented within `ProjectTrackerApp.methods`. This method:
    * Prompts for a PIN for authorization.
    * Asks the user to input the "Project Name" and "Area/Task" to be deleted.
    * Confirms the deletion with the user, emphasizing that the action is permanent.
    * If confirmed, it queries the Firestore `projects` collection to find and delete the specified area task.
    * Provides feedback to the user on the success or failure of the deletion and refreshes the displayed project data.

This modification allows administrators to securely delete specific area tasks from projects directly through the application's interface.

```javascript
/**
 * =================================================================
 * Project Tracker Application - Refactored and Bug-Fixed
 * =================================================================
 * This script has been fully refactored to encapsulate all logic
 * within the `ProjectTrackerApp` object. This approach eliminates
 * global variables, improves performance, and ensures correct
 * timezone handling.
 *
 * @version 2.9.2
 * @author Gemini AI Refactor & Bug-Fix
 * @changeLog
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
                apiKey: "AIzaSyADB1W9YKaU6DFqGyjivsADJOhuIRY0eZ0",
                authDomain: "project-tracker-fddb1.firebaseapp.com",
                projectId: "project-tracker-fddb1",
                storageBucket: "project-tracker-fddb1.firebasestorage.app",
                messagingSenderId: "698282455986",
                appId: "1:698282455986:web:f31fa7830148dc47076aab",
                measurementId: "G-6D2Z9ZWEN1"
            },
            pins: {
                TL_DASHBOARD_PIN: "1234"
            },
            firestorePaths: {
                ALLOWED_EMAILS: "settings/allowedEmails",
                NOTIFICATIONS: "notifications"
            },
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
                    // NEW: Reference for the Delete Area button
                    deleteAreaBtn: document.getElementById('deleteAreaBtn'),
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
                        self.methods.renderAllowedEmailsList.call(self);
                    } else if (pin) alert("Incorrect PIN.");
                });

                attachClick(self.elements.openTlSummaryBtn, () => {
                    self.elements.tlSummaryModal.style.display = 'block';
                    self.methods.generateTlSummaryData.call(self);
                });

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
                attachClick(self.elements.clearDataBtn, self.methods.handleClearData.bind(self));
                attachClick(self.elements.nextPageBtn, self.methods.handleNextPage.bind(self));
                attachClick(self.elements.prevPageBtn, self.methods.handlePrevPage.bind(self));

                // NEW: Attach click listener for Delete Area button
                attachClick(self.elements.deleteAreaBtn, self.methods.handleDeleteArea.bind(self));


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

            handleAuthorizedUser(user) {
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

            async handleDeleteArea() {
                const pin = prompt("Enter PIN to delete an area:");
                if (pin !== this.config.pins.TL_DASHBOARD_PIN) {
                    if (pin) alert("Incorrect PIN.");
                    return;
                }

                const baseProjectName = prompt("Enter the Project Name of the area to delete:");
                if (!baseProjectName || baseProjectName.trim() === "") {
                    alert("Project Name cannot be empty.");
                    return;
                }

                const areaTask = prompt("Enter the Area/Task name to delete (e.g., Area01):");
                if (!areaTask || areaTask.trim() === "") {
                    alert("Area/Task name cannot be empty.");
                    return;
                }

                const confirmDelete = confirm(`Are you sure you want to permanently delete area "${areaTask}" from project "${baseProjectName}"? This action cannot be undone.`);
                if (!confirmDelete) {
                    alert("Delete operation cancelled.");
                    return;
                }

                this.methods.showLoading.call(this, "Deleting area...");
                try {
                    const querySnapshot = await this.db.collection("projects")
                        .where("baseProjectName", "==", baseProjectName)
                        .where("areaTask", "==", areaTask)
                        .get();

                    if (querySnapshot.empty) {
                        alert(`No project found with Project Name "${baseProjectName}" and Area/Task "${areaTask}".`);
                        return;
                    }

                    const batch = this.db.batch();
                    querySnapshot.forEach(doc => {
                        batch.delete(doc.ref);
                    });

                    await batch.commit();
                    alert(`Area "${areaTask}" from project "${baseProjectName}" deleted successfully.`);
                    this.methods.initializeFirebaseAndLoadData.call(this); // Refresh data
                } catch (error) {
                    console.error("Error deleting area:", error);
                    alert("Error deleting area: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            refreshAllViews() {
                try {
                    this.methods.renderProjects.call(this);
                    this.methods.updatePaginationUI.call(this);
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

            renderTLDashboard() {
                const self = this;
                if (!self.elements.tlDashboardContentElement) return;

                let tlDashboardHtml = `
                    <h2>Project Settings & Admin Dashboard</h2>
                    <div class="dashboard-section">
                        <h3>Release Tasks</h3>
                        <p>Release tasks to the next Fix stage. This will create new tasks in the next stage and mark current tasks as 'Released'.</p>
                        <div class="action-buttons">
                            <select id="releaseBatchIdSelect">
                                <option value="">Select Project to Release</option>
                                ${self.state.projects.filter(p => !p.releasedToNextStage && p.status === "Completed")
                                    .map(p => p.baseProjectName)
                                    .filter((value, index, self) => self.indexOf(value) === index)
                                    .sort()
                                    .map(name => `<option value="${name}">${name}</option>`)
                                    .join('')}
                            </select>
                            <button id="releaseToNextStageBtn" class="btn btn-primary">Release Selected Project to Next Stage</button>
                            <p class="warning-text">Only 'Completed' tasks can be released. Releasing will create new tasks in Fix[X+1] and mark current tasks as 'Released'.</p>
                        </div>
                    </div>

                    <div class="dashboard-section">
                        <h3>Batch Operations</h3>
                        <p>Perform batch operations on project groups.</p>
                        <div class="action-buttons">
                            <select id="batchProjectNameSelect">
                                <option value="">Select Project for Batch Op</option>
                                ${self.state.projects.map(p => p.baseProjectName)
                                    .filter((value, index, self) => self.indexOf(value) === index)
                                    .sort()
                                    .map(name => `<option value="${name}">${name}</option>`)
                                    .join('')}
                            </select>

                            <label for="fixStageSelect">Fix Stage:</label>
                            <select id="fixStageSelect">
                                <option value="">All Fix Stages</option>
                                ${self.config.FIX_CATEGORIES.ORDER.map(fixCat => `<option value="${fixCat}">${fixCat}</option>`).join('')}
                            </select>

                            <button id="lockGroupBtn" class="btn btn-warning">Lock All in Group 🔒</button>
                            <button id="unlockGroupBtn" class="btn btn-info">Unlock All in Group 🔓</button>
                            <button id="recalcTotalsBtn" class="btn btn-secondary">Recalculate All Totals</button>
                        </div>
                    </div>

                    <div class="dashboard-section">
                        <h3>Delete Area</h3>
                        <p>Permanently delete a specific area task from a project. This action cannot be undone.</p>
                        <div class="action-buttons">
                            <button id="deleteAreaBtn" class="btn btn-danger">Delete Area</button>
                        </div>
                    </div>
                    `;
                self.elements.tlDashboardContentElement.innerHTML = tlDashboardHtml;

                // Attach event listeners for dynamically created elements
                const releaseToNextStageBtn = document.getElementById('releaseToNextStageBtn');
                if (releaseToNextStageBtn) {
                    releaseToNextStageBtn.onclick = () => self.methods.handleReleaseToNextStage.call(self);
                }

                const lockGroupBtn = document.getElementById('lockGroupBtn');
                if (lockGroupBtn) {
                    lockGroupBtn.onclick = () => self.methods.handleLockGroup.call(self);
                }

                const unlockGroupBtn = document.getElementById('unlockGroupBtn');
                if (unlockGroupBtn) {
                    unlockGroupBtn.onclick = () => self.methods.handleUnlockGroup.call(self);
                }

                const recalcTotalsBtn = document.getElementById('recalcTotalsBtn');
                if (recalcTotalsBtn) {
                    recalcTotalsBtn.onclick = () => self.methods.handleRecalcTotals.call(self);
                }

                // NEW: Assign the deleteAreaBtn reference dynamically as it's created within innerHTML
                self.elements.deleteAreaBtn = document.getElementById('deleteAreaBtn');
                // The event listener is already attached via attachEventListeners
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
                // NEW: Pre-calculate lock status for each group
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
                        // UPDATED: Determine lock icon based on pre-calculated status, using emojis
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
                        };
                    }
                    const row = this.elements.projectTableBody.insertRow();
                    row.style.backgroundColor = this.config.FIX_CATEGORIES.COLORS[project.fixCategory] || this.config.FIX_CATEGORIES.COLORS.default;
                    const groupKey = `${currentBaseProjectNameHeader}_${project.fixCategory}`;
                    if (this.state.groupVisibilityState[groupKey]?.isExpanded === false) row.classList.add("hidden-group-row");
                    if (project.isReassigned) row.classList.add("reassigned-task-highlight");
                    if (project.isLocked) row.classList.add("locked-task-highlight");
                    row.insertCell().textContent = project.fixCategory;
                    row.insertCell().textContent = project.baseProjectName;
                    row.insertCell().textContent = project.areaTask;
                    row.insertCell().textContent = project.gsd;
                    const assignedToCell = row.insertCell();
                    const assignedToSelect = document.createElement('select');
                    assignedToSelect.className = 'assigned-to-select';
                    assignedToSelect.disabled = project.status === "Reassigned_TechAbsent" || project.isLocked;
                    assignedToSelect.innerHTML = `<option value="">Select Tech ID</option>` + this.config.TECH_IDS.map(id => `<option value="${id}">${id}</option>`).join('');
                    assignedToSelect.value = project.assignedTo || "";
                    assignedToSelect.onchange = (e) => {
                        this.methods.updateFirestoreField(project.id, 'assignedTo', e.target.value);
                    };
                    assignedToCell.appendChild(assignedToSelect);

                    const statusCell = row.insertCell();
                    const statusSelect = document.createElement('select');
                    statusSelect.className = 'status-select';
                    statusSelect.disabled = project.status.includes('InProgress') || project.isLocked;
                    const statuses = ["Available", "InProgressDay1", "Day1Ended_AwaitingNext", "InProgressDay2", "Day2Ended_AwaitingNext", "InProgressDay3", "Day3Ended_AwaitingNext", "Completed", "Reassigned_TechAbsent", "Cancelled"];
                    statusSelect.innerHTML = statuses.map(s => `<option value="${s}" ${project.status === s ? 'selected' : ''}>${s}</option>`).join('');
                    statusSelect.onchange = (e) => {
                        this.methods.updateFirestoreField(project.id, 'status', e.target.value);
                    };
                    statusCell.appendChild(statusSelect);

                    const createTimeInput = (value, fieldName) => {
                        const input = document.createElement('input');
                        input.type = 'time';
                        input.value = value ? new Date(value.toDate()).toTimeString().slice(0, 5) : '';
                        input.disabled = project.isLocked;
                        input.onchange = (e) => this.methods.updateTimeField(project.id, fieldName, e.target.value);
                        return input;
                    };

                    row.insertCell().appendChild(createTimeInput(project.startTimeDay1, 'startTimeDay1'));
                    row.insertCell().appendChild(createTimeInput(project.finishTimeDay1, 'finishTimeDay1'));
                    const break1Cell = row.insertCell();
                    const break1Input = document.createElement('input');
                    break1Input.type = 'number';
                    break1Input.placeholder = 'min';
                    break1Input.value = project.breakDurationMinutesDay1 || 0;
                    break1Input.disabled = project.isLocked;
                    break1Input.onchange = (e) => this.methods.updateFirestoreField(project.id, 'breakDurationMinutesDay1', parseInt(e.target.value) || 0);
                    break1Cell.appendChild(break1Input);

                    row.insertCell().appendChild(createTimeInput(project.startTimeDay2, 'startTimeDay2'));
                    row.insertCell().appendChild(createTimeInput(project.finishTimeDay2, 'finishTimeDay2'));
                    const break2Cell = row.insertCell();
                    const break2Input = document.createElement('input');
                    break2Input.type = 'number';
                    break2Input.placeholder = 'min';
                    break2Input.value = project.breakDurationMinutesDay2 || 0;
                    break2Input.disabled = project.isLocked;
                    break2Input.onchange = (e) => this.methods.updateFirestoreField(project.id, 'breakDurationMinutesDay2', parseInt(e.target.value) || 0);
                    break2Cell.appendChild(break2Input);

                    row.insertCell().appendChild(createTimeInput(project.startTimeDay3, 'startTimeDay3'));
                    row.insertCell().appendChild(createTimeInput(project.finishTimeDay3, 'finishTimeDay3'));
                    const break3Cell = row.insertCell();
                    const break3Input = document.createElement('input');
                    break3Input.type = 'number';
                    break3Input.placeholder = 'min';
                    break3Input.value = project.breakDurationMinutesDay3 || 0;
                    break3Input.disabled = project.isLocked;
                    break3Input.onchange = (e) => this.methods.updateFirestoreField(project.id, 'breakDurationMinutesDay3', parseInt(e.target.value) || 0);
                    break3Cell.appendChild(break3Input);

                    const totalDurationMinutes = this.methods.calculateTotalDurationMinutes.call(this, project);
                    const totalCell = row.insertCell();
                    totalCell.textContent = totalDurationMinutes;
                    totalCell.style.fontWeight = 'bold';
                    totalCell.style.backgroundColor = totalDurationMinutes > 0 ? '#d4edda' : 'transparent';

                    const additionalMinutesCell = row.insertCell();
                    const additionalMinutesInput = document.createElement('input');
                    additionalMinutesInput.type = 'number';
                    additionalMinutesInput.placeholder = 'Add min';
                    additionalMinutesInput.value = project.additionalMinutesManual || 0;
                    additionalMinutesInput.disabled = project.isLocked;
                    additionalMinutesInput.onchange = (e) => {
                        this.methods.updateFirestoreField(project.id, 'additionalMinutesManual', parseInt(e.target.value) || 0);
                    };
                    additionalMinutesCell.appendChild(additionalMinutesInput);

                    const progressCell = row.insertCell();
                    const progressBarContainer = document.createElement('div');
                    progressBarContainer.className = 'progress-bar-container';
                    const progressBar = document.createElement('div');
                    progressBar.className = 'progress-bar';
                    const progressPercentage = this.methods.calculateProgress.call(this, project);
                    progressBar.style.width = `${progressPercentage}%`;
                    progressBar.textContent = `${Math.round(progressPercentage)}%`;
                    progressBarContainer.appendChild(progressBar);
                    progressCell.appendChild(progressBarContainer);

                    const notesCell = row.insertCell();
                    const notesTextarea = document.createElement('textarea');
                    notesTextarea.className = 'tech-notes-textarea';
                    notesTextarea.value = project.techNotes || "";
                    notesTextarea.placeholder = "Enter notes...";
                    notesTextarea.disabled = project.isLocked;
                    notesTextarea.onchange = (e) => {
                        this.methods.updateFirestoreField(project.id, 'techNotes', e.target.value);
                    };
                    notesCell.appendChild(notesTextarea);

                    row.insertCell().textContent = project.creationTimestamp ? new Date(project.creationTimestamp.toDate()).toLocaleString() : 'N/A';
                    row.insertCell().textContent = project.lastModifiedTimestamp ? new Date(project.lastModifiedTimestamp.toDate()).toLocaleString() : 'N/A';


                    const actionsCell = row.insertCell();
                    actionsCell.className = "actions-cell";

                    const createButton = (text, className, actionType) => {
                        const button = document.createElement('button');
                        button.textContent = text;
                        button.className = `btn btn-sm ${className}`;
                        button.disabled = project.isLocked;
                        button.onclick = () => this.methods.updateProjectState(project.id, actionType);
                        return button;
                    };

                    const startDay1Btn = createButton('Start Day 1', 'btn-success', 'startDay1');
                    const endDay1Btn = createButton('End Day 1', 'btn-warning', 'endDay1');
                    const startDay2Btn = createButton('Start Day 2', 'btn-success', 'startDay2');
                    const endDay2Btn = createButton('End Day 2', 'btn-warning', 'endDay2');
                    const startDay3Btn = createButton('Start Day 3', 'btn-success', 'startDay3');
                    const endDay3Btn = createButton('End Day 3', 'btn-warning', 'endDay3');
                    const markDoneBtn = createButton('Mark Done', 'btn-info', 'markDone');
                    const reassignedBtn = createButton('Reassign', 'btn-danger', 'reassign');

                    const releaseToNextFixBtn = document.createElement('button');
                    releaseToNextFixBtn.textContent = 'Release to Next Fix';
                    releaseToNextFixBtn.className = 'btn btn-sm btn-primary';
                    releaseToNextFixBtn.disabled = project.releasedToNextStage || project.isLocked;
                    releaseToNextFixBtn.onclick = () => this.methods.handleReleaseSingleTaskToNextFix.call(this, project.id, project.baseProjectName, project.areaTask, project.fixCategory);

                    const releaseToAvailableBtn = document.createElement('button');
                    releaseToAvailableBtn.textContent = 'Release to Available (Fix1)';
                    releaseToAvailableBtn.className = 'btn btn-sm btn-secondary';
                    releaseToAvailableBtn.disabled = project.isLocked;
                    releaseToAvailableBtn.onclick = () => this.methods.handleReleaseToAvailable.call(this, project.id, project.baseProjectName, project.areaTask);

                    // Reassign Button (with logic to prevent reassigning tasks that are InProgress, Completed, or Reassigned)
                    const reassignBtn = document.createElement('button');
                    reassignBtn.textContent = 'Reassign';
                    reassignBtn.className = 'btn btn-sm btn-danger';
                    reassignBtn.disabled = project.status.includes('InProgress') || project.status === 'Completed' || project.status.includes('Reassigned') || project.isLocked;
                    reassignBtn.onclick = () => this.methods.handleReassignProject.call(this, project.id, project.baseProjectName, project.areaTask);


                    if (project.status === "Available") {
                        actionsCell.appendChild(startDay1Btn);
                    } else if (project.status === "InProgressDay1") {
                        actionsCell.appendChild(endDay1Btn);
                        actionsCell.appendChild(markDoneBtn);
                    } else if (project.status === "Day1Ended_AwaitingNext") {
                        actionsCell.appendChild(startDay2Btn);
                        actionsCell.appendChild(markDoneBtn);
                    } else if (project.status === "InProgressDay2") {
                        actionsCell.appendChild(endDay2Btn);
                        actionsCell.appendChild(markDoneBtn);
                    } else if (project.status === "Day2Ended_AwaitingNext") {
                        actionsCell.appendChild(startDay3Btn);
                        actionsCell.appendChild(markDoneBtn);
                    } else if (project.status === "InProgressDay3") {
                        actionsCell.appendChild(endDay3Btn);
                        actionsCell.appendChild(markDoneBtn);
                    } else if (project.status === "Day3Ended_AwaitingNext") {
                        actionsCell.appendChild(markDoneBtn);
                    } else if (project.status === "Completed") {
                        const statusText = document.createElement('span');
                        statusText.textContent = "Completed";
                        statusText.className = "status-completed";
                        actionsCell.appendChild(statusText);
                    }

                    if (project.status !== "Completed" && !project.releasedToNextStage) {
                        actionsCell.appendChild(releaseToNextFixBtn);
                        actionsCell.appendChild(reassignBtn);
                    }

                    if (project.status === "Reassigned_TechAbsent" || project.status === "Cancelled") {
                        actionsCell.appendChild(releaseToAvailableBtn);
                    }
                });
                this.methods.hideLoading.call(this); // Hide loading after rendering
            },
            // --- Helper methods ---
            generateId() {
                return Date.now().toString(36) + Math.random().toString(36).substr(2);
            },

            showLoading(message = "Loading...") {
                const loadingOverlay = this.elements.loadingOverlay;
                if (loadingOverlay) {
                    loadingOverlay.style.display = 'flex';
                    loadingOverlay.querySelector('p').textContent = message;
                }
            },

            hideLoading() {
                const loadingOverlay = this.elements.loadingOverlay;
                if (loadingOverlay) {
                    loadingOverlay.style.display = 'none';
                }
            },

            async updateFirestoreField(projectId, field, value) {
                this.methods.showLoading.call(this, `Updating ${field}...`);
                try {
                    const projectRef = this.db.collection("projects").doc(projectId);
                    const doc = await projectRef.get();
                    if (!doc.exists) {
                        throw new Error("Document not found for update.");
                    }
                    const projectData = doc.data();
                    if (projectData.isLocked) {
                        alert("This task is locked. Please unlock it in Project Settings to make changes.");
                        return;
                    }
                    await projectRef.update({
                        [field]: value,
                        lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
                    });
                } catch (error) {
                    console.error(`Error updating field ${field}:`, error);
                    alert(`Error updating ${field}: ` + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            calculateDurationMs(startTime, finishTime) {
                if (startTime && finishTime && startTime.toDate && finishTime.toDate) {
                    const startMs = startTime.toDate().getTime();
                    const finishMs = finishTime.toDate().getTime();
                    return finishMs - startMs;
                }
                return null;
            },

            calculateTotalDurationMinutes(project) {
                let totalMs = 0;
                if (project.durationDay1Ms) totalMs += project.durationDay1Ms;
                if (project.durationDay2Ms) totalMs += project.durationDay2Ms;
                if (project.durationDay3Ms) totalMs += project.durationDay3Ms;

                let totalMinutes = Math.round(totalMs / (1000 * 60)); // Convert milliseconds to minutes
                totalMinutes -= (project.breakDurationMinutesDay1 || 0);
                totalMinutes -= (project.breakDurationMinutesDay2 || 0);
                totalMinutes -= (project.breakDurationMinutesDay3 || 0);
                totalMinutes += (project.additionalMinutesManual || 0);

                return Math.max(0, totalMinutes); // Ensure total is not negative
            },

            calculateProgress(project) {
                // Define stages and their approximate weights for progress calculation
                // This is a simplified model, can be made more complex if needed.
                const stageWeights = {
                    "Available": 0,
                    "InProgressDay1": 20,
                    "Day1Ended_AwaitingNext": 30,
                    "InProgressDay2": 50,
                    "Day2Ended_AwaitingNext": 60,
                    "InProgressDay3": 80,
                    "Day3Ended_AwaitingNext": 90,
                    "Completed": 100,
                    "Reassigned_TechAbsent": 0, // Reassigned tasks are not 'in progress' in the traditional sense
                    "Cancelled": 0 // Cancelled tasks are not 'in progress'
                };

                // Base progress on status
                let progress = stageWeights[project.status] || 0;

                // Add a small percentage if assigned, as it shows commitment
                if (project.assignedTo && progress < 100) {
                    progress += 5; // A small bump for being assigned
                }

                // Further refine progress based on actual time logged, if any
                const totalLoggedDuration = (project.durationDay1Ms || 0) + (project.durationDay2Ms || 0) + (project.durationDay3Ms || 0);
                // Assuming a typical project might take, say, 180 minutes (3 hours) to be 'done' to make this scale
                const assumedMaxDurationMs = 3 * 60 * 60 * 1000;
                if (totalLoggedDuration > 0 && progress < 100) {
                    let timeBasedProgress = (totalLoggedDuration / assumedMaxDurationMs) * 100;
                    // Cap time-based progress to avoid exceeding overall progress expectation for a stage
                    timeBasedProgress = Math.min(timeBasedProgress, 95);
                    progress = Math.max(progress, timeBasedProgress);
                }

                // Ensure progress is between 0 and 100
                return Math.min(100, Math.max(0, progress));
            },

            async handleReleaseToNextStage() {
                const pin = prompt("Enter PIN to release project(s):");
                if (pin !== this.config.pins.TL_DASHBOARD_PIN) {
                    if (pin) alert("Incorrect PIN.");
                    return;
                }

                const batchProjectName = document.getElementById('releaseBatchIdSelect').value;
                if (!batchProjectName) {
                    alert("Please select a Project to Release.");
                    return;
                }

                this.methods.showLoading.call(this, `Releasing project ${batchProjectName} to next stage...`);
                try {
                    const batch = this.db.batch();
                    const projectsToReleaseSnapshot = await this.db.collection("projects")
                        .where("baseProjectName", "==", batchProjectName)
                        .where("status", "==", "Completed")
                        .where("releasedToNextStage", "==", false)
                        .get();

                    if (projectsToReleaseSnapshot.empty) {
                        alert(`No completed tasks found for project "${batchProjectName}" that haven't been released yet.`);
                        this.methods.hideLoading.call(this);
                        return;
                    }

                    const newProjects = [];
                    const updatePromises = [];
                    const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();

                    projectsToReleaseSnapshot.forEach(doc => {
                        const project = doc.data();
                        if (project.isLocked) {
                            console.log(`Skipping locked task ${project.id} from release.`);
                            return; // Skip locked tasks
                        }

                        const currentFixNum = parseInt(project.fixCategory.replace('Fix', ''));
                        if (isNaN(currentFixNum)) {
                            console.warn(`Invalid Fix Category for project ${project.id}: ${project.fixCategory}`);
                            return;
                        }

                        const nextFixCategory = `Fix${currentFixNum + 1}`;
                        if (!this.config.FIX_CATEGORIES.ORDER.includes(nextFixCategory)) {
                            // If it's the last fix stage, just mark as released without creating a new one
                            updatePromises.push(doc.ref.update({
                                releasedToNextStage: true,
                                lastModifiedTimestamp: serverTimestamp
                            }));
                            return;
                        }

                        // Mark current task as released
                        updatePromises.push(doc.ref.update({
                            releasedToNextStage: true,
                            lastModifiedTimestamp: serverTimestamp
                        }));

                        // Create new task for the next stage
                        const newProjectData = {
                            ...project,
                            id: undefined, // Let Firestore generate new ID
                            fixCategory: nextFixCategory,
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
                            originalProjectId: doc.id,
                            creationTimestamp: serverTimestamp, // New creation timestamp for the new task
                            lastModifiedTimestamp: serverTimestamp,
                            breakDurationMinutesDay1: 0,
                            breakDurationMinutesDay2: 0,
                            breakDurationMinutesDay3: 0,
                            additionalMinutesManual: 0,
                            isLocked: false, // Ensure new tasks are always unlocked
                        };
                        newProjects.push(newProjectData);
                    });

                    // Commit updates to existing projects
                    await Promise.all(updatePromises);

                    // Add new projects in a separate batch operation or individual adds if needed
                    // For simplicity, add them individually here, but a batch is better for many items.
                    for (const newProject of newProjects) {
                        const newProjectRef = this.db.collection("projects").doc();
                        batch.set(newProjectRef, newProject);
                    }
                    await batch.commit();

                    // Send notification
                    await this.db.collection(this.config.firestorePaths.NOTIFICATIONS).add({
                        message: `Project "${batchProjectName}" tasks have been released to the next stage!`,
                        type: "release_task",
                        timestamp: serverTimestamp
                    });

                    alert(`Project "${batchProjectName}" tasks successfully released to next stage.`);
                    this.methods.initializeFirebaseAndLoadData.call(this); // Refresh the dashboard
                } catch (error) {
                    console.error("Error releasing project to next stage:", error);
                    alert("Error releasing project to next stage: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            async handleReleaseSingleTaskToNextFix(projectId, baseProjectName, areaTask, currentFixCategory) {
                const pin = prompt("Enter PIN to release this task:");
                if (pin !== this.config.pins.TL_DASHBOARD_PIN) {
                    if (pin) alert("Incorrect PIN.");
                    return;
                }

                this.methods.showLoading.call(this, `Releasing task ${areaTask} to next stage...`);
                try {
                    const projectRef = this.db.collection("projects").doc(projectId);
                    const doc = await projectRef.get();
                    if (!doc.exists) throw new Error("Task not found.");

                    const project = doc.data();
                    if (project.isLocked) {
                        alert("This task is locked and cannot be released.");
                        this.methods.hideLoading.call(this);
                        return;
                    }
                    if (project.status !== "Completed") {
                        alert("Only 'Completed' tasks can be released to the next Fix stage.");
                        this.methods.hideLoading.call(this);
                        return;
                    }
                    if (project.releasedToNextStage) {
                        alert("This task has already been released to the next stage.");
                        this.methods.hideLoading.call(this);
                        return;
                    }

                    const currentFixNum = parseInt(currentFixCategory.replace('Fix', ''));
                    if (isNaN(currentFixNum)) throw new Error("Invalid Fix Category.");

                    const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();
                    const batch = this.db.batch();

                    const nextFixCategory = `Fix${currentFixNum + 1}`;
                    if (!this.config.FIX_CATEGORIES.ORDER.includes(nextFixCategory)) {
                        // If it's the last fix stage, just mark as released without creating a new one
                        batch.update(projectRef, {
                            releasedToNextStage: true,
                            lastModifiedTimestamp: serverTimestamp
                        });
                        alert(`Task "${areaTask}" from project "${baseProjectName}" marked as released (no further Fix stages).`);
                    } else {
                        // Mark current task as released
                        batch.update(projectRef, {
                            releasedToNextStage: true,
                            lastModifiedTimestamp: serverTimestamp
                        });

                        // Create new task for the next stage
                        const newProjectData = {
                            ...project,
                            id: undefined, // Let Firestore generate new ID
                            fixCategory: nextFixCategory,
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
                            originalProjectId: projectId, // Link to original task
                            creationTimestamp: serverTimestamp, // New creation timestamp for the new task
                            lastModifiedTimestamp: serverTimestamp,
                            breakDurationMinutesDay1: 0,
                            breakDurationMinutesDay2: 0,
                            breakDurationMinutesDay3: 0,
                            additionalMinutesManual: 0,
                            isLocked: false, // Ensure new tasks are always unlocked
                        };
                        const newProjectRef = this.db.collection("projects").doc();
                        batch.set(newProjectRef, newProjectData);
                        alert(`Task "${areaTask}" from project "${baseProjectName}" released to ${nextFixCategory}.`);
                    }
                    await batch.commit();

                    // Send notification
                    await this.db.collection(this.config.firestorePaths.NOTIFICATIONS).add({
                        message: `Task "${areaTask}" from project "${baseProjectName}" released to next stage!`,
                        type: "release_single_task",
                        timestamp: serverTimestamp
                    });

                    this.methods.initializeFirebaseAndLoadData.call(this); // Refresh the dashboard
                } catch (error) {
                    console.error("Error releasing single task:", error);
                    alert("Error releasing task: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            async handleReassignProject(projectId, baseProjectName, areaTask) {
                const pin = prompt("Enter PIN to reassign this task:");
                if (pin !== this.config.pins.TL_DASHBOARD_PIN) {
                    if (pin) alert("Incorrect PIN.");
                    return;
                }

                const techAbsentReason = prompt("Please provide a reason for reassigning (e.g., 'Tech Absent', 'Incorrect Assignment'):");
                if (!techAbsentReason || techAbsentReason.trim() === "") {
                    alert("Reassignment reason is required.");
                    return;
                }

                const confirmReassign = confirm(`Are you sure you want to reassign task "${areaTask}" from project "${baseProjectName}" due to: "${techAbsentReason}"?`);
                if (!confirmReassign) {
                    alert("Reassignment cancelled.");
                    return;
                }

                this.methods.showLoading.call(this, `Reassigning task ${areaTask}...`);
                try {
                    const projectRef = this.db.collection("projects").doc(projectId);
                    const doc = await projectRef.get();
                    if (!doc.exists) throw new Error("Task not found.");

                    const project = doc.data();
                    if (project.isLocked) {
                        alert("This task is locked and cannot be reassigned.");
                        this.methods.hideLoading.call(this);
                        return;
                    }
                    if (project.status.includes('InProgress') || project.status === 'Completed' || project.status.includes('Reassigned')) {
                        alert("This task cannot be reassigned as it is already In Progress, Completed, or previously Reassigned.");
                        this.methods.hideLoading.call(this);
                        return;
                    }

                    const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();

                    // Update the existing task to be marked as reassigned
                    await projectRef.update({
                        isReassigned: true,
                        reassignmentReason: techAbsentReason,
                        lastModifiedTimestamp: serverTimestamp,
                        status: "Reassigned_TechAbsent", // Set a specific status for reassigned tasks
                        assignedTo: "", // Clear assigned tech
                    });

                    // Create a new task that is a copy of the original but available
                    const newProjectData = {
                        ...project,
                        id: undefined, // Let Firestore generate new ID
                        isReassigned: false,
                        reassignmentReason: "",
                        originalProjectId: projectId, // Link to the original task that was reassigned
                        creationTimestamp: serverTimestamp, // New creation timestamp for the new task
                        lastModifiedTimestamp: serverTimestamp,
                        status: "Available", // New task is available
                        assignedTo: "", // New task has no assigned tech initially
                        isLocked: false, // Ensure new tasks are always unlocked
                    };

                    await this.db.collection("projects").add(newProjectData);

                    // Send notification
                    await this.db.collection(this.config.firestorePaths.NOTIFICATIONS).add({
                        message: `Task "${areaTask}" from project "${baseProjectName}" has been reassigned due to "${techAbsentReason}". A new available task has been created.`,
                        type: "reassign_task",
                        timestamp: serverTimestamp
                    });

                    alert(`Task "${areaTask}" from project "${baseProjectName}" successfully reassigned.`);
                    this.methods.initializeFirebaseAndLoadData.call(this); // Refresh the dashboard
                } catch (error) {
                    console.error("Error reassigning task:", error);
                    alert("Error reassigning task: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },


            async handleLockGroup() {
                const pin = prompt("Enter PIN to lock a group:");
                if (pin !== this.config.pins.TL_DASHBOARD_PIN) {
                    if (pin) alert("Incorrect PIN.");
                    return;
                }

                const batchProjectName = document.getElementById('batchProjectNameSelect').value;
                const fixStage = document.getElementById('fixStageSelect').value;

                if (!batchProjectName) {
                    alert("Please select a Project for batch operation.");
                    return;
                }

                if (!fixStage) {
                    alert("Please select a Fix Stage to lock.");
                    return;
                }

                const confirmLock = confirm(`Are you sure you want to LOCK ALL tasks in project "${batchProjectName}" for Fix Stage "${fixStage}"? This will prevent any changes to these tasks.`);
                if (!confirmLock) {
                    alert("Lock operation cancelled.");
                    return;
                }

                this.methods.showLoading.call(this, `Locking tasks for ${batchProjectName} - ${fixStage}...`);
                try {
                    const batch = this.db.batch();
                    const tasksToLockSnapshot = await this.db.collection("projects")
                        .where("baseProjectName", "==", batchProjectName)
                        .where("fixCategory", "==", fixStage)
                        .get();

                    if (tasksToLockSnapshot.empty) {
                        alert(`No tasks found for Project "${batchProjectName}" and Fix Stage "${fixStage}".`);
                        this.methods.hideLoading.call(this);
                        return;
                    }

                    tasksToLockSnapshot.forEach(doc => {
                        batch.update(doc.ref, {
                            isLocked: true,
                            lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    });

                    await batch.commit();
                    alert(`All tasks in project "${batchProjectName}" for Fix Stage "${fixStage}" have been LOCKED.`);

                    // Force refresh to show lock icons
                    this.methods.initializeFirebaseAndLoadData.call(this);
                } catch (error) {
                    console.error("Error locking group:", error);
                    alert("Error locking group: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            async handleUnlockGroup() {
                const pin = prompt("Enter PIN to unlock a group:");
                if (pin !== this.config.pins.TL_DASHBOARD_PIN) {
                    if (pin) alert("Incorrect PIN.");
                    return;
                }

                const batchProjectName = document.getElementById('batchProjectNameSelect').value;
                const fixStage = document.getElementById('fixStageSelect').value;

                if (!batchProjectName) {
                    alert("Please select a Project for batch operation.");
                    return;
                }

                if (!fixStage) {
                    alert("Please select a Fix Stage to unlock.");
                    return;
                }

                const confirmUnlock = confirm(`Are you sure you want to UNLOCK ALL tasks in project "${batchProjectName}" for Fix Stage "${fixStage}"?`);
                if (!confirmUnlock) {
                    alert("Unlock operation cancelled.");
                    return;
                }

                this.methods.showLoading.call(this, `Unlocking tasks for ${batchProjectName} - ${fixStage}...`);
                try {
                    const batch = this.db.batch();
                    const tasksToUnlockSnapshot = await this.db.collection("projects")
                        .where("baseProjectName", "==", batchProjectName)
                        .where("fixCategory", "==", fixStage)
                        .get();

                    if (tasksToUnlockSnapshot.empty) {
                        alert(`No tasks found for Project "${batchProjectName}" and Fix Stage "${fixStage}".`);
                        this.methods.hideLoading.call(this);
                        return;
                    }

                    tasksToUnlockSnapshot.forEach(doc => {
                        batch.update(doc.ref, {
                            isLocked: false,
                            lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    });

                    await batch.commit();
                    alert(`All tasks in project "${batchProjectName}" for Fix Stage "${fixStage}" have been UNLOCKED.`);

                    // Force refresh to show lock icons
                    this.methods.initializeFirebaseAndLoadData.call(this);
                } catch (error) {
                    console.error("Error unlocking group:", error);
                    alert("Error unlocking group: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            async handleRecalcTotals() {
                const pin = prompt("Enter PIN to recalculate totals:");
                if (pin !== this.config.pins.TL_DASHBOARD_PIN) {
                    if (pin) alert("Incorrect PIN.");
                    return;
                }

                const batchProjectName = document.getElementById('batchProjectNameSelect').value;
                const fixStage = document.getElementById('fixStageSelect').value;

                if (!batchProjectName) {
                    alert("Please select a Project for recalculation.");
                    return;
                }

                this.methods.showLoading.call(this, `Recalculating totals for ${batchProjectName} - ${fixStage || 'All Fix Stages'}...`);
                try {
                    let query = this.db.collection("projects").where("baseProjectName", "==", batchProjectName);
                    if (fixStage) {
                        query = query.where("fixCategory", "==", fixStage);
                    }

                    const snapshot = await query.get();
                    if (snapshot.empty) {
                        alert(`No projects found for the selected criteria.`);
                        this.methods.hideLoading.call(this);
                        return;
                    }

                    const batch = this.db.batch();
                    let updatedCount = 0;

                    snapshot.forEach(doc => {
                        const projectData = doc.data();
                        let updates = {};
                        let changed = false;

                        // Recalculate duration for each day if start and finish times exist
                        const days = [1, 2, 3];
                        days.forEach(dayNum => {
                            const startTimeField = `startTimeDay${dayNum}`;
                            const finishTimeField = `finishTimeDay${dayNum}`;
                            const durationField = `durationDay${dayNum}Ms`;

                            const newDuration = this.methods.calculateDurationMs.call(this, projectData[startTimeField], projectData[finishTimeField]);

                            if (newDuration !== projectData[durationField]) {
                                updates[durationField] = newDuration;
                                changed = true;
                            }
                        });

                        if (changed) {
                            updates.lastModifiedTimestamp = firebase.firestore.FieldValue.serverTimestamp();
                            batch.update(doc.ref, updates);
                            updatedCount++;
                        }
                    });

                    if (updatedCount > 0) {
                        await batch.commit();
                        alert(`${updatedCount} tasks had their totals recalculated for project "${batchProjectName}" in Fix Stage "${fixStage || 'All'}".`);
                    } else {
                        alert(`No tasks needed total recalculation for project "${batchProjectName}" in Fix Stage "${fixStage || 'All'}".`);
                    }
                    this.methods.initializeFirebaseAndLoadData.call(this); // Refresh the view
                } catch (error) {
                    console.error("Error recalculating totals:", error);
                    alert("Error recalculating totals: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },


            async fetchAllowedEmails() {
                try {
                    const doc = await this.db.doc(this.config.firestorePaths.ALLOWED_EMAILS).get();
                    if (doc.exists) {
                        this.state.allowedEmails = doc.data().emails || [];
                    } else {
                        console.warn("No 'allowedEmails' document found. All emails will be denied access by default.");
                        this.state.allowedEmails = [];
                    }
                } catch (error) {
                    console.error("Error fetching allowed emails:", error);
                    this.state.allowedEmails = [];
                }
            },

            async handleAddEmail() {
                const pin = prompt("Enter PIN to add allowed email:");
                if (pin !== this.config.pins.TL_DASHBOARD_PIN) {
                    if (pin) alert("Incorrect PIN.");
                    return;
                }

                const email = this.elements.addEmailInput.value.trim();
                if (email && !this.state.allowedEmails.includes(email)) {
                    this.state.allowedEmails.push(email);
                    await this.db.doc(this.config.firestorePaths.ALLOWED_EMAILS).set({
                        emails: this.state.allowedEmails
                    });
                    this.elements.addEmailInput.value = '';
                    this.methods.renderAllowedEmailsList.call(this);
                } else {
                    alert("Email is empty or already in the list.");
                }
            },

            async handleDeleteEmail(emailToDelete) {
                const pin = prompt("Enter PIN to delete allowed email:");
                if (pin !== this.config.pins.TL_DASHBOARD_PIN) {
                    if (pin) alert("Incorrect PIN.");
                    return;
                }

                const confirmDelete = confirm(`Are you sure you want to delete ${emailToDelete}?`);
                if (confirmDelete) {
                    this.state.allowedEmails = this.state.allowedEmails.filter(email => email !== emailToDelete);
                    await this.db.doc(this.config.firestorePaths.ALLOWED_EMAILS).set({
                        emails: this.state.allowedEmails
                    });
                    this.methods.renderAllowedEmailsList.call(this);
                }
            },

            renderAllowedEmailsList() {
                if (!this.elements.allowedEmailsList) return;
                this.elements.allowedEmailsList.innerHTML = '';
                this.state.allowedEmails.forEach(email => {
                    const li = document.createElement('li');
                    li.textContent = email;
                    const deleteBtn = document.createElement('button');
                    deleteBtn.textContent = 'Delete';
                    deleteBtn.className = 'btn btn-danger btn-sm ml-2';
                    deleteBtn.onclick = () => this.methods.handleDeleteEmail(email);
                    li.appendChild(deleteBtn);
                    this.elements.allowedEmailsList.appendChild(li);
                });
            },

            async handleClearData() {
                const confirmClear = confirm("Are you sure you want to clear ALL project data? This action cannot be undone.");
                if (!confirmClear) return;

                const pin = prompt("Enter PIN to confirm data deletion:");
                if (pin !== this.config.pins.TL_DASHBOARD_PIN) {
                    if (pin) alert("Incorrect PIN.");
                    return;
                }

                this.methods.showLoading.call(this, "Clearing all project data...");
                try {
                    const projectsRef = this.db.collection("projects");
                    const snapshot = await projectsRef.get();
                    const batch = this.db.batch();

                    snapshot.forEach(doc => {
                        batch.delete(doc.ref);
                    });

                    await batch.commit();

                    // Also clear notifications
                    const notificationsRef = this.db.collection(this.config.firestorePaths.NOTIFICATIONS);
                    const notificationSnapshot = await notificationsRef.get();
                    const notificationBatch = this.db.batch();
                    notificationSnapshot.forEach(doc => {
                        notificationBatch.delete(doc.ref);
                    });
                    await notificationBatch.commit();

                    alert("All project data and notifications cleared successfully.");
                    this.state.projects = [];
                    this.methods.refreshAllViews.call(this);
                } catch (error) {
                    console.error("Error clearing data:", error);
                    alert("Error clearing data: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            async handleExportCsv() {
                this.methods.showLoading.call(this, "Exporting data to CSV...");
                try {
                    // Fetch ALL projects, regardless of current filters or pagination
                    const allProjectsSnapshot = await this.db.collection("projects").orderBy("creationTimestamp", "asc").get();
                    let projects = [];
                    allProjectsSnapshot.forEach(doc => {
                        projects.push({
                            id: doc.id,
                            ...doc.data()
                        });
                    });

                    if (projects.length === 0) {
                        alert("No projects to export.");
                        this.methods.hideLoading.call(this);
                        return;
                    }

                    // Define the headers explicitly in the desired order
                    const headers = this.config.CSV_HEADERS_FOR_IMPORT;

                    // Map Firestore field names to CSV headers for output
                    const fieldToCsvHeaderMap = Object.keys(this.config.CSV_HEADER_TO_FIELD_MAP).reduce((acc, key) => {
                        const firestoreField = this.config.CSV_HEADER_TO_FIELD_MAP[key];
                        if (firestoreField) {
                            acc[firestoreField] = key;
                        }
                        return acc;
                    }, {});

                    // Add dynamic headers for calculated fields that are not directly from Firestore but are part of the export
                    // "Total (min)" will be calculated, not directly mapped.

                    let csvContent = headers.map(header => `"${header}"`).join(',') + '\n';

                    projects.forEach(project => {
                        const row = headers.map(header => {
                            let value;
                            switch (header) {
                                case "Fix Cat":
                                    value = project.fixCategory || "";
                                    break;
                                case "Project Name":
                                    value = project.baseProjectName || "";
                                    break;
                                case "Area/Task":
                                    value = project.areaTask || "";
                                    break;
                                case "GSD":
                                    value = project.gsd || "";
                                    break;
                                case "Assigned To":
                                    value = project.assignedTo || "";
                                    break;
                                case "Status":
                                    value = project.status || "";
                                    break;
                                case "Day 1 Start":
                                    value = project.startTimeDay1 ? new Date(project.startTimeDay1.toDate()).toISOString() : "";
                                    break;
                                case "Day 1 Finish":
                                    value = project.finishTimeDay1 ? new Date(project.finishTimeDay1.toDate()).toISOString() : "";
                                    break;
                                case "Day 1 Break":
                                    value = project.breakDurationMinutesDay1 || 0;
                                    break;
                                case "Day 2 Start":
                                    value = project.startTimeDay2 ? new Date(project.startTimeDay2.toDate()).toISOString() : "";
                                    break;
                                case "Day 2 Finish":
                                    value = project.finishTimeDay2 ? new Date(project.finishTimeDay2.toDate()).toISOString() : "";
                                    break;
                                case "Day 2 Break":
                                    value = project.breakDurationMinutesDay2 || 0;
                                    break;
                                case "Day 3 Start":
                                    value = project.startTimeDay3 ? new Date(project.startTimeDay3.toDate()).toISOString() : "";
                                    break;
                                case "Day 3 Finish":
                                    value = project.finishTimeDay3 ? new Date(project.finishTimeDay3.toDate()).toISOString() : "";
                                    break;
                                case "Day 3 Break":
                                    value = project.breakDurationMinutesDay3 || 0;
                                    break;
                                case "Total (min)":
                                    value = this.methods.calculateTotalDurationMinutes(project);
                                    break;
                                case "Tech Notes":
                                    value = project.techNotes || "";
                                    break;
                                case "Creation Date":
                                    value = project.creationTimestamp ? new Date(project.creationTimestamp.toDate()).toISOString() : "";
                                    break;
                                case "Last Modified":
                                    value = project.lastModifiedTimestamp ? new Date(project.lastModifiedTimestamp.toDate()).toISOString() : "";
                                    break;
                                default:
                                    value = ""; // Fallback for any unexpected headers
                            }
                            // Handle commas and quotes within the data
                            return `"${String(value).replace(/"/g, '""')}"`;
                        }).join(',');
                        csvContent += row + '\n';
                    });

                    const blob = new Blob([csvContent], {
                        type: 'text/csv;charset=utf-8;'
                    });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.setAttribute('href', url);
                    link.setAttribute('download', 'project_tracker_export.csv');
                    link.style.display = 'none';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                    alert("Project data exported successfully to project_tracker_export.csv!");
                } catch (error) {
                    console.error("Error exporting CSV:", error);
                    alert("Error exporting data: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            async handleProcessCsvImport() {
                const pin = prompt("Enter PIN to process CSV import:");
                if (pin !== this.config.pins.TL_DASHBOARD_PIN) {
                    if (pin) alert("Incorrect PIN.");
                    return;
                }

                if (!this.elements.csvFileInput || !this.elements.csvFileInput.files || this.elements.csvFileInput.files.length === 0) {
                    this.elements.csvImportStatus.textContent = 'Please select a CSV file.';
                    return;
                }

                const file = this.elements.csvFileInput.files[0];
                this.methods.showLoading.call(this, "Processing CSV import...");
                this.elements.csvImportStatus.textContent = 'Processing...';

                const reader = new FileReader();
                reader.onload = async (e) => {
                    const text = e.target.result;
                    try {
                        const projectsToImport = this.methods.parseCsv.call(this, text);
                        if (projectsToImport.length === 0) {
                            alert("No valid projects found in the CSV for import.");
                            this.elements.csvImportStatus.textContent = 'Import failed: No valid projects found.';
                            return;
                        }

                        const batch = this.db.batch();
                        const creationTimestamp = firebase.firestore.FieldValue.serverTimestamp();
                        let importCount = 0;

                        for (const projectData of projectsToImport) {
                            // Ensure required fields are present (already checked in parseCsv, but good for safety)
                            if (!projectData.baseProjectName || !projectData.areaTask || !projectData.fixCategory || !projectData.gsd) {
                                console.warn("Skipping project due to missing required fields:", projectData);
                                continue;
                            }

                            // Generate a consistent batchId for imported projects based on project name for easier filtering
                            const batchIdForImport = `imported_batch_${projectData.baseProjectName.replace(/\s+/g, '_').toLowerCase()}`;

                            // Create new document reference and set data
                            const newProjectRef = this.db.collection("projects").doc();
                            batch.set(newProjectRef, {
                                ...projectData,
                                batchId: batchIdForImport,
                                creationTimestamp: creationTimestamp, // Set a new creation timestamp for imported projects
                                lastModifiedTimestamp: creationTimestamp,
                                releasedToNextStage: false, // Imported tasks are not yet released
                                isReassigned: false, // Imported tasks are not reassigned
                                originalProjectId: null, // No original project for imported tasks
                                isLocked: false, // Imported tasks are unlocked by default
                                // Ensure durations are null initially for fresh import
                                durationDay1Ms: null,
                                durationDay2Ms: null,
                                durationDay3Ms: null,
                            });
                            importCount++;
                        }

                        if (importCount > 0) {
                            await batch.commit();
                            this.elements.csvImportStatus.textContent = `Successfully imported ${importCount} projects!`;
                            alert(`Successfully imported ${importCount} projects!`);
                            this.elements.importCsvModal.style.display = 'none';
                            this.methods.initializeFirebaseAndLoadData.call(this); // Refresh the dashboard
                        } else {
                            this.elements.csvImportStatus.textContent = 'No projects were imported. Check console for warnings.';
                        }

                    } catch (error) {
                        console.error("Error during CSV import:", error);
                        this.elements.csvImportStatus.textContent = `Import failed: ${error.message}`;
                        alert("Error importing CSV: " + error.message);
                    } finally {
                        this.methods.hideLoading.call(this);
                    }
                };
                reader.readAsText(file);
            },

            parseCsv(csvText) {
                const lines = csvText.trim().split('\n');
                if (lines.length === 0) return [];

                // Sanitize headers by removing BOM and trimming whitespace, handling quotes
                const headerLine = lines[0].trim();
                const headers = headerLine.split(',').map(h => h.replace(/\"/g, '').trim().replace(/^\ufeff/, '')); // Remove BOM

                const projects = [];

                for (let i = 1; i < lines.length; i++) {
                    // Use a simple regex to split by comma, ignoring commas inside double quotes
                    const values = lines[i].match(/(?:\"([^\"]*)\"|([^,]*))/g).map(v => v ? v.replace(/\"/g, '').trim() : "");

                    if (values.length !== headers.length) {
                        console.warn(`Skipping row ${i + 1}: Column count mismatch. Expected ${headers.length}, got ${values.length}. Row: "${lines[i]}"`);
                        continue;
                    }

                    const projectData = {};
                    for (let j = 0; j < headers.length; j++) {
                        const csvHeader = headers[j];
                        const fieldName = this.config.CSV_HEADER_TO_FIELD_MAP[csvHeader];
                        const value = values[j];

                        // Skip fields that are null in the map (calculated/generated fields)
                        if (fieldName === null) {
                            continue;
                        }

                        // Special handling for timestamp fields (ISO format from export)
                        if (fieldName && (fieldName.includes("TimeDay") || fieldName.includes("Timestamp"))) {
                            projectData[fieldName] = value ? firebase.firestore.Timestamp.fromDate(new Date(value)) : null;
                        }
                        // Special handling for break durations (ensure they are numbers)
                        else if (fieldName && fieldName.includes("breakDurationMinutes")) {
                            projectData[fieldName] = parseInt(value, 10) || 0;
                        }
                        // Special handling for status to clean up potential variations
                        else if (fieldName === 'status') {
                            let cleanedStatus = value.toLowerCase();
                            if (cleanedStatus.includes('in progress day1')) cleanedStatus = 'InProgressDay1';
                            else if (cleanedStatus.includes('day1ended_awaitingnext')) cleanedStatus = 'Day1Ended_AwaitingNext';
                            else if (cleanedStatus.includes('in progress day2')) cleanedStatus = 'InProgressDay2';
                            else if (cleanedStatus.includes('day2ended_awaitingnext')) cleanedStatus = 'Day2Ended_AwaitingNext';
                            else if (cleanedStatus.includes('in progress day3')) cleanedStatus = 'InProgressDay3';
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

    // --- KICK OFF THE APPLICATION ---\
    ProjectTrackerApp.init();

});
