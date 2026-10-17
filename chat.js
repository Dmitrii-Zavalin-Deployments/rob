import { logTerm } from './logger.js';
import { getEngine, bootRobEngine } from './engine.js';
import { rankAndExtractRelevantSentences } from './rag.js';

console.log("[Module Loaded] chat.js | Functions: sendChatMessage, handleChatKeydown, downloadChatAsTxt, warmupEngineContext");

// Persistent in-memory dialogue history array for WebLLM multi-turn conversation
let chatHistoryMessages = [];
let isGenerating = false;

/**
 * Silent Warm-up Function
 * Accepts the engine instance directly to pre-compile WebGPU execution pipelines.
 */
export async function warmupEngineContext(engineInstance) {
    if (!engineInstance) {
        logTerm("⚠️ Engine unavailable for warm-up sequence.");
        return;
    }

    logTerm("🔥 [chat.js -> warmupEngineContext] Sending initialization warm-up payload...");
    
    const warmupMessages = [
        { 
            role: "system", 
            content: "You are Rob, an autonomous sovereign AI assistant created by Dmitrii Zavalin. Be helpful, polite, precise, and conversational." 
        },
        { 
            role: "user", 
            content: "Hello Rob! We are starting. Please answer all questions concisely, politely, and accurately." 
        }
    ];

    try {
        const asyncChunkGenerator = await engineInstance.chat.completions.create({
            messages: warmupMessages,
            temperature: 0.1,
            max_tokens: 16,
            stream: true
        });

        let warmupReply = "";
        for await (const chunk of asyncChunkGenerator) {
            const content = chunk.choices[0]?.delta?.content || "";
            warmupReply += content;
        }

        // Initialize dialogue history with system prompt & baseline warm-up turn
        chatHistoryMessages = [
            warmupMessages[0],
            warmupMessages[1],
            { role: "assistant", content: warmupReply }
        ];

        logTerm("🔥 WebGPU shader compilation & warm-up sequence completed successfully.");
    } catch (err) {
        logTerm(`⚠️ Warm-up minor note: ${err.message}`);
    }
}

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
            history.innerHTML += `<div class="chat-msg chat-rob" style="color: #a61c1c;"><b>Rob:</b> WebGPU engine is unavailable.</div>`;
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

    // Display temporary system search status in chat window & log to terminal
    const searchStatusText = "Looking for the answer in the text files from general_training/ (see 📡 System Terminal for details)";
    logTerm(`📡 ${searchStatusText}`);
    
    const statusDiv = document.createElement("div");
    statusDiv.className = "chat-msg chat-system";
    statusDiv.style.cssText = "color: #7f8c8d; font-style: italic; margin: 4px 0;";
    statusDiv.innerHTML = `📡 ${searchStatusText}`;
    history.appendChild(statusDiv);
    history.scrollTop = history.scrollHeight;

    // Run Sentence-by-Sentence Combinatorics RAG Extraction
    const matchedContext = rankAndExtractRelevantSentences(userText);
    const hasKnowledgeMatch = matchedContext && matchedContext.length > 0;

    let systemInstruction = "";

    if (hasKnowledgeMatch) {
        // STRICT KNOWLEDGE MODE (Triggered when matchedContext finds relevant training data)
        systemInstruction = `You are Rob, an autonomous sovereign AI assistant created by Dmitrii Zavalin.

STRICT KNOWLEDGE BASE INSTRUCTIONS:
1. Relevant information was found in the general_training/ corpus for this user query.
2. You MUST answer STRICTLY AND ONLY using the facts provided in the REFERENCE CONTEXT below.
3. For any sub-topic, question, or aspect asked by the user that IS NOT explicitly documented in the reference context below (e.g. specific experiments, dates, or additional features), state clearly: "No information regarding [specific topic] is available in the general_training/ corpus."
4. DO NOT use outside knowledge, extrapolate, or fabricate imaginary projects, cryptocurrencies, or details.

--- EXTRACTED REFERENCE CONTEXT ---
${matchedContext}`;
    } else {
        // GENERAL CONVERSATION MODE (Triggered for general chit-chat like "Hi Rob!" or "How is it going?")
        systemInstruction = `You are Rob, an autonomous sovereign AI assistant created by Dmitrii Zavalin. 
Be helpful, polite, precise, and conversational. Respond naturally as an AI assistant.`;
    }

    // Update System Instruction in active history
    if (chatHistoryMessages.length === 0) {
        chatHistoryMessages.push({ role: "system", content: systemInstruction });
    } else {
        chatHistoryMessages[0] = { role: "system", content: systemInstruction };
    }

    // Append user message to active context history
    chatHistoryMessages.push({ role: "user", content: userText });

    logTerm(`📝 Multi-turn payload assembled (${chatHistoryMessages.length} messages | Strict Mode: ${hasKnowledgeMatch}). Executing WebGPU stream (max_tokens: 512)...`);

    const replyDiv = document.createElement("div");
    replyDiv.className = "chat-msg chat-rob";
    replyDiv.innerHTML = "<b>Rob:</b> ";
    history.appendChild(replyDiv);
    history.scrollTop = history.scrollHeight;

    try {
        const asyncChunkGenerator = await engine.chat.completions.create({
            messages: chatHistoryMessages,
            temperature: hasKnowledgeMatch ? 0.0 : 0.4, // Temperature 0 for strict factual compliance
            max_tokens: 512,
            stream: true
        });

        let fullText = "";
        for await (const chunk of asyncChunkGenerator) {
            const content = chunk.choices[0]?.delta?.content || "";
            fullText += content;

            // Render Markdown if available, otherwise display plain text with bold prefix
            if (typeof window.marked !== 'undefined' && window.marked.parse) {
                replyDiv.innerHTML = "<b>Rob:</b> " + window.marked.parse(fullText);
            } else {
                replyDiv.innerHTML = "<b>Rob:</b> " + fullText;
            }
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
        // Remove the temporary search status element once response completes
        if (statusDiv && statusDiv.parentNode) {
            statusDiv.parentNode.removeChild(statusDiv);
        }

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
