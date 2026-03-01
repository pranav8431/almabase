const api = "";

const READY_QUESTIONS = [
  "Is multi-factor authentication required for employee and contractor accounts?",
  "What is the retention period for access and security logs?",
  "How often are production backups executed?",
  "Which cloud provider hosts production workloads?",
  "What are the documented RTO and RPO targets?",
  "Within what timeframe are customers notified after a confirmed incident?",
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VIEW_HOME = "home";
const VIEW_AUTH = "auth";
const VIEW_WORKFLOW = "workflow";
const VIEW_ASK = "ask";

function setStatus(id, message, isError = false) {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = message;
  element.className = isError ? "status error" : "status";
}

function token() {
  return localStorage.getItem("access_token") || "";
}

function showView(view) {
  const homePage = document.getElementById("homePage");
  const authPage = document.getElementById("authPage");
  const workflowPage = document.getElementById("workflowPage");
  const askPage = document.getElementById("askPage");
  if (!homePage || !authPage || !workflowPage || !askPage) return;

  homePage.classList.toggle("hidden", view !== VIEW_HOME);
  authPage.classList.toggle("hidden", view !== VIEW_AUTH);
  workflowPage.classList.toggle("hidden", view !== VIEW_WORKFLOW);
  askPage.classList.toggle("hidden", view !== VIEW_ASK);
}

function goHomePage() {
  showView(VIEW_HOME);
}

function goToAuthPage() {
  showView(VIEW_AUTH);
}

function ensureAuthenticated(statusId = "authStatus") {
  if (token()) return true;
  showView(VIEW_AUTH);
  setStatus(statusId, "Please log in first.", true);
  return false;
}

function goToWorkflowPage() {
  if (!ensureAuthenticated("authStatus")) return;
  showView(VIEW_WORKFLOW);
}

function goToAskPage() {
  if (!ensureAuthenticated("authStatus")) return;
  showView(VIEW_ASK);
}

function setSessionUI() {
  const hasToken = Boolean(token());
  const logoutBtn = document.getElementById("logoutBtn");
  const sessionInfo = document.getElementById("sessionInfo");
  const email = localStorage.getItem("session_email") || "";

  if (logoutBtn) logoutBtn.disabled = !hasToken;
  if (sessionInfo) {
    sessionInfo.textContent = hasToken ? `Logged in: ${email || "User"}` : "Not logged in";
  }
}

function normalizeResult(item) {
  return {
    id: item.id,
    question: item.question || "",
    answer: item.answer || "Not found in references.",
    citations: item.citations || [],
    confidence: item.confidence ?? 0,
    evidence_snippets: item.evidence_snippets || [],
  };
}

function authHeaders(extra = {}) {
  const headers = { ...extra };
  if (token()) {
    headers.Authorization = `Bearer ${token()}`;
  }
  return headers;
}

function escapeHtml(text) {
  return (text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isValidEmail(value) {
  return EMAIL_PATTERN.test((value || "").trim());
}

function toggleSignupBlock() {
  const signupBlock = document.getElementById("signupBlock");
  if (!signupBlock) return;
  signupBlock.classList.toggle("hidden");
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return await response.json();
  }
  const text = await response.text();
  return { detail: text || "Request failed" };
}

async function signup() {
  const email = document.getElementById("signupEmail")?.value.trim() || "";
  const password = document.getElementById("signupPassword")?.value || "";

  if (!isValidEmail(email)) {
    setStatus("authStatus", "Enter correct email", true);
    return;
  }

  try {
    const response = await fetch(`${api}/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await parseResponse(response);
    if (!response.ok) throw new Error(data.detail || "Signup failed");

    await loginWithCredentials(email, password);
    setStatus("authStatus", `Signup successful. Logged in as ${data.email}`);
    await loadSavedAnswers();
    showView(VIEW_WORKFLOW);
  } catch (error) {
    setStatus("authStatus", error.message, true);
  }
}

async function loginWithCredentials(username, password) {
  const body = new URLSearchParams({ username, password });
  const response = await fetch(`${api}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await parseResponse(response);
  if (!response.ok) throw new Error(data.detail || "Login failed");

  localStorage.setItem("access_token", data.access_token);
  localStorage.setItem("session_email", username);
  setSessionUI();
}

async function login() {
  const username = document.getElementById("loginEmail")?.value.trim() || "";
  const password = document.getElementById("loginPassword")?.value || "";

  if (!isValidEmail(username)) {
    setStatus("authStatus", "Enter correct email", true);
    return;
  }

  try {
    await loginWithCredentials(username, password);
    setStatus("authStatus", "Login successful. Token stored in browser.");
    await loadSavedAnswers();
    showView(VIEW_WORKFLOW);
  } catch (error) {
    setStatus("authStatus", error.message, true);
  }
}

function logout() {
  if (!token()) {
    setStatus("authStatus", "You are already logged out.");
    return;
  }
  localStorage.removeItem("access_token");
  localStorage.removeItem("session_email");
  setSessionUI();
  setStatus("authStatus", "Logged out.");
  goHomePage();
}

async function loadReferences() {
  try {
    const response = await fetch(`${api}/references`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Failed to load references");

    const list = document.getElementById("references");
    if (!list) return;
    list.innerHTML = "";

    const references = data.references || [];
    if (!references.length) {
      list.innerHTML = '<li class="small">No reference documents available.</li>';
      return;
    }

    for (const file of references) {
      const item = document.createElement("li");
      item.textContent = file;
      list.appendChild(item);
    }
  } catch (error) {
    const list = document.getElementById("references");
    if (!list) return;
    list.innerHTML = `<li class="small">${escapeHtml(error.message)}</li>`;
  }
}

async function uploadQuestionnaire() {
  if (!ensureAuthenticated("uploadStatus")) return;
  const file = document.getElementById("questionnaireFile")?.files?.[0];
  if (!file) {
    setStatus("uploadStatus", "Select a questionnaire file first.", true);
    return;
  }

  try {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${api}/upload-questionnaire`, {
      method: "POST",
      headers: authHeaders(),
      body: formData,
    });
    const data = await parseResponse(response);
    if (!response.ok) throw new Error(data.detail || "Questionnaire upload failed");

    setStatus("uploadStatus", data.message || "Questionnaire uploaded.");
  } catch (error) {
    setStatus("uploadStatus", error.message, true);
  }
}

async function generateFromQuestionnaire() {
  if (!ensureAuthenticated("generateStatus")) return;
  try {
    const response = await fetch(`${api}/generate`, {
      method: "POST",
      headers: authHeaders(),
    });
    const data = await parseResponse(response);
    if (!response.ok) throw new Error(data.detail || "Generation failed");

    const summary = data.summary || {};
    const summaryElement = document.getElementById("summary");
    if (summaryElement) {
      summaryElement.textContent =
        `Total: ${summary.total_questions ?? 0} | Answered: ${summary.answered_with_citations ?? 0} | Not found: ${summary.not_found ?? 0}`;
    }

    const results = (data.results || []).map(normalizeResult);
    renderGeneratedResults(results);
    setStatus("generateStatus", "Generated answers from questionnaire.");
  } catch (error) {
    setStatus("generateStatus", error.message, true);
  }
}

async function saveEditedAnswer(answerId, textareaId) {
  const textarea = document.getElementById(textareaId);
  if (!textarea) return;

  const answer = (textarea.value || "").trim();
  if (!answer) {
    setStatus("generateStatus", "Answer cannot be empty.", true);
    return;
  }

  try {
    const response = await fetch(`${api}/answers/${answerId}`, {
      method: "PUT",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ answer }),
    });
    const data = await parseResponse(response);
    if (!response.ok) throw new Error(data.detail || "Failed to save answer");

    setStatus("generateStatus", `Saved answer #${answerId}.`);
  } catch (error) {
    setStatus("generateStatus", error.message, true);
  }
}

function renderGeneratedResults(results) {
  const container = document.getElementById("generatedResults");
  if (!container) return;

  container.innerHTML = "";
  if (!results.length) {
    container.innerHTML = '<p class="small">No generated answers yet.</p>';
    return;
  }

  for (const item of results) {
    const result = normalizeResult(item);
    const card = document.createElement("div");
    card.className = "block";

    const citations = result.citations.join(", ") || "None";
    const textareaId = `answer-edit-${result.id}`;

    card.innerHTML = `
      <p><strong>Question:</strong> ${escapeHtml(result.question)}</p>
      <label class="label" for="${textareaId}">Review / Edit Answer</label>
      <textarea id="${textareaId}">${escapeHtml(result.answer)}</textarea>
      <p><strong>Citations:</strong> ${escapeHtml(citations)}</p>
      <div class="actions">
        <button type="button" data-save-id="${result.id}" data-textarea-id="${textareaId}">Save Edit</button>
      </div>
    `;

    container.appendChild(card);
  }

  const saveButtons = container.querySelectorAll("button[data-save-id]");
  for (const button of saveButtons) {
    button.addEventListener("click", () => {
      const answerId = button.getAttribute("data-save-id");
      const textareaId = button.getAttribute("data-textarea-id");
      if (!answerId || !textareaId) return;
      saveEditedAnswer(answerId, textareaId);
    });
  }
}

async function loadSavedAnswers() {
  if (!token()) {
    renderGeneratedResults([]);
    return;
  }

  try {
    const response = await fetch(`${api}/answers`, {
      method: "GET",
      headers: authHeaders(),
    });
    const data = await parseResponse(response);
    if (!response.ok) throw new Error(data.detail || "Failed to load answers");

    renderGeneratedResults((data.results || []).map(normalizeResult));
  } catch (error) {
    setStatus("generateStatus", error.message, true);
  }
}

async function exportDocument() {
  if (!ensureAuthenticated("exportStatus")) return;
  try {
    const response = await fetch(`${api}/export`, {
      method: "GET",
      headers: authHeaders(),
    });

    if (!response.ok) {
      const data = await parseResponse(response);
      throw new Error(data.detail || "Export failed");
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;

    const disposition = response.headers.get("content-disposition") || "";
    const match = disposition.match(/filename="?([^";]+)"?/i);
    anchor.download = match ? match[1] : "questionnaire_answers.txt";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);

    setStatus("exportStatus", "Export downloaded successfully.");
  } catch (error) {
    setStatus("exportStatus", error.message, true);
  }
}

async function askQuestion() {
  if (!ensureAuthenticated("askStatus")) return;
  const question = document.getElementById("questionInput")?.value.trim() || "";
  if (!question) {
    setStatus("askStatus", "Type a question first.", true);
    return;
  }

  try {
    const response = await fetch(`${api}/ask`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ question }),
    });
    const data = await parseResponse(response);
    if (!response.ok) throw new Error(data.detail || "Failed to answer question");

    renderAskResult(data);
    setStatus("askStatus", "Answer generated.");
  } catch (error) {
    setStatus("askStatus", error.message, true);
  }
}

function renderAskResult(result) {
  const container = document.getElementById("askResult");
  if (!container) return;

  const citations = (result.citations || []).join(", ") || "None";
  const evidence = (result.evidence_snippets || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("");
  container.innerHTML = `
    <p><strong>Question:</strong> ${escapeHtml(result.question || "")}</p>
    <p><strong>Answer:</strong> ${escapeHtml(result.answer || "")}</p>
    <p><strong>Citations:</strong> ${escapeHtml(citations)}</p>
    <p><strong>Confidence:</strong> ${result.confidence ?? 0}</p>
    <p><strong>Evidence Snippets:</strong></p>
    <ul>${evidence || "<li>None</li>"}</ul>
  `;
}

function renderReadyQuestions() {
  const container = document.getElementById("readyQuestions");
  if (!container) return;

  container.innerHTML = "";
  for (const question of READY_QUESTIONS) {
    const row = document.createElement("div");
    row.className = "ready-item";
    row.innerHTML = `
      <p>${escapeHtml(question)}</p>
      <div class="actions">
        <button class="secondary" type="button">Copy</button>
        <button type="button">Use</button>
      </div>
    `;

    const [copyBtn, useBtn] = row.querySelectorAll("button");
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(question);
        setStatus("askStatus", "Question copied to clipboard.");
      } catch {
        setStatus("askStatus", "Could not copy to clipboard.", true);
      }
    });

    useBtn.addEventListener("click", () => {
      const questionInput = document.getElementById("questionInput");
      if (questionInput) questionInput.value = question;
      setStatus("askStatus", "Question added to input.");
      showView(VIEW_ASK);
    });

    container.appendChild(row);
  }
}

function bindEvents() {
  document.getElementById("goHomeBtn")?.addEventListener("click", goHomePage);
  document.getElementById("goToAuthBtn")?.addEventListener("click", goToAuthPage);
  document.getElementById("goToWorkflowBtn")?.addEventListener("click", goToWorkflowPage);
  document.getElementById("goToAskBtn")?.addEventListener("click", goToAskPage);
  document.getElementById("goAuthFromHome")?.addEventListener("click", goToAuthPage);

  document.getElementById("showSignupBtn")?.addEventListener("click", toggleSignupBlock);
  document.getElementById("signupBtn")?.addEventListener("click", signup);
  document.getElementById("loginBtn")?.addEventListener("click", login);
  document.getElementById("logoutBtn")?.addEventListener("click", logout);

  document.getElementById("uploadQuestionnaireBtn")?.addEventListener("click", uploadQuestionnaire);
  document.getElementById("generateBtn")?.addEventListener("click", generateFromQuestionnaire);
  document.getElementById("exportBtn")?.addEventListener("click", exportDocument);
  document.getElementById("askBtn")?.addEventListener("click", askQuestion);
}

bindEvents();
setSessionUI();
showView(VIEW_HOME);
loadReferences();
renderReadyQuestions();
loadSavedAnswers();
