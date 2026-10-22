import { logTerm } from './logger.js';
import { getEngine, bootRobEngine } from './engine.js';
import { rankAndExtractRelevantSentences, setMatchThreshold } from './rag.js';

console.log("[Module Loaded] chat.js | Functions: sendChatMessage, handleChatKeydown, downloadChatAsTxt, warmupEngineContext");

// Persistent in-memory dialogue history array for WebLLM multi-turn conversation
let chatHistoryMessages = [];
let isGenerating = false;
let activeActionCard = null; // Tracks current mode action card in UI

/**
 * Initializes UI Slider Controls and Reset button listeners.
 * Ensures the value labels update live and reset behavior functions properly.
 */
function initEngineTuners() {
    const sliderTemp = document.getElementById("slider-temp");
    const valTemp = document.getElementById("val-temp");
    const sliderTokens = document.getElementById("slider-tokens");
    const valTokens = document.getElementById("val-tokens");
    const sliderMatch = document.getElementById("slider-match");
    const valMatch = document.getElementById("val-match");
    const resetBtn = document.getElementById("reset-defaults-btn");

    if (sliderTemp && valTemp) {
        sliderTemp.oninput = (e) => { valTemp.innerText = e.target.value; };
    }
    if (sliderTokens && valTokens) {
        sliderTokens.oninput = (e) => { valTokens.innerText = e.target.value; };
    }
    if (sliderMatch && valMatch) {
        sliderMatch.oninput = (e) => { 
            valMatch.innerText = e.target.value; 
            setMatchThreshold(parseFloat(e.target.value) / 100.0);
        };
    }

    if (resetBtn) {
        resetBtn.onclick = () => {
            // 1. Reset Extreme Mode Checkboxes & Restore Standard Ranges
            const toggleExtremeTemp = document.getElementById('toggle-extreme-temp');
            const toggleExtremeTokens = document.getElementById('toggle-extreme-tokens');
            const toggleVerbatimBypass = document.getElementById('toggle-verbatim-bypass');

            if (toggleExtremeTemp && toggleExtremeTemp.checked) {
                toggleExtremeTemp.checked = false;
                toggleTempLimit(toggleExtremeTemp);
            }

            if (toggleExtremeTokens && toggleExtremeTokens.checked) {
                toggleExtremeTokens.checked = false;
                toggleTokenLimit(toggleExtremeTokens);
            }

            if (toggleVerbatimBypass && toggleVerbatimBypass.checked) {
                toggleVerbatimBypass.checked = false;
                toggleVerbatimBypass(toggleVerbatimBypass);
            }

            // 2. Reset Temperature Slider
            if (sliderTemp && valTemp) {
                sliderTemp.value = "0.5";
                valTemp.innerText = "0.50";
            }

            // 3. Reset Response Tokens Slider
            if (sliderTokens && valTokens) {
                sliderTokens.value = "320";
                valTokens.innerText = "320";
            }

            // 4. Reset Match Threshold Slider
            if (sliderMatch && valMatch) {
                sliderMatch.value = "20";
                valMatch.innerText = "20";
                setMatchThreshold(0.20);
            }

            logTerm("🎛️ [Control Panel] Engine tuners reset to default values (Temp: 0.50, Tokens: 320, Match: 20%, Extreme/Bypass Modes: OFF).");
        };
    }
}

// Execute initialization safely regardless of module loading state
if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", initEngineTuners);
} else {
    initEngineTuners();
}

/**
 * Calculates query containment ratio: what fraction of words in str1 (query) exist inside str2 (target).
 * Returns a normalized value between 0.0 and 1.0.
 */
function getSimilarityScore(str1, str2) {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    if (s1 === s2) return 1.0;
    
    const words1 = new Set(s1.split(/\s+/));
    const words2 = new Set(s2.split(/\s+/));
    
    if (words1.size === 0) return 0;

    let intersection = 0;
    for (let word of words1) {
        if (words2.has(word)) intersection++;
    }
    
    return intersection / words1.size;
}

