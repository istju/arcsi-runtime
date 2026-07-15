function copyCode(block, btn) {
  try {
    const ta = document.createElement('textarea');
    ta.value = block.textContent;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    btn.textContent = ok ? '✅ Másolva!' : '❌ Hiba';
    setTimeout(() => btn.textContent = '📋 Másol', 2000);
  } catch(e) {
    btn.textContent = '❌ Hiba';
    setTimeout(() => btn.textContent = '📋 Másol', 2000);
  }
}

function addCopyButtons(container) {
  container.querySelectorAll('pre code').forEach(block => {
    if (block.parentNode.querySelector('.copy-btn')) return;

    // Nyelv felismerés
    const cls = block.className || '';
    const lang = cls.replace('language-', '').toLowerCase();
    const isRunnable = ['python', 'bash', 'sh', 'node', 'javascript'].includes(lang);
    const isSandboxable = ['python', 'bash', 'sh'].includes(lang) || lang === '' || lang === 'undefined';

    // Gomb sor
    const btnRow = document.createElement('div');
    btnRow.className = 'code-btn-row';

    // 📋 Másol gomb
    const copyBtn = document.createElement('button');
    copyBtn.textContent = '📋 Másol';
    copyBtn.className = 'copy-btn';
    copyBtn.onclick = () => copyCode(block, copyBtn);
    btnRow.appendChild(copyBtn);

    // 💾 Sandboxba gomb (python, bash)
    if (isSandboxable) {
      const sandboxBtn = document.createElement('button');
      sandboxBtn.textContent = '💾 Sandboxba';
      sandboxBtn.className = 'copy-btn sandbox-btn';
      sandboxBtn.onclick = async () => {
        const ext = lang === 'python' ? '.py' : '.sh';
        const filename = 'code_' + Date.now() + ext;
        const res = await fetch('/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API_KEY },
          body: JSON.stringify({ prompt: 'Mentsd el ezt a kódot sandbox_write tool-lal, filename: ' + filename + ', content: ' + block.textContent, sessionId: sessionId })
        });
        sandboxBtn.textContent = '✅ Mentve!';
        setTimeout(() => sandboxBtn.textContent = '💾 Sandboxba', 2000);
      };
      btnRow.appendChild(sandboxBtn);
    }

    block.parentNode.insertBefore(btnRow, block);
  });
}

const API_KEY = '11111111';
const chatEl = document.getElementById('chat');
const promptEl = document.getElementById('prompt');
const sendBtn = document.getElementById('send');
const statusEl = document.getElementById('status');
const imgBtn = document.getElementById('imgBtn');
const clearBtn = document.getElementById('clearBtn');
const fileInput = document.getElementById('fileInput');
const imgPreview = document.getElementById('imgPreview');
const previewImg = document.getElementById('previewImg');
const removeImgBtn = document.getElementById('removeImg');
const providerInfo = document.getElementById('providerInfo');
const agentBtn = document.getElementById('agentBtn'); // ÚJ

let currentImageBase64 = null;
let currentImageType = null;
let sessionId = loadOrCreateSessionId();
let messages = loadMessages();
let agentMode = false; // ÚJ

renderAllMessages();

providerInfo.textContent = 'Lokális AI szerver (/' + sessionId + ')';

// ÚJ: Agent gomb kapcsoló
agentBtn.onclick = () => {
  agentMode = !agentMode;
  agentBtn.className = agentMode ? 'agent-on' : 'agent-off';
  agentBtn.textContent = agentMode ? '🤖 Agent ON' : '🤖 Agent';
  statusEl.textContent = agentMode ? '🤖 Agent mód aktív — eszközöket is használhat!' : '';
};

resetBtn.onclick = async () => {
    await fetch('/agent/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionId })
    });
    statusEl.textContent = '🔄 Új feladat kezdhető!';
    resetBtn.style.background = '#27ae60';
    setTimeout(() => {
        statusEl.textContent = '';
        resetBtn.style.background = '';
    }, 2000);
};

