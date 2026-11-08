import express from "express";
import { ChatOpenAI } from "@langchain/openai";
import { fileURLToPath } from "node:url";
import path from "node:path";

const requiredEnv = ["OPENAI_API_KEY", "OPENAI_MODEL"];

const missingEnv = requiredEnv.filter((name) => !process.env[name]);

if (missingEnv.length > 0) {
  throw new Error(`Ontbrekende instellingen in .env: ${missingEnv.join(", ")}`);
}

const app = express();
const port = Number(process.env.PORT ?? 3000);
const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const clientDirectory = path.resolve(currentDirectory, "../CLIENT");

const MAX_MESSAGE_LENGTH = 4000;
const MAX_HISTORY_MESSAGES = 20;

// Geschiedenis en tokengebruik blijven in het geheugen zolang de server draait.
const sessions = new Map();

const model = new ChatOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL,
  temperature: 0.3,
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static(clientDirectory));

function getSession(sessionId) {
  let session = sessions.get(sessionId);

  if (!session) {
    session = {
      history: [],
      tokenUsage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
    };
    sessions.set(sessionId, session);
  }

  return session;
}

function readTokenUsage(response) {
  const usage =
    response.usage_metadata ?? response.response_metadata?.tokenUsage;

  if (!usage) {
    return null;
  }

  const inputTokens = Number(
    usage.input_tokens ?? usage.promptTokens ?? 0,
  );
  const outputTokens = Number(
    usage.output_tokens ?? usage.completionTokens ?? 0,
  );
  const totalTokens = Number(
    usage.total_tokens ?? usage.totalTokens ?? inputTokens + outputTokens,
  );

  return { inputTokens, outputTokens, totalTokens };
}

function getResponseText(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        return typeof part?.text === "string" ? part.text : "";
      })
      .join("");
  }

  return "";
}

app.post("/api/chat", async (req, res) => {
  const { message, sessionId } = req.body ?? {};

  if (typeof message !== "string" || message.trim().length === 0) {
    return res.status(400).json({ error: "Vul eerst een bericht in." });
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({
      error: `Je bericht mag maximaal ${MAX_MESSAGE_LENGTH} tekens bevatten.`,
    });
  }

  if (typeof sessionId !== "string" || sessionId.length > 100) {
    return res.status(400).json({ error: "Ongeldige chatsessie." });
  }

  const session = getSession(sessionId);
  const userMessage = message.trim();

  const systemMessage = {
    role: "system",
    content: `Je bent een behulpzame Pokémon-coach. Je spreekt Nederlands en legt je advies duidelijk en vriendelijk uit.
Help de gebruiker met strategie voor Pokémon-games en teams.
Vraag eerst om ontbrekende informatie als die nodig is, zoals welke game de gebruiker speelt, de voortgang en het huidige team.
Wees eerlijk wanneer je iets niet zeker weet. Gebruik Markdown voor overzichtelijke antwoorden.`,
  };

  try {
    const response = await model.invoke([
      systemMessage,
      ...session.history,
      { role: "user", content: userMessage },
    ]);

    const reply = getResponseText(response.content);

    if (!reply) {
      throw new Error("Het taalmodel heeft geen tekstantwoord teruggegeven.");
    }

    session.history.push(
      { role: "user", content: userMessage },
      { role: "assistant", content: reply },
    );
    session.history = session.history.slice(-MAX_HISTORY_MESSAGES);

    const usage = readTokenUsage(response);

    if (usage) {
      session.tokenUsage.inputTokens += usage.inputTokens;
      session.tokenUsage.outputTokens += usage.outputTokens;
      session.tokenUsage.totalTokens += usage.totalTokens;

      console.log("Tokengebruik deze beurt:", usage);
      console.log("Totaal tokengebruik sessie:", session.tokenUsage);
    } else {
      console.log("Tokengebruik was niet beschikbaar in de modelrespons.");
    }

    return res.json({
      reply,
      usage,
      sessionTokenUsage: session.tokenUsage,
    });
  } catch (error) {
    console.error("Fout tijdens de OpenAI-aanroep:", error);
    return res.status(500).json({
      error: "Het antwoord kon niet worden opgehaald. Controleer de serverlog.",
    });
  }
});

app.listen(port, () => {
  console.log(`Pokémon-chatbot draait op http://localhost:${port}`);
});
