
const chatForm = document.getElementById("chatForm");
const sendBtn = document.getElementById("sendBtn");
const messageInput = document.getElementById("message");
const chatbox = document.getElementById("chatbox");

const SESSION_STORAGE_KEY = "pokemon-chatbot-session-id";

function getSessionId() {
  let sessionId = localStorage.getItem(SESSION_STORAGE_KEY);

  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  }

  return sessionId;
}

const sessionId = getSessionId();

function addMessage(text, sender, usage = null) {
  const messageElement = document.createElement("article");
  messageElement.classList.add("message", sender);

  if (sender === "bot") {
    const formattedMarkdown = marked.parse(text);
    messageElement.innerHTML = DOMPurify.sanitize(formattedMarkdown);
  } else {
    messageElement.textContent = text;
  }

  chatbox.appendChild(messageElement);

  if (usage) {
    const usageElement = document.createElement("div");
    usageElement.classList.add("usage");
    usageElement.textContent =
      `Tokens deze beurt: ${usage.inputTokens} input, ` +
      `${usage.outputTokens} output, ${usage.totalTokens} totaal`;
    chatbox.appendChild(usageElement);
  }

  chatbox.scrollTop = chatbox.scrollHeight;
  return messageElement;
}

function setLoading(isLoading) {
  sendBtn.disabled = isLoading;
  messageInput.disabled = isLoading;
  sendBtn.textContent = isLoading ? "Even wachten..." : "Verstuur";
}

async function sendMessage(message) {
  addMessage(message, "user");
  setLoading(true);

  const loadingMessage = addMessage("Even denken...", "bot");

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message, sessionId }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error ?? "Er ging iets mis.");
    }

    loadingMessage.remove();
    addMessage(data.reply, "bot", data.usage);
  } catch (error) {
    loadingMessage.remove();
    addMessage(
      error.message || "Er kon geen verbinding met de server worden gemaakt.",
      "error",
    );
  } finally {
    setLoading(false);
    messageInput.focus();
  }
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const message = messageInput.value.trim();
  if (!message) return;

  messageInput.value = "";
  await sendMessage(message);
});

addMessage(
  "Hoi! Ik ben je Pokémon Coach. Welke game speel je, hoeveel badges heb je en welke Pokémon zitten in je team?",
  "bot",
);