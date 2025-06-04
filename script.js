const firebaseConfig = {
  apiKey: "AIzaSyAblGk1BHPF3J6w--Ii1pfDyKqcN-MFZyQ",
  authDomain: "time-tracker-41701.firebaseapp.com",
  projectId: "time-tracker-41701",
  storageBucket: "time-tracker-41701.firebasestorage.app",
  messagingSenderId: "401097667777",
  appId: "1:401097667777:web:d6c0c6e7741a2046945040",
  measurementId: "G-BY9CV5ZQ11"
};

let app, db, auth, signInBtn, signOutBtn, userInfoDisplayDiv, userNameP, userEmailP, userPhotoImg, appContentDiv, loadingAuthMessageDiv, loadingOverlay;

const TL_DASHBOARD_PIN = "1234",
  ALLOWED_EMAILS_DOC_REF_PATH = "settings/allowedEmails";

let allowedEmailsFromFirestore = [];

const TECH_IDS = ["4232JD", "7248AA", "4426KV", "4472JS", "7236LE", "4475JT", "7039NO", "7231NR", "7240HH", "7247JA", "7249SS", "7244AA", "7314VP"];
TECH_IDS.sort();

try {
  if (typeof firebase === "undefined" || void 0 === firebase.initializeApp) throw Error("Firebase SDK not loaded. Ensure Firebase scripts are correctly included.");
  if (app = firebase.initializeApp(firebaseConfig), void 0 === app.firestore) throw Error("Firestore SDK not loaded or initialized correctly with the app.");
  if (db = firebase.firestore(), void 0 === app.auth) throw Error("Firebase Auth SDK not loaded or initialized correctly with the app.");
  auth = firebase.auth(), console.log("Firebase initialized successfully (App, Firestore, Auth)!"), fetchAllowedEmails()
} catch (e) {
  console.error("CRITICAL: Error initializing Firebase: ", e.message);
  let t = document.getElementById("loading-auth-message");
  t ? t.innerHTML = `<p style="color:red;">CRITICAL ERROR: Could not connect to Firebase. App will not function correctly. Error: ${e.message}</p>` : alert("CRITICAL ERROR: Could not connect to Firebase. App will not function correctly. Error: " + e.message)
}

const FIX_CATEGORIES_ORDER = ["Fix1", "Fix2", "Fix3", "Fix4", "Fix5", "Fix6"],
  STATUS_ORDER = {
    Available: 1,
    InProgressDay1: 2,
    Day1Ended_AwaitingNext: 3,
    InProgressDay2: 4,
    Day2Ended_AwaitingNext: 5,
    InProgressDay3: 6,
    Completed: 7,
    Reassigned_TechAbsent: 8
  },
  NUM_TABLE_COLUMNS = 15;

let openAddNewProjectBtn, openTlDashboardBtn, openSettingsBtn, projectFormModal, tlDashboardModal, settingsModal, closeProjectFormBtn, closeTlDashboardBtn, closeSettingsBtn, newProjectForm, projectTableBody, tlDashboardContentElement, allowedEmailsList, addEmailInput, addEmailBtn, tlSummaryModal, closeTlSummaryBtn, tlSummaryContent, openTlSummaryBtn, projects = [],
  groupVisibilityState = {},
  isAppInitialized = !1,
  firestoreListenerUnsubscribe = null,
  batchIdSelect, fixCategoryFilter, monthFilter, currentSelectedBatchId = localStorage.getItem("currentSelectedBatchId") || "",
  currentSelectedFixCategory = "",
  currentSelectedMonth = localStorage.getItem("currentSelectedMonth") || "";

function showLoading(e = "Loading...") {
  loadingOverlay && (loadingOverlay.querySelector("p").textContent = e, loadingOverlay.style.display = "flex")
}

function hideLoading() {
  loadingOverlay && (loadingOverlay.style.display = "none")
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5)
}

function formatMillisToMinutes(e) {
  return null === e || "number" != typeof e || e < 0 ? "N/A" : Math.floor(e / 6e4)
}

function calculateDurationMs(e, t) {
  let a = e,
    i = t;
  if (e && "function" == typeof e.toMillis && (a = e.toMillis()), t && "function" == typeof t.toMillis) i = t.toMillis();
  else if ("number" == typeof e && "number" == typeof t);
  else if (e && "function" == typeof e.toMillis && "number" == typeof t);
  else if ("number" == typeof e && t && "function" == typeof t.toMillis);
  else {
    if (!e || !t) return null;
    "number" == typeof e || isNaN(new Date(e).getTime()) || (a = new Date(e).getTime()), "number" == typeof t || isNaN(new Date(t).getTime()) || (i = new Date(t).getTime())
  }
  return !a || !i || i < a || isNaN(a) || isNaN(i) ? null : i - a
}

function loadGroupVisibilityState() {
  try {
    let e = localStorage.getItem("projectTrackerGroupVisibility");
    groupVisibilityState = e ? JSON.parse(e) : {}
  } catch (t) {
    console.error("Error parsing group visibility state from localStorage:", t), groupVisibilityState = {}
  }
}

function saveGroupVisibilityState() {
  try {
    localStorage.setItem("projectTrackerGroupVisibility", JSON.stringify(groupVisibilityState))
  } catch (e) {
    console.error("Error saving group visibility state to localStorage:", e), alert("Warning: Could not save your group visibility preferences.")
  }
}

async function fetchAllowedEmails() {
  if (showLoading("Fetching allowed emails..."), !db) {
    console.error("Firestore (db) not initialized. Cannot fetch allowed emails."), hideLoading();
    return
  }
  try {
    let e = db.doc(ALLOWED_EMAILS_DOC_REF_PATH),
      t = await e.get();
    allowedEmailsFromFirestore = t.exists ? t.data().emails || [] : ["znerolodarbe@gmail.com"]
  } catch (a) {
    console.error("Error fetching allowed emails:", a), allowedEmailsFromFirestore = ["znerolodarbe@gmail.com"]
  } finally {
    hideLoading()
  }
}

async function updateAllowedEmailsInFirestore(e) {
  if (showLoading("Updating allowed emails..."), !db) return alert("Database not initialized! Cannot update allowed emails."), hideLoading(), !1;
  let t = db.doc(ALLOWED_EMAILS_DOC_REF_PATH);
  try {
    return await t.set({
      emails: e
    }), allowedEmailsFromFirestore = e, !0
  } catch (a) {
    return console.error("Error updating allowed emails in Firestore:", a), alert("Error saving allowed emails. Error: " + a.message), !1
  } finally {
    hideLoading()
  }
}