/**
 * Scans chatHistoryMessages for previous user turns similar to incomingUserText.
 * If a match (>= similarityThreshold) is found, prunes that user turn and its assistant reply.
 */
function deduplicateChatHistory(history, incomingUserText, similarityThreshold = 0.6) {
    if (history.length <= 1) return history; // System prompt only

    const cleanedHistory = [];
    let i = 0;

    cleanedHistory.push(history[0]);

    for (i = 1; i < history.length; i++) {
        const msg = history[i];

        if (msg.role === 'user') {
            const similarity = getSimilarityScore(msg.content, incomingUserText);
            
            if (similarity >= similarityThreshold) {
                logTerm(`🧹 [chat.js -> Deduplication] Found similar previous query (${Math.round(similarity * 100)}% match): "${msg.content}". Pruning old turn pair from memory.`);
                
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

/**
 * Formats System Instructions for Creative Mode.
 */
function buildSystemInstruction() {
    return `You are Rob, an autonomous sovereign AI assistant created by Dmitrii Zavalin. Your name is Rob. Never claim to be Dmitrii Zavalin or confuse your identity with the user. Do not repeat greeting introductions or boilerplate self-identifications in multi-turn conversations; answer the user's question directly. Be helpful, polite, precise, and conversational.`;
}

/**
 * Clears active Action Controls card when continuing discussion.
 */
function finalizePreviousActionCard() {
    if (activeActionCard && activeActionCard.parentNode) {
        activeActionCard.parentNode.removeChild(activeActionCard);
        activeActionCard = null;
    }
}

/**
 * Helper to generate a deterministic text summary from chatHistoryMessages without LLM inference.
 */
function renderChatSummaryView(targetContainer) {
    const assistantTurns = chatHistoryMessages.filter(m => m.role === 'assistant');
    
    if (assistantTurns.length === 0) {
        alert("No assistant history recorded in memory yet!");
        return;
    }

    let summaryHtml = `<div class="chat-summary-box" style="margin-top: 10px; padding: 10px; background: rgba(0, 0, 0, 0.2); border-radius: 4px; font-family: monospace; font-size: 12px; max-height: 200px; overflow-y: auto;">`;
    summaryHtml += `<b>📜 Cumulative Chat History Summary (${assistantTurns.length} recorded responses):</b><br><br>`;
    
    assistantTurns.forEach((turn, idx) => {
        summaryHtml += `<div style="margin-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px;"><b>[Turn ${idx + 1}]:</b> ${escapeHtml(turn.content)}</div>`;
    });
    summaryHtml += `</div>`;

    const existingSummary = targetContainer.querySelector('.chat-summary-box');
    if (existingSummary) {
        existingSummary.remove();
    }

    targetContainer.insertAdjacentHTML('beforeend', summaryHtml);
    logTerm(`📜 [Chat Summary] Generated deterministic summary from ${assistantTurns.length} recorded assistant messages.`);
}

export async function sendChatMessage(forceMode = null, targetReplyDiv = null, lastUserQuery = null) {
    if (isGenerating) return;

    finalizePreviousActionCard();

    const inputField = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const history = document.getElementById('chat-history');
    
    const isRedo = forceMode !== null && targetReplyDiv !== null;
    const userText = isRedo ? lastUserQuery : inputField.value.trim();

    let engine = getEngine();

    if (!userText) return;

    // Check if Strict Verbatim RAG Bypass mode is enabled
    const verbatimBypassCheckbox = document.getElementById('toggle-verbatim-bypass');
    const isVerbatimBypassActive = verbatimBypassCheckbox && verbatimBypassCheckbox.checked;

    if (!isVerbatimBypassActive && !engine) {
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

    if (!isRedo) {
        logTerm(`💬 [chat.js -> sendChatMessage] User query submitted: "${userText}"`);
        history.innerHTML += `<div class="chat-msg chat-user"><b>You:</b> ${escapeHtml(userText)}</div>`;
        inputField.value = '';
        history.scrollTop = history.scrollHeight;
    } else {
        logTerm(`🔄 [chat.js -> Regeneration] User requested re-generation in mode: ${forceMode}`);
    }

    // ==========================================
    // 1. STRICT VERBATIM RAG BYPASS MODE EXECUTION
    // ==========================================
    if (isVerbatimBypassActive) {
        logTerm(`🔒 [Verbatim Bypass Mode] Direct buffer stream active. Bypassing history injection.`);
        
        const matchedContext = await rankAndExtractRelevantSentences(userText, () => {});
        const replyDiv = isRedo ? targetReplyDiv : document.createElement("div");
        if (!isRedo) {
            replyDiv.className = "chat-msg chat-rob";
            history.appendChild(replyDiv);
        }

        const matchedSentences = Array.isArray(matchedContext) ? matchedContext : [];
        const totalSentences = matchedSentences.length;

        if (totalSentences > 0) {
            logTerm(`📦 [Verbatim Bypass] Streaming ${totalSentences} matched sentence chunks directly from buffer.`);
            replyDiv.innerHTML = `<b>Rob [Verbatim RAG Bypass]:</b> Found <b>${totalSentences}</b> matching sentences in corpus:<br><br>`;

            let bufferHtml = "";
            for (let i = 0; i < totalSentences; i++) {
                const sentence = matchedSentences[i];
                bufferHtml += `<div style="margin-bottom: 8px; padding: 6px 10px; background: rgba(0, 210, 255, 0.04); border-left: 3px solid #00d2ff; font-family: monospace; font-size: 13px;"><b>[Match ${i + 1}/${totalSentences}]:</b> ${escapeHtml(sentence)}</div>`;
            }
            replyDiv.innerHTML += bufferHtml;
        } else {
            logTerm(`⚠️ [Verbatim Bypass] Combinatorics scan complete: 0 relevant sentences matched.`);
            replyDiv.innerHTML = `<b>Rob [Verbatim RAG Bypass]:</b> 0 relevant sentences matched in corpus for query: "<code>${escapeHtml(userText)}</code>".`;
        }

        history.scrollTop = history.scrollHeight;
        isGenerating = false;
        inputField.disabled = false;
        sendBtn.disabled = false;
        inputField.focus();
        return;
    }
    // ==========================================

    // Display temporary system search status in chat window & log to terminal
    const searchStatusText = "Looking for the answer in the text files from general_training/ (see 📡 System Terminal for details)";
    logTerm(`📡 ${searchStatusText}`);
    
    const statusDiv = document.createElement("div");
    statusDiv.className = "chat-msg chat-system";
    statusDiv.style.cssText = "color: #7f8c8d; font-style: italic; margin: 4px 0;";
    statusDiv.innerHTML = `📡 ${searchStatusText}`;
    history.appendChild(statusDiv);
    history.scrollTop = history.scrollHeight;

    // Strict 1 Query = 1 Response Isolation (no history prepending during search)
    const ragSearchQuery = userText;

    // Run Sentence-by-Sentence Combinatorics RAG Extraction
    const matchedContext = await rankAndExtractRelevantSentences(ragSearchQuery, (filename, matchedSentencesChunk) => {
        // Optional live streaming callback during corpus scan
    });
    let hasKnowledgeMatch = matchedContext && Array.isArray(matchedContext) && matchedContext.length > 0;

    if (statusDiv && statusDiv.parentNode) {
        statusDiv.parentNode.removeChild(statusDiv);
    }

    // Apply manual mode override if user clicked a Redo button
    if (forceMode === 'creative') {
        hasKnowledgeMatch = false;
    }

    // ==========================================
    // 2. STRICT KNOWLEDGE MODE (DETERMINISTIC BUFFER PRINT)
    // ==========================================
    if (hasKnowledgeMatch && forceMode !== 'creative') {
        logTerm(`🔴 [Strict Knowledge Mode] Matched ${matchedContext.length} sentences. Printing verbatim text without LLM generation.`);

        const replyDiv = isRedo ? targetReplyDiv : document.createElement("div");
        if (!isRedo) {
            replyDiv.className = "chat-msg chat-rob";
            history.appendChild(replyDiv);
        }

        const matchedSentences = Array.isArray(matchedContext) ? matchedContext : [];
        const totalSentences = matchedSentences.length;

        let bufferHtml = `<b>Rob [Strict Knowledge Mode]:</b> Found <b>${totalSentences}</b> grounded sentences in <code>general_training/</code> corpus:<br><br>`;
        for (let i = 0; i < totalSentences; i++) {
            const sentence = matchedSentences[i];
            bufferHtml += `<div style="margin-bottom: 8px; padding: 6px 10px; background: rgba(255, 69, 58, 0.04); border-left: 3px solid #ff453a; font-family: monospace; font-size: 13px;"><b>[Match ${i + 1}/${totalSentences}]:</b> ${escapeHtml(sentence)}</div>`;
        }
        replyDiv.innerHTML = bufferHtml;

        const combinedGroundedText = matchedSentences.join("\n");
        renderStrictMemoryActionCard(replyDiv, userText, combinedGroundedText);

        history.scrollTop = history.scrollHeight;
        isGenerating = false;
        inputField.disabled = false;
        sendBtn.disabled = false;
        inputField.focus();
        return;
    }
    // ==========================================

    // ==========================================
    // 3. CREATIVE / GENERAL CONVERSATION MODE EXECUTION (AUTOMATIC FALLBACK)
    // ==========================================
    logTerm(`🟢 [Creative Mode] 0 corpus matches or manual override. Executing unconstrained generation...`);

    const systemInstruction = buildSystemInstruction();

    // Update System Instruction in active history
    if (chatHistoryMessages.length === 0) {
        chatHistoryMessages.push({ role: "system", content: systemInstruction });
    } else {
        chatHistoryMessages[0] = { role: "system", content: systemInstruction };
    }

    // Prepare temporary messages array for creative generation without polluting history yet
    const tempMessages = [...chatHistoryMessages];
    const cleanedTempMessages = deduplicateChatHistory(tempMessages, userText, 0.6);
    cleanedTempMessages.push({ role: "user", content: userText });

    // Read live values from Control Panel sliders
    const sliderTemp = document.getElementById("slider-temp");
    const sliderTokens = document.getElementById("slider-tokens");
    const userTempSetting = sliderTemp ? parseFloat(sliderTemp.value) : 0.5;
    const userMaxTokensSetting = sliderTokens ? parseInt(sliderTokens.value, 10) : 320;

    logTerm(`📝 Executing Creative Mode WebGPU stream (temp: ${userTempSetting}, max_tokens: ${userMaxTokensSetting})...`);

    const replyDiv = isRedo ? targetReplyDiv : document.createElement("div");
    if (!isRedo) {
        replyDiv.className = "chat-msg chat-rob";
        history.appendChild(replyDiv);
    }
    replyDiv.innerHTML = "<b>Rob:</b> ";
    history.scrollTop = history.scrollHeight;

    try {
        const asyncChunkGenerator = await engine.chat.completions.create({
            messages: cleanedTempMessages,
            temperature: userTempSetting,
            max_tokens: userMaxTokensSetting,
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

        logTerm(`✅ Streaming response completed successfully (${fullText.length} characters).`);

        // Render interactive Creative Action Card UI with manual "Remember" button
        renderCreativeActionCard(replyDiv, userText, fullText);

    } catch (err) {
        logTerm(`🔴 WebGPU Execution Error: ${err.message}`);
        
        const isTokenOverflow = err.message && err.message.includes('Prompt tokens exceed context window size');
        const isGpuCrash = err.message && (
            err.message.includes("DXGI_ERROR_DEVICE_REMOVED") ||
            err.message.includes("disposed") ||
            err.message.includes("device lost") ||
            err.message.includes("Invalid buffer") ||
            err.message.includes("Buffer unmapped")
        );

        if (isTokenOverflow) {
            logTerm("⚠️ Prompt tokens exceed context window size limit.");
            replyDiv.innerText = "Rob Error: Prompt tokens exceed context window size limit. Please try a narrower, more specific question!";
        } else if (isGpuCrash) {
            logTerm("⚠️ GPU context reset encountered. Displaying compact browser restart and export window.");
            
            replyDiv.style.background = "transparent";
            replyDiv.style.border = "none";
            replyDiv.style.padding = "0";
            replyDiv.style.margin = "8px 0";

            replyDiv.innerHTML = `
                <div style="background: rgba(255, 69, 58, 0.12); border: 1px solid #ff453a; padding: 10px 14px; border-radius: 6px; font-size: 0.85em; text-align: center; max-width: 100%; box-sizing: border-box;">
                    <div style="font-weight: bold; color: #ff6b6b; margin-bottom: 4px;">
                        ⚠️ WebGPU Hardware Limit Reached (Windows GPU Reset)
                    </div>
                    <div style="color: #ddd; margin-bottom: 8px; line-height: 1.4;">
                        Your GPU driver dropped the WebGPU context due to memory constraints. Please <b>download your transcript</b> below, then <b>completely close and restart your browser</b> to clear the hardware queue before launching your next session with Rob.
                    </div>
                    <div style="display: flex; justify-content: center; align-items: center;">
                        <button id="recovery-download-btn" style="background: #2c2c2e; color: #fff; border: 1px solid #ff453a; padding: 5px 14px; border-radius: 4px; cursor: pointer; font-size: 0.85em; display: inline-flex; align-items: center; gap: 6px;">
                            📥 Download Transcript
                        </button>
                    </div>
                </div>
            `;

            setTimeout(() => {
                const dlBtn = document.getElementById("recovery-download-btn");
                if (dlBtn) dlBtn.onclick = downloadChatAsTxt;
            }, 100);

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

/**
 * Renders Action Card for Strict Knowledge Mode with manual memory curation button & verification disclaimer
 */
function renderStrictMemoryActionCard(targetReplyDiv, userQuery, groundedText) {
    const actionCard = document.createElement("div");
    activeActionCard = actionCard;
    actionCard.className = "mode-action-card";

    actionCard.style.cssText = `
        background: rgba(255, 69, 58, 0.12);
        border: 1px solid #ff453a;
        padding: 10px 14px;
        border-radius: 6px;
        margin: 6px 0 12px 0;
        font-size: 0.85em;
    `;

    actionCard.innerHTML = `
        <div style="margin-bottom: 6px; font-weight: bold; color: #ff453a;">
            🔴 Generated in Strict Knowledge Mode (RAG Grounded)
        </div>
        <div style="color: #b00020; font-size: 0.9em; margin-bottom: 8px; line-height: 1.4;">
            🔒 This information is taken directly from the <code>general_training/</code> corpus without prior verification (please check the accuracy before using it).
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="remember-info-btn" style="background: #0a84ff; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 0.9em;">
                🧠 Remember this information
            </button>
            <button class="summarize-chat-btn" style="background: #5856d6; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.9em;">
                📜 Summarize Chat
            </button>
            <button class="keep-btn" style="background: #2c2c2e; color: #fff; border: 1px solid #555; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.9em;">
                ✅ Keep Response & Continue
            </button>
        </div>
    `;

    targetReplyDiv.after(actionCard);

    actionCard.querySelector('.remember-info-btn').onclick = () => {
        chatHistoryMessages = deduplicateChatHistory(chatHistoryMessages, userQuery, 0.6);
        chatHistoryMessages.push({ role: "user", content: userQuery });
        chatHistoryMessages.push({ role: "assistant", content: `Grounded corpus records:\n${groundedText}` });
        logTerm(`🧠 [Manual Memory Curation] Grounded records explicitly committed to session memory.`);
        actionCard.querySelector('.remember-info-btn').innerText = "✅ Remembered Successfully!";
        actionCard.querySelector('.remember-info-btn').disabled = true;
        actionCard.querySelector('.remember-info-btn').style.background = "#30d158";
    };

    actionCard.querySelector('.summarize-chat-btn').onclick = () => {
        renderChatSummaryView(actionCard);
    };

    actionCard.querySelector('.keep-btn').onclick = () => {
        logTerm("✅ User confirmed response. Closing action card.");
        finalizePreviousActionCard();
    };
}

/**
 * Renders Action Card for Creative Mode with manual memory button, brainstorming disclaimer & redo button
 */
function renderCreativeActionCard(targetReplyDiv, userQuery, assistantReplyText) {
    const actionCard = document.createElement("div");
    activeActionCard = actionCard;
    actionCard.className = "mode-action-card";

    actionCard.style.cssText = `
        background: rgba(48, 209, 88, 0.12);
        border: 1px solid #30d158;
        padding: 10px 14px;
        border-radius: 6px;
        margin: 6px 0 12px 0;
        font-size: 0.85em;
    `;

    actionCard.innerHTML = `
        <div style="margin-bottom: 6px; font-weight: bold; color: #137333;">
            🟢 Generated in Creative / General Conversation Mode
        </div>
        <div style="color: #2e7d32; font-size: 0.9em; margin-bottom: 8px; line-height: 1.4;">
            ⚠️ This information may be incorrect as it's generated under creativity temperature and should be used for brainstorming only, not as a fact (until correctness is checked).
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="remember-info-btn" style="background: #0a84ff; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 0.9em;">
                🧠 Remember this information
            </button>
            <button class="summarize-chat-btn" style="background: #5856d6; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.9em;">
                📜 Summarize Chat
            </button>
            <button class="redo-creative-btn" style="background: #2c2c2e; color: #30d158; border: 1px solid #30d158; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 0.85em;">
                🎨 Redo in Creative Mode
            </button>
            <button class="keep-btn" style="background: #2c2c2e; color: #fff; border: 1px solid #555; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 0.85em;">
                ✅ Keep Response & Continue
            </button>
        </div>
    `;

    targetReplyDiv.after(actionCard);

    actionCard.querySelector('.remember-info-btn').onclick = () => {
        chatHistoryMessages = deduplicateChatHistory(chatHistoryMessages, userQuery, 0.6);
        chatHistoryMessages.push({ role: "user", content: userQuery });
        chatHistoryMessages.push({ role: "assistant", content: assistantReplyText });
        logTerm(`🧠 [Manual Memory Curation] Creative response explicitly committed to session memory.`);
        actionCard.querySelector('.remember-info-btn').innerText = "✅ Remembered Successfully!";
        actionCard.querySelector('.remember-info-btn').disabled = true;
        actionCard.querySelector('.remember-info-btn').style.background = "#30d158";
    };

    actionCard.querySelector('.summarize-chat-btn').onclick = () => {
        renderChatSummaryView(actionCard);
    };

    actionCard.querySelector('.redo-creative-btn').onclick = () => {
        logTerm("🎨 User selected: Redo in Creative Mode");
        sendChatMessage('creative', targetReplyDiv, userQuery);
    };

    actionCard.querySelector('.keep-btn').onclick = () => {
        logTerm("✅ User confirmed response. Closing action card.");
        finalizePreviousActionCard();
    };
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