// Kontextus mentés gomb
const saveProgressBtn = document.getElementById('saveProgressBtn');
saveProgressBtn.onclick = async () => {
    const summary = prompt('Mit szeretnél rögzíteni a kontextusba?');
    if (!summary) return;
    const res = await fetch('/agent/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary, next_steps: [] })
    });
    const data = await res.json();
    if (data.ok) {
        saveProgressBtn.style.background = '#27ae60';
        statusEl.textContent = '💾 Kontextus mentve!';
        setTimeout(() => {
            saveProgressBtn.style.background = '';
            statusEl.textContent = '';
        }, 2000);
    }
};

focusBtn.onclick = async () => {
    const goal = prompt('Mi a jelenlegi fókusz/cél?');
    if (!goal) return;
    const reason = prompt('Miért prioritás? (mi blokkol)') || '';
    const estimatedTime = prompt('Becsült időkeret? (pl. 1-2 óra, ma, hétvégén)') || '';
    const relatedFilesStr = prompt('Kapcsolódó fájlok/modulok? (vesszővel elválasztva)') || '';
    const criteriaStr = prompt('Mikor tekinthető késznek? (kritériumok vesszővel)') || '';
    
    const related_files = relatedFilesStr.split(',').map(s => s.trim()).filter(Boolean);
    const success_criteria = criteriaStr.split(',').map(s => s.trim()).filter(Boolean);

    const res = await fetch('/runtime/context/patch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            patch: {
                current_focus: {
                    goal,
                    reason,
                    estimated_time: estimatedTime,
                    related_files,
                    started_at: new Date().toISOString(),
                    success_criteria
                }
            },
            reason: 'focus_update'
        })
    });
    const data = await res.json();
    if (data.ok) {
        focusBtn.style.background = '#27ae60';
        statusEl.textContent = '🎯 Fókusz beállítva!';
        setTimeout(() => {
            focusBtn.style.background = '';
            statusEl.textContent = '';
        }, 2000);
    }
};

imgBtn.onclick = () => fileInput.click();

fileInput.onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  compressImage(file, 4, (b64, type, dataUrl) => {
    currentImageBase64 = b64;
    currentImageType = type;
    previewImg.src = dataUrl;
    imgPreview.classList.remove('hidden');
  });
};

removeImgBtn.onclick = () => {
  currentImageBase64 = null;
  currentImageType = null;
  imgPreview.classList.add('hidden');
  fileInput.value = '';
};

promptEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendBtn.click();
  }
});

document.addEventListener('paste', (e) => {
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image/') === 0) {
      const file = items[i].getAsFile();
      compressImage(file, 4, (b64, type, dataUrl) => {
        currentImageBase64 = b64;
        currentImageType = type;
        previewImg.src = dataUrl;
        imgPreview.classList.remove('hidden');
      });
      break;
    }
  }
});

clearBtn.onclick = () => {
  if (!confirm('Biztosan törlöd a beszélgetést?')) return;
  messages = [];
  saveMessages();
  renderAllMessages();
};

