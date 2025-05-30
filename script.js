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
  let e = db.collection("projects"),
    t = await db.collection("projects").orderBy("creationTimestamp", "desc").get(),
    a = new Set;
  t.forEach(e => {
    let t = e.data();
    if (t.creationTimestamp) {
      let i = t.creationTimestamp.toDate(),
        n = `${i.getFullYear()}-${String(i.getMonth()+1).padStart(2,"0")}`;
      a.add(n)
    }
  }), monthFilter.innerHTML = '<option value="">All Months</option>', Array.from(a).sort((e, t) => t.localeCompare(e)).forEach(e => {
    let [t, a] = e.split("-"),
      i = new Date(t, parseInt(a) - 1, 1),
      n = document.createElement("option");
    n.value = e, n.textContent = i.toLocaleString("en-US", {
      year: "numeric",
      month: "long"
    }), monthFilter.appendChild(n)
  }), currentSelectedMonth && Array.from(a).includes(currentSelectedMonth) ? monthFilter.value = currentSelectedMonth : (currentSelectedMonth = "", monthFilter.value = "", localStorage.setItem("currentSelectedMonth", ""));
  let i = db.collection("projects").orderBy("creationTimestamp", "desc");
  if (currentSelectedMonth) {
    let [n, r] = currentSelectedMonth.split("-"),
      s = new Date(parseInt(n), parseInt(r) - 1, 1),
      o = new Date(parseInt(n), parseInt(r), 0, 23, 59, 59, 999);
    i = i.where("creationTimestamp", ">=", s).where("creationTimestamp", "<=", o)
  }
  let l = await i.get(),
    d = new Set,
    c = {};
  if (l.forEach(e => {
      let t = e.data();
      t.batchId && (d.add(t.batchId), c[t.batchId] = t.baseProjectName)
    }), batchIdSelect.innerHTML = "", 0 === d.size) {
    let u = document.createElement("option");
    u.value = "", u.textContent = "No batches available", u.disabled = !0, u.selected = !0, batchIdSelect.appendChild(u), currentSelectedBatchId = "", localStorage.setItem("currentSelectedBatchId", ""), projects = [], refreshAllViews(), hideLoading();
    return
  } {
    let m = Array.from(d).sort((e, t) => {
      let a = l.docs.find(t => t.data().batchId === e),
        i = l.docs.find(e => e.data().batchId === t);
      return a && i && a.data().creationTimestamp && i.data().creationTimestamp ? i.data().creationTimestamp.toMillis() - a.data().creationTimestamp.toMillis() : e.localeCompare(t)
    });
    m.forEach(e => {
      let t = document.createElement("option");
      t.value = e, t.textContent = `${c[e]||"Unknown Project"}`, batchIdSelect.appendChild(t)
    }), currentSelectedBatchId && d.has(currentSelectedBatchId) || (currentSelectedBatchId = m[0], localStorage.setItem("currentSelectedBatchId", currentSelectedBatchId)), batchIdSelect.value !== currentSelectedBatchId && (batchIdSelect.value = currentSelectedBatchId)
  }
  currentSelectedBatchId && (e = e.where("batchId", "==", currentSelectedBatchId)), currentSelectedFixCategory && (e = e.where("fixCategory", "==", currentSelectedFixCategory)), e = e.orderBy("fixCategory").orderBy("areaTask");
  try {
    firestoreListenerUnsubscribe = e.onSnapshot(e => {
      let t = [];
      e.forEach(e => {
        e.exists && "function" == typeof e.data && t.push({
          id: e.id,
          ...e.data()
        })
      }), (projects = t).forEach(e => {
        let t = `${e.batchId}_${e.fixCategory}`;
        void 0 === groupVisibilityState[t] && (groupVisibilityState[t] = {
          isExpanded: !0
        }), void 0 === e.breakDurationMinutes && (e.breakDurationMinutes = 0), void 0 === e.additionalMinutesManual && (e.additionalMinutesManual = 0), void 0 === e.startTimeDay3 && (e.startTimeDay3 = null), void 0 === e.finishTimeDay3 && (e.finishTimeDay3 = null), void 0 === e.durationDay3Ms && (e.durationDay3Ms = null)
      }), refreshAllViews()
    }, e => {
      console.error("Error fetching projects: ", e), projects = [], refreshAllViews(), alert("Error loading projects: " + e.message)
    })
  } catch (g) {
    console.error("Error setting up Firebase listener: ", g), alert("CRITICAL ERROR: Could not set up real-time project updates. Error: " + g.message)
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
      alert("No active tasks to release in the current stage for this batch."), refreshAllViews();
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
      alert("No active tasks to release after filtering out reassigned ones."), refreshAllViews();
      return
    }
    let r = n.every(e => e && ("Completed" === e.status || "Day1Ended_AwaitingNext" === e.status || "Day2Ended_AwaitingNext" === e.status));
    if (!r) {
      alert(`Not all active tasks in ${t} are 'Completed', 'Day 1 Ended', or 'Day 2 Ended'. Cannot release.`);
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
          assignedTo: l.assignedTo,
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
          originalProjectId: l.id,
          breakDurationMinutes: 0,
          additionalMinutesManual: 0
        };
        o.set(db.collection("projects").doc(), u)
      }
      o.update(db.collection("projects").doc(l.id), {
        releasedToNextStage: !0,
        lastModifiedTimestamp: s
      })
    }
    await o.commit(), initializeFirebaseAndLoadData()
  } catch (m) {
    console.error("Error releasing batch:", m), alert("Error releasing batch: " + m.message)
  } finally {
    hideLoading()
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
  let e = [...projects];
  e.sort((e, t) => {
    if (!e || !t) return 0;
    let a = FIX_CATEGORIES_ORDER.indexOf(e.fixCategory || ""),
      i = FIX_CATEGORIES_ORDER.indexOf(t.fixCategory || "");
    if (a < i) return -1;
    if (a > i) return 1;
    if ((e.areaTask || "") < (t.areaTask || "")) return -1;
    if ((e.areaTask || "") > (t.areaTask || "")) return 1;
    let n = STATUS_ORDER[e.status || ""] || 99,
      r = STATUS_ORDER[t.status || ""] || 99;
    return n < r ? -1 : n > r ? 1 : 0
  });
  let t = null,
    a = null;
  e.forEach(e => {
    if (!e || !e.id || !e.batchId || !e.fixCategory) return;
    if (e.batchId !== t) {
      t = e.batchId, a = null;
      let i = projectTableBody.insertRow();
      i.classList.add("batch-header-row");
      let n = i.insertCell();
      n.setAttribute("colspan", 15..toString()), n.textContent = `Project Batch: ${e.baseProjectName||"Unknown"} (ID: ${e.batchId.split("_")[1]||"N/A"})`
    }
    if (e.fixCategory !== a) {
      a = e.fixCategory;
      let r = `${e.batchId}_${a}`;
      void 0 === groupVisibilityState[r] && (groupVisibilityState[r] = {
        isExpanded: !0
      });
      let s = projectTableBody.insertRow();
      s.classList.add("fix-group-header");
      let o = s.insertCell();
      o.setAttribute("colspan", 15..toString());
      let l = document.createElement("button");
      l.classList.add("btn", "btn-group-toggle");
      let d = groupVisibilityState[r]?.isExpanded !== !1;
      l.textContent = d ? "−" : "+", l.title = d ? `Collapse ${a}` : `Expand ${a}`, o.appendChild(document.createTextNode(`${a} `)), o.appendChild(l), o.onclick = e => {
        (e.target === l || e.target === o || o.contains(e.target)) && groupVisibilityState[r] && (groupVisibilityState[r].isExpanded = !groupVisibilityState[r].isExpanded, saveGroupVisibilityState(), renderProjects())
      }
    }
    let c = projectTableBody.insertRow(),
      u = `${e.batchId}_${e.fixCategory}`;
    groupVisibilityState[u]?.isExpanded !== !1 || c.classList.add("hidden-group-row"), e.fixCategory && c.classList.add(`${e.fixCategory.toLowerCase()}-row`), e.isReassigned && c.classList.add("reassigned-task-highlight"), c.insertCell().textContent = e.fixCategory || "N/A";
    let m = c.insertCell();
    m.textContent = e.baseProjectName || "N/A", m.classList.add("wrap-text"), c.insertCell().textContent = e.areaTask || "N/A", c.insertCell().textContent = e.gsd || "N/A";
    let g = c.insertCell(),
      y = document.createElement("select");
    y.classList.add("assigned-to-select"), y.disabled = "Reassigned_TechAbsent" === e.status;
    let h = document.createElement("option");
    h.value = "", h.textContent = "Select Tech ID", y.appendChild(h), TECH_IDS.forEach(e => {
      let t = document.createElement("option");
      t.value = e, t.textContent = e, y.appendChild(t)
    }), y.value = e.assignedTo || "", y.onchange = async t => {
      showLoading("Updating assignment...");
      let a = t.target.value,
        i = e.assignedTo || "";
      if (!db || !e.id) {
        alert("Database or project ID missing. Cannot update assignment."), t.target.value = e.assignedTo || "", hideLoading();
        return
      }
      try {
        await db.collection("projects").doc(e.id).update({
          assignedTo: a,
          lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
        }), e.assignedTo = a
      } catch (n) {
        console.error("Error updating assignedTo:", n), alert("Error updating assignment: " + n.message), t.target.value = i
      } finally {
        hideLoading()
      }
    }, g.appendChild(y);
    let p = c.insertCell(),
      b = document.createElement("span");
    b.classList.add("status");
    let f = (e.status || "Unknown").replace(/([A-Z])(?=[a-z0-9_])/g, " $1").trim();

    function D(e) {
      if (!e) return "";
      let t;
      try {
        if (t = "function" == typeof e.toDate ? e.toDate() : new Date(e), isNaN(t.getTime())) return ""
      } catch (a) {
        return ""
      }
      return t.toTimeString().slice(0, 5)
    }

    async function T(e, t, a, i) {
      if (showLoading(`Updating ${t}...`), !db || !e) {
        alert("Database or project ID missing. Cannot update time."), hideLoading();
        return
      }
      let n = null;
      if (a) {
        let r = new Date,
          [s, o] = a.split(":").map(Number);
        r.setHours(s, o, 0, 0), n = firebase.firestore.Timestamp.fromDate(r)
      }
      try {
        let l = {
          [t]: n,
          lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        await db.collection("projects").doc(e).update(l);
        let d = { ...i,
            [t]: n
          },
          c = "",
          u = null,
          m = null;
        if (t.includes("Day1") ? (c = "durationDay1Ms", u = d.startTimeDay1, m = d.finishTimeDay1) : t.includes("Day2") ? (c = "durationDay2Ms", u = d.startTimeDay2, m = d.finishTimeDay2) : t.includes("Day3") && (c = "durationDay3Ms", u = d.startTimeDay3, m = d.finishTimeDay3), u && m && c) {
          let g = calculateDurationMs(u, m);
          await db.collection("projects").doc(e).update({
            [c]: g,
            lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
          })
        }
      } catch (y) {
        console.error(`Error updating ${t}:`, y), alert(`Error updating ${t}: ` + y.message)
      } finally {
        hideLoading()
      }
    }
    "Day1Ended_AwaitingNext" === e.status && (f = "Started Day 1 Ended"), "Day2Ended_AwaitingNext" === e.status && (f = "Started Day 2 Ended"), "Reassigned_TechAbsent" === e.status && (f = "Re-Assigned"), b.textContent = f, b.classList.add(`status-${(e.status||"unknown").toLowerCase()}`);
    let E = "Reassigned_TechAbsent" === e.status,
      I = c.insertCell(),
      M = document.createElement("input");
    M.type = "time", M.value = D(e.startTimeDay1), M.disabled = E, M.onchange = t => T(e.id, "startTimeDay1", t.target.value, e), I.appendChild(M);
    let C = c.insertCell(),
      w = document.createElement("input");
    w.type = "time", w.value = D(e.finishTimeDay1), w.disabled = E, w.onchange = t => T(e.id, "finishTimeDay1", t.target.value, e), C.appendChild(w);
    let A = c.insertCell(),
      L = document.createElement("input");
    L.type = "time", L.value = D(e.startTimeDay2), L.disabled = E, L.onchange = t => T(e.id, "startTimeDay2", t.target.value, e), A.appendChild(L);
    let S = c.insertCell(),
      v = document.createElement("input");
    v.type = "time", v.value = D(e.finishTimeDay2), v.disabled = E, v.onchange = t => T(e.id, "finishTimeDay2", t.target.value, e), S.appendChild(v);
    let B = c.insertCell(),
      k = document.createElement("input");
    k.type = "time", k.value = D(e.startTimeDay3), k.disabled = E, k.onchange = t => T(e.id, "startTimeDay3", t.target.value, e), B.appendChild(k);
    let j = c.insertCell(),
      x = document.createElement("input");
    x.type = "time", x.value = D(e.finishTimeDay3), x.disabled = E, x.onchange = t => T(e.id, "finishTimeDay3", t.target.value, e), j.appendChild(x);
    let F = (e.durationDay1Ms || 0) + (e.durationDay2Ms || 0) + (e.durationDay3Ms || 0),
      P = 6e4 * (e.breakDurationMinutes || 0),
      N, $ = Math.max(0, F - P) + 6e4 * (e.additionalMinutesManual || 0);
    0 === F && 0 === (e.breakDurationMinutes || 0) && 0 === (e.additionalMinutesManual || 0) && ($ = null);
    let _ = c.insertCell();
    _.textContent = formatMillisToMinutes($), _.classList.add("total-duration-column");
    let R = c.insertCell(),
      O = document.createElement("textarea");
    O.value = e.techNotes || "", O.placeholder = "Notes", O.classList.add("tech-notes-input"), O.rows = 1, O.id = `techNotes_${e.id}`, O.disabled = "Reassigned_TechAbsent" === e.status, O.onchange = async t => {
      showLoading("Updating tech notes...");
      let a = t.target.value,
        i = e.techNotes || "";
      if (!db || !e.id) {
        alert("Database or project ID missing. Cannot update notes."), t.target.value = e.techNotes || "", hideLoading();
        return
      }
      try {
        await db.collection("projects").doc(e.id).update({
          techNotes: a,
          lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
        }), e.techNotes = a
      } catch (n) {
        console.error("Error updating techNotes:", n), alert("Error updating tech notes: " + n.message), t.target.value = i
      } finally {
        hideLoading()
      }
    }, R.appendChild(O);
    let U = c.insertCell(),
      z = document.createElement("div");
    z.classList.add("action-buttons-container");
    let V = document.createElement("select");
    V.classList.add("break-select"), V.id = `breakSelect_${e.id}`, V.title = "Select break time to deduct", V.disabled = E;
    let H = document.createElement("option");
    H.value = "0", H.textContent = "No Break", V.appendChild(H);
    let G = document.createElement("option");
    G.value = "15", G.textContent = "15m Break", V.appendChild(G);
    let X = document.createElement("option");
    X.value = "60", X.textContent = "1h Break", V.appendChild(X);
    let W = document.createElement("option");
    W.value = "90", W.textContent = "1h30m Break", V.appendChild(W), V.value = "number" == typeof e.breakDurationMinutes ? e.breakDurationMinutes.toString() : "0", V.onchange = async t => {
      showLoading("Updating break duration...");
      let a = parseInt(t.target.value, 10),
        i = e.breakDurationMinutes || 0;
      if (!db || !e.id) {
        alert("Database or project ID missing. Cannot update break duration."), t.target.value = i.toString(), hideLoading();
        return
      }
      try {
        await db.collection("projects").doc(e.id).update({
          breakDurationMinutes: a,
          lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        let n = t.target.closest("tr");
        if (n) {
          let r = n.querySelector(".total-duration-column");
          if (r) {
            let s = (e.durationDay1Ms || 0) + (e.durationDay2Ms || 0) + (e.durationDay3Ms || 0),
              o = 6e4 * (e.additionalMinutesManual || 0),
              l = Math.max(0, s - 6e4 * a) + o;
            0 === s && 0 === a && 0 === (e.additionalMinutesManual || 0) && (l = null), r.textContent = formatMillisToMinutes(l), e.breakDurationMinutes = a
          }
        }
      } catch (d) {
        console.error("Error updating break duration:", d), alert("Error updating break duration: " + d.message), t.target.value = i.toString()
      } finally {
        hideLoading()
      }
    }, z.appendChild(V);
    let q = document.createElement("button");
    q.textContent = "Start D1", q.classList.add("btn", "btn-day-start"), q.disabled = E || !["Available"].includes(e.status), q.onclick = () => {
      e.id && updateProjectState(e.id, "startDay1")
    }, z.appendChild(q);
    let K = document.createElement("button");
    K.textContent = "End D1", K.classList.add("btn", "btn-day-end"), K.disabled = E || "InProgressDay1" !== e.status, K.onclick = () => {
      e.id && updateProjectState(e.id, "endDay1")
    }, z.appendChild(K);
    let J = document.createElement("button");
    J.textContent = "Start D2", J.classList.add("btn", "btn-day-start"), J.disabled = E || !["Day1Ended_AwaitingNext"].includes(e.status), J.onclick = () => {
      e.id && updateProjectState(e.id, "startDay2")
    }, z.appendChild(J);
    let Y = document.createElement("button");
    Y.textContent = "End D2", Y.classList.add("btn", "btn-day-end"), Y.disabled = E || "InProgressDay2" !== e.status, Y.onclick = () => {
      e.id && updateProjectState(e.id, "endDay2")
    }, z.appendChild(Y);
    let Z = document.createElement("button");
    Z.textContent = "Start D3", Z.classList.add("btn", "btn-day-start"), Z.disabled = E || !["Day2Ended_AwaitingNext"].includes(e.status), Z.onclick = () => {
      e.id && updateProjectState(e.id, "startDay3")
    }, z.appendChild(Z);
    let Q = document.createElement("button");
    Q.textContent = "End D3", Q.classList.add("btn", "btn-day-end"), Q.disabled = E || "InProgressDay3" !== e.status, Q.onclick = () => {
      e.id && updateProjectState(e.id, "endDay3")
    }, z.appendChild(Q);
    let ee = document.createElement("button");
    ee.textContent = "Done", ee.classList.add("btn", "btn-mark-done"), ee.disabled = E || "Completed" === e.status, ee.onclick = () => {
      e.id && updateProjectState(e.id, "markDone")
    }, z.appendChild(ee);
    let et = document.createElement("button");
    et.textContent = "Re-Assign", et.classList.add("btn", "btn-warning"), et.title = "Re-assign task by creating a new entry.", et.disabled = "Completed" === e.status || E, et.onclick = () => {
      let t = projects.find(t => t.id === e.id);
      t && handleReassignment(t)
    }, z.appendChild(et), U.appendChild(z)
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
      "Completed" !== i.status && (l.status = "Completed", c = "Completed", i.startTimeDay1 && !i.finishTimeDay1 && (l.finishTimeDay1 = s, l.durationDay1Ms = calculateDurationMs(i.startTimeDay1, o)), i.startTimeDay2 && !i.finishTimeDay2 && (l.finishTimeDay2 = s, l.durationDay2Ms = calculateDurationMs(i.startTimeDay2, o)), i.startTimeDay3 && !i.finishTimeDay3 && (l.finishTimeDay3 = s, l.durationDay3Ms = calculateDurationMs(i.startTimeDay3, o)), "Available" === i.status || (i.startTimeDay2 || !i.startTimeDay1 || i.finishTimeDay1 ? i.startTimeDay1 && i.finishTimeDay1 && !i.startTimeDay2 ? (l.startTimeDay2 = null, l.finishTimeDay2 = null, l.durationDay2Ms = null, l.startTimeDay3 = null, l.finishTimeDay3 = null, l.durationDay3Ms = null) : i.startTimeDay2 && !i.finishTimeDay2 ? (l.finishTimeDay2 = s, l.durationDay2Ms = calculateDurationMs(i.startTimeDay2, o), l.startTimeDay3 = null, l.finishTimeDay3 = null, l.durationDay3Ms = null) : i.startTimeDay2 && i.finishTimeDay2 && !i.startTimeDay3 && (l.startTimeDay3 = null, l.finishTimeDay3 = null, l.durationDay3Ms = null) : (l.finishTimeDay1 = s, l.durationDay1Ms = calculateDurationMs(i.startTimeDay1, o), l.startTimeDay2 = null, l.finishTimeDay2 = null, l.durationDay2Ms = null, l.startTimeDay3 = null, l.finishTimeDay3 = null, l.durationDay3Ms = null)));
      break;
    default:
      hideLoading();
      return
  }
  if (Object.keys(l).length > 1) try {
    await a.update(l)
  } catch (u) {
    console.error(`Error updating project ${e}:`, u), alert("Error updating project status: " + u.message)
  } finally {
    hideLoading()
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
        creationTimestamp: i,
        lastModifiedTimestamp: i,
        isReassigned: !0,
        originalProjectId: e.id,
        releasedToNextStage: !1,
        breakDurationMinutes: 0,
        additionalMinutesManual: 0
      },
      r = db.collection("projects").doc();
    a.set(r, n), a.update(db.collection("projects").doc(e.id), {
      status: "Reassigned_TechAbsent",
      lastModifiedTimestamp: i
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
    renderProjects()
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
    return
  }
  if (showLoading("Generating TL Summary..."), tlSummaryContent.innerHTML = "<p>Loading summary...</p>", !db) {
    tlSummaryContent.innerHTML = '<p style="color:red;">Database not initialized. Cannot generate summary.</p>', hideLoading();
    return
  }
  try {
    let e = await db.collection("projects").get(),
      t = [];
    e.forEach(e => {
      e.exists && "function" == typeof e.data && t.push({
        id: e.id,
        ...e.data()
      })
    });
    let a = {},
      i = {};
    t.forEach(e => {
      e.durationDay1Ms = "number" == typeof e.durationDay1Ms ? e.durationDay1Ms : 0, e.durationDay2Ms = "number" == typeof e.durationDay2Ms ? e.durationDay2Ms : 0, e.durationDay3Ms = "number" == typeof e.durationDay3Ms ? e.durationDay3Ms : 0, e.breakDurationMinutes = "number" == typeof e.breakDurationMinutes ? e.breakDurationMinutes : 0, e.additionalMinutesManual = "number" == typeof e.additionalMinutesManual ? e.additionalMinutesManual : 0;
      let t = e.durationDay1Ms + e.durationDay2Ms + e.durationDay3Ms,
        n = 6e4 * e.breakDurationMinutes,
        r = 6e4 * e.additionalMinutesManual,
        s = Math.max(0, t - n) + r;
      if (s <= 0 && 0 === e.breakDurationMinutes && 0 === e.additionalMinutesManual) return;
      let o = `${e.baseProjectName||"Unknown Project"}_${e.fixCategory||"Unknown Fix"}`;
      a[o] || (a[o] = {
        projectName: e.baseProjectName || "Unknown Project",
        fixCategory: e.fixCategory || "Unknown Fix",
        totalMinutes: 0
      }), a[o].totalMinutes += Math.floor(s / 6e4);
      let l = e.baseProjectName || "Unknown Project";
      i[l] || (i[l] = {
        projectName: l,
        totalMinutes: 0
      }), i[l].totalMinutes += Math.floor(s / 6e4)
    });
    let n = '<ul style="list-style: none; padding: 0;">',
      r = Object.keys(i).sort();
    r.length > 0 && (n += "<h3>Overall Project Totals (All Fix Categories)</h3>", r.forEach(e => {
      let t = i[e],
        a = (t.totalMinutes / 60).toFixed(2);
      n += `
                    <li class="tl-summary-overall-total">
                        <strong>Project:</strong> ${t.projectName}<br>
                        <strong>Total Across All Fixes:</strong> ${t.totalMinutes} minutes<br>
                        <strong>Decimal:</strong> ${a} hours
                    </li>
                `
    }), n += '<hr style="margin: 20px 0;">'), n += "<h3>Totals by Project and Fix Category</h3>";
    let s = Object.keys(a).sort();
    s.forEach(e => {
      let t = a[e],
        i = (t.totalMinutes / 60).toFixed(2);
      n += `
                <li style="margin-bottom: 8px; padding-bottom: 5px; border-bottom: 1px dotted #eee;">
                    <strong>Project Name:</strong> ${t.projectName} (${t.fixCategory})<br>
                    <strong>Total:</strong> ${t.totalMinutes} minutes<br>
                    <strong>Decimal:</strong> ${i} hours
                </li>
            `
    }), 0 === s.length && 0 === r.length ? n = "<p>No project time data found to generate a summary.</p>" : n += "</ul>", tlSummaryContent.innerHTML = n
  } catch (o) {
    console.error("Error generating TL Summary:", o), tlSummaryContent.innerHTML = '<p style="color:red;">Error generating summary: ' + o.message + "</p>", alert("Error generating TL Summary: " + o.message)
  } finally {
    hideLoading()
  }
}

function setupAuthEventListeners() {
  let e = new firebase.auth.GoogleAuthProvider;
  e.addScope("email"), signInBtn ? signInBtn.addEventListener("click", () => {
    if (showLoading("Signing in..."), !auth) {
      console.error("Auth not initialized"), hideLoading();
      return
    }
    auth.signInWithPopup(e).then(e => {
      console.log("Sign-in attempt successful for: ", e.user.email)
    }).catch(e => {
      console.error("Sign-in error: ", e);
      let t = "Error signing in: " + e.message;
      "auth/popup-closed-by-user" === e.code ? t = "Sign-in process was cancelled. Please try again." : "auth/cancelled-popup-request" === e.code ? t = "Sign-in process was interrupted. Please try again." : "auth/popup-blocked" === e.code ? t = "Sign-in pop-up was blocked by the browser. Please allow pop-ups for this site and try again." : "auth/network-request-failed" === e.code && (t = "Network error. Please check your internet connection."), alert(t), loadingAuthMessageDiv && signInBtn && userInfoDisplayDiv && appContentDiv && (userInfoDisplayDiv.style.display = "none", signInBtn.style.display = "block", appContentDiv.style.display = "none", loadingAuthMessageDiv.innerHTML = "<p>Please sign in to access the Project Tracker.</p>", loadingAuthMessageDiv.style.display = "block"), hideLoading()
    })
  }) : console.error("Sign-in button not found during event listener setup."), signOutBtn ? signOutBtn.addEventListener("click", () => {
    if (showLoading("Signing out..."), !auth) {
      console.error("Auth not initialized"), hideLoading();
      return
    }
    auth.signOut().then(() => {
      console.log("User signed out successfully by clicking button.")
    }).catch(e => {
      console.error("Sign-out error: ", e), alert("Error signing out: " + e.message), hideLoading()
    })
  }) : console.error("Sign-out button not found during event listener setup.")
}

function initializeAppComponents() {
  isAppInitialized ? (console.log("App components already initialized or re-initializing data load."), initializeFirebaseAndLoadData()) : (console.log("Initializing app components (DOM refs, event listeners, Firestore data)..."), setupDOMReferences(), attachEventListeners(), initializeFirebaseAndLoadData(), isAppInitialized = !0)
}

auth ? auth.onAuthStateChanged(async e => {
  if (setupDOMReferences(), setupAuthRelatedDOMReferences(), !userNameP || !userEmailP || !userPhotoImg || !userInfoDisplayDiv || !signInBtn || !appContentDiv || !loadingAuthMessageDiv || !openSettingsBtn) {
    console.error("One or more critical UI elements for auth state change not found. Aborting UI update."), hideLoading();
    return
  }
  if (e) {
    showLoading("Checking authorization..."), await fetchAllowedEmails();
    let t = e.email ? e.email.toLowerCase() : "";
    e.email && allowedEmailsFromFirestore.map(e => e.toLowerCase()).includes(t) ? (console.log("Auth state changed: User is SIGNED IN and ALLOWED - ", e.displayName, e.email), userNameP.textContent = e.displayName || "Name not available", userEmailP.textContent = e.email || "Email not available", userPhotoImg.src = e.photoURL || "default-user.png", userInfoDisplayDiv.style.display = "flex", signInBtn.style.display = "none", loadingAuthMessageDiv.style.display = "none", appContentDiv.style.display = "block", openSettingsBtn.style.display = "block", initializeAppComponents()) : (console.warn("Auth state changed: User SIGNED IN but NOT ALLOWED - ", e.email), alert("Access Denied: Your email address (" + (e.email || "N/A") + ") is not authorized to use this application. You will be signed out."), auth.signOut().then(() => {
      console.log("Unauthorized user automatically signed out."), loadingAuthMessageDiv.innerHTML = "<p>Access Denied. Please sign in with an authorized account.</p>", userInfoDisplayDiv.style.display = "none", signInBtn.style.display = "block", appContentDiv.style.display = "none", loadingAuthMessageDiv.style.display = "block", openSettingsBtn.style.display = "none", projects = [], projectTableBody && (projectTableBody.innerHTML = ""), tlDashboardContentElement && (tlDashboardContentElement.innerHTML = ""), allowedEmailsList && (allowedEmailsList.innerHTML = ""), firestoreListenerUnsubscribe && (firestoreListenerUnsubscribe(), firestoreListenerUnsubscribe = null, console.log("Firestore listener detached for unauthorized user sign out.")), isAppInitialized = !1, hideLoading()
    }).catch(e => {
      console.error("Error signing out unauthorized user:", e), alert("Error signing out unauthorized user: " + e.message), userInfoDisplayDiv.style.display = "none", signInBtn.style.display = "block", appContentDiv.style.display = "none", loadingAuthMessageDiv.innerHTML = "<p>Access Denied. Error during sign out. Please refresh.</p>", loadingAuthMessageDiv.style.display = "block", openSettingsBtn.style.display = "none", hideLoading()
    }))
  } else console.log("Auth state changed: User is SIGNED OUT"), userNameP.textContent = "", userEmailP.textContent = "", userPhotoImg.src = "", userInfoDisplayDiv.style.display = "none", signInBtn.style.display = "block", appContentDiv.style.display = "none", openSettingsBtn.style.display = "none", -1 === loadingAuthMessageDiv.innerHTML.indexOf("Access Denied") && (loadingAuthMessageDiv.innerHTML = "<p>Please sign in to access the Project Tracker.</p>"), loadingAuthMessageDiv.style.display = "block", projects = [], projectTableBody && (projectTableBody.innerHTML = ""), tlDashboardContentElement && (tlDashboardContentElement.innerHTML = ""), allowedEmailsList && (allowedEmailsList.innerHTML = ""), firestoreListenerUnsubscribe && (firestoreListenerUnsubscribe(), firestoreListenerUnsubscribe = null, console.log("Firestore listener detached on sign out.")), isAppInitialized = !1, console.log("App content hidden, project data cleared, and Firestore listener detached."), hideLoading()
}) : (console.error("Firebase Auth is not initialized. UI updates based on auth state will not occur."), loadingAuthMessageDiv && (loadingAuthMessageDiv.innerHTML = '<p style="color:red; font-weight:bold;">Authentication services could not be loaded. Please check the console and refresh.</p>', loadingAuthMessageDiv.style.display = "block")), document.addEventListener("DOMContentLoaded", () => {
  if (console.log("DOM fully loaded."), setupDOMReferences(), setupAuthRelatedDOMReferences(), auth) setupAuthEventListeners(), console.log("Auth UI and event listeners set up.");
  else {
    console.error("Firebase Auth not available on DOMContentLoaded. Auth UI setup skipped.");
    let e = document.getElementById("auth-container");
    e && loadingAuthMessageDiv && (loadingAuthMessageDiv.innerHTML = '<p style="color:red; font-weight:bold;">Authentication services could not be loaded. Please check the console and refresh.</p>', loadingAuthMessageDiv.style.display = "block")
  }
});
