import { logTerm } from './logger.js';
import { getEngine, bootRobEngine } from './engine.js';
import { getCorpus } from './rag.js';

console.log("[Module Loaded] chat.js | Functions: sendChatMessage, handleChatKeydown, downloadChatAsTxt");

// Persistent in-memory dialogue history array for WebLLM multi-turn conversation
let chatHistoryMessages = [];
let isGenerating = false;

export function handleChatKeydown(event) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        sendChatMessage();
    }
}

export async function sendChatMessage() {
    if (isGenerating) return;

    const inputField = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const history = document.getElementById('chat-history');
    const userText = inputField.value.trim();
    let engine = getEngine();

    if (!userText) return;

    // Auto-recover if engine is missing or uninitialized
    if (!engine) {
        logTerm("⚠️ Engine instance not ready. Attempting auto-boot...");
        await bootRobEngine();
        engine = getEngine();
        if (!engine) {
            history.innerHTML += `<div class="chat-msg chat-rob" style="color: #a61c1c;">Rob Error: WebGPU engine is unavailable.</div>`;
            return;
        }
    }

    isGenerating = true;
    inputField.disabled = true;
    sendBtn.disabled = true;

    logTerm(`💬 [chat.js -> sendChatMessage] User query submitted: "${userText}"`);
    history.innerHTML += `<div class="chat-msg chat-user"><b>You:</b> ${escapeHtml(userText)}</div>`;
    inputField.value = '';
    history.scrollTop = history.scrollHeight;

    // Assemble Knowledge Base Corpus
    let assembledTxt = "";
    const corpus = getCorpus();
    if (corpus && corpus.length > 0) {
        for (let doc of corpus) {
            assembledTxt += `\n--- START DOCUMENT: ${doc.name} ---\n${doc.content}\n--- END DOCUMENT ---\n`;
        }
    } else {
        assembledTxt = "No reference documents currently loaded.";
    }

    const systemInstruction = `You are Rob, an autonomous sovereign AI assistant created by Dmitrii Zavalin. 
Be helpful, polite, precise, and conversational.
When asked for code, technical architectures, or script modifications, provide complete, clean, and fully functional code blocks.
If reference knowledge is provided below, use it to accurately inform your answers.

--- KNOWLEDGE BASE REFERENCE ---
${assembledTxt}`;

    // Initialize or refresh System Instruction in conversation history
    if (chatHistoryMessages.length === 0) {
        chatHistoryMessages.push({ role: "system", content: systemInstruction });
    } else {
        chatHistoryMessages[0] = { role: "system", content: systemInstruction };
    }

    // Append user message to active context history
    chatHistoryMessages.push({ role: "user", content: userText });

    logTerm(`📝 Multi-turn payload assembled (${chatHistoryMessages.length} messages). Executing WebGPU stream (max_tokens: 512)...`);

    const replyDiv = document.createElement("div");
    replyDiv.className = "chat-msg chat-rob";
    replyDiv.innerText = "Rob: ";
    history.appendChild(replyDiv);
    history.scrollTop = history.scrollHeight;

    try {
        const asyncChunkGenerator = await engine.chat.completions.create({
            messages: chatHistoryMessages,
            temperature: 0.2,
            max_tokens: 512,
            stream: true
        });

        let fullText = "";
        for await (const chunk of asyncChunkGenerator) {
            const content = chunk.choices[0]?.delta?.content || "";
            fullText += content;
            replyDiv.innerText = "Rob: " + fullText;
            history.scrollTop = history.scrollHeight;
        }

        // Store Rob's answer in dialogue history for subsequent turns
        chatHistoryMessages.push({ role: "assistant", content: fullText });

        logTerm(`✅ Streaming response completed successfully (${fullText.length} characters).`);
    } catch (err) {
        logTerm(`🔴 WebGPU Execution Error: ${err.message}`);
        
        // Auto-recovery handler for disposed session context or buffer faults
        if (err.message && err.message.includes("disposed")) {
            logTerm(`⚠️ Disposed WebGPU session detected. Resetting history and re-booting engine session...`);
            replyDiv.innerText = "Rob: WebGPU session expired. Re-initializing engine context...";
            chatHistoryMessages = []; // Clear broken context window
            await bootRobEngine();
        } else if (err.message && (err.message.includes("Invalid buffer") || err.message.includes("Buffer unmapped"))) {
            logTerm(`⚠️ WebGPU buffer corruption detected. Suggesting cache wipe...`);
            replyDiv.innerText = "Rob Error: WebGPU buffer corrupted. Please click '🧹 Clear Application Cache & Restart Rob AI' to clear old cache files and reboot.";
        } else {
            replyDiv.innerText = "Rob Error: " + err.message;
        }
    } finally {
        isGenerating = false;
        inputField.disabled = false;
        sendBtn.disabled = false;
        inputField.focus();
    }
}

export function downloadChatAsTxt() {
    logTerm("📥 [chat.js -> downloadChatAsTxt] Exporting chat history...");
    const historyDiv = document.getElementById('chat-history');
    const msgs = historyDiv.getElementsByClassName('chat-msg');
    if (msgs.length <= 1) {
        alert("No chat conversation to export yet!");
        return;
    }

    let chatText = "--- Rob AI Engine Chat Export ---\nGenerated: " + new Date().toISOString() + "\n\n";
    for (let msg of msgs) {
        chatText += msg.innerText + "\n\n";
    }

    const blob = new Blob([chatText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rob_chat_export_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    logTerm("📥 Chat conversation successfully exported as TXT.");
}

function escapeHtml(text) {
    return text.replace(/[&<>"']/g, (m) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    })[m]);
}
