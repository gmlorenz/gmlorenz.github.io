/**
 * =================================================================
 * Project Tracker Application - Refactored
 * =================================================================
 * This script has been fully refactored to encapsulate all logic
 * within the `ProjectTrackerApp` object. This approach eliminates
 * global variables, improves performance, and ensures correct
 * timezone handling.
 *
 * @version 2.7.2
 * @author Gemini AI Refactor
 * @changeLog
 * - Integrated new login UI. Script now handles showing/hiding the login screen and the main dashboard.
 * - Added DOM references for new UI elements (`auth-wrapper`, `body`, `mainContainer`).
 * - Updated auth state handlers (`handleAuthorizedUser`, `handleSignedOutUser`) to toggle view visibility.
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
                ALLOWED_EMAILS: "settings/allowedEmails"
            },
            TECH_IDS: ["4232JD", "7248AA", "4426KV", "4472JS", "7236LE", "4475JT", "7039NO", "7231NR", "7240HH", "7247JA", "7249SS", "7244AA", "7314VP"].sort(),
            FIX_CATEGORIES: {
                ORDER: ["Fix1", "Fix2", "Fix3", "Fix4", "Fix5", "Fix6"],
                COLORS: {
                    "Fix1": "#FFFFE0", "Fix2": "#ADD8E6", "Fix3": "#90EE90",
                    "Fix4": "#FFB6C1", "Fix5": "#FFDAB9", "Fix6": "#E6E6FA",
                    "default": "#FFFFFF"
                }
            },
            NUM_TABLE_COLUMNS: 18
        },

        // --- 2. FIREBASE SERVICES ---
        app: null,
        db: null,
        auth: null,
        firestoreListenerUnsubscribe: null,

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
            }
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
                    projectFormModal: document.getElementById('projectFormModal'),
                    tlDashboardModal: document.getElementById('tlDashboardModal'),
                    settingsModal: document.getElementById('settingsModal'),
                    tlSummaryModal: document.getElementById('tlSummaryModal'),
                    closeProjectFormBtn: document.getElementById('closeProjectFormBtn'),
                    closeTlDashboardBtn: document.getElementById('closeTlDashboardBtn'),
                    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
                    closeTlSummaryBtn: document.getElementById('closeTlSummaryBtn'),
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
                };
            },

            setupAuthRelatedDOMReferences() {
                this.elements = {
                    ...this.elements,
                    // --- MODIFICATION: Added elements for new UI ---
                    body: document.body,
                    authWrapper: document.getElementById('auth-wrapper'),
                    mainContainer: document.querySelector('.container'),
                    // --- End Modification ---
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

                attachClick(self.elements.closeProjectFormBtn, () => {
                    if (self.elements.newProjectForm) self.elements.newProjectForm.reset();
                    self.elements.projectFormModal.style.display = 'none';
                });
                attachClick(self.elements.closeTlDashboardBtn, () => { self.elements.tlDashboardModal.style.display = 'none'; });
                attachClick(self.elements.closeSettingsBtn, () => { self.elements.settingsModal.style.display = 'none'; });
                attachClick(self.elements.closeTlSummaryBtn, () => { self.elements.tlSummaryModal.style.display = 'none'; });

                attachClick(self.elements.addEmailBtn, self.methods.handleAddEmail.bind(self));
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

                window.onclick = (event) => {
                    if (event.target == self.elements.tlDashboardModal) self.elements.tlDashboardModal.style.display = 'none';
                    if (event.target == self.elements.settingsModal) self.elements.settingsModal.style.display = 'none';
                    if (event.target == self.elements.tlSummaryModal) self.elements.tlSummaryModal.style.display = 'none';
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
                // --- MODIFICATION: Added logic to show the app and hide the login UI ---
                this.elements.body.classList.remove('login-view-active');
                this.elements.authWrapper.style.display = 'none';
                this.elements.mainContainer.style.display = 'block';
                // --- End Modification ---

                this.elements.userNameP.textContent = user.displayName || "N/A";
                this.elements.userEmailP.textContent = user.email || "N/A";
                if (this.elements.userPhotoImg) this.elements.userPhotoImg.src = user.photoURL || 'default-user.png';

                this.elements.userInfoDisplayDiv.style.display = 'flex';
                // The main signInBtn is inside the auth-wrapper which is now hidden, so no need to hide it separately.
                if (this.elements.clearDataBtn) this.elements.clearDataBtn.style.display = 'none';
                this.elements.appContentDiv.style.display = 'block';
                this.elements.loadingAuthMessageDiv.style.display = 'none';
                if (this.elements.openSettingsBtn) this.elements.openSettingsBtn.style.display = 'block';

                if (!this.state.isAppInitialized) {
                    this.methods.initializeFirebaseAndLoadData.call(this);
                    this.state.isAppInitialized = true;
                }
            },

            handleSignedOutUser() {
                // --- MODIFICATION: Added logic to show the login UI and hide the app ---
                this.elements.body.classList.add('login-view-active');
                this.elements.authWrapper.style.display = 'block';
                this.elements.mainContainer.style.display = 'none';
                // --- End Modification ---

                this.elements.userInfoDisplayDiv.style.display = 'none';
                // The main signInBtn is now inside auth-wrapper, which is shown by the lines above.
                if (this.elements.clearDataBtn) this.elements.clearDataBtn.style.display = 'block';
                this.elements.appContentDiv.style.display = 'none';
                this.elements.loadingAuthMessageDiv.innerHTML = "<p>Please sign in to access the Project Tracker.</p>";
                this.elements.loadingAuthMessageDiv.style.display = 'block'; // This is hidden by body class, but good practice
                if (this.elements.openSettingsBtn) this.elements.openSettingsBtn.style.display = 'none';

                if (this.firestoreListenerUnsubscribe) {
                    this.firestoreListenerUnsubscribe();
                    this.firestoreListenerUnsubscribe = null;
                }
                this.state.isAppInitialized = false;
            },

            setupAuthActions() {
                const provider = new firebase.auth.GoogleAuthProvider();
                provider.addScope('email');

                if (this.elements.signInBtn) {
                    // This now correctly refers to the new button in the login card since it has the ID 'signInBtn'
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
                    this.elements.signOutBtn.onclick = () => {
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
                        if (doc.exists) newProjects.push({ id: doc.id, ...doc.data() });
                    });
            
                    if (shouldPaginate) {
                         newProjects = newProjects.filter(p => this.state.pagination.paginatedProjectNameList.includes(p.baseProjectName));
                    }
                    
                    this.state.projects = newProjects.map(p => ({
                        breakDurationMinutesDay1: 0,
                        breakDurationMinutesDay2: 0,
                        breakDurationMinutesDay3: 0,
                        additionalMinutesManual: 0,
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
                        option.textContent = new Date(year, parseInt(month) - 1, 1).toLocaleString('en-US', { year: 'numeric', month: 'long' });
                        this.elements.monthFilter.appendChild(option);
                    });

                    if (this.state.filters.month && Array.from(uniqueMonths).includes(this.state.filters.month)) {
                        this.elements.monthFilter.value = this.state.filters.month;
                    } else {
                        this.state.filters.month = "";
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
                            batchId, creationTimestamp, fixCategory, baseProjectName, gsd,
                            areaTask: `Area${String(i).padStart(2, '0')}`,
                            assignedTo: "", techNotes: "", status: "Available",
                            startTimeDay1: null, finishTimeDay1: null, durationDay1Ms: null,
                            startTimeDay2: null, finishTimeDay2: null, durationDay2Ms: null,
                            startTimeDay3: null, finishTimeDay3: null, durationDay3Ms: null,
                            releasedToNextStage: false, isReassigned: false, originalProjectId: null,
                            lastModifiedTimestamp: creationTimestamp, 
                            breakDurationMinutesDay1: 0,
                            breakDurationMinutesDay2: 0,
                            breakDurationMinutesDay3: 0,
                            additionalMinutesManual: 0,
                        };
                        const newProjectRef = this.db.collection("projects").doc();
                        batch.set(newProjectRef, projectData);
                    }
                    await batch.commit();
                    
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
                const projectRef = this.db.collection("projects").doc(projectId);

                try {
                    await this.db.runTransaction(async (transaction) => {
                        const doc = await transaction.get(projectRef);
                        if (!doc.exists) {
                            throw new Error("Document not found.");
                        }

                        const projectData = doc.data();
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
                            if (!isNaN(hours) && !isNaN(minutes)) {
                                const baseDate = projectData[startFieldForDay]?.toDate() ||
                                                 projectData[finishFieldForDay]?.toDate() ||
                                                 projectData.creationTimestamp?.toDate() ||
                                                 new Date();

                                const year = baseDate.getFullYear();
                                const month = String(baseDate.getMonth() + 1).padStart(2, '0');
                                const day = String(baseDate.getDate()).padStart(2, '0');
                                const time = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
                                const isoStringWithTimezone = `${year}-${month}-${day}T${time}+08:00`;
                                firestoreTimestamp = firebase.firestore.Timestamp.fromDate(new Date(isoStringWithTimezone));
                            }
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
                    const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();
                    let updates = { lastModifiedTimestamp: serverTimestamp };

                    switch (action) {
                        case "startDay1": updates.status = "InProgressDay1"; updates.startTimeDay1 = serverTimestamp; break;
                        case "endDay1": updates.status = "Day1Ended_AwaitingNext"; updates.finishTimeDay1 = serverTimestamp; updates.durationDay1Ms = this.methods.calculateDurationMs.call(this, project.startTimeDay1, serverTimestamp); break;
                        case "startDay2": updates.status = "InProgressDay2"; updates.startTimeDay2 = serverTimestamp; break;
                        case "endDay2": updates.status = "Day2Ended_AwaitingNext"; updates.finishTimeDay2 = serverTimestamp; updates.durationDay2Ms = this.methods.calculateDurationMs.call(this, project.startTimeDay2, serverTimestamp); break;
                        case "startDay3": updates.status = "InProgressDay3"; updates.startTimeDay3 = serverTimestamp; break;
                        case "endDay3": updates.status = "Day3Ended_AwaitingNext"; updates.finishTimeDay3 = serverTimestamp; updates.durationDay3Ms = this.methods.calculateDurationMs.call(this, project.startTimeDay3, serverTimestamp); break;
                        case "markDone":
                            updates.status = "Completed";
                            if (project.status === "InProgressDay1" && !project.finishTimeDay1) {
                                updates.finishTimeDay1 = serverTimestamp;
                                updates.durationDay1Ms = this.methods.calculateDurationMs.call(this, project.startTimeDay1, serverTimestamp);
                            } else if (project.status === "InProgressDay2" && !project.finishTimeDay2) {
                                updates.finishTimeDay2 = serverTimestamp;
                                updates.durationDay2Ms = this.methods.calculateDurationMs.call(this, project.startTimeDay2, serverTimestamp);
                            } else if (project.status === "InProgressDay3" && !project.finishTimeDay3) {
                                updates.finishTimeDay3 = serverTimestamp;
                                updates.durationDay3Ms = this.methods.calculateDurationMs.call(this, project.startTimeDay3, serverTimestamp);
                            }
                            break;
                        default: this.methods.hideLoading.call(this); return;
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
                const { currentPage, totalPages } = this.state.pagination;
                if (totalPages > 0) {
                    this.elements.pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
                } else {
                    this.elements.pageInfo.textContent = "No projects found";
                }
                this.elements.prevPageBtn.disabled = currentPage <= 1;
                this.elements.nextPageBtn.disabled = currentPage >= totalPages;
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

                    if (nameA < nameB) return -1; if (nameA > nameB) return 1;
                    if (fixA < fixB) return -1; if (fixA > fixB) return 1;
                    if (areaA < areaB) return -1; if (areaA > areaB) return 1;
                    return 0;
                });

                let currentBaseProjectNameHeader = null, currentFixCategoryHeader = null;

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
                        headerRow.innerHTML = `<td colspan="${this.config.NUM_TABLE_COLUMNS}">Project: ${project.baseProjectName}</td>`;
                    }

                    if (project.fixCategory !== currentFixCategoryHeader) {
                        currentFixCategoryHeader = project.fixCategory;
                        const groupKey = `${currentBaseProjectNameHeader}_${currentFixCategoryHeader}`;
                        if (this.state.groupVisibilityState[groupKey] === undefined) {
                            this.state.groupVisibilityState[groupKey] = { isExpanded: true };
                        }
                        const isExpanded = this.state.groupVisibilityState[groupKey]?.isExpanded !== false;
                        const groupHeaderRow = this.elements.projectTableBody.insertRow();
                        groupHeaderRow.className = "fix-group-header";
                        groupHeaderRow.innerHTML = `<td colspan="${this.config.NUM_TABLE_COLUMNS}">${currentFixCategoryHeader} <button class="btn btn-group-toggle">${isExpanded ? "−" : "+"}</button></td>`;
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

                    row.insertCell().textContent = project.fixCategory;
                    row.insertCell().textContent = project.baseProjectName;
                    row.insertCell().textContent = project.areaTask;
                    row.insertCell().textContent = project.gsd;

                    const assignedToCell = row.insertCell();
                    const assignedToSelect = document.createElement('select');
                    assignedToSelect.className = 'assigned-to-select';
                    assignedToSelect.disabled = project.status === "Reassigned_TechAbsent";
                    assignedToSelect.innerHTML = `<option value="">Select Tech ID</option>` + this.config.TECH_IDS.map(id => `<option value="${id}">${id}</option>`).join('');
                    assignedToSelect.value = project.assignedTo || "";
                    assignedToSelect.onchange = (e) => this.db.collection("projects").doc(project.id).update({ assignedTo: e.target.value, lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp() });
                    assignedToCell.appendChild(assignedToSelect);

                    const statusCell = row.insertCell();
                    statusCell.innerHTML = `<span class="status status-${(project.status || "unknown").toLowerCase()}">${(project.status || "Unknown").replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim()}</span>`;

                    const formatTime = (ts) => ts?.toDate ? ts.toDate().toTimeString().slice(0, 5) : "";
                    
                    const createTimeInput = (timeValue, fieldName) => {
                        const cell = row.insertCell();
                        const input = document.createElement('input');
                        input.type = 'time';
                        input.value = formatTime(timeValue);
                        input.disabled = project.status === "Reassigned_TechAbsent";
                        input.onchange = (e) => this.methods.updateTimeField.call(this, project.id, fieldName, e.target.value);
                        cell.appendChild(input);
                    };

                    const createBreakSelect = (day, currentProject) => {
                        const cell = row.insertCell();
                        cell.className = "break-cell";
                        const select = document.createElement('select');
                        select.className = 'break-select';
                        select.disabled = currentProject.status === "Reassigned_TechAbsent";
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

                    createTimeInput(project.startTimeDay2, 'startTimeDay2');
                    createTimeInput(project.finishTimeDay2, 'finishTimeDay2');
                    createBreakSelect(2, project);

                    createTimeInput(project.startTimeDay3, 'startTimeDay3');
                    createTimeInput(project.finishTimeDay3, 'finishTimeDay3');
                    createBreakSelect(3, project);
                    
                    const totalDurationMs = (project.durationDay1Ms || 0) + (project.durationDay2Ms || 0) + (project.durationDay3Ms || 0);
                    const totalBreakMs = ((project.breakDurationMinutesDay1 || 0) +
                                         (project.breakDurationMinutesDay2 || 0) +
                                         (project.breakDurationMinutesDay3 || 0)) * 60000;
                    const additionalMs = (project.additionalMinutesManual || 0) * 60000;
                    const finalAdjustedDurationMs = Math.max(0, totalDurationMs - totalBreakMs) + additionalMs;
                    
                    const totalDurationCell = row.insertCell();
                    totalDurationCell.textContent = this.methods.formatMillisToMinutes.call(this, finalAdjustedDurationMs);
                    totalDurationCell.className = 'total-duration-column';

                    const techNotesCell = row.insertCell();
                    const techNotesInput = document.createElement('textarea');
                    techNotesInput.value = project.techNotes || "";
                    techNotesInput.className = 'tech-notes-input';
                    techNotesInput.disabled = project.status === "Reassigned_TechAbsent";
                    techNotesInput.onchange = (e) => this.db.collection("projects").doc(project.id).update({ techNotes: e.target.value, lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp() });
                    techNotesCell.appendChild(techNotesInput);

                    const actionsCell = row.insertCell();
                    const actionButtonsDiv = document.createElement('div');
                    actionButtonsDiv.className = 'action-buttons-container';
                    
                    const createActionButton = (text, className, disabled, action) => {
                        const button = document.createElement('button');
                        button.textContent = text;
                        button.className = `btn ${className}`;
                        button.disabled = project.status === "Reassigned_TechAbsent" || disabled;
                        button.onclick = () => this.methods.updateProjectState.call(this, project.id, action);
                        return button;
                    };

                    actionButtonsDiv.appendChild(createActionButton("Start D1", "btn-day-start", project.status !== "Available", "startDay1"));
                    actionButtonsDiv.appendChild(createActionButton("End D1", "btn-day-end", project.status !== "InProgressDay1", "endDay1"));
                    actionButtonsDiv.appendChild(createActionButton("Start D2", "btn-day-start", project.status !== "Day1Ended_AwaitingNext", "startDay2"));
                    actionButtonsDiv.appendChild(createActionButton("End D2", "btn-day-end", project.status !== "InProgressDay2", "endDay2"));
                    actionButtonsDiv.appendChild(createActionButton("Start D3", "btn-day-start", project.status !== "Day2Ended_AwaitingNext", "startDay3"));
                    actionButtonsDiv.appendChild(createActionButton("End D3", "btn-day-end", project.status !== "InProgressDay3", "endDay3"));
                    actionButtonsDiv.appendChild(createActionButton("Done", "btn-mark-done", project.status === "Completed" || project.status === "Reassigned_TechAbsent" || (project.status === "Available" && !(project.durationDay1Ms || project.durationDay2Ms || project.durationDay3Ms)), "markDone"));

                    const reassignBtn = createActionButton("Re-Assign", "btn-warning", project.status === "Completed" || project.status === "Reassigned_TechAbsent", "reassign");
                    reassignBtn.onclick = () => this.methods.handleReassignment.call(this, project);
                    actionButtonsDiv.appendChild(reassignBtn);
                    
                    actionsCell.appendChild(actionButtonsDiv);
                });
            },
            
            showLoading(message = "Loading...") { if (this.elements.loadingOverlay) { this.elements.loadingOverlay.querySelector('p').textContent = message; this.elements.loadingOverlay.style.display = 'flex'; } },
            hideLoading() { if (this.elements.loadingOverlay) { this.elements.loadingOverlay.style.display = 'none'; } },
            generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 5); },
            formatMillisToMinutes(ms) { return (ms === null || typeof ms !== 'number' || ms < 0) ? "N/A" : Math.floor(ms / 60000); },
            calculateDurationMs(start, finish) {
                const startMs = start?.toMillis ? start.toMillis() : start;
                const finishMs = finish?.toMillis ? finish.toMillis() : finish;
                return (typeof startMs !== 'number' || typeof finishMs !== 'number' || finishMs < startMs) ? null : finishMs - startMs;
            },
            loadGroupVisibilityState() { this.state.groupVisibilityState = JSON.parse(localStorage.getItem('projectTrackerGroupVisibility') || '{}'); },
            saveGroupVisibilityState() { localStorage.setItem('projectTrackerGroupVisibility', JSON.stringify(this.state.groupVisibilityState)); },
            
            async fetchAllowedEmails() {
                try {
                    const docSnap = await this.db.doc(this.config.firestorePaths.ALLOWED_EMAILS).get();
                    this.state.allowedEmails = docSnap.exists ? docSnap.data().emails || [] : ["ev.lorens.ebrado@gmail.com"];
                } catch (error) {
                    console.error("Error fetching allowed emails:", error);
                    this.state.allowedEmails = ["ev.lorens.ebrado@gmail.com"];
                }
            },
            
            async updateAllowedEmailsInFirestore(emailsArray) {
                this.methods.showLoading.call(this, "Updating allowed emails...");
                try {
                    await this.db.doc(this.config.firestorePaths.ALLOWED_EMAILS).set({ emails: emailsArray });
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
                            if (!batches[task.batchId]) batches[task.batchId] = { batchId: task.batchId, baseProjectName: task.baseProjectName || "N/A", tasksByFix: {} };
                            if (task.fixCategory) {
                                if (!batches[task.batchId].tasksByFix[task.fixCategory]) batches[task.batchId].tasksByFix[task.fixCategory] = [];
                                batches[task.batchId].tasksByFix[task.fixCategory].push({id: doc.id, ...task});
                            }
                        }
                    });
                    return Object.values(batches);
                } catch (error) {
                    console.error("Error fetching batches for dashboard:", error);
                    alert("Error fetching batches: " + error.message);
                    return [];
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },
            
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

                    batchItemDiv.innerHTML = `<h4>Project: ${batch.baseProjectName || "Unknown"} (Batch ID: ${batch.batchId.split('_')[1] || "N/A"})</h4>`;
                    const allFixStages = this.config.FIX_CATEGORIES.ORDER;
                    const stagesPresent = batch.tasksByFix ? Object.keys(batch.tasksByFix).sort((a,b) => allFixStages.indexOf(a) - allFixStages.indexOf(b)) : [];
                    batchItemDiv.innerHTML += `<p><strong>Stages Present:</strong> ${stagesPresent.join(', ') || "None"}</p>`;
                    
                    const releaseActionsDiv = document.createElement('div');
                    releaseActionsDiv.className = 'dashboard-batch-actions-release';

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
                    addAreaBtn.disabled = stagesPresent.length === 0;
                    addAreaBtn.onclick = () => this.methods.handleAddExtraArea.call(this, batch.batchId, batch.baseProjectName);
                    releaseActionsDiv.appendChild(addAreaBtn);

                    batchItemDiv.appendChild(releaseActionsDiv);


                    const deleteActionsDiv = document.createElement('div');
                    deleteActionsDiv.className = 'dashboard-batch-actions-delete';
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
                    batchItemDiv.appendChild(deleteActionsDiv);
                    const deleteAllContainer = document.createElement('div');
                    deleteAllContainer.style.marginTop = '15px';
                    deleteAllContainer.style.borderTop = '1px solid #cc0000';
                    deleteAllContainer.style.paddingTop = '10px';
                    
                    const deleteAllBtn = document.createElement('button');
                    deleteAllBtn.textContent = 'Delete Entire Project (All Fix Stages)';
                    deleteAllBtn.className = 'btn btn-danger btn-delete-project';
                    deleteAllBtn.style.width = '100%';
                    deleteAllBtn.onclick = () => this.methods.handleDeleteEntireProject.call(this, batch.batchId, batch.baseProjectName);
                    
                    deleteAllContainer.appendChild(deleteAllBtn);
                    batchItemDiv.appendChild(deleteAllContainer);

                    const resetActionsDiv = document.createElement('div');
                    resetActionsDiv.className = 'dashboard-batch-actions-reset';
                    resetActionsDiv.style.marginTop = '10px';
                    resetActionsDiv.innerHTML = '<strong>Manage Individual Tasks:</strong>';
                    
                    const taskResetContainer = document.createElement('div');
                    taskResetContainer.className = 'task-reset-container';
                    taskResetContainer.style.display = 'none';

                    if (batch.tasksByFix) {
                        stagesPresent.forEach(fixCat => {
                            const btn = document.createElement('button');
                            btn.textContent = `Manage ${fixCat}`;
                            btn.className = 'btn btn-secondary btn-small';
                            btn.onclick = () => {
                                if (taskResetContainer.style.display === 'block' && taskResetContainer.dataset.activeFix === fixCat) {
                                    taskResetContainer.style.display = 'none';
                                    taskResetContainer.dataset.activeFix = '';
                                } else {
                                    taskResetContainer.dataset.activeFix = fixCat;
                                    taskResetContainer.style.display = 'block';
                                    this.methods.renderResettableTasksForBatchFix.call(this, taskResetContainer, batch.batchId, fixCat);
                                }
                            };
                            resetActionsDiv.appendChild(btn);
                        });
                    }
                    batchItemDiv.appendChild(resetActionsDiv);
                    batchItemDiv.appendChild(taskResetContainer);

                    this.elements.tlDashboardContentElement.appendChild(batchItemDiv);
                });
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
                    if(tasksInLatestFix.length > 0){
                        lastTask = tasksInLatestFix.reduce((latest, task) => {
                             const currentNum = parseInt(task.areaTask.replace('Area', ''), 10) || 0;
                             const latestNum = parseInt(latest.areaTask.replace('Area', ''), 10) || 0;
                             return currentNum > latestNum ? task : latest;
                        });
                        lastAreaNumber = parseInt(lastTask.areaTask.replace('Area', ''), 10) || 0;
                    } else {
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
                            startTimeDay1: null, finishTimeDay1: null, durationDay1Ms: null,
                            startTimeDay2: null, finishTimeDay2: null, durationDay2Ms: null,
                            startTimeDay3: null, finishTimeDay3: null, durationDay3Ms: null,
                            releasedToNextStage: false,
                            isReassigned: false,
                            originalProjectId: null,
                            breakDurationMinutesDay1: 0,
                            breakDurationMinutesDay2: 0,
                            breakDurationMinutesDay3: 0,
                            additionalMinutesManual: 0,
                            creationTimestamp: serverTimestamp,
                            lastModifiedTimestamp: serverTimestamp
                        };

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

                    await this.methods.initializeFirebaseAndLoadData.call(this);
                    await this.methods.renderTLDashboard.call(this);

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

                    for (const doc of snapshot.docs) {
                        const task = { id: doc.id, ...doc.data() };
                        if (task.status === "Reassigned_TechAbsent") continue;

                        const newNextFixTask = { ...task,
                            fixCategory: nextFixCategory,
                            status: "Available",
                            techNotes: "", 
                            additionalMinutesManual: 0,
                            breakDurationMinutesDay1: 0,
                            breakDurationMinutesDay2: 0,
                            breakDurationMinutesDay3: 0,
                            startTimeDay1: null, finishTimeDay1: null, durationDay1Ms: null,
                            startTimeDay2: null, finishTimeDay2: null, durationDay2Ms: null,
                            startTimeDay3: null, finishTimeDay3: null, durationDay3Ms: null,
                            releasedToNextStage: false,
                            // This line ensures the highlight is removed for the next stage.
                            isReassigned: false, 
                            lastModifiedTimestamp: serverTimestamp,
                            originalProjectId: task.id,
                        };
                        delete newNextFixTask.id;
                        const newDocRef = this.db.collection("projects").doc();
                        firestoreBatch.set(newDocRef, newNextFixTask);
                        
                        firestoreBatch.update(doc.ref, { releasedToNextStage: true, lastModifiedTimestamp: serverTimestamp });
                    }
                    await firestoreBatch.commit();
                    
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
                    const snapshot = await this.db.collection("projects").where("batchId", "==", batchId).where("fixCategory", "==", fixCategory).get();
                    const batch = this.db.batch();
                    snapshot.forEach(doc => batch.delete(doc.ref));
                    await batch.commit();
                    this.methods.initializeFirebaseAndLoadData.call(this);
                    this.methods.renderTLDashboard.call(this);
                } catch (error) {
                    console.error(`Error deleting tasks:`, error);
                    alert("Error deleting tasks: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

           async resetProjectTask(projectId) {
                this.methods.showLoading.call(this, "Resetting task...");
                const projectRef = this.db.collection("projects").doc(projectId);
                try {
                    const doc = await projectRef.get();
                    if (!doc.exists) throw new Error("Project not found.");
                    
                    await projectRef.update({
                        status: "Available",
                        assignedTo: "",
                        techNotes: "",
                        startTimeDay1: null, finishTimeDay1: null, durationDay1Ms: null,
                        startTimeDay2: null, finishTimeDay2: null, durationDay2Ms: null,
                        startTimeDay3: null, finishTimeDay3: null, durationDay3Ms: null,
                        breakDurationMinutesDay1: 0,
                        breakDurationMinutesDay2: 0,
                        breakDurationMinutesDay3: 0,
                        additionalMinutesManual: 0,
                        lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
                    });
                } catch (error) {
                    console.error(`Error resetting project:`, error);
                    alert("Error resetting task: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

           async renderResettableTasksForBatchFix(container, batchId, fixCategory) {
                container.innerHTML = `<p>Loading tasks for ${fixCategory}...</p>`;
                try {
                    const snapshot = await this.db.collection("projects").where("batchId", "==", batchId).where("fixCategory", "==", fixCategory).orderBy("areaTask").get();
                    if (snapshot.empty) {
                        container.innerHTML = `<p>No tasks found for ${fixCategory}.</p>`;
                        return;
                    }
                    container.innerHTML = '';
                    const list = document.createElement('ul');
                    list.className = 'resettable-tasks-list';
                    snapshot.forEach(doc => {
                        const project = { id: doc.id, ...doc.data() };
                        const li = document.createElement('li');
                        li.style.display = 'flex';
                        li.style.justifyContent = 'space-between';
                        li.style.alignItems = 'center';
                        li.style.marginBottom = '8px';
                        li.innerHTML = `<div><strong>${project.areaTask}</strong> - Status: ${project.status.replace(/([A-Z])/g, ' $1').trim()} - Assigned: ${project.assignedTo || 'N/A'}</div>`;
                        
                        const actionsDiv = document.createElement('div');

                        const resetButton = document.createElement('button');
                        resetButton.textContent = 'Reset Task';
                        resetButton.className = 'btn btn-danger btn-small';
                        resetButton.style.marginLeft = '10px';
                        
                        if (project.status === 'Available') {
                            resetButton.disabled = true;
                        }

                        resetButton.onclick = async () => {
                            if (confirm(`Are you sure you want to reset task '${project.areaTask}'? This will clear its progress and assigned technician.`)) {
                                await this.methods.resetProjectTask.call(this, project.id);
                                await this.methods.renderResettableTasksForBatchFix.call(this, container, batchId, fixCategory);
                            }
                        };
                        actionsDiv.appendChild(resetButton);

                        li.appendChild(actionsDiv);
                        list.appendChild(li);
                    });
                    container.appendChild(list);
                } catch (error) {
                    console.error("Error rendering resettable tasks:", error);
                    container.innerHTML = `<p style="color:red;">Error loading tasks: ${error.message}</p>`;
                }
            },

            async handleReassignment(projectToReassign) {
                if (!projectToReassign || projectToReassign.status === "Reassigned_TechAbsent") return alert("Cannot re-assign this task.");
                const newTechId = prompt(`Re-assigning task '${projectToReassign.areaTask}'. Enter NEW Tech ID:`, projectToReassign.assignedTo || "");
                if (!newTechId) return;

                if (confirm(`Create a NEW task for '${newTechId.trim()}'? The current task will be closed.`)) {
                    this.methods.showLoading.call(this, "Reassigning task...");
                    const batch = this.db.batch();
                    const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();
                    
                    const newProjectData = { ...projectToReassign,
                        assignedTo: newTechId.trim(), status: "Available",
                        techNotes: `Reassigned from ${projectToReassign.assignedTo || "N/A"}. Original ID: ${projectToReassign.id}`,
                        creationTimestamp: serverTimestamp, 
                        lastModifiedTimestamp: serverTimestamp,
                        isReassigned: true, originalProjectId: projectToReassign.id,
                        startTimeDay1: null, finishTimeDay1: null, durationDay1Ms: null,
                        startTimeDay2: null, finishTimeDay2: null, durationDay2Ms: null,
                        startTimeDay3: null, finishTimeDay3: null, durationDay3Ms: null,
                        releasedToNextStage: false, 
                        breakDurationMinutesDay1: 0,
                        breakDurationMinutesDay2: 0,
                        breakDurationMinutesDay3: 0,
                        additionalMinutesManual: 0,
                    };
                    delete newProjectData.id;
                    
                    batch.set(this.db.collection("projects").doc(), newProjectData);
                    batch.update(this.db.collection("projects").doc(projectToReassign.id), { status: "Reassigned_TechAbsent", lastModifiedTimestamp: serverTimestamp });
                    
                    try { await batch.commit(); }
                    catch (error) { console.error("Error in re-assignment:", error); alert("Error during re-assignment: " + error.message); }
                    finally { this.methods.hideLoading.call(this); }
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
                        alert("Local application data has been cleared. The page will now reload.");
                        location.reload();
                    } catch (e) {
                        console.error("Error clearing local storage:", e);
                        alert("Could not clear application data. See the console for more details.");
                    }
                }
            },

            async generateTlSummaryData() {
                if (!this.elements.tlSummaryContent) return;
                this.methods.showLoading.call(this, "Generating TL Summary...");
                this.elements.tlSummaryContent.innerHTML = "<p>Loading summary...</p>";

                try {
                    const snapshot = await this.db.collection("projects").get();
                    const projectTotals = {};
                    snapshot.forEach(doc => {
                        const p = doc.data();
                        const totalWorkMs = (p.durationDay1Ms || 0) + (p.durationDay2Ms || 0) + (p.durationDay3Ms || 0);
                        
                        const breakMs = ((p.breakDurationMinutesDay1 || 0) +
                                         (p.breakDurationMinutesDay2 || 0) +
                                         (p.breakDurationMinutesDay3 || 0)) * 60000;

                        const additionalMs = (p.additionalMinutesManual || 0) * 60000;
                        const adjustedNetMs = Math.max(0, totalWorkMs - breakMs) + additionalMs;
                        if (adjustedNetMs <= 0) return;

                        const minutes = Math.floor(adjustedNetMs / 60000);
                        if (minutes <= 0) return;

                        const projName = p.baseProjectName || "Unknown Project";
                        const fixCat = p.fixCategory || "Unknown Fix";
                        if (!projectTotals[projName]) projectTotals[projName] = {};
                        projectTotals[projName][fixCat] = (projectTotals[projName][fixCat] || 0) + minutes;
                    });
                    
                    let summaryHtml = '<h3>Totals by Project and Fix Category</h3><ul style="list-style: none; padding: 0;">';
                    const sortedProjectNames = Object.keys(projectTotals).sort();
                    if (sortedProjectNames.length === 0) {
                        summaryHtml = "<p>No project time data found to generate a summary.</p>";
                    } else {
                        sortedProjectNames.forEach(projName => {
                            const fixCategoryTotals = projectTotals[projName];
                            const sortedFixCategories = Object.keys(fixCategoryTotals).sort((a, b) => this.config.FIX_CATEGORIES.ORDER.indexOf(a) - this.config.FIX_CATEGORIES.ORDER.indexOf(b));
                            sortedFixCategories.forEach(fixCat => {
                                const totalMinutes = fixCategoryTotals[fixCat];
                                const hoursDecimal = (totalMinutes / 60).toFixed(2);
                                const bgColor = this.config.FIX_CATEGORIES.COLORS[fixCat] || this.config.FIX_CATEGORIES.COLORS.default;
                                summaryHtml += `<li style="background-color: ${bgColor}; padding: 8px; margin-bottom: 5px; border-radius: 4px;"><strong>${projName} - ${fixCat}:</strong> ${totalMinutes} minutes (${hoursDecimal} hours)</li>`;
                            });
                        });
                    }
                    this.elements.tlSummaryContent.innerHTML = summaryHtml + "</ul>";
                } catch (error) {
                    console.error("Error generating TL summary:", error);
                    this.elements.tlSummaryContent.innerHTML = `<p style="color:red;">Error generating summary: ${error.message}</p>`;
                } finally {
                    this.methods.hideLoading.call(this);
                }
            }
        }
    };

    // --- KICK OFF THE APPLICATION ---
    ProjectTrackerApp.init();

});
