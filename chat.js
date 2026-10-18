import { logTerm } from './logger.js';
import { getEngine, bootRobEngine } from './engine.js';
import { rankAndExtractRelevantSentences } from './rag.js';

console.log("[Module Loaded] chat.js | Functions: sendChatMessage, handleChatKeydown, downloadChatAsTxt, warmupEngineContext");

// Persistent in-memory dialogue history array for WebLLM multi-turn conversation
let chatHistoryMessages = [];
let isGenerating = false;
let activeActionCard = null; // Tracks current mode action card in UI

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
 * Formats System Instructions based on desired generation mode.
 */
function buildSystemInstruction(hasKnowledgeMatch, matchedContext) {
    const baseIdentity = `You are Rob, an autonomous sovereign AI assistant created by Dmitrii Zavalin. Your name is Rob. Never claim to be Dmitrii Zavalin or confuse your identity with the user. Do not repeat greeting introductions or boilerplate self-identifications in multi-turn conversations; answer the user's question directly.`;

    if (hasKnowledgeMatch) {
        const formattedContext = Array.isArray(matchedContext) ? matchedContext.join("\n") : matchedContext;
        return `${baseIdentity}

STRICT KNOWLEDGE BASE INSTRUCTIONS:
1. Relevant information was found in the general_training/ corpus for this user query.
2. You MUST answer STRICTLY AND ONLY using the facts provided in the REFERENCE CONTEXT below.
3. For any sub-topic, question, or aspect asked by the user that IS NOT explicitly documented in the reference context below (e.g. specific experiments, expeditions, dates, or additional features), state clearly: "No information regarding [specific topic] is available in the general_training/ corpus."
4. DO NOT use outside knowledge, extrapolate, or fabricate imaginary details.

--- EXTRACTED REFERENCE CONTEXT ---
${formattedContext}`;
    } else {
        return `${baseIdentity}
Be helpful, polite, precise, and conversational. Respond naturally as an AI assistant.`;
    }
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

    if (!isRedo) {
        logTerm(`💬 [chat.js -> sendChatMessage] User query submitted: "${userText}"`);
        history.innerHTML += `<div class="chat-msg chat-user"><b>You:</b> ${escapeHtml(userText)}</div>`;
        inputField.value = '';
        history.scrollTop = history.scrollHeight;
    } else {
        logTerm(`🔄 [chat.js -> Regeneration] User requested re-generation in mode: ${forceMode}`);
    }

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
    const implicitPronouns = /\b(it|its|they|them|their|this|that|project|topic|discussing)\b/i;

    if (implicitPronouns.test(userText) && chatHistoryMessages.length > 2) {
        const lastUserMsg = [...chatHistoryMessages].reverse().find(m => m.role === 'user');
        if (lastUserMsg) {
            ragSearchQuery = `${lastUserMsg.content} ${userText}`;
            logTerm(`🔄 [chat.js -> Query Resolution] Expanded RAG search query: "${ragSearchQuery}"`);
        }
    }

    // Run Sentence-by-Sentence Combinatorics RAG Extraction
    const matchedContext = rankAndExtractRelevantSentences(ragSearchQuery);
    let hasKnowledgeMatch = matchedContext && matchedContext.length > 0;

    // Apply manual mode override if user clicked a Redo button
    if (forceMode === 'creative') {
        hasKnowledgeMatch = false;
    } else if (forceMode === 'strict') {
        hasKnowledgeMatch = true;
    }

    const systemInstruction = buildSystemInstruction(hasKnowledgeMatch, matchedContext);

    // Update System Instruction in active history
    if (chatHistoryMessages.length === 0) {
        chatHistoryMessages.push({ role: "system", content: systemInstruction });
    } else {
        chatHistoryMessages[0] = { role: "system", content: systemInstruction };
    }

    if (!isRedo) {
        chatHistoryMessages = deduplicateChatHistory(chatHistoryMessages, userText, 0.6);
        chatHistoryMessages.push({ role: "user", content: userText });
    } else {
        // If re-generating, remove previous assistant turn from memory array
        if (chatHistoryMessages.length > 0 && chatHistoryMessages[chatHistoryMessages.length - 1].role === 'assistant') {
            chatHistoryMessages.pop();
        }
    }

    // Optimized token ceilings: 256 for Strict Knowledge Mode, 384 for Creative Mode
    const activeMaxTokens = hasKnowledgeMatch ? 256 : 384;
    logTerm(`📝 Multi-turn payload assembled (${chatHistoryMessages.length} messages active in context | Mode: ${hasKnowledgeMatch ? 'Strict Knowledge' : 'Creative'}). Executing WebGPU stream (max_tokens: ${activeMaxTokens})...`);

    const replyDiv = isRedo ? targetReplyDiv : document.createElement("div");
    if (!isRedo) {
        replyDiv.className = "chat-msg chat-rob";
        history.appendChild(replyDiv);
    }
    replyDiv.innerHTML = "<b>Rob:</b> ";
    history.scrollTop = history.scrollHeight;

    try {
        const asyncChunkGenerator = await engine.chat.completions.create({
            messages: chatHistoryMessages,
            temperature: hasKnowledgeMatch ? 0.0 : 0.5,
            max_tokens: activeMaxTokens,
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

        // Render interactive Mode Action Badge UI below response
        renderModeActionCard(replyDiv, hasKnowledgeMatch, userText);

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
            logTerm("⚠️ RAG payload exceeded 2048 token limit. Initiating 1-Sentence = 1-Chunk Sequential Streaming Loop...");

            const matchedSentences = Array.isArray(matchedContext) ? matchedContext : [];
            const totalSentences = matchedSentences.length;

            if (totalSentences > 0) {
                logTerm(`📦 Corpus matches parsed into ${totalSentences} individual sentence chunks for sequential breakdown.`);

                // Step 1: Announce in the first message bubble how many sequential responses will follow
                replyDiv.innerHTML = `<b>Rob:</b> I found extensive details across <b>${totalSentences}</b> matching sentences in my <code>general_training/</code> corpus. I will respond in <b>${totalSentences}</b> sequential messages below to ensure zero data loss:`;
                history.scrollTop = history.scrollHeight;

                // Step 2: Loop through each sentence (1 sentence = 1 chunk) programmatically in JavaScript
                for (let i = 0; i < totalSentences; i++) {
                    const sentence = matchedSentences[i];
                    logTerm(`🔄 [Chunk Loop] Processing sentence ${i + 1} of ${totalSentences} (Length: ${sentence.length} chars)...`);

                    const sentenceMessages = [
                        { 
                            role: "system", 
                            content: `You are Rob, an autonomous local AI engine created by Dmitrii Zavalin. Answer the user's question using STRICTLY AND ONLY the single reference sentence provided below. Do not extrapolate.\n\n--- REFERENCE SENTENCE ---\n${sentence}` 
                        },
                        { role: "user", content: userText }
                    ];

                    // Create a separate consecutive chat message div for this specific sentence chunk
                    const chunkReplyDiv = document.createElement("div");
                    chunkReplyDiv.className = "chat-msg chat-rob";
                    chunkReplyDiv.innerHTML = `<b>Rob [Match ${i + 1}/${totalSentences}]:</b> `;
                    history.appendChild(chunkReplyDiv);
                    history.scrollTop = history.scrollHeight;

                    try {
                        const chunkGenerator = await engine.chat.completions.create({
                            messages: sentenceMessages,
                            temperature: 0.0,
                            max_tokens: 150,
                            stream: true
                        });

                        let chunkText = "";
                        for await (const chunk of chunkGenerator) {
                            const content = chunk.choices[0]?.delta?.content || "";
                            chunkText += content;
                            
                            if (typeof window.marked !== 'undefined' && window.marked.parse) {
                                chunkReplyDiv.innerHTML = `<b>Rob [Match ${i + 1}/${totalSentences}]:</b> ` + window.marked.parse(chunkText);
                            } else {
                                chunkReplyDiv.innerHTML = `<b>Rob [Match ${i + 1}/${totalSentences}]:</b> ` + chunkText;
                            }
                            history.scrollTop = history.scrollHeight;
                        }

                        logTerm(`✅ [Chunk Loop] Successfully streamed sentence ${i + 1}/${totalSentences} (${chunkText.length} chars).`);

                    } catch (chunkErr) {
                        logTerm(`⚠️ Minor note on sentence chunk ${i + 1}: ${chunkErr.message}`);
                        chunkReplyDiv.innerHTML = `<b>Rob [Match ${i + 1}/${totalSentences}]:</b> [Skipped due to generation limit]`;
                    }
                }

                logTerm(`✅ 1-Sentence = 1-Chunk Sequential Streaming Loop completed successfully across all ${totalSentences} sections.`);

            } else {
                logTerm(`⚠️ Token overflow caught, but no matched sentences array available. Falling back to direct notice.`);
                replyDiv.innerText = "Rob Error: Prompt tokens exceed context window size limit. Please try a narrower, more specific question!";
            }

        } else if (isGpuCrash) {
            logTerm("⚠️ GPU context reset encountered. Displaying compact browser restart and export window.");
            
            // Neutralize container constraints so the crash window renders as a compact, centered card
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

/**
 * Renders the color-coded technical mode badge & action buttons below Rob's message
 */
function renderModeActionCard(targetReplyDiv, isStrict, userQuery) {
    const actionCard = document.createElement("div");
    activeActionCard = actionCard;
    actionCard.className = "mode-action-card";

    const badgeBg = isStrict ? "rgba(255, 69, 58, 0.12)" : "rgba(48, 209, 88, 0.12)";
    const badgeBorder = isStrict ? "#ff453a" : "#30d158";
    const badgeText = isStrict ? "🔴 Generated in Strict Knowledge Mode (RAG Grounded)" : "🟢 Generated in Creative / General Conversation Mode";

    actionCard.style.cssText = `
        background: ${badgeBg};
        border: 1px solid ${badgeBorder};
        padding: 8px 12px;
        border-radius: 6px;
        margin: 6px 0 12px 0;
        font-size: 0.85em;
    `;

    actionCard.innerHTML = `
        <div style="margin-bottom: 6px; font-weight: bold; color: ${badgeBorder};">
            ${badgeText}
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="redo-creative-btn" style="background: #2c2c2e; color: #30d158; border: 1px solid #30d158; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 0.85em;">
                🎨 Redo in Creative Mode
            </button>
            <button class="redo-strict-btn" style="background: #2c2c2e; color: #ff6b6b; border: 1px solid #ff453a; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 0.85em;">
                🔒 Redo in Strict Knowledge Mode
            </button>
            <button class="keep-btn" style="background: #0a84ff; color: #fff; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 0.85em;">
                ✅ Keep Response & Continue
            </button>
        </div>
    `;

    targetReplyDiv.after(actionCard);

    // Event Bindings
    actionCard.querySelector('.redo-creative-btn').onclick = () => {
        logTerm("🎨 User selected: Redo in Creative Mode");
        sendChatMessage('creative', targetReplyDiv, userQuery);
    };

    actionCard.querySelector('.redo-strict-btn').onclick = () => {
        logTerm("🔒 User selected: Redo in Strict Knowledge Mode");
        sendChatMessage('strict', targetReplyDiv, userQuery);
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