async function initializeFirebaseAndLoadData() {
  if (showLoading("Loading projects..."), !db) {
    projects = [], refreshAllViews(), hideLoading();
    return
  }
  firestoreListenerUnsubscribe && firestoreListenerUnsubscribe(), loadGroupVisibilityState();
  let e = db.collection("projects"), // query variable
    t_snapshot = await db.collection("projects").orderBy("creationTimestamp", "desc").get(), // initialSnapshotForMonths
    a_months = new Set; // uniqueMonths
  t_snapshot.forEach(doc => { // Renamed 'e' to 'doc'
    let data = doc.data(); // Renamed 't' to 'data'
    if (data.creationTimestamp) {
      let i_date = data.creationTimestamp.toDate(), // creationDate
        n_monthYear = `${i_date.getFullYear()}-${String(i_date.getMonth()+1).padStart(2,"0")}`; // monthYear
      a_months.add(n_monthYear)
    }
  }), monthFilter.innerHTML = '<option value="">All Months</option>', Array.from(a_months).sort((e_month, t_month) => t_month.localeCompare(e_month)).forEach(monthYear => { // Renamed 'e' to 'monthYear'
    let [year, month_num_str] = monthYear.split("-"), // Renamed 't','a' to 'year','month_num_str'
      i_date_obj = new Date(year, parseInt(month_num_str) - 1, 1), // dateObjForMonthName
      n_option = document.createElement("option"); // optionElement
    n_option.value = monthYear, n_option.textContent = i_date_obj.toLocaleString("en-US", {
      year: "numeric",
      month: "long"
    }), monthFilter.appendChild(n_option)
  }), currentSelectedMonth && Array.from(a_months).includes(currentSelectedMonth) ? monthFilter.value = currentSelectedMonth : (currentSelectedMonth = "", monthFilter.value = "", localStorage.setItem("currentSelectedMonth", ""));
  
  let i_query = db.collection("projects").orderBy("creationTimestamp", "desc"); // baseQueryForBatchPopulation
  if (currentSelectedMonth) {
    let [n_year, r_month] = currentSelectedMonth.split("-"), // year, month
      s_startDate = new Date(parseInt(n_year), parseInt(r_month) - 1, 1), // startDate
      o_endDate = new Date(parseInt(n_year), parseInt(r_month), 0, 23, 59, 59, 999); // endDate
    i_query = i_query.where("creationTimestamp", ">=", s_startDate).where("creationTimestamp", "<=", o_endDate)
  }
  let l_batch_snapshot = await i_query.get(), // snapshotForBatchPopulation
    d_batch_ids = new Set, // uniqueBatchIds
    c_batch_names = {}; // batchIdToBaseNameMap
  if (l_batch_snapshot.forEach(doc => { // Renamed 'e' to 'doc'
      let data = doc.data(); // Renamed 't' to 'data'
      data.batchId && (d_batch_ids.add(data.batchId), c_batch_names[data.batchId] = data.baseProjectName)
    }), batchIdSelect.innerHTML = "", 0 === d_batch_ids.size) {
    let u_option = document.createElement("option"); // noBatchOption
    u_option.value = "", u_option.textContent = "No batches available", u_option.disabled = !0, u_option.selected = !0, batchIdSelect.appendChild(u_option), currentSelectedBatchId = "", localStorage.setItem("currentSelectedBatchId", ""), projects = [], refreshAllViews(), hideLoading();
    return
  } {
    let m_sorted_batches = Array.from(d_batch_ids).sort((batchA, batchB) => { // sortedBatchIds // Renamed 'e','t' to 'batchA','batchB'
      let a_doc = l_batch_snapshot.docs.find(doc => doc.data().batchId === batchA), // docA // Renamed 't' to 'doc'
        i_doc = l_batch_snapshot.docs.find(doc => doc.data().batchId === batchB); // docB // Renamed 'e' to 'doc'
      return a_doc && i_doc && a_doc.data().creationTimestamp && i_doc.data().creationTimestamp ? i_doc.data().creationTimestamp.toMillis() - a_doc.data().creationTimestamp.toMillis() : batchA.localeCompare(batchB)
    });
    m_sorted_batches.forEach(batchId => { // Renamed 'e' to 'batchId'
      let t_option = document.createElement("option"); // batchOption
      t_option.value = batchId, t_option.textContent = `${c_batch_names[batchId]||"Unknown Project"}`, batchIdSelect.appendChild(t_option)
    }), currentSelectedBatchId && d_batch_ids.has(currentSelectedBatchId) || (currentSelectedBatchId = m_sorted_batches[0], localStorage.setItem("currentSelectedBatchId", currentSelectedBatchId)), batchIdSelect.value !== currentSelectedBatchId && (batchIdSelect.value = currentSelectedBatchId)
  }
  
  e = db.collection("projects"); // Reset 'e' to be the base query for projects
  if (currentSelectedBatchId) {
    e = e.where("batchId", "==", currentSelectedBatchId)
  }
  if (currentSelectedFixCategory) {
    e = e.where("fixCategory", "==", currentSelectedFixCategory)
  }
  
  // Apply month filter if it hasn't been applied already for batch selection
  if (currentSelectedMonth && !l_batch_snapshot) { // l_batch_snapshot would be undefined if batch selection part was skipped
    let [n_year, r_month] = currentSelectedMonth.split("-"),
      s_startDate = new Date(parseInt(n_year), parseInt(r_month) - 1, 1),
      o_endDate = new Date(parseInt(n_year), parseInt(r_month), 0, 23, 59, 59, 999);
    e = e.where("creationTimestamp", ">=", s_startDate).where("creationTimestamp", "<=", o_endDate);
  }

  e = e.orderBy("creationTimestamp", "desc").orderBy("fixCategory").orderBy("areaTask"); // Add creationTimestamp sort again if month filter active

  try {
    firestoreListenerUnsubscribe = e.onSnapshot(snapshot => { // Renamed 'e' to 'snapshot'
      let tempProjects = []; // Renamed 't' to 'tempProjects'
      snapshot.forEach(doc => { // Renamed 'e' to 'doc'
        doc.exists && "function" == typeof doc.data && tempProjects.push({
          id: doc.id,
          ...doc.data()
        })
      });
      projects = tempProjects; // Assign to global projects
      projects.forEach(proj => { // Renamed 'e' to 'proj'
        let groupKey = `${proj.batchId}_${proj.fixCategory}`; // Renamed 't' to 'groupKey'
        void 0 === groupVisibilityState[groupKey] && (groupVisibilityState[groupKey] = {
          isExpanded: !0
        }), void 0 === proj.breakDurationMinutes && (proj.breakDurationMinutes = 0), void 0 === proj.additionalMinutesManual && (proj.additionalMinutesManual = 0), void 0 === proj.startTimeDay3 && (proj.startTimeDay3 = null), void 0 === proj.finishTimeDay3 && (proj.finishTimeDay3 = null), void 0 === proj.durationDay3Ms && (proj.durationDay3Ms = null)
      }), refreshAllViews()
    }, error => { // Renamed 'e' to 'error'
      console.error("Error fetching projects: ", error), projects = [], refreshAllViews(), alert("Error loading projects: " + error.message)
    })
  } catch (g_error) { // Renamed 'g' to 'g_error'
    console.error("Error setting up Firebase listener: ", g_error), alert("CRITICAL ERROR: Could not set up real-time project updates. Error: " + g_error.message)
  } finally {
    hideLoading()
  }
}

function setupDOMReferences() {
  openAddNewProjectBtn = document.getElementById("openAddNewProjectBtn"), openTlDashboardBtn = document.getElementById("openTlDashboardBtn"), openSettingsBtn = document.getElementById("openSettingsBtn"), projectFormModal = document.getElementById("projectFormModal"), tlDashboardModal = document.getElementById("tlDashboardModal"), settingsModal = document.getElementById("settingsModal"), closeProjectFormBtn = document.getElementById("closeProjectFormBtn"), closeTlDashboardBtn = document.getElementById("closeTlDashboardBtn"), closeSettingsBtn = document.getElementById("closeSettingsBtn"), newProjectForm = document.getElementById("newProjectForm"), projectTableBody = document.getElementById("projectTableBody"), tlDashboardContentElement = document.getElementById("tlDashboardContent"), allowedEmailsList = document.getElementById("allowedEmailsList"), addEmailInput = document.getElementById("addEmailInput"), addEmailBtn = document.getElementById("addEmailBtn"), tlSummaryModal = document.getElementById("tlSummaryModal"), closeTlSummaryBtn = document.getElementById("closeTlSummaryBtn"), tlSummaryContent = document.getElementById("tlSummaryContent"), openTlSummaryBtn = document.getElementById("openTlSummaryBtn"), loadingOverlay = document.getElementById("loadingOverlay"), batchIdSelect = document.getElementById("batchIdSelect"), fixCategoryFilter = document.getElementById("fixCategoryFilter"), monthFilter = document.getElementById("monthFilter")
}

function setupAuthRelatedDOMReferences() {
  signInBtn = document.getElementById("signInBtn"), signOutBtn = document.getElementById("signOutBtn"), userInfoDisplayDiv = document.getElementById("user-info-display"), userNameP = document.getElementById("userName"), userEmailP = document.getElementById("userEmail"), userPhotoImg = document.getElementById("userPhoto"), appContentDiv = document.getElementById("app-content"), loadingAuthMessageDiv = document.getElementById("loading-auth-message")
}

function attachEventListeners() {
  openAddNewProjectBtn && (openAddNewProjectBtn.onclick = () => {
    let e = prompt("Enter PIN to add new tracker:");
    if ("1234" !== e) {
      alert("Incorrect PIN.");
      return
    }
    projectFormModal.style.display = "block"
  }), closeProjectFormBtn && (closeProjectFormBtn.onclick = () => {
    newProjectForm.reset(), projectFormModal.style.display = "none"
  }), openTlDashboardBtn && (openTlDashboardBtn.onclick = () => {
    let e = prompt("Enter PIN to access Project Settings:");
    "1234" === e ? (tlDashboardModal.style.display = "block", renderTLDashboard()) : alert("Incorrect PIN.")
  }), closeTlDashboardBtn && (closeTlDashboardBtn.onclick = () => {
    tlDashboardModal.style.display = "none"
  }), openSettingsBtn && (openSettingsBtn.onclick = () => {
    let e = prompt("Enter PIN to access User Settings:");
    if ("1234" !== e) {
      alert("Incorrect PIN.");
      return
    }
    settingsModal.style.display = "block", renderAllowedEmailsList()
  }), closeSettingsBtn && (closeSettingsBtn.onclick = () => {
    settingsModal.style.display = "none"
  }), addEmailBtn && (addEmailBtn.onclick = handleAddEmail), openTlSummaryBtn && (openTlSummaryBtn.onclick = () => {
    tlSummaryModal.style.display = "block", generateTlSummaryData()
  }), closeTlSummaryBtn && (closeTlSummaryBtn.onclick = () => {
    tlSummaryModal.style.display = "none"
  }), batchIdSelect && (batchIdSelect.onchange = e => {
    currentSelectedBatchId = e.target.value, localStorage.setItem("currentSelectedBatchId", currentSelectedBatchId), initializeFirebaseAndLoadData()
  }), fixCategoryFilter && (fixCategoryFilter.onchange = e => {
    currentSelectedFixCategory = e.target.value, initializeFirebaseAndLoadData()
  }), monthFilter && (monthFilter.onchange = e => {
    currentSelectedMonth = e.target.value, localStorage.setItem("currentSelectedMonth", currentSelectedMonth), currentSelectedBatchId = "", localStorage.setItem("currentSelectedBatchId", ""), initializeFirebaseAndLoadData()
  }), "undefined" != typeof window && (window.onclick = e => {
    e.target == projectFormModal && (projectFormModal.style.display = "none"), e.target == tlDashboardModal && (tlDashboardModal.style.display = "none"), e.target == settingsModal && (settingsModal.style.display = "none"), e.target == tlSummaryModal && (tlSummaryModal.style.display = "none")
  }), newProjectForm && newProjectForm.addEventListener("submit", handleAddProjectSubmit), setupAuthEventListeners()
}

