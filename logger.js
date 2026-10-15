console.log("[Module Loaded] logger.js | Functions: logTerm, getBasePath");

export function logTerm(message) {
    const term = document.getElementById('log-terminal');
    if (term) {
        const timestamp = new Date().toLocaleTimeString();
        term.innerText += `\n[${timestamp}] ${message}`;
        term.scrollTop = term.scrollHeight;
    }
    console.log(`[Rob Terminal] ${message}`);
}

export function getBasePath() {
    let path = window.location.pathname;
    if (!path.endsWith('/')) {
        path = path.substring(0, path.lastIndexOf('/') + 1);
    }
    return window.location.origin + path;
}
