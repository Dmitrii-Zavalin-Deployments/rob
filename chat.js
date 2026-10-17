import { logTerm } from './logger.js';
import { getEngine, bootRobEngine } from './engine.js';
import { rankAndExtractRelevantSentences } from './rag.js';

console.log("[Module Loaded] chat.js | Functions: sendChatMessage, handleChatKeydown, downloadChatAsTxt, warmupEngineContext");

// Persistent in-memory dialogue history array for WebLLM multi-turn conversation
let chatHistoryMessages = [];
let isGenerating = false;

/**
 * Calculates Jaccard word-set similarity percentage between two strings (0.0 to 1.0).
 */
function getSimilarityScore(str1, str2) {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    if (s1 === s2) return 1.0;
    
    const words1 = new Set(s1.split(/\s+/));
    const words2 = new Set(s2.split(/\s+/));
    
    let intersection = 0;
    for (let word of words1) {
        if (words2.has(word)) intersection++;
    }
    
    const union = new Set([...words1, ...words2]).size;
    return union === 0 ? 0 : (intersection / union);
}

/**
 * Scans chatHistoryMessages for previous user turns similar to incomingUserText.
 * If a match (>= similarityThreshold) is found, prunes that user turn and its assistant reply.
 */
function deduplicateChatHistory(history, incomingUserText, similarityThreshold = 0.6) {
    if (history.length <= 1) return history; // System prompt only

    const cleanedHistory = [];
    let i = 0;

    // Preserve System Prompt (Index 0)
    cleanedHistory.push(history[0]);

    // Iterate through remaining user/assistant turns
    for (i = 1; i < history.length; i++) {
        const msg = history[i];

        if (msg.role === 'user') {
            const similarity = getSimilarityScore(msg.content, incomingUserText);
            
            if (similarity >= similarityThreshold) {
                logTerm(`🧹 [chat.js -> Deduplication] Found similar previous query (${Math.round(similarity * 100)}% match): "${msg.content}". Pruning old turn pair from memory.`);
                
                // Skip this user message AND the following assistant response if present
                if (i + 1 < history.length && history[i + 1].role === 'assistant') {
                    i++; 
                }
                continue;
            }
        }
        cleanedHistory.push(msg);
    }

    return cleanedHistory;
}

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
            content: "You are Rob, an autonomous sovereign AI assistant created by Dmitrii Zavalin. Your name is Rob. Never claim to be Dmitrii. Be helpful, polite, precise, and conversational." 
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

    // Resolve implicit pronouns ("it", "this", "that") using recent history for RAG lookup
    let ragSearchQuery = userText;
    const implicitPronouns = /\b(it|its|they|them|their|this|that)\b/i;

    if (implicitPronouns.test(userText) && chatHistoryMessages.length > 2) {
        const lastUserMsg = [...chatHistoryMessages].reverse().find(m => m.role === 'user');
        if (lastUserMsg) {
            ragSearchQuery = `${lastUserMsg.content} ${userText}`;
            logTerm(`🔄 [chat.js -> Pronoun Resolution] Expanded RAG search query: "${ragSearchQuery}"`);
        }
    }

    // Run Sentence-by-Sentence Combinatorics RAG Extraction
    const matchedContext = rankAndExtractRelevantSentences(ragSearchQuery);
    const hasKnowledgeMatch = matchedContext && matchedContext.length > 0;

    let systemInstruction = "";

    if (hasKnowledgeMatch) {
        const formattedContext = Array.isArray(matchedContext) ? matchedContext.join("\n") : matchedContext;

        systemInstruction = `You are Rob, an autonomous sovereign AI assistant created by Dmitrii Zavalin.
Your name is Rob. You are an AI assistant. Never claim to be Dmitrii Zavalin or confuse your identity with the user.

STRICT KNOWLEDGE BASE INSTRUCTIONS:
1. Relevant information was found in the general_training/ corpus for this user query.
2. You MUST answer STRICTLY AND ONLY using the facts provided in the REFERENCE CONTEXT below.
3. For any sub-topic, question, or aspect asked by the user that IS NOT explicitly documented in the reference context below (e.g. specific experiments, dates, or additional features), state clearly: "No information regarding [specific topic] is available in the general_training/ corpus."
4. DO NOT use outside knowledge, extrapolate, or fabricate imaginary projects, cryptocurrencies, or details.

--- EXTRACTED REFERENCE CONTEXT ---
${formattedContext}`;
    } else {
        systemInstruction = `You are Rob, an autonomous sovereign AI assistant created by Dmitrii Zavalin. 
Your name is Rob. You are an AI assistant. Never claim to be Dmitrii Zavalin.
Be helpful, polite, precise, and conversational. Respond naturally as an AI assistant.`;
    }

    // Update System Instruction in active history
    if (chatHistoryMessages.length === 0) {
        chatHistoryMessages.push({ role: "system", content: systemInstruction });
    } else {
        chatHistoryMessages[0] = { role: "system", content: systemInstruction };
    }

    // Prune previous near-duplicate query turns from memory array
    chatHistoryMessages = deduplicateChatHistory(chatHistoryMessages, userText, 0.6);

    // Append new user message to active context history
    chatHistoryMessages.push({ role: "user", content: userText });

    logTerm(`📝 Multi-turn payload assembled (${chatHistoryMessages.length} messages active in context | Strict Mode: ${hasKnowledgeMatch}). Executing WebGPU stream (max_tokens: 384)...`);

    const replyDiv = document.createElement("div");
    replyDiv.className = "chat-msg chat-rob";
    replyDiv.innerHTML = "<b>Rob:</b> ";
    history.appendChild(replyDiv);
    history.scrollTop = history.scrollHeight;

    try {
        const asyncChunkGenerator = await engine.chat.completions.create({
            messages: chatHistoryMessages,
            temperature: hasKnowledgeMatch ? 0.0 : 0.4,
            max_tokens: 384, // Capped to prevent Windows TDR GPU driver timeout
            stream: true
        });

        let fullText = "";
        for await (const chunk of asyncChunkGenerator) {
            const content = chunk.choices[0]?.delta?.content || "";
            fullText += content;

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
        
        const isGpuCrash = err.message && (
            err.message.includes("DXGI_ERROR_DEVICE_REMOVED") ||
            err.message.includes("disposed") ||
            err.message.includes("device lost") ||
            err.message.includes("Invalid buffer") ||
            err.message.includes("Buffer unmapped")
        );

        if (isGpuCrash) {
            logTerm("⚠️ GPU context reset encountered. Displaying browser restart and export instructions.");
            replyDiv.innerHTML = `
                <div style="background: rgba(255, 69, 58, 0.15); border: 1px solid #ff453a; padding: 12px; border-radius: 8px; margin: 8px 0;">
                    <p style="margin: 0 0 6px 0; color: #ff6b6b; font-weight: bold;">
                        ⚠️ WebGPU Hardware Limit Reached (Windows GPU Reset)
                    </p>
                    <p style="margin: 0 0 10px 0; font-size: 0.9em; color: #ddd;">
                        Your Windows GPU driver dropped the WebGPU context due to memory constraints. Please <b>download your transcript</b> below, then <b>completely close and restart your browser</b> to clear the hardware queue before launching next session with Rob.
                    </p>
                    <div style="display: flex; gap: 8px;">
                        <button id="recovery-download-btn" style="background: #2c2c2e; color: #fff; border: 1px solid #555; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.85em;">
                            📥 Download Transcript
                        </button>
                    </div>
                </div>
            `;

            // Attach event listener safely for the download button
            setTimeout(() => {
                const dlBtn = document.getElementById("recovery-download-btn");
                if (dlBtn) dlBtn.onclick = downloadChatAsTxt;
            }, 100);

        } else {
            replyDiv.innerText = "Rob Error: " + err.message;
        }
    } finally {
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