async function handleAddProjectSubmit(e) {
  if (e.preventDefault(), showLoading("Adding project(s)..."), !db) {
    alert("Database not initialized!"), hideLoading();
    return
  }
  let t = document.getElementById("fixCategorySelect").value,
    a = parseInt(document.getElementById("numRows").value, 10),
    i = document.getElementById("baseProjectName").value.trim(),
    n = document.getElementById("gsd").value;
  if (!i || isNaN(a) || a < 1) {
    alert("Invalid input. Please ensure Project Name is not empty and Number of Tasks is at least 1."), hideLoading();
    return
  }
  let r = "batch_" + generateId(),
    s = firebase.firestore.FieldValue.serverTimestamp(),
    o = db.batch();
  try {
    for (let l = 1; l <= a; l++) {
      let d = {
        batchId: r,
        creationTimestamp: s,
        fixCategory: t,
        baseProjectName: i,
        areaTask: `Area${String(l).padStart(2,"0")}`,
        gsd: n,
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
        releasedToNextStage: !1,
        lastModifiedTimestamp: s,
        isReassigned: !1,
        originalProjectId: null,
        breakDurationMinutes: 0,
        additionalMinutesManual: 0
      };
      o.set(db.collection("projects").doc(), d)
    }
    await o.commit(), newProjectForm.reset(), currentSelectedBatchId = r, localStorage.setItem("currentSelectedBatchId", currentSelectedBatchId), currentSelectedMonth = "", localStorage.setItem("currentSelectedMonth", ""), initializeFirebaseAndLoadData()
  } catch (c) {
    console.error("Error adding projects: ", c), alert("Error adding projects: " + c.message)
  } finally {
    projectFormModal.style.display = "none", hideLoading()
  }
}

async function getManageableBatches() {
  if (!db) return console.error("DB not initialized for getManageableBatches."), [];
  showLoading("Loading batches for dashboard...");
  try {
    let e = await db.collection("projects").get(),
      t = {};
    return e.forEach(e => {
      let a = e.data();
      a && a.batchId && (t[a.batchId] || (t[a.batchId] = {
        batchId: a.batchId,
        baseProjectName: a.baseProjectName || "N/A",
        tasksByFix: {}
      }), a.fixCategory && (t[a.batchId].tasksByFix[a.fixCategory] || (t[a.batchId].tasksByFix[a.fixCategory] = []), t[a.batchId].tasksByFix[a.fixCategory].push(a)))
    }), Object.values(t)
  } catch (a) {
    return console.error("Error fetching batches for dashboard:", a), alert("Error fetching batches for dashboard: " + a.message), []
  } finally {
    hideLoading()
  }
}

async function renderTLDashboard() {
  if (!tlDashboardContentElement) {
    console.error("tlDashboardContentElement not found.");
    return
  }
  tlDashboardContentElement.innerHTML = "";
  let e = await getManageableBatches();
  if (0 === e.length) {
    tlDashboardContentElement.innerHTML = "<p>No project batches found.</p>";
    return
  }
  e.forEach(e => {
    if (!e || !e.batchId) return;
    let t = document.createElement("div");
    t.classList.add("dashboard-batch-item");
    let a = document.createElement("h4");
    a.textContent = `Batch: ${e.baseProjectName||"Unknown"} (ID: ${e.batchId.split("_")[1]||"N/A"})`, t.appendChild(a);
    let i = document.createElement("p"),
      n = e.tasksByFix ? Object.keys(e.tasksByFix).sort((e, t) => FIX_CATEGORIES_ORDER.indexOf(e) - FIX_CATEGORIES_ORDER.indexOf(t)) : [];
    i.innerHTML = `<strong>Stages Present:</strong> ${n.join(", ")||"None"}`, t.appendChild(i);
    let r = document.createElement("div");
    r.classList.add("dashboard-batch-actions-release");
    let s = "",
      o = !1,
      l = !0;
    if (e.tasksByFix && FIX_CATEGORIES_ORDER.slice().reverse().forEach(t => {
        !e.tasksByFix[t] || !(e.tasksByFix[t].length > 0) || s || (s = t, (l = e.tasksByFix[t].every(e => e && e.releasedToNextStage && "Reassigned_TechAbsent" !== e.status)) || (o = e.tasksByFix[t].filter(e => "Reassigned_TechAbsent" !== e.status).every(e => e && ("Completed" === e.status || "Day1Ended_AwaitingNext" === e.status || "Day2Ended_AwaitingNext" === e.status))))
      }), s && !l) {
      let d = FIX_CATEGORIES_ORDER.indexOf(s);
      if (d < FIX_CATEGORIES_ORDER.length - 1) {
        let c = FIX_CATEGORIES_ORDER[d + 1],
          u = document.createElement("button");
        u.textContent = `Release to ${c}`, u.classList.add("btn", "btn-release"), o || (u.disabled = !0, u.title = `Not all active tasks in ${s} are 'Completed' or 'Day 1 Ended' or 'Day 2 Ended'.`), u.onclick = () => releaseBatchToNextFix(e.batchId, s, c), r.appendChild(u)
      }
    } else if (l && s && FIX_CATEGORIES_ORDER.indexOf(s) < FIX_CATEGORIES_ORDER.length - 1) {
      let m = document.createElement("p");
      m.innerHTML = `<small><em>(Active tasks released from ${s})</em></small>`, r.appendChild(m)
    }
    t.appendChild(r);
    let g = document.createElement("div");
    g.classList.add("dashboard-batch-actions-delete"), e.tasksByFix && FIX_CATEGORIES_ORDER.forEach(t => {
      if (e.tasksByFix[t] && e.tasksByFix[t].length > 0) {
        let a = document.createElement("button");
        a.textContent = `Delete ${t} Tasks`, a.classList.add("btn", "btn-danger"), a.onclick = () => {
          confirm(`Are you sure you want to delete all ${t} tasks for batch '${e.baseProjectName||"Unknown"}'? IRREVERSIBLE.`) && deleteSpecificFixTasksForBatch(e.batchId, t)
        }, g.appendChild(a)
      }
    });
    let y = document.createElement("button");
    y.textContent = "Delete ALL Tasks for this Batch", y.classList.add("btn", "btn-danger"), y.onclick = () => {
      confirm(`Are-you sure you want to delete ALL tasks for batch '${e.baseProjectName||"Unknown"}'? IRREVERSIBLE.`) && deleteProjectBatch(e.batchId)
    }, g.appendChild(y), t.appendChild(g), tlDashboardContentElement.appendChild(t)
  })
}

async function releaseBatchToNextFix(e, t, a) {
  if (showLoading(`Releasing ${t} tasks...`), !db) {
    alert("Database not initialized!"), hideLoading();
    return
  }
  try {
    let i = await db.collection("projects").where("batchId", "==", e).where("fixCategory", "==", t).where("releasedToNextStage", "==", !1).get();
    if (i.empty) {
      alert("No active tasks to release in the current stage for this batch."), refreshAllViews(); // refreshAllViews might not be needed if initializeFirebaseAndLoadData is called later
      hideLoading(); // Added hideLoading here
      return
    }
    let n = [];
    if (i.forEach(e => {
        let t = e.data();
        "Reassigned_TechAbsent" !== t.status && n.push({
          id: e.id,
          ...t
        })
      }), 0 === n.length) {
      alert("No active tasks to release after filtering out reassigned ones."), refreshAllViews(); // Same as above
      hideLoading(); // Added hideLoading here
      return
    }
    let r = n.every(e => e && ("Completed" === e.status || "Day1Ended_AwaitingNext" === e.status || "Day2Ended_AwaitingNext" === e.status));
    if (!r) {
      alert(`Not all active tasks in ${t} are 'Completed', 'Day 1 Ended', or 'Day 2 Ended'. Cannot release.`);
      hideLoading(); // Added hideLoading here
      return
    }
    let s = firebase.firestore.FieldValue.serverTimestamp(),
      o = db.batch();
    for (let l of n) {
      if (!l || !l.id) continue;
      let d = db.collection("projects").where("batchId", "==", l.batchId).where("areaTask", "==", l.areaTask).where("fixCategory", "==", a),
        c = await d.get();
      if (c.empty) {
        let u = {
          batchId: l.batchId,
          creationTimestamp: l.creationTimestamp,
          fixCategory: a,
          baseProjectName: l.baseProjectName,
          areaTask: l.areaTask,
          gsd: l.gsd,
          assignedTo: l.assignedTo, // Should this be cleared or kept? Kept for now.
          techNotes: "", // Cleared for new stage
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
          releasedToNextStage: !1,
          lastModifiedTimestamp: s,
          isReassigned: !1, // New task is not a reassignment itself
          originalProjectId: l.id, // Link to the task from the previous stage
          breakDurationMinutes: 0, // Reset break
          additionalMinutesManual: 0 // Reset additional minutes
        };
        o.set(db.collection("projects").doc(), u)
      }
      o.update(db.collection("projects").doc(l.id), {
        releasedToNextStage: !0,
        lastModifiedTimestamp: s
      })
    }
    await o.commit(), initializeFirebaseAndLoadData() // This will refresh views
  } catch (m) {
    console.error("Error releasing batch:", m), alert("Error releasing batch: " + m.message)
  } finally {
    hideLoading() // Ensure loading is hidden
  }
}

async function deleteProjectBatch(e) {
  if (showLoading("Deleting batch..."), !db || !e) {
    alert("Invalid request to delete batch."), hideLoading();
    return
  }
  try {
    let t = await db.collection("projects").where("batchId", "==", e).get();
    if (t.empty) {
      console.log("No tasks found for batch ID to delete:", e), hideLoading();
      return
    }
    let a = db.batch();
    t.forEach(e => a.delete(e.ref)), await a.commit(), currentSelectedBatchId === e && (currentSelectedBatchId = "", localStorage.setItem("currentSelectedBatchId", "")), initializeFirebaseAndLoadData(), renderTLDashboard()
  } catch (i) {
    console.error(`Error deleting batch ${e}:`, i), alert("Error deleting batch: " + i.message)
  } finally {
    hideLoading()
  }
}

