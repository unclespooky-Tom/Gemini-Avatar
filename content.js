// Inject Iframe widget structure
const wrapper = document.createElement('div');
wrapper.id = 'avatar-extension-wrapper';

const iframe = document.createElement('iframe');
iframe.id = 'avatar-extension-iframe';

const getExtURL = (path) => {
    if (typeof browser !== 'undefined' && browser.runtime) return browser.runtime.getURL(path);
    if (typeof chrome !== 'undefined' && chrome.runtime) return chrome.runtime.getURL(path);
    return path;
};
iframe.src = getExtURL('index.html');
iframe.allow = "microphone; camera";
iframe.setAttribute("allowtransparency", "true");
iframe.style.backgroundColor = "transparent";

wrapper.appendChild(iframe);
document.body.appendChild(wrapper);

// ==========================================
// Robust Gemini DOM Text Extraction Pipeline
// ==========================================
class GeminiTextExtractor {
    constructor(onTextAvailable) {
        this.onTextAvailable = onTextAvailable;
        this.spokenLength = 0;
        this.lastMessageNode = null;
        this.debounceTimeout = null;
        this.currentText = "";
        
        // Poll DOM for streaming AI response changes
        setInterval(() => this.pollForChanges(), 400);
    }
    
    pollForChanges() {
        // Universal selector cascade targeting Google Gemini's modern and legacy components
        const selectors = [
            'message-content',             // Legacy fallback
            'model-response',              // Modern 2024+ Gemini Element
            '[data-message-author="chatModel"]', // Generic Data Attribute
            '.model-response-text',        // Text container class
            'response-container'           // Generic Wrapper
        ];
        
        let messages = [];
        for (const sel of selectors) {
            const nodes = document.querySelectorAll(sel);
            if (nodes.length > 0) {
                messages = Array.from(nodes);
                // Strip out nodes that are explicitly bound to the 'user' prompt
                messages = messages.filter(n => !n.closest('[data-message-author="user"]'));
                if (messages.length > 0) break;
            }
        }
        
        if (messages.length === 0) return;
        
        const latestMessage = messages[messages.length - 1];
        
        // Hardware switch: new message bubble detected!
        if (this.lastMessageNode !== latestMessage) {
            this.lastMessageNode = latestMessage;
            this.spokenLength = 0;
            this.currentText = "";
        }
        
        const newText = latestMessage.textContent.replace(/[\n\r]+/g, ' ').trim();
        
        // If the AI is actively streaming characters to the screen
        if (newText.length > this.spokenLength) {
            this.currentText = newText;
            
            // Debounce the text so we wait for a natural pause in the AI generation
            clearTimeout(this.debounceTimeout);
            this.debounceTimeout = setTimeout(() => {
                const unseenText = this.currentText.substring(this.spokenLength);
                if (unseenText.trim().length > 0) {
                    this.spokenLength = this.currentText.length;
                    this.onTextAvailable(unseenText.trim());
                }
            }, 1200); // 1.2 second pause triggers speech
        }
    }
}

// Bind the extractor directly to our Extension Iframe Intercom
new GeminiTextExtractor((newUnseenText) => {
    iframe.contentWindow.postMessage({ type: 'GEMINI_SPEAK', text: newUnseenText }, '*');
});

// Coordinate tracking for Iframe Dragging protocols
let wrapperBottom = 32;
let wrapperRight = 32;

// Inter-frame Communication protocols
window.addEventListener('message', (e) => {
    if (!e.data) return;
    
    // Resize protocols for inner popouts
    if (e.data.type === 'WIDGET_EXPAND') {
        if (e.data.target === 'menu') {
            wrapper.style.height = '620px';
        }
    } else if (e.data.type === 'WIDGET_COLLAPSE') {
        wrapper.style.width = '280px';
        wrapper.style.height = '280px';
    } 
    // Drag protocols from inner hidden handle
    else if (e.data.type === 'DRAG_START') {
        const style = window.getComputedStyle(wrapper);
        wrapperRight = parseInt(style.right, 10);
        wrapperBottom = parseInt(style.bottom, 10);
    } else if (e.data.type === 'DRAG_MOVE') {
        wrapperRight -= e.data.dx;
        wrapperBottom -= e.data.dy;
        wrapper.style.right = wrapperRight + 'px';
        wrapper.style.bottom = wrapperBottom + 'px';
    }
});
