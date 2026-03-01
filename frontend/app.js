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

function setStatus(id, message, isError = false) {
  const element = document.getElementById(id);
  element.textContent = message;
  element.className = isError ? "status error" : "status";
}

function token() {
  return localStorage.getItem("access_token") || "";
}

function setSessionUI() {
  const hasToken = Boolean(token());
  const logoutBtn = document.getElementById("logoutBtn");
  const sessionInfo = document.getElementById("sessionInfo");
  const email = localStorage.getItem("session_email") || "";

  logoutBtn.disabled = !hasToken;
  sessionInfo.textContent = hasToken ? `Logged in: ${email || "User"}` : "Not logged in";
}

function authHeaders(extra = {}) {
  return {
    ...extra,
    Authorization: token() ? `Bearer ${token()}` : "",
  };
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

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return await response.json();
  }
  const text = await response.text();
  return { detail: text || "Request failed" };
}

async function signup() {
  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value;

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
    window.location.reload();
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
  const username = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  if (!isValidEmail(username)) {
    setStatus("authStatus", "Enter correct email", true);
    return;
  }

  try {
    await loginWithCredentials(username, password);
    setStatus("authStatus", "Login successful. Token stored in browser.");
    window.location.reload();
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
}

async function loadReferences() {
  try {
    const response = await fetch(`${api}/references`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Failed to load references");

    const list = document.getElementById("references");
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
    list.innerHTML = `<li class="small">${escapeHtml(error.message)}</li>`;
  }
}

async function uploadQuestionnaire() {
  const file = document.getElementById("questionnaireFile").files[0];
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
  try {
    const response = await fetch(`${api}/generate`, {
      method: "POST",
      headers: authHeaders(),
    });
    const data = await parseResponse(response);
    if (!response.ok) throw new Error(data.detail || "Generation failed");

    const summary = data.summary || {};
    document.getElementById("summary").textContent =
      `Total: ${summary.total_questions ?? 0} | Answered: ${summary.answered_with_citations ?? 0} | Not found: ${summary.not_found ?? 0}`;
    setStatus("generateStatus", "Generated answers from questionnaire.");
  } catch (error) {
    setStatus("generateStatus", error.message, true);
  }
}

async function askQuestion() {
  const question = document.getElementById("questionInput").value.trim();
  if (!question) return setStatus("askStatus", "Type a question first.", true);

  try {
    const response = await fetch(`${api}/ask`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ question }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Failed to answer question");

    renderAskResult(data);
    setStatus("askStatus", "Answer generated.");
  } catch (error) {
    setStatus("askStatus", error.message, true);
  }
}

function renderAskResult(result) {
  const container = document.getElementById("askResult");
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
      document.getElementById("questionInput").value = question;
      setStatus("askStatus", "Question added to input.");
    });

    container.appendChild(row);
  }
}

function bindEvents() {
  document.getElementById("signupBtn").addEventListener("click", signup);
  document.getElementById("loginBtn").addEventListener("click", login);
  document.getElementById("logoutBtn").addEventListener("click", logout);
  document.getElementById("uploadQuestionnaireBtn").addEventListener("click", uploadQuestionnaire);
  document.getElementById("generateBtn").addEventListener("click", generateFromQuestionnaire);
  document.getElementById("askBtn").addEventListener("click", askQuestion);
}

bindEvents();
setSessionUI();
loadReferences();
renderReadyQuestions();