sendBtn.onclick = async () => {
  const text = promptEl.value.trim();
  if (!text && !currentImageBase64) return;

  const userMsg = {
    role: 'user',
    content: text || '(kép küldve)',
    image: currentImageBase64 ? previewImg.src : null
  };
  messages.push(userMsg);
  saveMessages();
  appendMessage(userMsg);
  scrollToBottom();

  const aiMsg = { role: 'assistant', content: '' };
  const aiDiv = appendMessage(aiMsg, true);

  // ÚJ: endpoint és payload agent módtól függően
  const endpoint = agentMode ? '/agent/chat' : '/chat';
  const payload = agentMode
    ? { prompt: text, sessionId: sessionId, autonomous: true }
    : { prompt: text || 'Mit látsz ezen a képen? Írd le részletesen magyarul.', sessionId: sessionId };

  if (!agentMode && currentImageBase64) {
    payload.image = currentImageBase64;
    payload.imageType = currentImageType;
  }

  promptEl.value = '';
  currentImageBase64 = null;
  currentImageType = null;
  imgPreview.classList.add('hidden');
  fileInput.value = '';

  sendBtn.disabled = true;
  // ÚJ: státusz agent módban más
  statusEl.textContent = agentMode ? '🤖 Agent dolgozik...' : '⏳ Válasz érkezik...';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 perc

    let response;
    try {
      response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': '12dfrtzubvduikbf56789ifdstbnkizdde457uhfvguijvvft7zddghh'
  },
  body: JSON.stringify(payload),
  signal: controller.signal
});
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const err = await response.text();
      aiDiv.querySelector('.content').textContent = 'Szerver hiba: ' + err;
      aiDiv.classList.add('error');
      statusEl.textContent = '❌ Hiba';
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      fullText += chunk;
      aiDiv.querySelector('.content').innerHTML = marked.parse(fullText);
      scrollToBottom();
    }

    addCopyButtons(aiDiv.querySelector('.content'));
    aiMsg.content = fullText;
    messages.push(aiMsg);
    saveMessages();
    statusEl.textContent = agentMode ? '✅ Agent kész' : '✅ Kész';
  } catch (e) {
    aiDiv.querySelector('.content').textContent = 'Hálózati hiba: ' + e.message;
    aiDiv.classList.add('error');
    statusEl.textContent = '❌ Hiba';
  } finally {
    sendBtn.disabled = false;
    scrollToBottom();
  }
};

// ... többi függvény marad változatlan (appendMessage, renderAllMessages, stb.)
function appendMessage(msg, returnElement = false) {
  const wrapper = document.createElement('div');
  wrapper.className = 'message ' + msg.role;

  const roleDiv = document.createElement('div');
  roleDiv.className = 'role';
  // ÚJ: agent módban jelöljük az AI üzenetet
  roleDiv.textContent = msg.role === 'user' ? 'TE' : (agentMode ? '🤖 Arcsi Agent' : 'Arcsi');
  wrapper.appendChild(roleDiv);

  const contentDiv = document.createElement('div');
  contentDiv.className = 'content';
  contentDiv.innerHTML = msg.content ? marked.parse(msg.content) : '';
  wrapper.appendChild(contentDiv);

  if (msg.image) {
    const img = document.createElement('img');
    img.src = msg.image;
    wrapper.appendChild(img);
  }

  chatEl.appendChild(wrapper);
  if (returnElement) return wrapper;
}

function renderAllMessages() {
  chatEl.innerHTML = '';
  if (messages.length === 0) {
    const div = document.createElement('div');
    div.className = 'message system';
    div.innerHTML = '<div class="content">Üdv! Írj valamit, vagy tölts fel egy képet…</div>';
    chatEl.appendChild(div);
    return;
  }
  messages.forEach(m => appendMessage(m));
  scrollToBottom();
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    chatEl.scrollTop = chatEl.scrollHeight;
  });
}

function compressImage(file, maxSizeMB, callback) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX = 1920;
      let w = img.width;
      let h = img.height;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else { w = Math.round(w * MAX / h); h = MAX; }
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      let q = 0.85;
      let dataUrl = canvas.toDataURL('image/jpeg', q);
      while (dataUrl.length > maxSizeMB * 1024 * 1024 * 1.37 && q > 0.3) {
        q -= 0.1;
        dataUrl = canvas.toDataURL('image/jpeg', q);
      }
      const b64 = dataUrl.split(',')[1];
      callback(b64, 'image/jpeg', dataUrl);
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function loadOrCreateSessionId() {
  const key = 'arcsi_session_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = 'session_' + Math.random().toString(36).slice(2);
    localStorage.setItem(key, id);
  }
  return id;
}

function loadMessages() {
  const key = 'arcsi_messages_' + sessionId;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
}

function saveMessages() {
  const key = 'arcsi_messages_' + sessionId;
  localStorage.setItem(key, JSON.stringify(messages));
}