async function deleteSpecificFixTasksForBatch(e, t) {
  if (showLoading(`Deleting ${t} tasks...`), !db || !e || !t) {
    alert("Invalid request to delete specific fix tasks."), hideLoading();
    return
  }
  try {
    let a = await db.collection("projects").where("batchId", "==", e).where("fixCategory", "==", t).get();
    if (a.empty) {
      console.log(`No ${t} tasks found for batch ID ${e} to delete.`), hideLoading();
      return
    }
    let i = db.batch();
    a.forEach(e => i.delete(e.ref)), await i.commit(), initializeFirebaseAndLoadData(), renderTLDashboard()
  } catch (n) {
    console.error(`Error deleting ${t} for batch ${e}:`, n), alert("Error deleting specific fix tasks: " + n.message)
  } finally {
    hideLoading()
  }
}

function renderProjects() {
  if (!projectTableBody) {
    console.error("CRITICAL: projectTableBody not found.");
    return
  }
  projectTableBody.innerHTML = "";
  let e_projects = [...projects]; // projectData (local copy)
  e_projects.sort((projA, projB) => { // Renamed e, t to projA, projB
    if (!projA || !projB) return 0;
    let a_fixIndexA = FIX_CATEGORIES_ORDER.indexOf(projA.fixCategory || ""), // fixIndexA
      i_fixIndexB = FIX_CATEGORIES_ORDER.indexOf(projB.fixCategory || ""); // fixIndexB
    if (a_fixIndexA < i_fixIndexB) return -1;
    if (a_fixIndexA > i_fixIndexB) return 1;
    if ((projA.areaTask || "") < (projB.areaTask || "")) return -1;
    if ((projA.areaTask || "") > (projB.areaTask || "")) return 1;
    let n_statusOrderA = STATUS_ORDER[projA.status || ""] || 99, // statusOrderA
      r_statusOrderB = STATUS_ORDER[projB.status || ""] || 99; // statusOrderB
    return n_statusOrderA < r_statusOrderB ? -1 : n_statusOrderA > r_statusOrderB ? 1 : 0
  });
  let t_currentBatchId = null, // currentBatchId
    a_currentFixCategory = null; // currentFixCategory
  e_projects.forEach(e_project => { // project (loop variable)
    if (!e_project || !e_project.id || !e_project.batchId || !e_project.fixCategory) return;
    if (e_project.batchId !== t_currentBatchId) {
      t_currentBatchId = e_project.batchId, a_currentFixCategory = null;
      let i_batchHeaderRow = projectTableBody.insertRow(); // batchHeaderRow
      i_batchHeaderRow.classList.add("batch-header-row");
      let n_batchHeaderCell = i_batchHeaderRow.insertCell(); // batchHeaderCell
      n_batchHeaderCell.setAttribute("colspan", NUM_TABLE_COLUMNS.toString()), n_batchHeaderCell.textContent = `Project Batch: ${e_project.baseProjectName||"Unknown"} (ID: ${e_project.batchId.split("_")[1]||"N/A"})`
    }
    if (e_project.fixCategory !== a_currentFixCategory) {
      a_currentFixCategory = e_project.fixCategory;
      let r_groupKey = `${e_project.batchId}_${a_currentFixCategory}`; // groupKey
      void 0 === groupVisibilityState[r_groupKey] && (groupVisibilityState[r_groupKey] = {
        isExpanded: !0
      });
      let s_fixHeaderRow = projectTableBody.insertRow(); // fixHeaderRow
      s_fixHeaderRow.classList.add("fix-group-header");
      let o_fixHeaderCell = s_fixHeaderRow.insertCell(); // fixHeaderCell
      o_fixHeaderCell.setAttribute("colspan", NUM_TABLE_COLUMNS.toString());
      let l_toggleBtn = document.createElement("button"); // toggleBtn
      l_toggleBtn.classList.add("btn", "btn-group-toggle");
      let d_isExpanded = groupVisibilityState[r_groupKey]?.isExpanded !== !1; // isExpanded
      l_toggleBtn.textContent = d_isExpanded ? "−" : "+", l_toggleBtn.title = d_isExpanded ? `Collapse ${a_currentFixCategory}` : `Expand ${a_currentFixCategory}`, o_fixHeaderCell.appendChild(document.createTextNode(`${a_currentFixCategory} `)), o_fixHeaderCell.appendChild(l_toggleBtn), o_fixHeaderCell.onclick = event => { // Renamed 'e' to 'event'
        (event.target === l_toggleBtn || event.target === o_fixHeaderCell || o_fixHeaderCell.contains(event.target)) && groupVisibilityState[r_groupKey] && (groupVisibilityState[r_groupKey].isExpanded = !groupVisibilityState[r_groupKey].isExpanded, saveGroupVisibilityState(), renderProjects())
      }
    }
    let c_projectRow = projectTableBody.insertRow(), // projectRow
      u_groupKeyForRow = `${e_project.batchId}_${e_project.fixCategory}`; // groupKeyForRow
    groupVisibilityState[u_groupKeyForRow]?.isExpanded !== !1 || c_projectRow.classList.add("hidden-group-row"), e_project.fixCategory && c_projectRow.classList.add(`${e_project.fixCategory.toLowerCase()}-row`), e_project.isReassigned && c_projectRow.classList.add("reassigned-task-highlight"), c_projectRow.insertCell().textContent = e_project.fixCategory || "N/A";
    let m_projectNameCell = c_projectRow.insertCell(); // projectNameCell
    m_projectNameCell.textContent = e_project.baseProjectName || "N/A", m_projectNameCell.classList.add("wrap-text"), c_projectRow.insertCell().textContent = e_project.areaTask || "N/A", c_projectRow.insertCell().textContent = e_project.gsd || "N/A";
    let g_assignedToCell = c_projectRow.insertCell(), // assignedToCell
      y_techSelect = document.createElement("select"); // techSelect
    y_techSelect.classList.add("assigned-to-select"), y_techSelect.disabled = "Reassigned_TechAbsent" === e_project.status;
    let h_defaultOption = document.createElement("option"); // defaultOption
    h_defaultOption.value = "", h_defaultOption.textContent = "Select Tech ID", y_techSelect.appendChild(h_defaultOption), TECH_IDS.forEach(techId => { // Renamed 'e' to 'techId'
      let t_techOption = document.createElement("option"); // techOption
      t_techOption.value = techId, t_techOption.textContent = techId, y_techSelect.appendChild(t_techOption)
    }), y_techSelect.value = e_project.assignedTo || "", y_techSelect.onchange = async event => { // Renamed 't' to 'event'
      showLoading("Updating assignment...");
      let a_newTech = event.target.value, // newTech
        i_oldTech = e_project.assignedTo || ""; // oldTech
      if (!db || !e_project.id) {
        alert("Database or project ID missing. Cannot update assignment."), event.target.value = e_project.assignedTo || "", hideLoading();
        return
      }
      try {
        await db.collection("projects").doc(e_project.id).update({
          assignedTo: a_newTech,
          lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
        }), e_project.assignedTo = a_newTech // Update local project data
      } catch (n_error) { // Renamed 'n' to 'n_error'
        console.error("Error updating assignedTo:", n_error), alert("Error updating assignment: " + n_error.message), event.target.value = i_oldTech
      } finally {
        hideLoading()
      }
    }, g_assignedToCell.appendChild(y_techSelect);
    
    let p_statusCell = c_projectRow.insertCell(); // statusCell (was 'p')
    let b_statusSpan = document.createElement("span"); // statusSpan (was 'b')
    b_statusSpan.classList.add("status");
    let f_formattedStatus = (e_project.status || "Unknown").replace(/([A-Z])(?=[a-z0-9_])/g, " $1").trim(); // formattedStatus (was 'f')

    function D_formatTime(timestamp) { // formatTime (was D)
      if (!timestamp) return "";
      let dateObj; // Renamed 't' to 'dateObj'
      try {
        if (dateObj = "function" == typeof timestamp.toDate ? timestamp.toDate() : new Date(timestamp), isNaN(dateObj.getTime())) return ""
      } catch (a_error) { // Renamed 'a' to 'a_error'
        return ""
      }
      return dateObj.toTimeString().slice(0, 5)
    }

    async function T_updateTime(projectId, fieldName, timeValue, projectData) { // updateTime (was T) // Renamed 'e,t,a,i' to 'projectId,fieldName,timeValue,projectData'
      showLoading(`Updating ${fieldName}...`);
      if (!db || !projectId) {
        alert("Database or project ID missing. Cannot update time."), hideLoading();
        return
      }
      let n_timestamp = null; // timestamp (was 'n')
      if (timeValue) {
        let r_now = new Date, // now (was 'r')
          [s_hours, o_minutes] = timeValue.split(":").map(Number); // hours, minutes (was 's,o')
        r_now.setHours(s_hours, o_minutes, 0, 0), n_timestamp = firebase.firestore.Timestamp.fromDate(r_now)
      }
      try {
        let l_updateData = { // updateData (was 'l')
          [fieldName]: n_timestamp,
          lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        await db.collection("projects").doc(projectId).update(l_updateData);
        let d_updatedProjectData = { ...projectData, // updatedProjectData (was 'd')
            [fieldName]: n_timestamp
          },
          c_durationField = "", // durationField (was 'c')
          u_startTime = null, // startTime (was 'u')
          m_finishTime = null; // finishTime (was 'm')
        if (fieldName.includes("Day1") ? (c_durationField = "durationDay1Ms", u_startTime = d_updatedProjectData.startTimeDay1, m_finishTime = d_updatedProjectData.finishTimeDay1) : fieldName.includes("Day2") ? (c_durationField = "durationDay2Ms", u_startTime = d_updatedProjectData.startTimeDay2, m_finishTime = d_updatedProjectData.finishTimeDay2) : fieldName.includes("Day3") && (c_durationField = "durationDay3Ms", u_startTime = d_updatedProjectData.startTimeDay3, m_finishTime = d_updatedProjectData.finishTimeDay3), u_startTime && m_finishTime && c_durationField) {
          let g_durationMs = calculateDurationMs(u_startTime, m_finishTime); // durationMs (was 'g')
          await db.collection("projects").doc(projectId).update({
            [c_durationField]: g_durationMs,
            lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
          });
          // Update local project data as well for duration
          const localProject = projects.find(p => p.id === projectId);
          if (localProject) localProject[c_durationField] = g_durationMs;
        }
      } catch (y_error) { // Renamed 'y' to 'y_error'
        console.error(`Error updating ${fieldName}:`, y_error), alert(`Error updating ${fieldName}: ` + y_error.message)
      } finally {
        hideLoading()
      }
    }
    "Day1Ended_AwaitingNext" === e_project.status && (f_formattedStatus = "Started Day 1 Ended"), "Day2Ended_AwaitingNext" === e_project.status && (f_formattedStatus = "Started Day 2 Ended"), "Reassigned_TechAbsent" === e_project.status && (f_formattedStatus = "Re-Assigned"), b_statusSpan.textContent = f_formattedStatus, b_statusSpan.classList.add(`status-${(e_project.status||"unknown").toLowerCase()}`);
    p_statusCell.appendChild(b_statusSpan); // Append status span to its cell

    let E_isReassignedOrCompleted = "Reassigned_TechAbsent" === e_project.status; // isReassignedOrCompleted (was E) // Note: "Completed" status also disables fields, handled by specific buttons
    let I_startTimeD1Cell = c_projectRow.insertCell(), // startTimeD1Cell (was I)
      M_startTimeD1Input = document.createElement("input"); // startTimeD1Input (was M)
    M_startTimeD1Input.type = "time", M_startTimeD1Input.value = D_formatTime(e_project.startTimeDay1), M_startTimeD1Input.disabled = E_isReassignedOrCompleted, M_startTimeD1Input.onchange = event => T_updateTime(e_project.id, "startTimeDay1", event.target.value, e_project), I_startTimeD1Cell.appendChild(M_startTimeD1Input);
    let C_finishTimeD1Cell = c_projectRow.insertCell(), // finishTimeD1Cell (was C)
      w_finishTimeD1Input = document.createElement("input"); // finishTimeD1Input (was w)
    w_finishTimeD1Input.type = "time", w_finishTimeD1Input.value = D_formatTime(e_project.finishTimeDay1), w_finishTimeD1Input.disabled = E_isReassignedOrCompleted, w_finishTimeD1Input.onchange = event => T_updateTime(e_project.id, "finishTimeDay1", event.target.value, e_project), C_finishTimeD1Cell.appendChild(w_finishTimeD1Input);
    let A_startTimeD2Cell = c_projectRow.insertCell(), // startTimeD2Cell (was A)
      L_startTimeD2Input = document.createElement("input"); // startTimeD2Input (was L)
    L_startTimeD2Input.type = "time", L_startTimeD2Input.value = D_formatTime(e_project.startTimeDay2), L_startTimeD2Input.disabled = E_isReassignedOrCompleted, L_startTimeD2Input.onchange = event => T_updateTime(e_project.id, "startTimeDay2", event.target.value, e_project), A_startTimeD2Cell.appendChild(L_startTimeD2Input);
    let S_finishTimeD2Cell = c_projectRow.insertCell(), // finishTimeD2Cell (was S)
      v_finishTimeD2Input = document.createElement("input"); // finishTimeD2Input (was v)
    v_finishTimeD2Input.type = "time", v_finishTimeD2Input.value = D_formatTime(e_project.finishTimeDay2), v_finishTimeD2Input.disabled = E_isReassignedOrCompleted, v_finishTimeD2Input.onchange = event => T_updateTime(e_project.id, "finishTimeDay2", event.target.value, e_project), S_finishTimeD2Cell.appendChild(v_finishTimeD2Input);
    let B_startTimeD3Cell = c_projectRow.insertCell(), // startTimeD3Cell (was B)
      k_startTimeD3Input = document.createElement("input"); // startTimeD3Input (was k)
    k_startTimeD3Input.type = "time", k_startTimeD3Input.value = D_formatTime(e_project.startTimeDay3), k_startTimeD3Input.disabled = E_isReassignedOrCompleted, k_startTimeD3Input.onchange = event => T_updateTime(e_project.id, "startTimeDay3", event.target.value, e_project), B_startTimeD3Cell.appendChild(k_startTimeD3Input);
    let j_finishTimeD3Cell = c_projectRow.insertCell(), // finishTimeD3Cell (was j)
      x_finishTimeD3Input = document.createElement("input"); // finishTimeD3Input (was x)
    x_finishTimeD3Input.type = "time", x_finishTimeD3Input.value = D_formatTime(e_project.finishTimeDay3), x_finishTimeD3Input.disabled = E_isReassignedOrCompleted, x_finishTimeD3Input.onchange = event => T_updateTime(e_project.id, "finishTimeDay3", event.target.value, e_project), j_finishTimeD3Cell.appendChild(x_finishTimeD3Input);
    
    let F_totalDurationMs = (e_project.durationDay1Ms || 0) + (e_project.durationDay2Ms || 0) + (e_project.durationDay3Ms || 0); // totalDurationMs (was F)
    let P_breakMs = 6e4 * (e_project.breakDurationMinutes || 0); // breakMs (was P)
    let $_netDurationMs = Math.max(0, F_totalDurationMs - P_breakMs) + 6e4 * (e_project.additionalMinutesManual || 0); // netDurationMs (was N used for Firebase App before, then $)
    if (0 === F_totalDurationMs && 0 === (e_project.breakDurationMinutes || 0) && 0 === (e_project.additionalMinutesManual || 0)) {
      $_netDurationMs = null;
    }
    let __totalDurationCell = c_projectRow.insertCell(); // totalDurationCell (was _)
    __totalDurationCell.textContent = formatMillisToMinutes($_netDurationMs), __totalDurationCell.classList.add("total-duration-column");
    
    let R_techNotesCell = c_projectRow.insertCell(), // techNotesCell (was R)
      O_techNotesInput = document.createElement("textarea"); // techNotesInput (was O)
    O_techNotesInput.value = e_project.techNotes || "", O_techNotesInput.placeholder = "Notes", O_techNotesInput.classList.add("tech-notes-input"), O_techNotesInput.rows = 1, O_techNotesInput.id = `techNotes_${e_project.id}`, O_techNotesInput.disabled = "Reassigned_TechAbsent" === e_project.status, O_techNotesInput.onchange = async event => { // Renamed 't' to 'event'
      showLoading("Updating tech notes...");
      let a_newNotes = event.target.value, // newNotes
        i_oldNotes = e_project.techNotes || ""; // oldNotes
      if (!db || !e_project.id) {
        alert("Database or project ID missing. Cannot update notes."), event.target.value = e_project.techNotes || "", hideLoading();
        return
      }
      try {
        await db.collection("projects").doc(e_project.id).update({
          techNotes: a_newNotes,
          lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
        }), e_project.techNotes = a_newNotes // Update local project data
      } catch (n_error) { // Renamed 'n' to 'n_error'
        console.error("Error updating techNotes:", n_error), alert("Error updating tech notes: " + n_error.message), event.target.value = i_oldNotes
      } finally {
        hideLoading()
      }
    }, R_techNotesCell.appendChild(O_techNotesInput);
    
    let U_actionsCell = c_projectRow.insertCell(); // actionsCell (was U)
    let z_actionsContainer = document.createElement("div"); // actionsContainer (was z)
    z_actionsContainer.classList.add("action-buttons-container");
    
    let V_breakSelect = document.createElement("select"); // breakSelect (was V)
    V_breakSelect.classList.add("break-select"), V_breakSelect.id = `breakSelect_${e_project.id}`, V_breakSelect.title = "Select break time to deduct", V_breakSelect.disabled = E_isReassignedOrCompleted;
    let H_noBreakOption = document.createElement("option"); // noBreakOption (was H)
    H_noBreakOption.value = "0", H_noBreakOption.textContent = "No Break", V_breakSelect.appendChild(H_noBreakOption);
    let G_15mBreakOption = document.createElement("option"); // _15mBreakOption (was G)
    G_15mBreakOption.value = "15", G_15mBreakOption.textContent = "15m Break", V_breakSelect.appendChild(G_15mBreakOption);
    let X_1hBreakOption = document.createElement("option"); // _1hBreakOption (was X)
    X_1hBreakOption.value = "60", X_1hBreakOption.textContent = "1h Break", V_breakSelect.appendChild(X_1hBreakOption);
    let W_1h30mBreakOption = document.createElement("option"); // _1h30mBreakOption (was W)
    W_1h30mBreakOption.value = "90", W_1h30mBreakOption.textContent = "1h30m Break", V_breakSelect.appendChild(W_1h30mBreakOption), V_breakSelect.value = "number" == typeof e_project.breakDurationMinutes ? e_project.breakDurationMinutes.toString() : "0", V_breakSelect.onchange = async event => { // Renamed 't' to 'event'
      showLoading("Updating break duration...");
      let a_newBreakMinutes = parseInt(event.target.value, 10), // newBreakMinutes
        i_oldBreakMinutes = e_project.breakDurationMinutes || 0; // oldBreakMinutes
      if (!db || !e_project.id) {
        alert("Database or project ID missing. Cannot update break duration."), event.target.value = i_oldBreakMinutes.toString(), hideLoading();
        return
      }
      try {
        await db.collection("projects").doc(e_project.id).update({
          breakDurationMinutes: a_newBreakMinutes,
          lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        e_project.breakDurationMinutes = a_newBreakMinutes; // Update local project data
        let n_tableRow = event.target.closest("tr"); // tableRow
        if (n_tableRow) {
          let r_durationCell = n_tableRow.querySelector(".total-duration-column"); // durationCell
          if (r_durationCell) {
            let s_currentTotalMs = (e_project.durationDay1Ms || 0) + (e_project.durationDay2Ms || 0) + (e_project.durationDay3Ms || 0), // currentTotalMs
              o_additionalMs = 6e4 * (e_project.additionalMinutesManual || 0), // additionalMs
              l_newNetMs = Math.max(0, s_currentTotalMs - 6e4 * a_newBreakMinutes) + o_additionalMs; // newNetMs
            if (0 === s_currentTotalMs && 0 === a_newBreakMinutes && 0 === (e_project.additionalMinutesManual || 0)) {
                l_newNetMs = null;
            }
            r_durationCell.textContent = formatMillisToMinutes(l_newNetMs);
          }
        }
      } catch (d_error) { // Renamed 'd' to 'd_error'
        console.error("Error updating break duration:", d_error), alert("Error updating break duration: " + d_error.message), event.target.value = i_oldBreakMinutes.toString()
      } finally {
        hideLoading()
      }
    }, z_actionsContainer.appendChild(V_breakSelect);
    
    let q_startD1Btn = document.createElement("button"); // startD1Btn (was q)
    q_startD1Btn.textContent = "Start D1", q_startD1Btn.classList.add("btn", "btn-day-start"), q_startD1Btn.disabled = E_isReassignedOrCompleted || !["Available"].includes(e_project.status), q_startD1Btn.onclick = () => {
      e_project.id && updateProjectState(e_project.id, "startDay1")
    }, z_actionsContainer.appendChild(q_startD1Btn);
    
    let K_endD1Btn = document.createElement("button"); // endD1Btn (was K)
    K_endD1Btn.textContent = "End D1", K_endD1Btn.classList.add("btn", "btn-day-end"), K_endD1Btn.disabled = E_isReassignedOrCompleted || "InProgressDay1" !== e_project.status, K_endD1Btn.onclick = () => {
      e_project.id && updateProjectState(e_project.id, "endDay1")
    }, z_actionsContainer.appendChild(K_endD1Btn);
    
    let J_startD2Btn = document.createElement("button"); // startD2Btn (was J)
    J_startD2Btn.textContent = "Start D2", J_startD2Btn.classList.add("btn", "btn-day-start"), J_startD2Btn.disabled = E_isReassignedOrCompleted || !["Day1Ended_AwaitingNext"].includes(e_project.status), J_startD2Btn.onclick = () => {
      e_project.id && updateProjectState(e_project.id, "startDay2")
    }, z_actionsContainer.appendChild(J_startD2Btn);
    
    let Y_endD2Btn = document.createElement("button"); // endD2Btn (was Y)
    Y_endD2Btn.textContent = "End D2", Y_endD2Btn.classList.add("btn", "btn-day-end"), Y_endD2Btn.disabled = E_isReassignedOrCompleted || "InProgressDay2" !== e_project.status, Y_endD2Btn.onclick = () => {
      e_project.id && updateProjectState(e_project.id, "endDay2")
    }, z_actionsContainer.appendChild(Y_endD2Btn);
    
    let Z_start_d3_btn = document.createElement("button"); // startD3Btn (was Z, changed to avoid conflict with global Z)
    Z_start_d3_btn.textContent = "Start D3", Z_start_d3_btn.classList.add("btn", "btn-day-start"), Z_start_d3_btn.disabled = E_isReassignedOrCompleted || !["Day2Ended_AwaitingNext"].includes(e_project.status), Z_start_d3_btn.onclick = () => {
      e_project.id && updateProjectState(e_project.id, "startDay3")
    }, z_actionsContainer.appendChild(Z_start_d3_btn);
    
    let Q_endD3Btn = document.createElement("button"); // endD3Btn (was Q)
    Q_endD3Btn.textContent = "End D3", Q_endD3Btn.classList.add("btn", "btn-day-end"), Q_endD3Btn.disabled = E_isReassignedOrCompleted || "InProgressDay3" !== e_project.status, Q_endD3Btn.onclick = () => {
      e_project.id && updateProjectState(e_project.id, "endDay3")
    }, z_actionsContainer.appendChild(Q_endD3Btn);
    
    let ee_doneBtn = document.createElement("button"); // doneBtn (was ee)
    ee_doneBtn.textContent = "Done", ee_doneBtn.classList.add("btn", "btn-mark-done"), ee_doneBtn.disabled = E_isReassignedOrCompleted || "Completed" === e_project.status, ee_doneBtn.onclick = () => {
      e_project.id && updateProjectState(e_project.id, "markDone")
    }, z_actionsContainer.appendChild(ee_doneBtn);

    // ***** START: MODIFIED "No Refix" Button code *****
    const fixCategoriesForNoRefix = ["Fix2", "Fix3", "Fix4", "Fix5", "Fix6"];
    if (e_project.fixCategory && fixCategoriesForNoRefix.includes(e_project.fixCategory)) {
        let noRefixBtn = document.createElement("button");
        noRefixBtn.textContent = "No Refix";
        noRefixBtn.classList.add("btn", "btn-mark-done"); // Using same class as "Done"
        noRefixBtn.title = "Mark as done without further refix.";
        noRefixBtn.style.marginLeft = "4px"; // Optional: adds a small space
        noRefixBtn.disabled = E_isReassignedOrCompleted || "Completed" === e_project.status; // Same disabled condition

        noRefixBtn.onclick = () => {
            if (e_project.id) {
                updateProjectState(e_project.id, "markDone");
            }
        };
        z_actionsContainer.appendChild(noRefixBtn);
    }
    // ***** END: MODIFIED "No Refix" Button code *****
    
    let et_reAssignBtn = document.createElement("button"); // reAssignBtn (was et)
    et_reAssignBtn.textContent = "Re-Assign", et_reAssignBtn.classList.add("btn", "btn-warning"), et_reAssignBtn.title = "Re-assign task by creating a new entry.", et_reAssignBtn.disabled = "Completed" === e_project.status || E_isReassignedOrCompleted, et_reAssignBtn.onclick = () => {
      let t_projectToReassign = projects.find(t_proj => t_proj.id === e_project.id); // projectToReassign
      t_projectToReassign && handleReassignment(t_projectToReassign)
    }, z_actionsContainer.appendChild(et_reAssignBtn), U_actionsCell.appendChild(z_actionsContainer)
  })
}

async function updateProjectState(e, t) {
  if (showLoading("Updating project state..."), !db || !e) {
    alert("Database not initialized or project ID missing for state update."), hideLoading();
    return
  }
  let a = db.collection("projects").doc(e),
    i;
  try {
    let n = await a.get();
    if (!n.exists) {
      console.warn("Project document not found:", e), hideLoading();
      return
    }
    i = n.data()
  } catch (r) {
    console.error("Error fetching current project data for update:", r), alert("Error fetching project data: " + r.message), hideLoading();
    return
  }
  if (!i || "Reassigned_TechAbsent" === i.status) {
    console.warn("Attempted to update a reassigned or invalid project."), hideLoading();
    return
  }
  let s = firebase.firestore.FieldValue.serverTimestamp(),
    o = Date.now(),
    l = {
      lastModifiedTimestamp: s
    },
    d = i.status,
    c = d;
  switch (t) {
    case "startDay1":
      ["Available"].includes(i.status) && (l = { ...l,
        status: "InProgressDay1",
        startTimeDay1: s,
        finishTimeDay1: null,
        durationDay1Ms: null,
        startTimeDay2: null,
        finishTimeDay2: null,
        durationDay2Ms: null,
        startTimeDay3: null,
        finishTimeDay3: null,
        durationDay3Ms: null
      }, c = "InProgressDay1");
      break;
    case "endDay1":
      "InProgressDay1" === i.status && i.startTimeDay1 ? (l = { ...l,
        status: "Day1Ended_AwaitingNext",
        finishTimeDay1: s,
        durationDay1Ms: calculateDurationMs(i.startTimeDay1, o)
      }, c = "Day1Ended_AwaitingNext") : alert("Cannot end Day 1. Task is not in 'In Progress Day 1' status or start time is missing.");
      break;
    case "startDay2":
      ["Day1Ended_AwaitingNext"].includes(i.status) && (l = { ...l,
        status: "InProgressDay2",
        startTimeDay2: s,
        finishTimeDay2: null,
        durationDay2Ms: null,
        startTimeDay3: null,
        finishTimeDay3: null,
        durationDay3Ms: null
      }, c = "InProgressDay2");
      break;
    case "endDay2":
      "InProgressDay2" === i.status && i.startTimeDay2 ? (l = { ...l,
        status: "Day2Ended_AwaitingNext",
        finishTimeDay2: s,
        durationDay2Ms: calculateDurationMs(i.startTimeDay2, o)
      }, c = "Day2Ended_AwaitingNext") : alert("Cannot end Day 2. Task is not in 'In Progress Day 2' status or start time is missing.");
      break;
    case "startDay3":
      ["Day2Ended_AwaitingNext"].includes(i.status) && (l = { ...l,
        status: "InProgressDay3",
        startTimeDay3: s,
        finishTimeDay3: null,
        durationDay3Ms: null
      }, c = "InProgressDay3");
      break;
    case "endDay3":
      "InProgressDay3" === i.status && i.startTimeDay3 ? (l = { ...l,
        status: "Completed",
        finishTimeDay3: s,
        durationDay3Ms: calculateDurationMs(i.startTimeDay3, o)
      }, c = "Completed") : alert("Cannot end Day 3. Task is not in 'In Progress Day 3' status or start time is missing.");
      break;
    case "markDone":
      if ("Completed" !== i.status) {
          l.status = "Completed", c = "Completed";
          const nowTimestamp = s; // Use server timestamp for consistency if possible, or 'o' (Date.now()) for client time
                                     // For durations, client time 'o' used in endDayX is probably fine.
                                     // For merely marking done, if days weren't ended, this logic sets end times.

          if (i.startTimeDay1 && !i.finishTimeDay1) { // If D1 started but not ended
              l.finishTimeDay1 = nowTimestamp;
              l.durationDay1Ms = calculateDurationMs(i.startTimeDay1, o); // 'o' is client's Date.now()
          }
          if (i.startTimeDay2 && !i.finishTimeDay2) { // If D2 started but not ended
              l.finishTimeDay2 = nowTimestamp;
              l.durationDay2Ms = calculateDurationMs(i.startTimeDay2, o);
          }
          if (i.startTimeDay3 && !i.finishTimeDay3) { // If D3 started but not ended
              l.finishTimeDay3 = nowTimestamp;
              l.durationDay3Ms = calculateDurationMs(i.startTimeDay3, o);
          }

          // If task was 'Available' and marked 'Done', no times/durations should be set unless manually entered.
          // The original logic for 'Available' or other states when directly marking 'Done' seems complex.
          // Let's simplify: if it's marked done, and a day was in progress, end that day.
          // The original complex conditional block for setting other day times to null is preserved below.
          if ("Available" === i.status) {
              // If directly marked done from available, typically no auto-times are set.
              // The existing logic seems to try and fill them if D1 was started.
              // This might need review based on exact desired behavior.
          } else if (i.startTimeDay1 && i.finishTimeDay1 && !i.startTimeDay2) { 
              // D1 ended, D2 not started (implies D3 not started)
              l.startTimeDay2 = null; l.finishTimeDay2 = null; l.durationDay2Ms = null;
              l.startTimeDay3 = null; l.finishTimeDay3 = null; l.durationDay3Ms = null;
          } else if (i.startTimeDay2 && i.finishTimeDay2 && !i.startTimeDay3) {
              // D2 ended, D3 not started
              l.startTimeDay3 = null; l.finishTimeDay3 = null; l.durationDay3Ms = null;
          }
          // If 'InProgressDay1/2/3' and marked done, the specific day's end time and duration are set above.
      }
      break;
    default:
      hideLoading();
      return
  }
  if (Object.keys(l).length > 1 || l.lastModifiedTimestamp) { // Ensure we update if only lastModifiedTimestamp changed
    try {
        await a.update(l);
        // Update local project data to reflect changes immediately
        const localProjectIndex = projects.findIndex(p => p.id === e);
        if (localProjectIndex !== -1) {
            projects[localProjectIndex] = { ...projects[localProjectIndex], ...l, status: c };
            // If durations were calculated, ensure they are in 'l' from the switch case or T_updateTime
            if(l.durationDay1Ms !== undefined) projects[localProjectIndex].durationDay1Ms = l.durationDay1Ms;
            if(l.durationDay2Ms !== undefined) projects[localProjectIndex].durationDay2Ms = l.durationDay2Ms;
            if(l.durationDay3Ms !== undefined) projects[localProjectIndex].durationDay3Ms = l.durationDay3Ms;
        }
        // refreshAllViews(); // Consider if this is needed or if onSnapshot handles it.
                           // Direct local update is faster for UI responsiveness.
                           // onSnapshot will eventually align, but this makes UI immediate.
    } catch (u) {
        console.error(`Error updating project ${e}:`, u), alert("Error updating project status: " + u.message)
    } finally {
        hideLoading()
    }
  } else hideLoading()
}

async function handleReassignment(e) {
  if (!e || !e.id || "Reassigned_TechAbsent" === e.status || "Completed" === e.status) {
    alert("Cannot re-assign. Task is already reassigned, completed, or invalid.");
    return
  }
  let t = prompt(`Task for '${e.areaTask}'. Enter New Tech ID:`);
  if (null === t || "" === t.trim()) {
    alert("Reassignment cancelled. Tech ID cannot be empty.");
    return
  }
  if (confirm(`Create NEW task for '${t.trim()}'? Current task will be closed and marked as 'Re-assigned'.`)) {
    if (showLoading("Reassigning task..."), !db) {
      alert("Database not initialized! Cannot re-assign."), hideLoading();
      return
    }
    let a = db.batch(),
      i = firebase.firestore.FieldValue.serverTimestamp(),
      n = {
        batchId: e.batchId,
        baseProjectName: e.baseProjectName,
        areaTask: e.areaTask,
        gsd: e.gsd,
        fixCategory: e.fixCategory,
        assignedTo: t.trim(),
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
        techNotes: `Reassigned from ${e.assignedTo||"N/A"}. Original Project ID: ${e.id}`,
        creationTimestamp: i, // Should be new creation timestamp for the new task
        lastModifiedTimestamp: i,
        isReassigned: !0,
        originalProjectId: e.id,
        releasedToNextStage: !1, // New task starts unreleased
        breakDurationMinutes: 0,
        additionalMinutesManual: 0
      },
      r = db.collection("projects").doc();
    a.set(r, n), a.update(db.collection("projects").doc(e.id), {
      status: "Reassigned_TechAbsent",
      lastModifiedTimestamp: i,
      // Clear out time fields for the reassigned task as they are no longer active
      // This depends on desired behavior - for now, just marking status.
      // assignedTo: "" // Optionally clear assignedTo for the old task
    });
    try {
      await a.commit(), initializeFirebaseAndLoadData()
    } catch (s) {
      console.error("Error in re-assignment:", s), alert("Error during re-assignment: " + s.message)
    } finally {
      hideLoading()
    }
  }
}

function refreshAllViews() {
  try {
    renderProjects() // This will use the global 'projects' array which should be updated by onSnapshot or direct modifications
  } catch (e) {
    console.error("Error during refreshAllViews:", e), alert("An error occurred while refreshing the project display. Please check the console.")
  }
}

async function renderAllowedEmailsList() {
  if (!allowedEmailsList) {
    console.error("allowedEmailsList element not found.");
    return
  }
  if (showLoading("Rendering allowed emails..."), await fetchAllowedEmails(), allowedEmailsList.innerHTML = "", 0 === allowedEmailsFromFirestore.length) {
    allowedEmailsList.innerHTML = "<li>No allowed emails configured. Please add at least one.</li>", hideLoading();
    return
  }
  allowedEmailsFromFirestore.forEach(e => {
    let t = document.createElement("li");
    t.textContent = e;
    let a = document.createElement("button");
    a.textContent = "Remove", a.classList.add("btn", "btn-danger", "btn-small"), a.onclick = () => handleRemoveEmail(e), t.appendChild(a), allowedEmailsList.appendChild(t)
  }), hideLoading()
}

async function handleAddEmail() {
  if (showLoading("Adding email..."), !addEmailInput) {
    hideLoading();
    return
  }
  let e = addEmailInput.value.trim().toLowerCase();
  if (!e || !e.includes("@") || !e.includes(".")){
    alert("Please enter a valid email address (e.g., user@example.com)."), hideLoading();
    return
  }
  if (allowedEmailsFromFirestore.map(e => e.toLowerCase()).includes(e)) {
    alert("This email is already in the allowed list."), hideLoading();
    return
  }
  let t = [...allowedEmailsFromFirestore, e].sort();
  await updateAllowedEmailsInFirestore(t) && (addEmailInput.value = "", renderAllowedEmailsList())
}

async function handleRemoveEmail(e) {
  if (confirm(`Are you sure you want to remove ${e} from the allowed list? This will prevent them from logging in.`)) {
    showLoading("Removing email...");
    let t = allowedEmailsFromFirestore.filter(t => t !== e);
    await updateAllowedEmailsInFirestore(t) && (renderAllowedEmailsList())
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
    let firebaseProjectsSnapshot = await db.collection("projects").get();
    let projectsArray = [];
    firebaseProjectsSnapshot.forEach(doc => {
      if (doc.exists && "function" == typeof doc.data) {
        projectsArray.push({ id: doc.id, ...doc.data() });
      }
    });

    let totalsByProjectAndFix = {};
    // The 'i' object and its related logic for overall project totals are removed.

    projectsArray.forEach(project => {
      project.durationDay1Ms = "number" == typeof project.durationDay1Ms ? project.durationDay1Ms : 0;
      project.durationDay2Ms = "number" == typeof project.durationDay2Ms ? project.durationDay2Ms : 0;
      project.durationDay3Ms = "number" == typeof project.durationDay3Ms ? project.durationDay3Ms : 0;
      project.breakDurationMinutes = "number" == typeof project.breakDurationMinutes ? project.breakDurationMinutes : 0;
      project.additionalMinutesManual = "number" == typeof project.additionalMinutesManual ? project.additionalMinutesManual : 0;

      let totalDurationMs = project.durationDay1Ms + project.durationDay2Ms + project.durationDay3Ms;
      let breakMs = 6e4 * project.breakDurationMinutes;
      let additionalMs = 6e4 * project.additionalMinutesManual;
      let netMs = Math.max(0, totalDurationMs - breakMs) + additionalMs;

      if (netMs <= 0 && project.breakDurationMinutes === 0 && project.additionalMinutesManual === 0) return;

      let projectFixKey = `${project.baseProjectName || "Unknown Project"}_${project.fixCategory || "Unknown Fix"}`;
      if (!totalsByProjectAndFix[projectFixKey]) {
        totalsByProjectAndFix[projectFixKey] = {
          projectName: project.baseProjectName || "Unknown Project",
          fixCategory: project.fixCategory || "Unknown Fix",
          totalMinutes: 0
        };
      }
      totalsByProjectAndFix[projectFixKey].totalMinutes += Math.floor(netMs / 6e4);
    });

    let htmlOutput = '<ul style="list-style: none; padding: 0;">';
    // HTML generation for 'Overall Project Totals' is removed.

    htmlOutput += "<h3>Totals by Project and Fix Category</h3>";
    let projectFixKeys = Object.keys(totalsByProjectAndFix).sort();

    projectFixKeys.forEach(key => {
      let data = totalsByProjectAndFix[key];
      let decimalHours = (data.totalMinutes / 60).toFixed(2);
      htmlOutput += `
                <li style="margin-bottom: 8px; padding-bottom: 5px; border-bottom: 1px dotted #eee;">
                    <strong>Project Name:</strong> ${data.projectName} (${data.fixCategory})<br>
                    <strong>Total:</strong> ${data.totalMinutes} minutes<br>
                    <strong>Decimal:</strong> ${decimalHours} hours
                </li>
            `;
    });

    if (0 === projectFixKeys.length) { // Condition updated
      htmlOutput = "<p>No project time data found to generate a summary.</p>";
    } else {
      htmlOutput += "</ul>";
    }
    tlSummaryContent.innerHTML = htmlOutput;

  } catch (error) {
    console.error("Error generating TL Summary:", error);
    tlSummaryContent.innerHTML = '<p style="color:red;">Error generating summary: ' + error.message + "</p>";
    alert("Error generating TL Summary: " + error.message);
  } finally {
    hideLoading();
  }
}


function setupAuthEventListeners() {
  let Z_googleAuthProvider = new firebase.auth.GoogleAuthProvider; // Renamed 'e' to 'Z_googleAuthProvider' to avoid conflict with event args
  Z_googleAuthProvider.addScope("email"), signInBtn ? signInBtn.addEventListener("click", () => {
    if (showLoading("Signing in..."), !auth) {
      console.error("Auth not initialized"), hideLoading();
      return
    }
    auth.signInWithPopup(Z_googleAuthProvider).then(userCredential => { // Renamed 'e' to 'userCredential'
      console.log("Sign-in attempt successful for: ", userCredential.user.email)
    }).catch(error => { // Renamed 'e' to 'error'
      console.error("Sign-in error: ", error);
      let t_message = "Error signing in: " + error.message; // Renamed 't' to 't_message'
      "auth/popup-closed-by-user" === error.code ? t_message = "Sign-in process was cancelled. Please try again." : "auth/cancelled-popup-request" === error.code ? t_message = "Sign-in process was interrupted. Please try again." : "auth/popup-blocked" === error.code ? t_message = "Sign-in pop-up was blocked by the browser. Please allow pop-ups for this site and try again." : "auth/network-request-failed" === error.code && (t_message = "Network error. Please check your internet connection."), alert(t_message), loadingAuthMessageDiv && signInBtn && userInfoDisplayDiv && appContentDiv && (userInfoDisplayDiv.style.display = "none", signInBtn.style.display = "block", appContentDiv.style.display = "none", loadingAuthMessageDiv.innerHTML = "<p>Please sign in to access the Project Tracker.</p>", loadingAuthMessageDiv.style.display = "block"), hideLoading()
    })
  }) : console.error("Sign-in button not found during event listener setup."), signOutBtn ? signOutBtn.addEventListener("click", () => {
    if (showLoading("Signing out..."), !auth) {
      console.error("Auth not initialized"), hideLoading();
      return
    }
    auth.signOut().then(() => {
      console.log("User signed out successfully by clicking button.")
    }).catch(e_error => { // Renamed 'e' to 'e_error'
      console.error("Sign-out error: ", e_error), alert("Error signing out: " + e_error.message), hideLoading()
    })
  }) : console.error("Sign-out button not found during event listener setup.")
}

function initializeAppComponents() {
  isAppInitialized ? (console.log("App components already initialized or re-initializing data load."), initializeFirebaseAndLoadData()) : (console.log("Initializing app components (DOM refs, event listeners, Firestore data)..."), setupDOMReferences(), attachEventListeners(), initializeFirebaseAndLoadData(), isAppInitialized = !0)
}

auth ? auth.onAuthStateChanged(async user => { // Renamed 'e' to 'user'
  if (setupDOMReferences(), setupAuthRelatedDOMReferences(), !userNameP || !userEmailP || !userPhotoImg || !userInfoDisplayDiv || !signInBtn || !appContentDiv || !loadingAuthMessageDiv || !openSettingsBtn) {
    console.error("One or more critical UI elements for auth state change not found. Aborting UI update."), hideLoading();
    return
  }
  if (user) {
    showLoading("Checking authorization..."), await fetchAllowedEmails();
    let t_userEmailLower = user.email ? user.email.toLowerCase() : ""; // Renamed 't' to 't_userEmailLower'
    user.email && allowedEmailsFromFirestore.map(e_allowedEmail => e_allowedEmail.toLowerCase()).includes(t_userEmailLower) ? (console.log("Auth state changed: User is SIGNED IN and ALLOWED - ", user.displayName, user.email), userNameP.textContent = user.displayName || "Name not available", userEmailP.textContent = user.email || "Email not available", userPhotoImg.src = user.photoURL || "default-user.png", userInfoDisplayDiv.style.display = "flex", signInBtn.style.display = "none", loadingAuthMessageDiv.style.display = "none", appContentDiv.style.display = "block", openSettingsBtn.style.display = "block", initializeAppComponents()) : (console.warn("Auth state changed: User SIGNED IN but NOT ALLOWED - ", user.email), alert("Access Denied: Your email address (" + (user.email || "N/A") + ") is not authorized to use this application. You will be signed out."), auth.signOut().then(() => {
      console.log("Unauthorized user automatically signed out."), loadingAuthMessageDiv.innerHTML = "<p>Access Denied. Please sign in with an authorized account.</p>", userInfoDisplayDiv.style.display = "none", signInBtn.style.display = "block", appContentDiv.style.display = "none", loadingAuthMessageDiv.style.display = "block", openSettingsBtn.style.display = "none", projects = [], projectTableBody && (projectTableBody.innerHTML = ""), tlDashboardContentElement && (tlDashboardContentElement.innerHTML = ""), allowedEmailsList && (allowedEmailsList.innerHTML = ""), firestoreListenerUnsubscribe && (firestoreListenerUnsubscribe(), firestoreListenerUnsubscribe = null, console.log("Firestore listener detached for unauthorized user sign out.")), isAppInitialized = !1, hideLoading()
    }).catch(e_error => { // Renamed 'e' to 'e_error'
      console.error("Error signing out unauthorized user:", e_error), alert("Error signing out unauthorized user: " + e_error.message), userInfoDisplayDiv.style.display = "none", signInBtn.style.display = "block", appContentDiv.style.display = "none", loadingAuthMessageDiv.innerHTML = "<p>Access Denied. Error during sign out. Please refresh.</p>", loadingAuthMessageDiv.style.display = "block", openSettingsBtn.style.display = "none", hideLoading()
    }))
  } else console.log("Auth state changed: User is SIGNED OUT"), userNameP.textContent = "", userEmailP.textContent = "", userPhotoImg.src = "", userInfoDisplayDiv.style.display = "none", signInBtn.style.display = "block", appContentDiv.style.display = "none", openSettingsBtn.style.display = "none", -1 === loadingAuthMessageDiv.innerHTML.indexOf("Access Denied") && (loadingAuthMessageDiv.innerHTML = "<p>Please sign in to access the Project Tracker.</p>"), loadingAuthMessageDiv.style.display = "block", projects = [], projectTableBody && (projectTableBody.innerHTML = ""), tlDashboardContentElement && (tlDashboardContentElement.innerHTML = ""), allowedEmailsList && (allowedEmailsList.innerHTML = ""), firestoreListenerUnsubscribe && (firestoreListenerUnsubscribe(), firestoreListenerUnsubscribe = null, console.log("Firestore listener detached on sign out.")), isAppInitialized = !1, console.log("App content hidden, project data cleared, and Firestore listener detached."), hideLoading()
}) : (console.error("Firebase Auth is not initialized. UI updates based on auth state will not occur."), loadingAuthMessageDiv && (loadingAuthMessageDiv.innerHTML = '<p style="color:red; font-weight:bold;">Authentication services could not be loaded. Please check the console and refresh.</p>', loadingAuthMessageDiv.style.display = "block")), document.addEventListener("DOMContentLoaded", () => {
  if (console.log("DOM fully loaded."), setupDOMReferences(), setupAuthRelatedDOMReferences(), auth) setupAuthEventListeners(), console.log("Auth UI and event listeners set up.");
  else {
    console.error("Firebase Auth not available on DOMContentLoaded. Auth UI setup skipped.");
    let e_authContainer = document.getElementById("auth-container"); // Renamed 'e' to 'e_authContainer'
    e_authContainer && loadingAuthMessageDiv && (loadingAuthMessageDiv.innerHTML = '<p style="color:red; font-weight:bold;">Authentication services could not be loaded. Please check the console and refresh.</p>', loadingAuthMessageDiv.style.display = "block")
  }
});
