/**
 * =================================================================
 * Project Tracker Application - Refactored and Bug-Fixed
 * =================================================================
 * This script has been fully refactored to encapsulate all logic
 * within the `ProjectTrackerApp` object. This approach eliminates
 * global variables, improves performance, and ensures correct
 * timezone handling.
 *
 * @version 4.9.2
 * @author Gemini AI Refactor & Bug-Fix
 * @changeLog
 * - FIXED: Corrected a TypeError by replacing the incompatible `.count().get()` method with `.get()` followed by the `.size` property in the `checkForNewDisputes` and `checkForNewLeaveRequests` functions. This resolves the "query.count is not a function" error.
 * - FIXED: The project name dropdown in the Dispute Modal now correctly populates with all available project names for the selected month, instead of only showing projects from the current page of the main view.
 * - MODIFIED: The 'Show Day' filter checkboxes (Day 2-6) now also control the visibility of their corresponding Start/End action buttons in the table, in addition to hiding the table columns. This provides a more intuitive and cleaner interface when focusing on specific days.
 * - MODIFIED: Updated data loading logic to fetch all unique project names upfront (respecting month filter) to populate the project dropdown filter completely on initial load. This improves user experience by showing all available projects in the filter without incurring additional database reads, while the main task view remains paginated for performance.
 * - FIXED: Implemented a robust retry mechanism in the authentication flow to permanently resolve the "email not authorized" race condition. The app now waits for Firebase to fully validate the user's session before checking permissions.
 * - OPTIMIZED: Replaced real-time listeners (onSnapshot) with manual fetches (getDocs) for projects, disputes, and leave requests to dramatically reduce Firestore read operations.
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
                USERS: "users",
                NOTIFICATIONS: "notifications",
                CHAT: "chat",
                TYPING_STATUS: "typing_status",
                APP_CONFIG: "app_config",
                LEAVE_REQUESTS: "leave_requests",
                DISPUTES: "disputes"
            },
            chat: {
                MAX_MESSAGES: 30
            },
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
            NUM_TABLE_COLUMNS: 28,
            CSV_HEADERS_FOR_IMPORT: [
                "Fix Cat", "Project Name", "Area/Task", "GSD", "Assigned To", "Status",
                "Day 1 Start", "Day 1 Finish", "Day 1 Break",
                "Day 2 Start", "Day 2 Finish", "Day 2 Break",
                "Day 3 Start", "Day 3 Finish", "Day 3 Break",
                "Day 4 Start", "Day 4 Finish", "Day 4 Break",
                "Day 5 Start", "Day 5 Finish", "Day 5 Break",
                "Day 6 Start", "Day 6 Finish", "Day 6 Break",
                "Total (min)", "Tech Notes", "Creation Date", "Last Modified"
            ],
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
                "Day 4 Start": "startTimeDay4",
                "Day 4 Finish": "finishTimeDay4",
                "Day 4 Break": "breakDurationMinutesDay4",
                "Day 5 Start": "startTimeDay5",
                "Day 5 Finish": "finishTimeDay5",
                "Day 5 Break": "breakDurationMinutesDay5",
                "Day 6 Start": "startTimeDay6",
                "Day 6 Finish": "finishTimeDay6",
                "Day 6 Break": "breakDurationMinutesDay6",
                "Total (min)": null,
                "Tech Notes": "techNotes",
                "Creation Date": null,
                "Last Modified": null
            }
        },

        // --- 2. FIREBASE SERVICES ---
        app: null,
        db: null,
        auth: null,
        chatListenerUnsubscribe: null,
        typingListenerUnsubscribe: null,
        appConfigListenerUnsubscribe: null,

        // --- 3. APPLICATION STATE ---
        state: {
            projects: [],
            users: [],
            chatMessages: [],
            leaveRequests: [],
            disputes: [],
            allUniqueProjectNames: [],
            editingLeaveId: null,
            hasUnreadMessages: false,
            newDisputesCount: 0,
            newLeaveRequestsCount: 0,
            lastDisputeViewTimestamp: 0,
            lastLeaveViewTimestamp: 0,
            isInitialChatLoad: true,
            typingUsers: [],
            typingTimeout: null,
            groupVisibilityState: {},
            isAppInitialized: false,
            editingUser: null,
            currentUserTechId: null,
            appConfig: {},
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
                monthForPaging: ''
            },
            disputePagination: {
                currentPage: 1,
                disputesPerPage: 15,
                totalPages: 0
            },
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

                this.methods.injectChatModalHTML.call(this);
                this.methods.injectDisputeModalHTML.call(this);
                this.methods.setupDOMReferences.call(this);
                this.methods.injectNotificationStyles.call(this);
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
                    tlSummaryContent: document.getElementById('tlSummaryContent'),
                    toggleTitleCheckbox: document.getElementById('toggleTitleCheckbox'),
                    toggleDay2Checkbox: document.getElementById('toggleDay2Checkbox'),
                    toggleDay3Checkbox: document.getElementById('toggleDay3Checkbox'),
                    toggleDay4Checkbox: document.getElementById('toggleDay4Checkbox'),
                    toggleDay5Checkbox: document.getElementById('toggleDay5Checkbox'),
                    toggleDay6Checkbox: document.getElementById('toggleDay6Checkbox'),
                    tscLinkBtn: document.getElementById('tscLinkBtn'),

                    // User Management DOM elements
                    userManagementForm: document.getElementById('userManagementForm'),
                    newUserName: document.getElementById('newUserName'),
                    newUserEmail: document.getElementById('newUserEmail'),
                    newUserTechId: document.getElementById('newUserTechId'),
                    userManagementTableBody: document.getElementById('userManagementTableBody'),
                    userFormButtons: document.getElementById('userFormButtons'),
                    importUsersBtn: document.getElementById('importUsersBtn'),
                    exportUsersBtn: document.getElementById('exportUsersBtn'),
                    userCsvInput: document.getElementById('userCsvInput'),

                    // Team Chat DOM elements
                    openTeamChatBtn: document.getElementById('openTeamChatBtn'),
                    teamChatModal: document.getElementById('teamChatModal'),
                    closeTeamChatBtn: document.getElementById('closeTeamChatBtn'),
                    chatMessagesContainer: document.getElementById('chatMessagesContainer'),
                    chatMessageForm: document.getElementById('chatMessageForm'),
                    chatMessageInput: document.getElementById('chatMessageInput'),
                    chatNotificationBadge: document.getElementById('chatNotificationBadge'),
                    startVoiceCallBtn: document.getElementById('startVoiceCallBtn'),
                    typingIndicator: document.getElementById('typingIndicator'),
                    chatAudioNotification: document.getElementById('chatAudioNotification'),

                     // Leave Scheduler DOM elements
                    openLeaveSchedulerBtn: document.getElementById('openLeaveSchedulerBtn'),
                    leaveSchedulerModal: document.getElementById('leaveSchedulerModal'),
                    closeLeaveSchedulerBtn: document.getElementById('closeLeaveSchedulerBtn'),
                    leaveRequestForm: document.getElementById('leaveRequestForm'),
                    leaveFormTitle: document.getElementById('leaveFormTitle'),
                    editingLeaveId: document.getElementById('editingLeaveId'),
                    leaveFormButtons: document.getElementById('leaveFormButtons'),
                    leaveCalendar: document.getElementById('leaveCalendar'),
                    pendingRequestsList: document.getElementById('pendingRequestsList'),
                    adminLeaveSection: document.getElementById('admin-leave-section'),
                    allLeaveRequestsBody: document.getElementById('allLeaveRequestsBody'),
                    leaveNotificationBadge: document.getElementById('leaveNotificationBadge'),

                     // Dispute Modal DOM Elements
                    openDisputeBtn: document.getElementById('openDisputeBtn'),
                    disputeModal: document.getElementById('disputeModal'),
                    closeDisputeBtn: document.getElementById('closeDisputeBtn'),
                    disputeForm: document.getElementById('disputeForm'),
                    disputeTableBody: document.getElementById('disputeTableBody'),
                    disputeProjectName: document.getElementById('disputeProjectName'),
                    disputeTechId: document.getElementById('disputeTechId'),
                    disputeTechName: document.getElementById('disputeTechName'),
                    disputePaginationControls: document.getElementById('disputePaginationControls'),
                    prevDisputePageBtn: document.getElementById('prevDisputePageBtn'),
                    nextDisputePageBtn: document.getElementById('nextDisputePageBtn'),
                    disputePageInfo: document.getElementById('disputePageInfo'),
                    disputeDetailsModal: document.getElementById('disputeDetailsModal'),
                    disputeDetailsContent: document.getElementById('disputeDetailsContent'),
                    closeDisputeDetailsBtn: document.getElementById('closeDisputeDetailsBtn'),
                    disputeNotificationBadge: document.getElementById('disputeNotificationBadge'),
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
                        self.methods.renderUserManagement.call(self);
                        self.methods.exitEditMode.call(self);
                    } else if (pin) alert("Incorrect PIN.");
                });

                attachClick(self.elements.openTlSummaryBtn, () => {
                    self.elements.tlSummaryModal.style.display = 'block';
                    self.methods.generateTlSummaryData.call(self);
                });

                attachClick(self.elements.openLeaveSchedulerBtn, () => {
                    self.elements.leaveSchedulerModal.style.display = 'block';
                    self.methods.fetchLeaveData.call(self);
                    self.state.newLeaveRequestsCount = 0;
                    self.methods.updateLeaveBadge.call(self);
                    self.state.lastLeaveViewTimestamp = Date.now();
                    localStorage.setItem('lastLeaveViewTimestamp', self.state.lastLeaveViewTimestamp);
                });

                attachClick(self.elements.openDisputeBtn, () => {
                    self.elements.disputeModal.style.display = 'block';
                    self.methods.openDisputeModal.call(self); // Call the setup function here
                    self.methods.fetchDisputes.call(self);
                    self.state.newDisputesCount = 0;
                    self.methods.updateDisputeBadge.call(self);
                    self.state.lastDisputeViewTimestamp = Date.now();
                    localStorage.setItem('lastDisputeViewTimestamp', self.state.lastDisputeViewTimestamp);
                });


                // Team Chat event listeners
                attachClick(self.elements.openTeamChatBtn, () => {
                    self.elements.teamChatModal.style.display = 'block';
                    self.state.hasUnreadMessages = false;
                    self.methods.updateChatBadgeVisibility.call(self);
                    self.elements.chatMessagesContainer.scrollTop = self.elements.chatMessagesContainer.scrollHeight;
                });
                attachClick(self.elements.closeTeamChatBtn, () => {
                    self.elements.teamChatModal.style.display = 'none';
                });
                if (self.elements.chatMessageForm) {
                    self.elements.chatMessageForm.addEventListener('submit', (e) => {
                        e.preventDefault();
                        const input = self.elements.chatMessageInput;
                        self.methods.handleSendMessage.call(self, input.value.trim());
                        input.value = '';
                    });
                }
                if (self.elements.chatMessageInput) {
                    self.elements.chatMessageInput.addEventListener('keyup', self.methods.handleUserTyping.bind(self));
                }
                attachClick(self.elements.startVoiceCallBtn, self.methods.handleStartVoiceCall.bind(self));


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
                 attachClick(self.elements.closeLeaveSchedulerBtn, () => {
                    self.elements.leaveSchedulerModal.style.display = 'none';
                });
                 attachClick(self.elements.closeDisputeBtn, () => {
                    self.elements.disputeModal.style.display = 'none';
                });
                attachClick(self.elements.closeDisputeDetailsBtn, () => {
                    self.elements.disputeDetailsModal.style.display = 'none';
                });

                attachClick(self.elements.clearDataBtn, self.methods.handleClearData.bind(self));
                attachClick(self.elements.nextPageBtn, self.methods.handleNextPage.bind(self));
                attachClick(self.elements.prevPageBtn, self.methods.handlePrevPage.bind(self));
                attachClick(self.elements.nextDisputePageBtn, self.methods.handleNextDisputePage.bind(self));
                attachClick(self.elements.prevDisputePageBtn, self.methods.handlePrevDisputePage.bind(self));


                if (self.elements.newProjectForm) {
                    self.elements.newProjectForm.addEventListener('submit', self.methods.handleAddProjectSubmit.bind(self));
                }

                if (self.elements.leaveRequestForm) {
                    self.elements.leaveRequestForm.addEventListener('submit', self.methods.handleLeaveRequestSubmit.bind(self));
                }

                if (self.elements.userManagementForm) {
                    self.elements.userManagementForm.addEventListener('submit', self.methods.handleUserFormSubmit.bind(self));
                }
                 if (self.elements.disputeForm) {
                    self.elements.disputeForm.addEventListener('submit', self.methods.handleDisputeFormSubmit.bind(self));
                }
                 if (self.elements.disputeTechId) {
                    self.elements.disputeTechId.onchange = (e) => {
                        const selectedUser = self.state.users.find(u => u.techId === e.target.value);
                        self.elements.disputeTechName.value = selectedUser ? selectedUser.name : '';
                    };
                }
                 if (self.elements.disputeTableBody) {
                    self.elements.disputeTableBody.addEventListener('click', self.methods.handleDisputeTableActions.bind(self));
                }

                attachClick(self.elements.importUsersBtn, () => self.elements.userCsvInput.click());
                attachClick(self.elements.exportUsersBtn, self.methods.handleExportUsers.bind(self));
                if (self.elements.userCsvInput) {
                    self.elements.userCsvInput.onchange = self.methods.handleImportUsers.bind(self);
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

                const setupToggle = (checkbox) => {
                    if (checkbox) {
                        checkbox.onchange = () => {
                            self.methods.saveColumnVisibilityState.call(self);
                            self.methods.applyColumnVisibility.call(self);
                        };
                    }
                };

                setupToggle(self.elements.toggleTitleCheckbox);
                setupToggle(self.elements.toggleDay2Checkbox);
                setupToggle(self.elements.toggleDay3Checkbox);
                setupToggle(self.elements.toggleDay4Checkbox);
                setupToggle(self.elements.toggleDay5Checkbox);
                setupToggle(self.elements.toggleDay6Checkbox);


                window.onclick = (event) => {
                    if (event.target == self.elements.tlDashboardModal) self.elements.tlDashboardModal.style.display = 'none';
                    if (event.target == self.elements.settingsModal) self.elements.settingsModal.style.display = 'none';
                    if (event.target == self.elements.tlSummaryModal) self.elements.tlSummaryModal.style.display = 'none';
                    if (event.target == self.elements.importCsvModal) self.elements.importCsvModal.style.display = 'none';
                    if (event.target == self.elements.teamChatModal) self.elements.teamChatModal.style.display = 'none';
                    if (event.target == self.elements.leaveSchedulerModal) self.elements.leaveSchedulerModal.style.display = 'none';
                    if (event.target == self.elements.disputeModal) self.elements.disputeModal.style.display = 'none';
                    if (event.target == self.elements.disputeDetailsModal) self.elements.disputeDetailsModal.style.display = 'none';
                };
                 document.querySelectorAll('.leave-tab-button').forEach(button => {
                    button.addEventListener('click', (e) => {
                        const tab = e.target.dataset.tab;
                        document.querySelectorAll('.leave-tab-button').forEach(btn => btn.classList.remove('active'));
                        e.target.classList.add('active');

                        document.querySelectorAll('.leave-tab-content').forEach(content => content.classList.remove('active'));
                        document.getElementById(`tab-${tab}`).classList.add('active');
                    });
                });
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

            async checkUserAuthorization(user, retries = 3) {
                try {
                    const snapshot = await this.db.collection(this.config.firestorePaths.USERS).get();
                    this.state.users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                    const userEmailLower = user.email.toLowerCase();
                    const authorizedUser = this.state.users.find(u => u.email.toLowerCase() === userEmailLower);

                    if (authorizedUser) {
                        this.state.currentUserTechId = authorizedUser.techId;
                        this.methods.handleAuthorizedUser.call(this, user);
                    } else {
                        alert("Access Denied: Your email address is not authorized for this application.");
                        this.auth.signOut();
                    }
                } catch (error) {
                    if (error.code === 'permission-denied' && retries > 0) {
                        console.warn(`Permission denied, retrying... (${retries} retries left)`);
                        setTimeout(() => this.methods.checkUserAuthorization.call(this, user, retries - 1), 1000);
                    } else {
                        console.error("Authorization check failed:", error);
                        alert("An error occurred during authorization. Please try again.");
                        this.auth.signOut();
                    }
                }
            },

            listenForAuthStateChanges() {
                if (!this.auth) {
                    console.error("Firebase Auth is not initialized. Application cannot function.");
                    return;
                }
                this.auth.onAuthStateChanged(async (user) => {
                    if (user && user.email) {
                        this.methods.showLoading.call(this, "Verifying authorization...");
                        this.state.lastDisputeViewTimestamp = parseInt(localStorage.getItem('lastDisputeViewTimestamp') || '0', 10);
                        this.state.lastLeaveViewTimestamp = parseInt(localStorage.getItem('lastLeaveViewTimestamp') || '0', 10);
                        this.methods.checkUserAuthorization.call(this, user);
                    } else {
                        this.methods.handleSignedOutUser.call(this);
                    }
                });
            },

            async handleAuthorizedUser(user) {
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
                    this.methods.listenForAppConfigChanges.call(this);
                    this.methods.initializeFirebaseAndLoadData.call(this);
                    this.state.isAppInitialized = true;
                    this.methods.listenForNotifications.call(this);
                    this.methods.listenForChatMessages.call(this);
                    this.methods.listenForTypingStatus.call(this);
                    this.methods.checkForNewDisputes.call(this);
                    this.methods.checkForNewLeaveRequests.call(this);
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
                this.state.currentUserTechId = null;

                // Unsubscribe from real-time listeners
                if (this.chatListenerUnsubscribe) this.chatListenerUnsubscribe();
                if (this.typingListenerUnsubscribe) this.typingListenerUnsubscribe();
                if (this.appConfigListenerUnsubscribe) this.appConfigListenerUnsubscribe();

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

                this.methods.loadGroupVisibilityState.call(this);
                await this.methods.populateMonthFilter.call(this);

                // Fetch all unique project names for the dropdown filter, respecting the month filter.
                this.methods.showLoading.call(this, "Building project list...");
                const sortDirection = this.state.filters.sortBy === 'oldest' ? 'asc' : 'desc';
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
                // Store the full list of names. This will be used by the dropdown.
                this.state.allUniqueProjectNames = sortedNames;
                this.state.pagination.paginatedProjectNameList = sortedNames; // Also update the list used for pagination.

                const shouldPaginate = !this.state.filters.batchId && !this.state.filters.fixCategory;

                let projectsQuery = this.db.collection("projects");

                if (shouldPaginate) {
                    this.elements.paginationControls.style.display = 'block';

                    this.state.pagination.totalPages = Math.ceil(this.state.pagination.paginatedProjectNameList.length / this.state.pagination.projectsPerPage);
                    this.state.pagination.sortOrderForPaging = this.state.filters.sortBy;
                    this.state.pagination.monthForPaging = this.state.filters.month;

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

                try {
                    const snapshot = await projectsQuery.get();
                    let newProjects = [];
                    snapshot.forEach(doc => {
                        if (doc.exists) newProjects.push({ id: doc.id, ...doc.data() });
                    });

                    if (shouldPaginate) {
                        newProjects = newProjects.filter(p => this.state.pagination.paginatedProjectNameList.includes(p.baseProjectName));
                    }

                    this.state.projects = newProjects.map(p => ({
                        ...p,
                        breakDurationMinutesDay1: p.breakDurationMinutesDay1 || 0,
                        breakDurationMinutesDay2: p.breakDurationMinutesDay2 || 0,
                        breakDurationMinutesDay3: p.breakDurationMinutesDay3 || 0,
                        breakDurationMinutesDay4: p.breakDurationMinutesDay4 || 0,
                        breakDurationMinutesDay5: p.breakDurationMinutesDay5 || 0,
                        breakDurationMinutesDay6: p.breakDurationMinutesDay6 || 0,
                        additionalMinutesManual: p.additionalMinutesManual || 0,
                        isLocked: p.isLocked || false,
                    }));

                    await this.methods.populateProjectNameFilter.call(this);
                    this.methods.refreshAllViews.call(this);
                } catch (error) {
                    console.error("Error fetching projects:", error);
                    this.state.projects = [];
                    this.methods.refreshAllViews.call(this);
                    alert("Error loading projects: " + error.message);
                }
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
                        option.textContent = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString('en-US', {
                            year: 'numeric',
                            month: 'long'
                        });
                        this.elements.monthFilter.appendChild(option);
                    });

                    if (this.state.filters.month && Array.from(uniqueMonths).includes(this.state.filters.month)) {
                        this.elements.monthFilter.value = this.state.filters.month;
                    } else {
                        this.elements.monthFilter.value = "";
                        localStorage.setItem('currentSelectedMonth', "");
                    }
                } catch (error) {
                    console.error("Error populating month filter:", error);
                }
            },

            async populateProjectNameFilter() {
                // Use the comprehensive list of names that was already fetched.
                const sortedNames = this.state.allUniqueProjectNames || [];
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

                try {
                    const message = `A new project "${baseProjectName}" with ${numRows} areas has been added!`;
                    await this.methods.createNotification.call(this, message, "new_project", baseProjectName);

                    const batchId = `batch_${this.methods.generateId.call(this)}`;
                    const creationTimestamp = firebase.firestore.FieldValue.serverTimestamp();
                    const batch = this.db.batch();

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
                            startTimeDay1: null, finishTimeDay1: null, durationDay1Ms: null,
                            startTimeDay2: null, finishTimeDay2: null, durationDay2Ms: null,
                            startTimeDay3: null, finishTimeDay3: null, durationDay3Ms: null,
                            startTimeDay4: null, finishTimeDay4: null, durationDay4Ms: null,
                            startTimeDay5: null, finishTimeDay5: null, durationDay5Ms: null,
                            startTimeDay6: null, finishTimeDay6: null, durationDay6Ms: null,
                            releasedToNextStage: false,
                            isReassigned: false,
                            originalProjectId: null,
                            lastModifiedTimestamp: creationTimestamp,
                            breakDurationMinutesDay1: 0,
                            breakDurationMinutesDay2: 0,
                            breakDurationMinutesDay3: 0,
                            breakDurationMinutesDay4: 0,
                            breakDurationMinutesDay5: 0,
                            breakDurationMinutesDay6: 0,
                            additionalMinutesManual: 0,
                            isLocked: false,
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

                    const handleDayEnd = (dayNum) => {
                        const finishTime = firebase.firestore.Timestamp.now();
                        updates[`finishTimeDay${dayNum}`] = finishTime;
                        updates[`durationDay${dayNum}Ms`] = this.methods.calculateDurationMs.call(this, project[`startTimeDay${dayNum}`], finishTime);
                    };

                    switch (action) {
                        case "startDay1":
                            updates.status = "InProgressDay1";
                            updates.startTimeDay1 = serverTimestamp;
                            break;
                        case "endDay1":
                            updates.status = "Day1Ended_AwaitingNext";
                            handleDayEnd(1);
                            break;
                        case "startDay2":
                            updates.status = "InProgressDay2";
                            updates.startTimeDay2 = serverTimestamp;
                            break;
                        case "endDay2":
                            updates.status = "Day2Ended_AwaitingNext";
                            handleDayEnd(2);
                            break;
                        case "startDay3":
                            updates.status = "InProgressDay3";
                            updates.startTimeDay3 = serverTimestamp;
                            break;
                        case "endDay3":
                            updates.status = "Day3Ended_AwaitingNext";
                            handleDayEnd(3);
                            break;
                        case "startDay4":
                            updates.status = "InProgressDay4";
                            updates.startTimeDay4 = serverTimestamp;
                            break;
                        case "endDay4":
                            updates.status = "Day4Ended_AwaitingNext";
                            handleDayEnd(4);
                            break;
                        case "startDay5":
                            updates.status = "InProgressDay5";
                            updates.startTimeDay5 = serverTimestamp;
                            break;
                        case "endDay5":
                            updates.status = "Day5Ended_AwaitingNext";
                            handleDayEnd(5);
                            break;
                        case "startDay6":
                            updates.status = "InProgressDay6";
                            updates.startTimeDay6 = serverTimestamp;
                            break;
                        case "endDay6":
                             updates.status = "Completed"; // End of Day 6 marks completion
                            handleDayEnd(6);
                            break;
                        case "markDone":
                            updates.status = "Completed";
                             for (let i = 1; i <= 6; i++) {
                                if (project.status === `InProgressDay${i}` && !project[`finishTimeDay${i}`]) {
                                    handleDayEnd(i);
                                }
                            }
                            break;
                        default:
                            this.methods.hideLoading.call(this);
                            return;
                    }

                    await projectRef.update(updates);
                    this.methods.initializeFirebaseAndLoadData.call(this); // Refresh data after update
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
                                lockIcon = ' 白';
                            } else if (status.locked > 0) {
                                lockIcon = ' 泊';
                            } else {
                                lockIcon = ' 箔';
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

                    let optionsHtml = '<option value="">Select Tech ID</option>';
                    this.state.users.sort((a, b) => a.techId.localeCompare(b.techId)).forEach(user => {
                        optionsHtml += `<option value="${user.techId}" title="${user.name}">${user.techId}</option>`;
                    });
                    assignedToSelect.innerHTML = optionsHtml;

                    assignedToSelect.value = project.assignedTo || "";
                    assignedToSelect.onchange = (e) => this.db.collection("projects").doc(project.id).update({
                        assignedTo: e.target.value,
                        lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    assignedToCell.appendChild(assignedToSelect);

                    const statusCell = row.insertCell();
                    let displayStatus = project.status || "Unknown";
                    if (displayStatus.includes("Ended_AwaitingNext")) {
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

                    createTimeInput(project.startTimeDay4, 'startTimeDay4', 'column-day4');
                    createTimeInput(project.finishTimeDay4, 'finishTimeDay4', 'column-day4');
                    createBreakSelect(4, project, 'column-day4');

                    createTimeInput(project.startTimeDay5, 'startTimeDay5', 'column-day5');
                    createTimeInput(project.finishTimeDay5, 'finishTimeDay5', 'column-day5');
                    createBreakSelect(5, project, 'column-day5');

                    createTimeInput(project.startTimeDay6, 'startTimeDay6', 'column-day6');
                    createTimeInput(project.finishTimeDay6, 'finishTimeDay6', 'column-day6');
                    createBreakSelect(6, project, 'column-day6');

                    const totalDurationMs = (project.durationDay1Ms || 0) + (project.durationDay2Ms || 0) + (project.durationDay3Ms || 0) +
                                          (project.durationDay4Ms || 0) + (project.durationDay5Ms || 0) + (project.durationDay6Ms || 0);
                    const totalBreakMs = ((project.breakDurationMinutesDay1 || 0) + (project.breakDurationMinutesDay2 || 0) + (project.breakDurationMinutesDay3 || 0) +
                                          (project.breakDurationMinutesDay4 || 0) + (project.breakDurationMinutesDay5 || 0) + (project.breakDurationMinutesDay6 || 0)) * 60000;
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

                    const createActionButton = (text, className, disabled, action, dayClass = '') => {
                        const button = document.createElement('button');
                        button.textContent = text;
                        button.className = `btn ${className} ${dayClass}`;
                        button.disabled = project.status === "Reassigned_TechAbsent" || disabled || project.isLocked;
                        button.onclick = () => this.methods.updateProjectState.call(this, project.id, action);
                        return button;
                    };

                    actionButtonsDiv.appendChild(createActionButton("Start D1", "btn-day-start", project.status !== "Available", "startDay1"));
                    actionButtonsDiv.appendChild(createActionButton("End D1", "btn-day-end", project.status !== "InProgressDay1", "endDay1"));
                    actionButtonsDiv.appendChild(createActionButton("Start D2", "btn-day-start", project.status !== "Day1Ended_AwaitingNext", "startDay2", "action-day2"));
                    actionButtonsDiv.appendChild(createActionButton("End D2", "btn-day-end", project.status !== "InProgressDay2", "endDay2", "action-day2"));
                    actionButtonsDiv.appendChild(createActionButton("Start D3", "btn-day-start", project.status !== "Day2Ended_AwaitingNext", "startDay3", "action-day3"));
                    actionButtonsDiv.appendChild(createActionButton("End D3", "btn-day-end", project.status !== "InProgressDay3", "endDay3", "action-day3"));
                    actionButtonsDiv.appendChild(createActionButton("Start D4", "btn-day-start", project.status !== "Day3Ended_AwaitingNext", "startDay4", "action-day4"));
                    actionButtonsDiv.appendChild(createActionButton("End D4", "btn-day-end", project.status !== "InProgressDay4", "endDay4", "action-day4"));
                    actionButtonsDiv.appendChild(createActionButton("Start D5", "btn-day-start", project.status !== "Day4Ended_AwaitingNext", "startDay5", "action-day5"));
                    actionButtonsDiv.appendChild(createActionButton("End D5", "btn-day-end", project.status !== "InProgressDay5", "endDay5", "action-day5"));
                    actionButtonsDiv.appendChild(createActionButton("Start D6", "btn-day-start", project.status !== "Day5Ended_AwaitingNext", "startDay6", "action-day6"));
                    actionButtonsDiv.appendChild(createActionButton("End D6", "btn-day-end", project.status !== "InProgressDay6", "endDay6", "action-day6"));

                    const doneButtonDisabled = project.status === "Completed" || project.status === "Reassigned_TechAbsent" || (project.status === "Available" && !(project.durationDay1Ms || project.durationDay2Ms || project.durationDay3Ms || project.durationDay4Ms || project.durationDay5Ms || project.durationDay6Ms));
                    actionButtonsDiv.appendChild(createActionButton("Done", "btn-mark-done", doneButtonDisabled, "markDone"));

                    const resetBtn = createActionButton("Reset", "btn-secondary", project.status === "Available", "reset");
                    resetBtn.onclick = () => this.methods.handleResetTask.call(this, project);
                    actionButtonsDiv.appendChild(resetBtn);

                    const reassignBtn = createActionButton("Re-Assign", "btn-warning", project.status === "Completed" || project.status === "Reassigned_TechAbsent", "reassign");
                    reassignBtn.onclick = () => this.methods.handleReassignment.call(this, project);
                    actionButtonsDiv.appendChild(reassignBtn);

                    actionsCell.appendChild(actionButtonsDiv);
                });
            },

            async handleResetTask(project) {
                if (!project || project.isLocked) {
                    alert("This task is locked and cannot be reset.");
                    return;
                }

                if (confirm(`Are you sure you want to reset the task '${project.areaTask}'? This will clear all recorded times and set the status to "Available". This action cannot be undone.`)) {
                    this.methods.showLoading.call(this, "Resetting task...");
                    const projectRef = this.db.collection("projects").doc(project.id);
                    const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();

                    const updates = {
                        status: "Available",
                        startTimeDay1: null, finishTimeDay1: null, durationDay1Ms: null,
                        startTimeDay2: null, finishTimeDay2: null, durationDay2Ms: null,
                        startTimeDay3: null, finishTimeDay3: null, durationDay3Ms: null,
                        startTimeDay4: null, finishTimeDay4: null, durationDay4Ms: null,
                        startTimeDay5: null, finishTimeDay5: null, durationDay5Ms: null,
                        startTimeDay6: null, finishTimeDay6: null, durationDay6Ms: null,
                        breakDurationMinutesDay1: 0,
                        breakDurationMinutesDay2: 0,
                        breakDurationMinutesDay3: 0,
                        breakDurationMinutesDay4: 0,
                        breakDurationMinutesDay5: 0,
                        breakDurationMinutesDay6: 0,
                        additionalMinutesManual: 0,
                        techNotes: "",
                        lastModifiedTimestamp: serverTimestamp
                    };

                    try {
                        await projectRef.update(updates);
                        this.methods.initializeFirebaseAndLoadData.call(this); // Refresh
                    } catch (error) {
                        console.error("Error resetting task:", error);
                        alert("Error resetting task: " + error.message);
                    } finally {
                        this.methods.hideLoading.call(this);
                    }
                }
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
                const loadState = (key, checkbox, defaultValue) => {
                    const value = localStorage.getItem(key) !== 'false';
                    if (checkbox) checkbox.checked = value;
                };

                loadState('showTitleColumn', this.elements.toggleTitleCheckbox);
                loadState('showDay2Column', this.elements.toggleDay2Checkbox);
                loadState('showDay3Column', this.elements.toggleDay3Checkbox);
                loadState('showDay4Column', this.elements.toggleDay4Checkbox);
                loadState('showDay5Column', this.elements.toggleDay5Checkbox);
                loadState('showDay6Column', this.elements.toggleDay6Checkbox);
            },

            saveColumnVisibilityState() {
                const saveState = (key, checkbox) => {
                    if (checkbox) localStorage.setItem(key, checkbox.checked);
                };

                saveState('showTitleColumn', this.elements.toggleTitleCheckbox);
                saveState('showDay2Column', this.elements.toggleDay2Checkbox);
                saveState('showDay3Column', this.elements.toggleDay3Checkbox);
                saveState('showDay4Column', this.elements.toggleDay4Checkbox);
                saveState('showDay5Column', this.elements.toggleDay5Checkbox);
                saveState('showDay6Column', this.elements.toggleDay6Checkbox);
            },

            applyColumnVisibility() {
                const toggleVisibility = (className, checkbox) => {
                    // Hide/show table columns (th and td)
                    document.querySelectorAll(`#projectTable .${className}`).forEach(el => {
                        el.classList.toggle('column-hidden', !checkbox.checked);
                    });

                    // Hide/show corresponding action buttons
                    const dayMatch = className.match(/day(\d)/);
                    if (dayMatch) {
                        const dayNum = dayMatch[1];
                        document.querySelectorAll(`#projectTable .action-day${dayNum}`).forEach(btn => {
                            btn.style.display = checkbox.checked ? '' : 'none';
                        });
                    }
                };

                toggleVisibility('column-project-name', this.elements.toggleTitleCheckbox);
                toggleVisibility('column-day2', this.elements.toggleDay2Checkbox);
                toggleVisibility('column-day3', this.elements.toggleDay3Checkbox);
                toggleVisibility('column-day4', this.elements.toggleDay4Checkbox);
                toggleVisibility('column-day5', this.elements.toggleDay5Checkbox);
                toggleVisibility('column-day6', this.elements.toggleDay6Checkbox);
            },


            async fetchUsers() {
                try {
                    const snapshot = await this.db.collection(this.config.firestorePaths.USERS).get();
                    this.state.users = snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }));
                    console.log("Successfully fetched user list.", this.state.users);
                } catch (error) {
                    console.error("Error fetching user list:", error);
                    this.state.users = [];
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

                    let sortedBatches = Object.values(batches).sort((a, b) => {
                        const tsA = a.creationTimestamp?.toMillis ? a.creationTimestamp.toMillis() : 0;
                        const tsB = b.creationTimestamp?.toMillis ? b.creationTimestamp.toMillis() : 0;
                        return tsB - tsA;
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

            async renderTLDashboard() {
                if (!this.elements.tlDashboardContentElement) return;
                this.elements.tlDashboardContentElement.innerHTML = "";

                // --- General Settings Section ---
                const settingsDiv = document.createElement('div');
                settingsDiv.className = 'dashboard-batch-item';
                settingsDiv.innerHTML = `<h4>⚙️ General Settings</h4>`;

                // Meeting Link Settings
                const chatSettingsForm = document.createElement('div');
                chatSettingsForm.className = 'form-group';
                chatSettingsForm.innerHTML = `
                    <label for="meetingLinkInput" style="font-weight: bold; font-size: 1em;">Team Meeting URL</label>
                    <div style="display: flex; gap: 10px;">
                        <input type="url" id="meetingLinkInput" class="form-control" placeholder="https://meet.google.com/xxx-xxxx-xxx">
                        <button id="saveMeetingLinkBtn" class="btn btn-primary">Save</button>
                    </div>
                `;
                settingsDiv.appendChild(chatSettingsForm);

                // TSC Link Settings
                const tscSettingsForm = document.createElement('div');
                tscSettingsForm.className = 'form-group';
                tscSettingsForm.innerHTML = `
                    <label for="tscLinkNameInput" style="font-weight: bold; font-size: 1em; margin-top: 15px;">Custom Link Button</label>
                    <div style="display: grid; grid-template-columns: 1fr 2fr auto; gap: 10px;">
                        <input type="text" id="tscLinkNameInput" class="form-control" placeholder="e.g., July">
                        <input type="url" id="tscLinkUrlInput" class="form-control" placeholder="https://chat.google.com/...">
                        <button id="saveTscLinkBtn" class="btn btn-primary">Save</button>
                    </div>
                `;
                settingsDiv.appendChild(tscSettingsForm);

                this.elements.tlDashboardContentElement.appendChild(settingsDiv);

                // Fetch and display current settings
                const configDoc = await this.db.collection(this.config.firestorePaths.APP_CONFIG).doc('settings').get();
                if (configDoc.exists) {
                    const data = configDoc.data();
                    if (data.meetingUrl) {
                        settingsDiv.querySelector('#meetingLinkInput').value = data.meetingUrl;
                    }
                    if (data.tscButtonName) {
                        settingsDiv.querySelector('#tscLinkNameInput').value = data.tscButtonName;
                    }
                    if (data.tscButtonUrl) {
                        settingsDiv.querySelector('#tscLinkUrlInput').value = data.tscButtonUrl;
                    }
                }

                // Add event listeners
                settingsDiv.querySelector('#saveMeetingLinkBtn').onclick = this.methods.handleSaveMeetingLink.bind(this);
                settingsDiv.querySelector('#saveTscLinkBtn').onclick = this.methods.handleSaveTscLink.bind(this);

                // --- Project Management Sections ---
                const batches = await this.methods.getManageableBatches.call(this);
                if (batches.length === 0) {
                    const noProjectsEl = document.createElement('p');
                    noProjectsEl.textContent = "No project batches found.";
                    this.elements.tlDashboardContentElement.appendChild(noProjectsEl);
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
                    addAreaBtn.disabled = !stagesPresent.includes('Fix1');
                    addAreaBtn.title = addAreaBtn.disabled ? 'Adding areas is only enabled for projects with a Fix1 stage.' : 'Add a new task area to the latest Fix stage.';
                    addAreaBtn.onclick = () => this.methods.handleAddExtraArea.call(this, batch.batchId, batch.baseProjectName);
                    releaseActionsDiv.appendChild(addAreaBtn);
                    releaseGroup.appendChild(releaseActionsDiv);
                    actionsContainer.appendChild(releaseGroup);

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

            async handleSaveMeetingLink() {
                const input = document.getElementById('meetingLinkInput');
                const newUrl = input.value.trim();

                if (newUrl && !newUrl.startsWith('http')) {
                    alert('Please enter a valid URL (e.g., https://meet.google.com/...).');
                    return;
                }

                this.methods.showLoading.call(this, 'Saving Meeting Link...');
                try {
                    await this.db.collection(this.config.firestorePaths.APP_CONFIG).doc('settings').set({
                        meetingUrl: newUrl
                    }, { merge: true });
                    alert('Meeting link saved successfully!');
                } catch (error) {
                    console.error("Error saving meeting link:", error);
                    alert('Failed to save meeting link: ' + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            async handleSaveTscLink() {
                const nameInput = document.getElementById('tscLinkNameInput');
                const urlInput = document.getElementById('tscLinkUrlInput');
                const newName = nameInput.value.trim();
                const newUrl = urlInput.value.trim();

                if (newUrl && !newUrl.startsWith('http')) {
                    alert('Please enter a valid URL for the custom link.');
                    return;
                }

                this.methods.showLoading.call(this, 'Saving Custom Link...');
                try {
                    await this.db.collection(this.config.firestorePaths.APP_CONFIG).doc('settings').set({
                        tscButtonName: newName,
                        tscButtonUrl: newUrl
                    }, { merge: true });
                    alert('Custom link saved successfully!');
                } catch (error) {
                    console.error("Error saving custom link:", error);
                    alert('Failed to save custom link: ' + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

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
                        const newDurationDay4 = this.methods.calculateDurationMs.call(this, task.startTimeDay4, task.finishTimeDay4);
                        const newDurationDay5 = this.methods.calculateDurationMs.call(this, task.startTimeDay5, task.finishTimeDay5);
                        const newDurationDay6 = this.methods.calculateDurationMs.call(this, task.startTimeDay6, task.finishTimeDay6);

                        let needsUpdate = false;
                        if ((newDurationDay1 || null) !== (task.durationDay1Ms || null)) needsUpdate = true;
                        if ((newDurationDay2 || null) !== (task.durationDay2Ms || null)) needsUpdate = true;
                        if ((newDurationDay3 || null) !== (task.durationDay3Ms || null)) needsUpdate = true;
                        if ((newDurationDay4 || null) !== (task.durationDay4Ms || null)) needsUpdate = true;
                        if ((newDurationDay5 || null) !== (task.durationDay5Ms || null)) needsUpdate = true;
                        if ((newDurationDay6 || null) !== (task.durationDay6Ms || null)) needsUpdate = true;

                        if (needsUpdate) {
                            tasksToUpdate++;
                            const updates = {
                                durationDay1Ms: newDurationDay1,
                                durationDay2Ms: newDurationDay2,
                                durationDay3Ms: newDurationDay3,
                                durationDay4Ms: newDurationDay4,
                                durationDay5Ms: newDurationDay5,
                                durationDay6Ms: newDurationDay6,
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
                            startTimeDay4: null, finishTimeDay4: null, durationDay4Ms: null,
                            startTimeDay5: null, finishTimeDay5: null, durationDay5Ms: null,
                            startTimeDay6: null, finishTimeDay6: null, durationDay6Ms: null,
                            releasedToNextStage: false,
                            isReassigned: false,
                            originalProjectId: null,
                            isLocked: false,
                            breakDurationMinutesDay1: 0,
                            breakDurationMinutesDay2: 0,
                            breakDurationMinutesDay3: 0,
                            breakDurationMinutesDay4: 0,
                            breakDurationMinutesDay5: 0,
                            breakDurationMinutesDay6: 0,
                            additionalMinutesManual: 0,
                            creationTimestamp: serverTimestamp,
                            lastModifiedTimestamp: serverTimestamp
                        };
                        delete newTaskData.id;

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

                    let projectNameForNotification = "";
                    if (!snapshot.empty) {
                        projectNameForNotification = snapshot.docs[0].data().baseProjectName;
                    } else {
                        alert("No tasks to release.");
                        this.methods.hideLoading.call(this);
                        return;
                    }

                    const message = `Tasks from ${currentFixCategory} for project "${projectNameForNotification}" have been released to ${nextFixCategory}!`;
                    await this.methods.createNotification.call(this, message, "fix_release", projectNameForNotification);

                    const firestoreBatch = this.db.batch();
                    const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();

                    for (const doc of snapshot.docs) {
                        const task = {
                            id: doc.id,
                            ...doc.data()
                        };
                        if (task.status === "Reassigned_TechAbsent") continue;

                        const newNextFixTask = {
                            ...task,
                            fixCategory: nextFixCategory,
                            status: "Available",
                            techNotes: "",
                            additionalMinutesManual: 0,
                             breakDurationMinutesDay1: 0,
                            breakDurationMinutesDay2: 0,
                            breakDurationMinutesDay3: 0,
                            breakDurationMinutesDay4: 0,
                            breakDurationMinutesDay5: 0,
                            breakDurationMinutesDay6: 0,
                            startTimeDay1: null, finishTimeDay1: null, durationDay1Ms: null,
                            startTimeDay2: null, finishTimeDay2: null, durationDay2Ms: null,
                            startTimeDay3: null, finishTimeDay3: null, durationDay3Ms: null,
                            startTimeDay4: null, finishTimeDay4: null, durationDay4Ms: null,
                            startTimeDay5: null, finishTimeDay5: null, durationDay5Ms: null,
                            startTimeDay6: null, finishTimeDay6: null, durationDay6Ms: null,
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
                        startTimeDay1: null, finishTimeDay1: null, durationDay1Ms: null,
                        startTimeDay2: null, finishTimeDay2: null, durationDay2Ms: null,
                        startTimeDay3: null, finishTimeDay3: null, durationDay3Ms: null,
                        startTimeDay4: null, finishTimeDay4: null, durationDay4Ms: null,
                        startTimeDay5: null, finishTimeDay5: null, durationDay5Ms: null,
                        startTimeDay6: null, finishTimeDay6: null, durationDay6Ms: null,
                        releasedToNextStage: false,
                        isLocked: false,
                        breakDurationMinutesDay1: 0,
                        breakDurationMinutesDay2: 0,
                        breakDurationMinutesDay3: 0,
                        breakDurationMinutesDay4: 0,
                        breakDurationMinutesDay5: 0,
                        breakDurationMinutesDay6: 0,
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
                        this.methods.initializeFirebaseAndLoadData.call(this);
                    } catch (error) {
                        console.error("Error in re-assignment:", error);
                        alert("Error during re-assignment: " + error.message);
                    } finally {
                        this.methods.hideLoading.call(this);
                    }
                }
            },

            async renderUserManagement() {
                if (!this.elements.userManagementTableBody) return;
                this.methods.showLoading.call(this, "Loading user list...");

                await this.methods.fetchUsers.call(this);

                this.elements.userManagementTableBody.innerHTML = "";
                if (this.state.users.length === 0) {
                    this.elements.userManagementTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No users found. Add one above.</td></tr>';
                } else {
                    this.state.users.sort((a, b) => a.name.localeCompare(b.name)).forEach(user => {
                        const row = this.elements.userManagementTableBody.insertRow();
                        row.insertCell().textContent = user.name;
                        row.insertCell().textContent = user.email;
                        row.insertCell().textContent = user.techId;
                        const actionCell = row.insertCell();

                        const editBtn = document.createElement('button');
                        editBtn.textContent = "Edit";
                        editBtn.className = 'btn btn-secondary btn-small';
                        editBtn.onclick = () => this.methods.enterEditMode.call(this, user);
                        actionCell.appendChild(editBtn);

                        const removeBtn = document.createElement('button');
                        removeBtn.textContent = "Remove";
                        removeBtn.className = 'btn btn-danger btn-small';
                        removeBtn.onclick = () => this.methods.handleRemoveUser.call(this, user);
                        actionCell.appendChild(removeBtn);
                    });
                }
                this.methods.hideLoading.call(this);
            },

            async handleUserFormSubmit(event) {
                event.preventDefault();
                if (this.state.editingUser) {
                    await this.methods.handleUpdateUser.call(this);
                } else {
                    await this.methods.handleAddNewUser.call(this);
                }
            },

            async handleAddNewUser() {
                const name = this.elements.newUserName.value.trim();
                const email = this.elements.newUserEmail.value.trim().toLowerCase();
                const techId = this.elements.newUserTechId.value.trim().toUpperCase();

                if (!name || !email || !techId) {
                    alert("Please fill in all fields: Full Name, Email, and Tech ID.");
                    return;
                }

                if (this.state.users.some(u => u.email === email)) {
                    alert(`Error: The email "${email}" is already registered.`);
                    return;
                }
                if (this.state.users.some(u => u.techId === techId)) {
                    alert(`Error: The Tech ID "${techId}" is already registered.`);
                    return;
                }

                this.methods.showLoading.call(this, `Adding user ${name}...`);
                try {
                    const newUser = {
                        name,
                        email,
                        techId
                    };
                    await this.db.collection(this.config.firestorePaths.USERS).add(newUser);

                    alert(`User "${name}" added successfully!`);
                    this.elements.userManagementForm.reset();
                    await this.methods.renderUserManagement.call(this);
                    this.methods.renderProjects.call(this);

                } catch (error) {
                    console.error("Error adding new user:", error);
                    alert("An error occurred while adding the user: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            async handleUpdateUser() {
                const name = this.elements.newUserName.value.trim();
                const email = this.elements.newUserEmail.value.trim().toLowerCase();
                const techId = this.elements.newUserTechId.value.trim().toUpperCase();

                if (!name || !email || !techId) {
                    alert("Please fill in all fields: Full Name, Email, and Tech ID.");
                    return;
                }

                if (this.state.users.some(u => u.email === email && u.id !== this.state.editingUser.id)) {
                    alert(`Error: The email "${email}" is already registered to another user.`);
                    return;
                }
                if (this.state.users.some(u => u.techId === techId && u.id !== this.state.editingUser.id)) {
                    alert(`Error: The Tech ID "${techId}" is already registered to another user.`);
                    return;
                }

                this.methods.showLoading.call(this, `Updating user ${name}...`);
                try {
                    const updatedUser = {
                        name,
                        email,
                        techId
                    };
                    await this.db.collection(this.config.firestorePaths.USERS).doc(this.state.editingUser.id).update(updatedUser);

                    alert(`User "${name}" updated successfully!`);
                    this.methods.exitEditMode.call(this);
                    await this.methods.renderUserManagement.call(this);
                    this.methods.renderProjects.call(this);

                } catch (error) {
                    console.error("Error updating user:", error);
                    alert("An error occurred while updating the user: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            enterEditMode(user) {
                this.state.editingUser = user;
                this.elements.newUserName.value = user.name;
                this.elements.newUserEmail.value = user.email;
                this.elements.newUserTechId.value = user.techId;

                this.elements.userFormButtons.innerHTML = '';

                const saveBtn = document.createElement('button');
                saveBtn.type = 'submit';
                saveBtn.className = 'btn btn-primary';
                saveBtn.textContent = 'Save Changes';

                const cancelBtn = document.createElement('button');
                cancelBtn.type = 'button';
                cancelBtn.className = 'btn btn-secondary';
                cancelBtn.textContent = 'Cancel';
                cancelBtn.onclick = () => this.methods.exitEditMode.call(this);

                this.elements.userFormButtons.appendChild(saveBtn);
                this.elements.userFormButtons.appendChild(cancelBtn);
            },

            exitEditMode() {
                this.state.editingUser = null;
                this.elements.userManagementForm.reset();
                this.elements.userFormButtons.innerHTML = '';

                const addBtn = document.createElement('button');
                addBtn.type = 'submit';
                addBtn.className = 'btn btn-success';
                addBtn.textContent = 'Add User';
                this.elements.userFormButtons.appendChild(addBtn);
            },

            async handleRemoveUser(userToRemove) {
                if (confirm(`Are you sure you want to remove the user "${userToRemove.name}" (${userToRemove.email})? This action cannot be undone.`)) {
                    this.methods.showLoading.call(this, `Removing user ${userToRemove.name}...`);
                    try {
                        await this.db.collection(this.config.firestorePaths.USERS).doc(userToRemove.id).delete();
                        alert(`User "${userToRemove.name}" has been removed.`);
                        this.methods.exitEditMode.call(this);
                        await this.methods.renderUserManagement.call(this);
                        this.methods.renderProjects.call(this);
                    } catch (error) {
                        console.error("Error removing user:", error);
                        alert("An error occurred while removing the user: " + error.message);
                    } finally {
                        this.methods.hideLoading.call(this);
                    }
                }
            },

            handleClearData() {
                if (confirm("Are you sure you want to clear all locally stored application data? This will reset your filters and view preferences but will not affect any data on the server.")) {
                    try {
                        localStorage.clear();
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
                refreshButton.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
                refreshButton.onclick = () => this.methods.generateTlSummaryData.call(this);

                summaryHeader.appendChild(summaryTitle);
                summaryHeader.appendChild(refreshButton);
                this.elements.tlSummaryContent.appendChild(summaryHeader);

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
                        const totalWorkMs = (p.durationDay1Ms || 0) + (p.durationDay2Ms || 0) + (p.durationDay3Ms || 0) +
                                          (p.durationDay4Ms || 0) + (p.durationDay5Ms || 0) + (p.durationDay6Ms || 0);
                        const breakMs = ((p.breakDurationMinutesDay1 || 0) + (p.breakDurationMinutesDay2 || 0) + (p.breakDurationMinutesDay3 || 0) +
                                         (p.breakDurationMinutesDay4 || 0) + (p.breakDurationMinutesDay5 || 0) + (p.breakDurationMinutesDay6 || 0)) * 60000;
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

            injectNotificationStyles() {
                const style = document.createElement('style');
                style.innerHTML = `
                    .notification-modal-backdrop {
                        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                        background-color: rgba(0,0,0,0.4); z-index: 10000; display: flex;
                        justify-content: center; align-items: flex-start; padding-top: 50px;
                    }
                    .notification-modal-content {
                        background-color: white; padding: 25px; border-radius: 8px;
                        box-shadow: 0 5px 15px rgba(0,0,0,0.3); width: 90%; max-width: 450px;
                        text-align: center;
                    }
                    .notification-modal-content h4 { margin-top: 0; }
                    .notification-modal-buttons { margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end; }
                `;
                document.head.appendChild(style);
            },

            showNotificationModal(notification) {
                const backdrop = document.createElement('div');
                backdrop.className = 'notification-modal-backdrop';

                const modal = document.createElement('div');
                modal.className = 'notification-modal-content';

                const title = document.createElement('h4');
                title.textContent = '粕 New Update';

                const messageP = document.createElement('p');
                messageP.textContent = notification.message;

                const buttonContainer = document.createElement('div');
                buttonContainer.className = 'notification-modal-buttons';

                const closeBtn = document.createElement('button');
                closeBtn.textContent = 'Close';
                closeBtn.className = 'btn btn-secondary';
                closeBtn.onclick = () => document.body.removeChild(backdrop);

                const viewBtn = document.createElement('button');
                viewBtn.textContent = 'View Project';
                viewBtn.className = 'btn btn-primary';

                if (notification.baseProjectName) {
                    viewBtn.onclick = () => {
                        this.state.filters.batchId = notification.baseProjectName;
                        localStorage.setItem('currentSelectedBatchId', this.state.filters.batchId);
                        this.state.filters.fixCategory = "";
                        this.state.pagination.currentPage = 1;
                        this.state.pagination.paginatedProjectNameList = [];
                        this.methods.initializeFirebaseAndLoadData.call(this);
                        document.body.removeChild(backdrop);
                    };
                } else {
                    viewBtn.disabled = true;
                }

                buttonContainer.appendChild(closeBtn);
                buttonContainer.appendChild(viewBtn);
                modal.appendChild(title);
                modal.appendChild(messageP);
                modal.appendChild(buttonContainer);
                backdrop.appendChild(modal);
                document.body.appendChild(backdrop);
            },

            async createNotification(message, type, baseProjectName) {
                const notificationsRef = this.db.collection(this.config.firestorePaths.NOTIFICATIONS);

                try {
                    const query = notificationsRef.orderBy("timestamp", "asc");
                    const snapshot = await query.get();

                    if (snapshot.size >= 5) {
                        const batch = this.db.batch();
                        const toDeleteCount = snapshot.size - 4;
                        const toDelete = snapshot.docs.slice(0, toDeleteCount);
                        toDelete.forEach(doc => batch.delete(doc.ref));
                        await batch.commit();
                        console.log(`Cleared ${toDelete.length} oldest notification(s).`);
                    }

                    await notificationsRef.add({
                        message,
                        type,
                        baseProjectName: baseProjectName || null,
                        timestamp: firebase.firestore.FieldValue.serverTimestamp()
                    });

                } catch (error) {
                    console.error("Error creating notification:", error);
                }
            },

            listenForNotifications() {
                // This function is kept for real-time pop-up notifications,
                // which are a separate feature from the badge counts.
                if (!this.db) {
                    console.error("Firestore not initialized for notifications.");
                    return;
                }

                this.db.collection(this.config.firestorePaths.NOTIFICATIONS)
                    .orderBy("timestamp", "desc")
                    .limit(1)
                    .onSnapshot(
                        (snapshot) => {
                            snapshot.docChanges().forEach(change => {
                                if (change.type === "added") {
                                    const notification = change.doc.data();
                                    const fiveSecondsAgo = firebase.firestore.Timestamp.now().toMillis() - 5000;
                                    if (notification.timestamp && notification.timestamp.toMillis() > fiveSecondsAgo) {
                                        this.methods.showNotificationModal.call(this, notification);
                                    }
                                }
                            });
                        },
                        (error) => {
                            console.error("Error listening for notifications:", error);
                        }
                    );
            },

            // --- TEAM CHAT METHODS ---

            injectChatModalHTML() {
                const chatModalHTML = `
                    <div class="modal" id="teamChatModal" style="display: none;">
                        <div class="modal-content large">
                            <div class="modal-header">
                                <h2>Team Chat</h2>
                                <button id="startVoiceCallBtn" class="btn btn-success" style="margin-left: auto; margin-right: 20px;">📞 Start Voice Call</button>
                                <span class="close-btn" id="closeTeamChatBtn">&times;</span>
                            </div>
                            <div class="modal-body">
                                <div id="chatMessagesContainer" class="chat-messages"></div>
                                <div id="typingIndicator" class="typing-indicator"></div>
                                <form id="chatMessageForm" class="chat-form">
                                    <input type="text" id="chatMessageInput" placeholder="Type a message... (try 'lol' or ':)')" autocomplete="off" required>
                                    <button type="submit" class="btn btn-primary">Send</button>
                                </form>
                            </div>
                        </div>
                    </div>
                    <audio id="chatAudioNotification" src="https://firebasestorage.googleapis.com/v0/b/project-tracker-pro-728b1.appspot.com/o/notification.mp3?alt=media&token=8934ed53-220a-4a2f-893f-8898a11b669e"></audio>
                `;
                document.body.insertAdjacentHTML('beforeend', chatModalHTML);
            },

            listenForChatMessages() {
                if (!this.db) {
                    console.error("Firestore not initialized for chat.");
                    return;
                }
                if (this.chatListenerUnsubscribe) {
                    this.chatListenerUnsubscribe();
                }

                const self = this;
                const chatRef = this.db.collection(this.config.firestorePaths.CHAT).orderBy("timestamp", "asc");

                this.chatListenerUnsubscribe = chatRef.onSnapshot(snapshot => {
                    if (self.state.isInitialChatLoad) {
                        self.state.isInitialChatLoad = false;
                    } else {
                        snapshot.docChanges().forEach(change => {
                            if (change.type === "added") {
                                const messageData = change.doc.data();
                                if (self.elements.teamChatModal.style.display === 'none' && messageData.techId !== self.state.currentUserTechId) {
                                    self.state.hasUnreadMessages = true;
                                    self.methods.updateChatBadgeVisibility.call(self);
                                    self.methods.playNotificationSound.call(self);
                                }
                            }
                        });
                    }

                    self.state.chatMessages = snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }));
                    self.methods.renderChatMessages.call(self);
                }, error => {
                    console.error("Error listening for chat messages:", error);
                });
            },

            updateChatBadgeVisibility() {
                if (this.elements.chatNotificationBadge) {
                    this.elements.chatNotificationBadge.style.display = this.state.hasUnreadMessages ? 'block' : 'none';
                }
            },

            playNotificationSound() {
                if (this.elements.chatAudioNotification) {
                    this.elements.chatAudioNotification.play().catch(error => {
                        console.warn("Audio notification blocked by browser:", error.message);
                    });
                }
            },

            renderChatMessages() {
                if (!this.elements.chatMessagesContainer) return;
                const container = this.elements.chatMessagesContainer;
                const shouldScroll = container.scrollTop + container.clientHeight >= container.scrollHeight - 20;

                container.innerHTML = '';

                this.state.chatMessages.forEach(msg => {
                    const msgDiv = document.createElement('div');
                    msgDiv.className = 'chat-message';
                    if (msg.techId === this.state.currentUserTechId) {
                        msgDiv.classList.add('current-user');
                    }
                    if (msg.type === 'invitation') {
                        msgDiv.classList.add('invitation');
                    }

                    const time = msg.timestamp ? msg.timestamp.toDate().toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                    }) : '';

                    const messageTextWithLinks = this.methods.linkify.call(this, msg.text);

                    msgDiv.innerHTML = `
                        <div class="message-header">
                            <span class="message-user">${msg.techId || 'Anonymous'}</span>
                            <span class="message-time">${time}</span>
                        </div>
                        <p class="message-text">${messageTextWithLinks}</p>
                    `;
                    container.appendChild(msgDiv);
                });

                if (shouldScroll || this.elements.teamChatModal.style.display !== 'none') {
                     container.scrollTop = container.scrollHeight;
                }
            },

            linkify(text) {
                const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
                return text.replace(urlRegex, (url) => {
                    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
                });
            },

            parseEmojis(text) {
                const emojiMap = {
                    ":)": "😊", ":-)": "😊",
                    ":(": "😢", ":-(": "😢",
                    ":D": "😄", ":-D": "😄",
                    "lol": "😂",
                    "<3": "❤️",
                    ":p": "😛", ":-p": "😛",
                    ";)": "😉", ";-)": "😉",
                    ":o": "😮", ":-o": "😮",
                    "yay": "🎉",
                    "wow": "🤩",
                    "ok": "👍",
                    "tada": "🎉"
                };
                const regex = new RegExp(Object.keys(emojiMap).map(e => e.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join("|"), "gi");
                return text.replace(regex, (match) => emojiMap[match.toLowerCase()]);
            },

            async handleSendMessage(messageText, messageType = 'standard') {
                if (typeof messageText !== 'string' || !messageText.trim()) return;
                if (!this.state.currentUserTechId) {
                    alert("Cannot send message. Your user ID is not set.");
                    return;
                }

                let processedText = this.methods.parseEmojis.call(this, messageText);

                const messageData = {
                    text: processedText,
                    techId: this.state.currentUserTechId,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    type: messageType
                };

                try {
                    await this.db.collection(this.config.firestorePaths.CHAT).add(messageData);
                    this.methods.updateTypingStatus.call(this, false);
                    this.methods.limitChatMessages.call(this);
                } catch (error) {
                    console.error("Error sending message:", error);
                    alert("Failed to send message: " + error.message);
                }
            },

            async handleStartVoiceCall() {
                this.methods.showLoading.call(this, 'Getting meeting link...');
                try {
                    const meetingUrl = this.state.appConfig.meetingUrl;
                    if (meetingUrl) {
                        const message = `${this.state.currentUserTechId} has started a voice call! Click to join:\n${meetingUrl}`;
                        await this.methods.handleSendMessage.call(this, message, 'invitation');
                        window.open(meetingUrl, '_blank');
                    } else {
                        alert('The team meeting link has not been set. An admin can set it in Project Settings.');
                    }
                } catch (error) {
                    console.error("Error starting voice call:", error);
                    alert('Could not start voice call. Please check settings.');
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            async limitChatMessages() {
                const chatRef = this.db.collection(this.config.firestorePaths.CHAT);
                try {
                    const snapshot = await chatRef.orderBy("timestamp", "desc").get();
                    const messageCount = snapshot.size;

                    if (messageCount > this.config.chat.MAX_MESSAGES) {
                        const toDeleteCount = messageCount - this.config.chat.MAX_MESSAGES;
                        const toDelete = snapshot.docs.slice(this.config.chat.MAX_MESSAGES);

                        const batch = this.db.batch();
                        toDelete.forEach(doc => {
                            batch.delete(doc.ref);
                        });
                        await batch.commit();
                        console.log(`Auto-deleted ${toDelete.length} oldest chat message(s).`);
                    }
                } catch (error) {
                    console.error("Error trimming chat history:", error);
                }
            },

            handleUserTyping(event) {
                if (event.key === 'Enter') {
                    clearTimeout(this.state.typingTimeout);
                    this.methods.updateTypingStatus.call(this, false);
                    return;
                }
                clearTimeout(this.state.typingTimeout);
                this.methods.updateTypingStatus.call(this, true);
                this.state.typingTimeout = setTimeout(() => {
                    this.methods.updateTypingStatus.call(this, false);
                }, 2000);
            },

            async updateTypingStatus(isTyping) {
                if (!this.state.currentUserTechId) return;
                const typingRef = this.db.collection(this.config.firestorePaths.TYPING_STATUS).doc(this.state.currentUserTechId);
                if (isTyping) {
                    await typingRef.set({
                        techId: this.state.currentUserTechId,
                        timestamp: firebase.firestore.FieldValue.serverTimestamp()
                    });
                } else {
                    await typingRef.delete();
                }
            },

            listenForTypingStatus() {
                if (this.typingListenerUnsubscribe) this.typingListenerUnsubscribe();

                const self = this;
                const typingRef = this.db.collection(this.config.firestorePaths.TYPING_STATUS);

                this.typingListenerUnsubscribe = typingRef.onSnapshot(snapshot => {
                    const now = Date.now();
                    const typingUsers = [];
                    snapshot.forEach(doc => {
                        const data = doc.data();
                        if (data.timestamp && (now - data.timestamp.toMillis() < 5000) && data.techId !== self.state.currentUserTechId) {
                            typingUsers.push(data.techId);
                        }
                    });
                    self.state.typingUsers = typingUsers;
                    self.methods.renderTypingIndicator.call(self);
                });
            },

            renderTypingIndicator() {
                const indicator = this.elements.typingIndicator;
                if (!indicator) return;

                if (this.state.typingUsers.length === 0) {
                    indicator.textContent = '';
                    indicator.style.display = 'none';
                } else if (this.state.typingUsers.length === 1) {
                    indicator.textContent = `${this.state.typingUsers[0]} is typing...`;
                    indicator.style.display = 'block';
                } else if (this.state.typingUsers.length <= 3) {
                    indicator.textContent = `${this.state.typingUsers.join(', ')} are typing...`;
                    indicator.style.display = 'block';
                } else {
                    indicator.textContent = 'Several people are typing...';
                    indicator.style.display = 'block';
                }
            },

            listenForAppConfigChanges() {
                if (this.appConfigListenerUnsubscribe) this.appConfigListenerUnsubscribe();
                const self = this;
                this.appConfigListenerUnsubscribe = this.db.collection(this.config.firestorePaths.APP_CONFIG).doc('settings')
                    .onSnapshot(doc => {
                        if (doc.exists) {
                            self.state.appConfig = doc.data();
                            self.methods.updateTscButton.call(self);
                        }
                    });
            },

            updateTscButton() {
                const { tscButtonName, tscButtonUrl } = this.state.appConfig;
                const btn = this.elements.tscLinkBtn;

                if (btn && tscButtonName && tscButtonUrl) {
                    btn.textContent = `TSC ${tscButtonName}`;
                    btn.onclick = () => window.open(tscButtonUrl, '_blank');
                    btn.style.display = 'inline-block';
                } else if (btn) {
                    btn.style.display = 'none';
                }
            },

            // --- IMPORT / EXPORT METHODS ---

            async handleExportUsers() {
                this.methods.showLoading.call(this, "Exporting users...");
                try {
                    if (this.state.users.length === 0) {
                        alert("No users to export.");
                        return;
                    }

                    const headers = ["name", "email", "techId"];
                    const rows = [headers.join(',')];

                    this.state.users.forEach(user => {
                        const rowData = [
                            `"${user.name.replace(/"/g, '""')}"`,
                            `"${user.email.replace(/"/g, '""')}"`,
                            `"${user.techId.replace(/"/g, '""')}"`
                        ];
                        rows.push(rowData.join(','));
                    });

                    const csvContent = "data:text/csv;charset=utf-8," + rows.join('\n');
                    const encodedUri = encodeURI(csvContent);
                    const link = document.createElement("a");
                    link.setAttribute("href", encodedUri);
                    link.setAttribute("download", `User_List_${new Date().toISOString().slice(0, 10)}.csv`);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);

                } catch (error) {
                    console.error("Error exporting users:", error);
                    alert("Failed to export users: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            handleImportUsers(event) {
                const file = event.target.files[0];
                if (!file) return;

                this.methods.showLoading.call(this, "Processing user CSV...");
                const reader = new FileReader();

                reader.onload = async (e) => {
                    try {
                        const csvText = e.target.result;
                        const newUsers = this.methods.parseUserCsv.call(this, csvText);

                        if (newUsers.length === 0) {
                            alert("No new, valid users found in the CSV file. Please check for duplicates or formatting errors.");
                            return;
                        }

                        if (!confirm(`Found ${newUsers.length} new user(s). Do you want to import them?`)) {
                            return;
                        }

                        this.methods.showLoading.call(this, `Importing ${newUsers.length} user(s)...`);
                        const batch = this.db.batch();
                        newUsers.forEach(user => {
                            const newDocRef = this.db.collection(this.config.firestorePaths.USERS).doc();
                            batch.set(newDocRef, user);
                        });

                        await batch.commit();
                        alert(`Successfully imported ${newUsers.length} new user(s)!`);
                        await this.methods.renderUserManagement.call(this);
                        this.methods.renderProjects.call(this);

                    } catch (error) {
                        console.error("Error processing user CSV:", error);
                        alert("Error importing users: " + error.message);
                    } finally {
                        this.methods.hideLoading.call(this);
                        this.elements.userCsvInput.value = '';
                    }
                };

                reader.readAsText(file);
            },

            parseUserCsv(csvText) {
                const lines = csvText.split('\n').map(l => l.trim()).filter(l => l);
                if (lines.length <= 1) return [];

                const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
                const requiredHeaders = ["name", "email", "techid"];
                if (!requiredHeaders.every(h => headers.includes(h))) {
                    throw new Error("CSV must contain 'name', 'email', and 'techId' headers.");
                }

                const newUsers = [];
                const existingEmails = new Set(this.state.users.map(u => u.email.toLowerCase()));
                const existingTechIds = new Set(this.state.users.map(u => u.techId.toUpperCase()));

                for (let i = 1; i < lines.length; i++) {
                    const values = lines[i].split(',');
                    const name = (values[headers.indexOf('name')] || "").trim();
                    const email = (values[headers.indexOf('email')] || "").trim().toLowerCase();
                    const techId = (values[headers.indexOf('techid')] || "").trim().toUpperCase();

                    if (!name || !email || !techId) {
                        console.warn(`Skipping row ${i+1}: Missing required data.`);
                        continue;
                    }

                    if (existingEmails.has(email) || existingTechIds.has(techId)) {
                        console.warn(`Skipping row ${i+1}: User with email '${email}' or Tech ID '${techId}' already exists.`);
                        continue;
                    }

                    newUsers.push({
                        name,
                        email,
                        techId
                    });
                    existingEmails.add(email);
                    existingTechIds.add(techId);
                }
                return newUsers;
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
                     const headers = this.config.CSV_HEADERS_FOR_IMPORT;

                    const rows = [headers.join(',')];

                    allProjectsData.forEach(project => {
                        const formatTimeCsv = (ts) => ts?.toDate ? `"${ts.toDate().toISOString()}"` : "";
                        const formatNotesCsv = (notes) => notes ? `"${notes.replace(/"/g, '""')}"` : "";

                         const totalDurationMs = (project.durationDay1Ms || 0) + (project.durationDay2Ms || 0) + (project.durationDay3Ms || 0) +
                                          (project.durationDay4Ms || 0) + (project.durationDay5Ms || 0) + (project.durationDay6Ms || 0);
                        const totalBreakMs = ((project.breakDurationMinutesDay1 || 0) + (project.breakDurationMinutesDay2 || 0) + (project.breakDurationMinutesDay3 || 0) +
                                             (project.breakDurationMinutesDay4 || 0) + (project.breakDurationMinutesDay5 || 0) + (project.breakDurationMinutesDay6 || 0)) * 60000;
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
                            formatTimeCsv(project.startTimeDay4),
                            formatTimeCsv(project.finishTimeDay4),
                            project.breakDurationMinutesDay4 || "0",
                            formatTimeCsv(project.startTimeDay5),
                            formatTimeCsv(project.finishTimeDay5),
                            project.breakDurationMinutesDay5 || "0",
                            formatTimeCsv(project.startTimeDay6),
                            formatTimeCsv(project.finishTimeDay6),
                            project.breakDurationMinutesDay6 || "0",
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

                            const fullProjectData = {
                                batchId: currentBatchId,
                                creationTimestamp: serverTimestamp,
                                lastModifiedTimestamp: serverTimestamp,
                                isLocked: false,
                                releasedToNextStage: false,
                                isReassigned: false,
                                originalProjectId: null,
                                additionalMinutesManual: projectData.additionalMinutesManual || 0,
                                fixCategory: projectData.fixCategory || "Fix1",
                                baseProjectName: projectData.baseProjectName || "IMPORTED_PROJ",
                                areaTask: projectData.areaTask || `Area${String(importedCount + 1).padStart(2, '0')}`,
                                gsd: projectData.gsd || "3in",
                                assignedTo: projectData.assignedTo || "",
                                status: projectData.status || "Available",
                                techNotes: projectData.techNotes || "",
                            };

                             for(let i=1; i<=6; i++){
                                fullProjectData[`breakDurationMinutesDay${i}`] = projectData[`breakDurationMinutesDay${i}`] || 0;
                                fullProjectData[`startTimeDay${i}`] = projectData[`startTimeDay${i}`] || null;
                                fullProjectData[`finishTimeDay${i}`] = projectData[`finishTimeDay${i}`] || null;
                                fullProjectData[`durationDay${i}Ms`] = this.methods.calculateDurationMs(projectData[`startTimeDay${i}`], projectData[`finishTimeDay${i}`]);
                            }

                            batch.set(newProjectRef, fullProjectData);
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

                             if (cleanedStatus.includes('startedavailable')) {
                                cleanedStatus = 'Available';
                            } else if (cleanedStatus.includes('inprogressday1')) cleanedStatus = 'InProgressDay1';
                            else if (cleanedStatus.includes('day1ended_awaitingnext')) cleanedStatus = 'Day1Ended_AwaitingNext';
                            else if (cleanedStatus.includes('inprogressday2')) cleanedStatus = 'InProgressDay2';
                            else if (cleanedStatus.includes('day2ended_awaitingnext')) cleanedStatus = 'Day2Ended_AwaitingNext';
                            else if (cleanedStatus.includes('inprogressday3')) cleanedStatus = 'InProgressDay3';
                            else if (cleanedStatus.includes('day3ended_awaitingnext')) cleanedStatus = 'Day3Ended_AwaitingNext';
                            else if (cleanedStatus.includes('inprogressday4')) cleanedStatus = 'InProgressDay4';
                            else if (cleanedStatus.includes('day4ended_awaitingnext')) cleanedStatus = 'Day4Ended_AwaitingNext';
                            else if (cleanedStatus.includes('inprogressday5')) cleanedStatus = 'InProgressDay5';
                            else if (cleanedStatus.includes('day5ended_awaitingnext')) cleanedStatus = 'Day5Ended_AwaitingNext';
                            else if (cleanedStatus.includes('inprogressday6')) cleanedStatus = 'InProgressDay6';
                            else if (cleanedStatus.includes('completed')) cleanedStatus = 'Completed';
                            else if (cleanedStatus.includes('reassigned_techabsent')) cleanedStatus = 'Reassigned_TechAbsent';
                            else cleanedStatus = 'Available';

                            projectData[fieldName] = cleanedStatus;
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

             // --- LEAVE SCHEDULER METHODS ---

            initLeaveScheduler() {
                this.methods.populateLeaveTechIdDropdown.call(this);
                this.methods.renderLeaveCalendar.call(this);
                this.methods.renderPendingRequests.call(this);
                this.methods.renderAllLeaveRequestsTable.call(this);
                this.methods.resetLeaveForm.call(this);

                const isAdmin = true; // Replace with actual admin check logic
                this.elements.adminLeaveSection.style.display = isAdmin ? 'block' : 'none';
            },

            async checkForNewLeaveRequests() {
                const lastViewed = firebase.firestore.Timestamp.fromMillis(this.state.lastLeaveViewTimestamp);
                const query = this.db.collection(this.config.firestorePaths.LEAVE_REQUESTS).where("requestedAt", ">", lastViewed);
                const snapshot = await query.get();
                this.state.newLeaveRequestsCount = snapshot.size;
                this.methods.updateLeaveBadge.call(this);
            },

            async fetchLeaveData() {
                try {
                    const snapshot = await this.db.collection(this.config.firestorePaths.LEAVE_REQUESTS).get();
                    this.state.leaveRequests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    this.methods.initLeaveScheduler.call(this);
                } catch(error) {
                     console.error("Error fetching leave data:", error)
                }
            },

            updateLeaveBadge() {
                const badge = this.elements.leaveNotificationBadge;
                if (badge) {
                    if (this.state.newLeaveRequestsCount > 0) {
                        badge.textContent = this.state.newLeaveRequestsCount;
                        badge.style.display = 'flex';
                        badge.style.alignItems = 'center';
                        badge.style.justifyContent = 'center';
                        badge.style.fontSize = '10px';
                        badge.style.width = '16px';
                        badge.style.height = '16px';
                        badge.style.top = '-5px';
                        badge.style.right = '-5px';
                    } else {
                        badge.style.display = 'none';
                    }
                }
            },

            populateLeaveTechIdDropdown() {
                const select = document.getElementById('leaveTechId');
                select.innerHTML = '';
                this.state.users.sort((a,b) => a.name.localeCompare(b.name)).forEach(user => {
                    const option = document.createElement('option');
                    option.value = user.techId;
                    option.textContent = `${user.name} (${user.techId})`;
                    select.appendChild(option);
                });
                if(this.state.currentUserTechId) {
                    select.value = this.state.currentUserTechId;
                }
            },

            async handleLeaveRequestSubmit(event) {
                event.preventDefault();
                const techId = document.getElementById('leaveTechId').value;
                const startDate = document.getElementById('leaveStartDate').value;
                const endDate = document.getElementById('leaveEndDate').value;
                const leaveType = document.getElementById('leaveType').value;
                const reason = document.getElementById('leaveReason').value;

                if (!techId || !startDate || !endDate || !leaveType || !reason) {
                    alert("Please fill out all fields.");
                    return;
                }

                if (new Date(startDate) > new Date(endDate)) {
                    alert("Start date cannot be after the end date.");
                    return;
                }

                const leaveData = {
                    techId, startDate, endDate, leaveType, reason,
                    lastUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                this.methods.showLoading.call(this, "Submitting leave request...");
                try {
                    if (this.state.editingLeaveId) {
                        // Update existing request
                        await this.db.collection(this.config.firestorePaths.LEAVE_REQUESTS).doc(this.state.editingLeaveId).update(leaveData);
                        alert("Leave request updated successfully!");
                    } else {
                        // Add new request
                        leaveData.status = 'pending'; // pending, approved, denied
                        leaveData.requestedAt = firebase.firestore.FieldValue.serverTimestamp();
                        await this.db.collection(this.config.firestorePaths.LEAVE_REQUESTS).add(leaveData);
                        alert("Leave request submitted successfully!");
                    }
                    this.methods.resetLeaveForm.call(this);
                    this.methods.fetchLeaveData.call(this); // Re-fetch after submitting
                } catch (error) {
                    console.error("Error submitting leave request:", error);
                    alert("Failed to submit leave request: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            renderLeaveCalendar() {
                const calendarEl = this.elements.leaveCalendar;
                if (!calendarEl || typeof VanillaCalendar === 'undefined') return;
                calendarEl.innerHTML = ''; // Clear previous calendar instance

                const approvedLeaves = this.state.leaveRequests.filter(req => req.status === 'approved');
                const popups = approvedLeaves.reduce((acc, leave) => {
                    let currentDate = new Date(leave.startDate);
                    const endDate = new Date(leave.endDate);

                    while(currentDate <= endDate){
                         const dateStr = currentDate.toISOString().slice(0,10);
                        if (!acc[dateStr]) {
                             acc[dateStr] = { modifier: 'bg-red-500 text-white', html: '' };
                        }
                        acc[dateStr].html += `<div><b>${leave.techId}</b> - <i>${leave.leaveType}</i></div>`;
                        currentDate.setDate(currentDate.getDate() + 1);
                    }
                    return acc;
                }, {});

                const calendar = new VanillaCalendar(calendarEl, {
                     settings: {
                        range: {
                            disablePast: false,
                        },
                         selection: {
                            day: false,
                        },
                    },
                    popups: popups
                });
                calendar.init();
            },

             renderPendingRequests() {
                const pendingList = this.elements.pendingRequestsList;
                pendingList.innerHTML = '';
                const pending = this.state.leaveRequests.filter(req => req.status === 'pending');

                if (pending.length === 0) {
                    pendingList.innerHTML = '<p>No pending requests.</p>';
                    return;
                }

                pending.forEach(req => {
                    const item = document.createElement('div');
                    item.className = 'pending-request-item';
                    let actionsHtml = `
                        <button class="btn btn-success btn-sm btn-approve-leave" data-id="${req.id}">Approve</button>
                        <button class="btn btn-danger btn-sm btn-deny-leave" data-id="${req.id}">Deny</button>
                    `;
                    // Add cancel button if the current user is the one who requested
                    if (req.techId === this.state.currentUserTechId) {
                        actionsHtml += `<button class="btn btn-secondary btn-sm btn-cancel-leave" data-id="${req.id}">Cancel</button>`;
                    }

                    item.innerHTML = `
                        <div class="details">
                           <p><strong>${req.techId}</strong> - ${req.leaveType}</p>
                           <p><strong>Dates:</strong> ${req.startDate} to ${req.endDate}</p>
                           <p><strong>Reason:</strong> ${req.reason}</p>
                        </div>
                        <div class="actions">${actionsHtml}</div>
                    `;
                    pendingList.appendChild(item);
                });

                pendingList.querySelectorAll('.btn-approve-leave, .btn-deny-leave').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const id = e.target.dataset.id;
                        const action = e.target.classList.contains('btn-approve-leave') ? 'approved' : 'denied';
                        const pin = prompt(`Enter admin PIN to ${action} this request:`);
                        if(pin === this.config.pins.TL_DASHBOARD_PIN){
                             this.methods.updateLeaveStatus.call(this, id, action);
                        } else if(pin) {
                            alert("Incorrect PIN.");
                        }
                    });
                });

                 pendingList.querySelectorAll('.btn-cancel-leave').forEach(btn => {
                    btn.addEventListener('click', (e) => this.methods.handleCancelLeaveRequest.call(this, e.target.dataset.id));
                });
            },

             renderAllLeaveRequestsTable() {
                const tableBody = this.elements.allLeaveRequestsBody;
                tableBody.innerHTML = '';
                const isAdmin = true; // Replace with actual admin check logic

                if(this.state.leaveRequests.length === 0){
                    tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No leave requests found.</td></tr>';
                    return;
                }

                this.state.leaveRequests.sort((a, b) => new Date(b.startDate) - new Date(a.startDate)).forEach(req => {
                    const row = tableBody.insertRow();
                    let actionsHtml = '';
                    if (isAdmin) {
                         actionsHtml += `<button class="btn btn-secondary btn-sm btn-edit-leave" data-id="${req.id}">Edit</button>`;
                         actionsHtml += `<button class="btn btn-danger btn-sm btn-delete-leave" data-id="${req.id}">Delete</button>`;
                    }
                    row.innerHTML = `
                        <td>${req.techId}</td>
                        <td>${req.leaveType}</td>
                        <td>${req.startDate}</td>
                        <td>${req.endDate}</td>
                        <td>${req.reason}</td>
                        <td><span class="leave-status-${req.status}">${req.status}</span></td>
                        <td>${actionsHtml}</td>
                    `;
                });

                 tableBody.querySelectorAll('.btn-edit-leave').forEach(btn => {
                    btn.addEventListener('click', (e) => this.methods.handleEditLeaveRequest.call(this, e.target.dataset.id));
                });
                tableBody.querySelectorAll('.btn-delete-leave').forEach(btn => {
                    btn.addEventListener('click', (e) => this.methods.handleDeleteLeaveRequest.call(this, e.target.dataset.id));
                });
            },

            async updateLeaveStatus(id, status) {
                this.methods.showLoading.call(this, "Updating leave status...");
                try {
                    await this.db.collection(this.config.firestorePaths.LEAVE_REQUESTS).doc(id).update({ status });
                    this.methods.fetchLeaveData.call(this); // Re-fetch
                } catch (error) {
                    console.error("Error updating leave status:", error);
                    alert("Failed to update status: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            // NEW Leave Management Functions

            resetLeaveForm() {
                this.state.editingLeaveId = null;
                this.elements.leaveRequestForm.reset();
                this.elements.leaveFormTitle.textContent = 'Submit a New Leave Request';
                this.elements.editingLeaveId.value = '';
                this.elements.leaveFormButtons.innerHTML = `<button type="submit" class="btn btn-primary" style="margin-top: 15px; width: 100%;">Submit Request</button>`;
                if (this.state.currentUserTechId) {
                    document.getElementById('leaveTechId').value = this.state.currentUserTechId;
                }
            },

            handleEditLeaveRequest(id) {
                const request = this.state.leaveRequests.find(r => r.id === id);
                if (!request) return;

                this.state.editingLeaveId = id;

                // Switch to the request tab
                document.querySelector('.leave-tab-button[data-tab="request"]').click();

                // Populate the form
                this.elements.leaveFormTitle.textContent = 'Edit Leave Request';
                document.getElementById('editingLeaveId').value = id;
                document.getElementById('leaveTechId').value = request.techId;
                document.getElementById('leaveStartDate').value = request.startDate;
                document.getElementById('leaveEndDate').value = request.endDate;
                document.getElementById('leaveType').value = request.leaveType;
                document.getElementById('leaveReason').value = request.reason;

                // Update buttons
                this.elements.leaveFormButtons.innerHTML = `
                    <button type="submit" class="btn btn-success" style="margin-top: 15px;">Save Changes</button>
                    <button type="button" id="cancelEditLeaveBtn" class="btn btn-secondary" style="margin-top: 15px;">Cancel Edit</button>
                `;
                document.getElementById('cancelEditLeaveBtn').onclick = () => this.methods.resetLeaveForm.call(this);
            },

            async handleDeleteLeaveRequest(id) {
                 const pin = prompt("Enter admin PIN to delete this request permanently:");
                 if (pin === this.config.pins.TL_DASHBOARD_PIN) {
                    if (confirm("Are you sure you want to permanently delete this leave request? This action cannot be undone.")) {
                        this.methods.showLoading.call(this, "Deleting leave request...");
                        try {
                            await this.db.collection(this.config.firestorePaths.LEAVE_REQUESTS).doc(id).delete();
                            this.methods.fetchLeaveData.call(this); // Re-fetch
                        } catch (error) {
                            console.error("Error deleting leave request:", error);
                            alert("Failed to delete request: " + error.message);
                        } finally {
                            this.methods.hideLoading.call(this);
                        }
                    }
                 } else if (pin) {
                     alert("Incorrect PIN.");
                 }
            },

            async handleCancelLeaveRequest(id) {
                 if (confirm("Are you sure you want to cancel your leave request?")) {
                    this.methods.showLoading.call(this, "Canceling leave request...");
                    try {
                        await this.db.collection(this.config.firestorePaths.LEAVE_REQUESTS).doc(id).delete();
                        this.methods.fetchLeaveData.call(this); // Re-fetch
                    } catch (error) {
                        console.error("Error canceling leave request:", error);
                        alert("Failed to cancel request: " + error.message);
                    } finally {
                        this.methods.hideLoading.call(this);
                    }
                }
            },

             // --- DISPUTE METHODS ---

            injectDisputeModalHTML() {
                const disputeModalHTML = `
                    <div class="modal" id="disputeDetailsModal" style="display: none; z-index: 1001;">
                        <div class="modal-content" style="max-width: 600px;">
                            <div class="modal-header">
                                <h2>Dispute Details</h2>
                                <span class="close-btn" id="closeDisputeDetailsBtn">&times;</span>
                            </div>
                            <div id="disputeDetailsContent" class="dispute-details-container"></div>
                        </div>
                    </div>
                `;
                document.body.insertAdjacentHTML('beforeend', disputeModalHTML);

                const style = document.createElement('style');
                style.innerHTML = `
                    .dispute-details-container {
                        padding-top: 15px;
                        font-size: 0.9em;
                        line-height: 1.6;
                    }
                    .dispute-details-container .detail-row {
                        display: grid;
                        grid-template-columns: 120px 1fr;
                        gap: 10px;
                        padding: 8px 0;
                        border-bottom: 1px solid #eee;
                    }
                    .dispute-details-container .detail-row:last-child {
                        border-bottom: none;
                    }
                    .dispute-details-container .detail-label {
                        font-weight: bold;
                        color: #555;
                    }
                    .dispute-details-container .detail-value {
                        word-break: break-word;
                    }
                    .dispute-details-container .detail-reason {
                        grid-column: 1 / -1;
                        padding-top: 10px;
                    }
                     .dispute-details-container .detail-reason .detail-value {
                        white-space: pre-wrap;
                        background-color: #f9f9f9;
                        padding: 10px;
                        border-radius: 4px;
                    }
                `;
                document.head.appendChild(style);
            },

            async checkForNewDisputes() {
                const lastViewed = firebase.firestore.Timestamp.fromMillis(this.state.lastDisputeViewTimestamp);
                const query = this.db.collection(this.config.firestorePaths.DISPUTES).where("createdAt", ">", lastViewed);
                const snapshot = await query.get();
                this.state.newDisputesCount = snapshot.size;
                this.methods.updateDisputeBadge.call(this);
            },

            async fetchDisputes() {
                try {
                    const snapshot = await this.db.collection(this.config.firestorePaths.DISPUTES).orderBy("createdAt", "desc").get();
                    this.state.disputes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    this.methods.renderDisputes.call(this);
                } catch (error) {
                    console.error("Error fetching disputes:", error);
                }
            },

            updateDisputeBadge() {
                const badge = this.elements.disputeNotificationBadge;
                if (badge) {
                    if (this.state.newDisputesCount > 0) {
                        badge.textContent = this.state.newDisputesCount;
                        badge.style.display = 'flex';
                        badge.style.alignItems = 'center';
                        badge.style.justifyContent = 'center';
                        badge.style.fontSize = '10px';
                        badge.style.width = '16px';
                        badge.style.height = '16px';
                        badge.style.top = '-5px';
                        badge.style.right = '-5px';
                    } else {
                        badge.style.display = 'none';
                    }
                }
            },

            async openDisputeModal() {
                // Use the comprehensive list of all project names.
                this.elements.disputeProjectName.innerHTML = '<option value="">Select Project</option>' + this.state.allUniqueProjectNames.map(name => `<option value="${name}">${name}</option>`).join('');

                this.elements.disputeTechId.innerHTML = '<option value="">Select Tech ID</option>' + this.state.users.map(user => `<option value="${user.techId}" data-name="${user.name}">${user.techId}</option>`).join('');

                this.elements.disputeForm.reset();
                this.elements.disputeTechName.value = '';
            },

            async handleDisputeFormSubmit(event) {
                event.preventDefault();

                const getElValue = (id) => document.getElementById(id)?.value || '';

                const disputeData = {
                    blockId: getElValue('disputeBlockId'),
                    projectName: getElValue('disputeProjectName'),
                    partial: getElValue('disputePartial'),
                    phase: getElValue('disputePhase'),
                    uid: getElValue('disputeUid'),
                    techId: getElValue('disputeTechId'),
                    techName: getElValue('disputeTechName'),
                    team: getElValue('disputeTeam'),
                    type: getElValue('disputeType'),
                    category: getElValue('disputeCategory'),
                    warning: getElValue('disputeWarning'),
                    rqaTechId: getElValue('disputeRqaTechId'),
                    reason: getElValue('disputeReason'),
                    status: 'Pending',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                this.methods.showLoading.call(this, "Saving dispute...");
                try {
                    await this.db.collection(this.config.firestorePaths.DISPUTES).add(disputeData);
                    this.elements.disputeForm.reset();
                    this.elements.disputeTechName.value = '';
                    this.methods.fetchDisputes.call(this); // Re-fetch after submitting
                } catch(error) {
                    console.error("Error saving dispute:", error);
                    alert("Failed to save dispute: " + error.message);
                } finally {
                    this.methods.hideLoading.call(this);
                }
            },

            renderDisputes() {
                const tableBody = this.elements.disputeTableBody;
                tableBody.innerHTML = '';
                this.state.disputePagination.totalPages = Math.ceil(this.state.disputes.length / this.state.disputePagination.disputesPerPage);

                const startIndex = (this.state.disputePagination.currentPage - 1) * this.state.disputePagination.disputesPerPage;
                const endIndex = startIndex + this.state.disputePagination.disputesPerPage;
                const disputesToRender = this.state.disputes.slice(startIndex, endIndex);

                if(disputesToRender.length === 0) {
                     tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No disputes filed yet.</td></tr>';
                } else {
                    disputesToRender.forEach(d => {
                        const row = tableBody.insertRow();
                        row.innerHTML = `
                            <td>${d.blockId}</td>
                            <td>${d.projectName}</td>
                            <td>${d.phase}</td>
                            <td>${d.techId}</td>
                            <td>${d.team}</td>
                            <td>${d.type}</td>
                            <td><span class="dispute-status-${d.status.toLowerCase()}">${d.status}</span></td>
                            <td>
                                <button class="btn btn-info btn-sm btn-view-dispute" data-id="${d.id}">View</button>
                                <button class="btn btn-secondary btn-sm btn-copy-dispute" data-id="${d.id}">Copy</button>
                                <button class="btn btn-success btn-sm btn-mark-dispute-done" data-id="${d.id}" ${d.status === 'Done' ? 'disabled' : ''}>Done</button>
                                <button class="btn btn-danger btn-sm btn-delete-dispute" data-id="${d.id}">Delete</button>
                            </td>
                        `;
                    });
                }
                this.methods.renderDisputePagination.call(this);
            },

            renderDisputePagination() {
                const { currentPage, totalPages } = this.state.disputePagination;
                if (totalPages > 1) {
                    this.elements.disputePageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
                    this.elements.disputePaginationControls.style.display = 'block';
                } else {
                    this.elements.disputePaginationControls.style.display = 'none';
                }
                this.elements.prevDisputePageBtn.disabled = currentPage <= 1;
                this.elements.nextDisputePageBtn.disabled = currentPage >= totalPages;
            },

            handleNextDisputePage() {
                if (this.state.disputePagination.currentPage < this.state.disputePagination.totalPages) {
                    this.state.disputePagination.currentPage++;
                    this.methods.renderDisputes.call(this);
                }
            },

            handlePrevDisputePage() {
                if (this.state.disputePagination.currentPage > 1) {
                    this.state.disputePagination.currentPage--;
                    this.methods.renderDisputes.call(this);
                }
            },

            handleDisputeTableActions(event) {
                const button = event.target;
                const id = button.dataset.id;
                if (!id) return;

                if (button.classList.contains('btn-view-dispute')) {
                    this.methods.handleViewDispute.call(this, id);
                } else if (button.classList.contains('btn-copy-dispute')) {
                    this.methods.handleCopyDispute.call(this, id);
                } else if (button.classList.contains('btn-mark-dispute-done')) {
                     this.methods.handleMarkDisputeDone.call(this, id);
                } else if (button.classList.contains('btn-delete-dispute')) {
                    this.methods.handleDeleteDispute.call(this, id);
                }
            },

            handleViewDispute(id) {
                this.methods.showDisputeDetailsModal.call(this, id);
            },

            showDisputeDetailsModal(id) {
                const dispute = this.state.disputes.find(d => d.id === id);
                if (!dispute) return;

                const content = this.elements.disputeDetailsContent;
                content.innerHTML = `
                    <div class="detail-row"><span class="detail-label">Block ID:</span><span class="detail-value">${dispute.blockId}</span></div>
                    <div class="detail-row"><span class="detail-label">Project:</span><span class="detail-value">${dispute.projectName}</span></div>
                    <div class="detail-row"><span class="detail-label">Partial:</span><span class="detail-value">${dispute.partial}</span></div>
                    <div class="detail-row"><span class="detail-label">Phase:</span><span class="detail-value">${dispute.phase}</span></div>
                    <div class="detail-row"><span class="detail-label">UID:</span><span class="detail-value">${dispute.uid}</span></div>
                    <div class="detail-row"><span class="detail-label">Tech ID:</span><span class="detail-value">${dispute.techId} (${dispute.techName})</span></div>
                    <div class="detail-row"><span class="detail-label">Team:</span><span class="detail-value">${dispute.team}</span></div>
                    <div class="detail-row"><span class="detail-label">Type:</span><span class="detail-value">${dispute.type}</span></div>
                    <div class="detail-row"><span class="detail-label">Category:</span><span class="detail-value">${dispute.category}</span></div>
                    <div class="detail-row"><span class="detail-label">Warning:</span><span class="detail-value">${dispute.warning}</span></div>
                    <div class="detail-row"><span class="detail-label">RQA TechID:</span><span class="detail-value">${dispute.rqaTechId || 'N/A'}</span></div>
                    <div class="detail-row detail-reason">
                        <span class="detail-label">Detailed Reason:</span>
                        <div class="detail-value">${dispute.reason}</div>
                    </div>
                `;

                this.elements.disputeDetailsModal.style.display = 'block';
            },

            handleCopyDispute(id) {
                 const dispute = this.state.disputes.find(d => d.id === id);
                 if (!dispute) return;

                const textToCopy = `
Block ID: ${dispute.blockId}
Project Name: ${dispute.projectName}
Partial: ${dispute.partial}
Phase: ${dispute.phase}
UID: ${dispute.uid}
Tech ID: ${dispute.techId}
Tech Name: ${dispute.techName}
Team: ${dispute.team}
Type: ${dispute.type}
Category: ${dispute.category}
Warning: ${dispute.warning}
RQA TechID: ${dispute.rqaTechId}
Reason: ${dispute.reason}
Status: ${dispute.status}
                `.trim();

                navigator.clipboard.writeText(textToCopy).then(() => {
                    alert("Dispute details copied to clipboard.");
                }).catch(err => {
                    console.error("Failed to copy dispute details: ", err);
                    alert("Could not copy details.");
                });
            },

             async handleMarkDisputeDone(id) {
                 if (confirm("Are you sure you want to mark this dispute as 'Done'?")) {
                    try {
                        await this.db.collection(this.config.firestorePaths.DISPUTES).doc(id).update({ status: 'Done' });
                        this.methods.fetchDisputes.call(this); // Re-fetch
                    } catch (error) {
                        console.error("Error marking dispute as done:", error);
                        alert("Failed to update dispute status.");
                    }
                 }
            },

            async handleDeleteDispute(id) {
                if(confirm("Are you sure you want to delete this dispute? This action is permanent.")) {
                    try {
                        await this.db.collection(this.config.firestorePaths.DISPUTES).doc(id).delete();
                        this.methods.fetchDisputes.call(this); // Re-fetch
                    } catch(error) {
                        console.error("Error deleting dispute:", error);
                        alert("Failed to delete dispute.");
                    }
                }
            },
        }
    };

    // --- KICK OFF THE APPLICATION ---
    ProjectTrackerApp.init();

});
