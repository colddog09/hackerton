
// Google Sheets Configuration
const SHEET_ID = '1dgw1DPfIgxyV0qO2qkdLxsbtbMRBt65QcJRwcqyex8I';

// Map Class Number to Sheet GID (Tab ID)
// ⚠️ USER MUST UPDATE THESE GIDs FOR CLASSES 2-5
const CLASS_GIDS = {
    1: '0',           // Class 1
    2: '1667344915',  // Class 2
    3: '1590452115',  // Class 3
    4: '991564034',   // Class 4
    5: '463016272'    // Class 5
};

let currentClass = 1;
const IGNORED_COLUMNS = [0]; // Only ignore first column (index)
let WEBHOOK_URL = localStorage.getItem('WEBHOOK_URL') || '';
let globalRawHeaders = []; // For add modal

function getCSVUrl() {
    const gid = CLASS_GIDS[currentClass] || '0';
    return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}&t=${Date.now()}`;
}

function switchClass(classNum) {
    currentClass = classNum;

    // Update active tab UI
    document.querySelectorAll('.class-tab').forEach((tab, index) => {
        if ((index + 1) === classNum) tab.classList.add('active');
        else tab.classList.remove('active');
    });

    // Check if GID is configured
    if (CLASS_GIDS[classNum] && CLASS_GIDS[classNum].startsWith('REPLACE_ME')) {
        alert(`${classNum}반 시트 ID(GID)가 설정되지 않았습니다.\nscript.js 파일에서 CLASS_GIDS를 업데이트해주세요.`);
        return;
    }

    loadData();
}

function promptWebhookUrl() {
    const url = prompt("n8n Webhook URL을 입력하세요:", WEBHOOK_URL);
    if (url !== null) {
        WEBHOOK_URL = url.trim();
        localStorage.setItem('WEBHOOK_URL', WEBHOOK_URL);
        loadData();
    }
}

function parseCSV(text) {
    // ... (Same CSV Parsing Logic for Fallback) ...
    const lines = [];
    let currentLine = '';
    let inQuotes = false;
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];
        if (char === '"') {
            if (inQuotes && nextChar === '"') { currentLine += '"'; i++; } else { inQuotes = !inQuotes; }
        } else if (char === '\n' && !inQuotes) { lines.push(currentLine); currentLine = ''; }
        else { currentLine += char; }
    }
    if (currentLine || text.length > 0) lines.push(currentLine);
    if (lines.length === 0) return { h: [], r: [] };

    const parseLine = (line) => {
        const vals = [];
        let curr = '';
        let quote = false;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            const n = line[i + 1];
            if (c === '"') {
                if (quote && n === '"') { curr += '"'; i++; } else { quote = !quote; }
            } else if (c === ',' && !quote) { vals.push(curr); curr = ''; } else { curr += c; }
        }
        vals.push(curr);
        return vals;
    };
    const headers = parseLine(lines[0]);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === '' && !line.includes(',')) continue;
        rows.push(parseLine(line));
    }
    return { headers, rows };
}

function filterData(headers, rows) {
    const filteredHeaders = headers.filter((_, index) => !IGNORED_COLUMNS.includes(index));

    // Map rows to objects with index
    const rowsWithIndex = rows.map((r, i) => ({ data: r, originalIndex: i }));

    const filteredRowObjects = rowsWithIndex.map(obj => ({
        filteredData: obj.data.filter((_, index) => !IGNORED_COLUMNS.includes(index)),
        originalIndex: obj.originalIndex,
        fullData: obj.data
    }));

    return { headers: filteredHeaders, rowObjects: filteredRowObjects };
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function createCardHTML(headers, rowObj) {
    const row = rowObj.filteredData;
    const originalIndex = rowObj.originalIndex;

    const titleValue = row[0] || '제목 없음';
    const displayTitle = escapeHtml(titleValue);
    const emoji = getSubjectEmoji(titleValue);

    // Find Date for Poster View & Urgency Check
    const dateColIndex = findDateColumnIndex(globalRawHeaders);
    // Fix: Use fullData to access by raw index
    const dateStr = dateColIndex !== -1 ? (rowObj.fullData[dateColIndex] || '') : '';

    // Check Urgency and Overdue
    let isUrgent = false;
    let isOverdue = false;
    if (dateStr) {
        const taskDate = parseDateString(String(dateStr));
        if (taskDate) {
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const diffTime = taskDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays >= 0 && diffDays <= 1) isUrgent = true;
            if (diffDays < 0) isOverdue = true;
        }
    }

    // Front: Poster View (Title + Emoji + Date)
    // Back: Details View (Rows)

    // Add urgency/overdue class if needed
    let cardClass = '';
    if (isOverdue) cardClass = ' highlight-overdue';
    else if (isUrgent) cardClass = ' highlight-urgent';

    // Remove inline onclick, handled by listeners
    let html = `<div class="info-card${cardClass}" id="card-original-${originalIndex}">`;

    html += `<div class="card-inner">`;

    // --- FRONT ---
    html += `<div class="card-front">`;
    html += `   <div class="card-bg-title">${displayTitle}</div>`;
    html += `   <div class="card-bg-emoji">${isOverdue ? '💀' : emoji}</div>`;
    html += `   <div class="card-content" style="justify-content:center; align-items:center; text-align:center;">`;
    html += `       <div style="font-size:32px; font-weight:800; margin-bottom:10px;">${displayTitle}</div>`;
    html += `       <div style="font-size:18px; color:#666; font-weight:600;">${dateStr}</div>`;
    if (isOverdue) {
        html += `<div style="margin-top:8px; font-size:14px; color:#888; font-weight:700;">💀 기한 지남</div>`;
    } else if (isUrgent) {
        html += `<div style="margin-top:8px; font-size:14px; color:#FF3B30; font-weight:700;">⚠️ 마감 임박</div>`;
    }
    html += `       <div style="margin-top:20px; font-size:14px; color:#999;">터치하여 상세 정보 보기</div>`;
    html += `   </div>`;

    html += `</div>`; // End Front

    // --- BACK ---
    html += `<div class="card-back">`;
    html += `   <div class="card-header-small" contenteditable="false">${displayTitle}</div>`;
    html += `   <div class="card-body">`;

    headers.forEach((header, index) => {
        // Skip Title (0) ? No, maybe show it? We already showed main title.
        // Skip Hidden Columns
        if (IGNORED_COLUMNS.includes(index)) return;

        const label = escapeHtml(header);
        const value = escapeHtml(row[index] || '-');
        const isTitle = (index === 0);
        const isLink = header.toLowerCase().includes('링크') || header.toLowerCase().includes('link') || header.toLowerCase().includes('url');

        if (!isTitle && !isLink) { // Don't repeat title, handle links separately
            html += `<div class="info-row">
                                <div class="info-label">${label}</div>
                                <div class="info-value" contenteditable="false">${value}</div>
                             </div>`;
        }
    });
    html += `   </div>`;

    // Find and add Classroom Link Button
    const linkColIndex = globalRawHeaders.findIndex(h =>
        h.toLowerCase().includes('링크') || h.toLowerCase().includes('link') || h.toLowerCase().includes('url')
    );
    const linkUrl = linkColIndex !== -1 ? rowObj.fullData[linkColIndex] : '';

    if (linkUrl && linkUrl.trim() !== '' && linkUrl.trim().toLowerCase() !== 'x') {
        html += `<a href="${escapeHtml(linkUrl)}" target="_blank" class="classroom-link-btn" onclick="event.stopPropagation();">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                <polyline points="15 3 21 3 21 9"></polyline>
                                <line x1="10" y1="14" x2="21" y2="3"></line>
                            </svg>
                            클래스룸 열기
                         </a>`;
    } else {
        html += `<div class="no-link-msg">링크 없음</div>`;
    }

    html += `</div>`; // End Back

    html += `</div>`; // End Inner
    html += `</div>`; // End Card

    return html;
}

function renderInfiniteCards(headers, rowObjects) {
    if (rowObjects.length === 0) return '<div class="state-container">데이터가 없습니다</div>';
    const cardHTMLs = rowObjects.map(obj => createCardHTML(headers, obj));
    const originalHTML = cardHTMLs.join('');
    // Add set divider marker between sets
    const setDivider = `<div class="set-divider"><div class="set-divider-marker">▼</div></div>`;
    const setsWithDividers = [];
    for (let i = 0; i < 5; i++) {
        setsWithDividers.push(originalHTML);
        if (i < 4) setsWithDividers.push(setDivider);
    }
    return setsWithDividers.join('');
}

function setupInfiniteScroll(container, singleSetCount) {
    // Store singleSetCount globally for ScrollTo
    window.singleSetCount = singleSetCount;

    requestAnimationFrame(() => {
        const firstCard = container.querySelector('.info-card');
        if (!firstCard) return;
        const style = window.getComputedStyle(container);
        const gap = parseFloat(style.gap) || 0;
        const itemWidth = firstCard.offsetWidth + gap;
        const singleSetWidth = itemWidth * singleSetCount;

        container.scrollLeft = singleSetWidth * 2;

        let isResetting = false;

        // Remove existing handler if present
        if (container._infiniteScrollHandler) {
            container.removeEventListener('scroll', container._infiniteScrollHandler);
        }

        // Define new handler
        const scrollHandler = () => {
            if (isResetting) return;
            const currentScroll = container.scrollLeft;

            // 1. Infinite Scroll Logic
            if (currentScroll < singleSetWidth) {
                isResetting = true;
                container.style.scrollSnapType = 'none';
                container.style.scrollBehavior = 'auto'; // Disable smooth for instant jump
                container.scrollLeft += (singleSetWidth * 2);
                void container.offsetWidth;
                container.style.scrollBehavior = 'smooth'; // Re-enable
                container.style.scrollSnapType = 'x mandatory';
                isResetting = false;
            }
            else if (currentScroll > singleSetWidth * 4) {
                isResetting = true;
                container.style.scrollSnapType = 'none';
                container.style.scrollBehavior = 'auto'; // Disable smooth for instant jump
                container.scrollLeft -= (singleSetWidth * 2);
                void container.offsetWidth;
                container.style.scrollBehavior = 'smooth'; // Re-enable
                container.style.scrollSnapType = 'x mandatory';
                isResetting = false;
            }

            // 2. Focus Effect Logic
            updateScrollFocus(container);
        };

        // Attach and store
        container.addEventListener('scroll', scrollHandler);
        container._infiniteScrollHandler = scrollHandler;

        // Initial Focus Call
        updateScrollFocus(container);
    });
}

function updateScrollFocus(container) {
    const cards = container.querySelectorAll('.info-card');
    const containerCenter = container.scrollLeft + (container.offsetWidth / 2);

    cards.forEach(card => {
        const cardCenter = card.offsetLeft + (card.offsetWidth / 2);
        const dist = Math.abs(containerCenter - cardCenter);

        // Threshold for "center": within 100px (half card width approx)
        if (dist < 150) {
            card.classList.add('active-center');
        } else {
            card.classList.remove('active-center');
        }
    });
}

// --- CRUD Logic ---

// --- CRUD Logic (Webhook) ---

async function apiRequest(action, payload) {
    if (!WEBHOOK_URL) {
        alert("연동된 Webhook URL이 없습니다. 상단 텍스트를 클릭하여 설정해주세요.");
        return false;
    }

    try {
        // n8n Webhook: POST JSON
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: action, ...payload })
        });

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }

        const json = await response.json();
        // Assume n8n returns { result: 'success' } or similar
        // If simple text "Webhook received", we handle that too.
        // For now, strict check not strictly needed if status is 200.
        return true;
    } catch (e) {
        console.error(e);
        alert("요청 실패: " + e.message);
        return false;
    }
}

function openAddModal() {
    const modal = document.getElementById('addModal');
    const formContainer = document.getElementById('addFormInputs');

    // Clear previous inputs
    formContainer.innerHTML = '';

    // Generate input fields based on headers (excluding ignored columns)
    globalRawHeaders.forEach((header, index) => {
        if (IGNORED_COLUMNS.includes(index)) return;

        const inputGroup = document.createElement('div');
        inputGroup.className = 'input-group';
        inputGroup.style.marginBottom = '16px';

        const label = document.createElement('label');
        label.textContent = header;
        label.style.display = 'block';
        label.style.marginBottom = '8px';
        label.style.fontWeight = '600';
        label.style.color = 'var(--text-primary)';

        const input = document.createElement('input');
        input.type = 'text';
        input.dataset.index = index;
        input.dataset.header = header;
        input.placeholder = `${header} 입력`;
        input.style.width = '100%';
        input.style.padding = '12px';
        input.style.border = '1px solid #ddd';
        input.style.borderRadius = '12px';
        input.style.fontSize = '14px';

        inputGroup.appendChild(label);
        inputGroup.appendChild(input);
        formContainer.appendChild(inputGroup);
    });

    modal.classList.add('active');
}

function closeAddModal() {
    document.getElementById('addModal').classList.remove('active');
}

async function submitAdd() {
    const inputs = document.querySelectorAll('#addFormInputs input');
    const btn = document.querySelector('.btn-submit');

    // Construct payload object
    const payload = {
        class: currentClass // Include current class
    };

    inputs.forEach(input => {
        const header = input.dataset.header;
        if (header && input.value.trim()) {
            payload[header] = input.value.trim();
        }
    });

    // Validate that at least some data is provided
    if (Object.keys(payload).length <= 1) {
        alert('최소한 하나의 필드를 입력해주세요.');
        return;
    }

    btn.disabled = true;
    btn.textContent = '저장 중...';

    // Use class-specific webhook URL
    const webhookUrl = `https://gbshackathon.app.n8n.cloud/webhook/add-task-${currentClass}`;
    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            alert('✅ 일정이 추가되었습니다!');
            closeAddModal();
            // Wait a bit for the sheet to update, then reload
            setTimeout(() => loadData(), 1000);
        } else {
            throw new Error('Failed to add task');
        }
    } catch (error) {
        console.error('Error adding task:', error);
        alert('❌ 일정 추가에 실패했습니다. n8n 웹훅이 실행 중인지 확인해주세요.');
    } finally {
        btn.disabled = false;
        btn.textContent = '저장하기';
    }
}



// --- Logic Updates ---

async function loadData() {
    const container = document.getElementById('scroll-container');
    const statusText = document.getElementById('statusText');
    const refreshBtn = document.getElementById('refreshBtn');

    container.innerHTML = `<div class="state-container"><div class="spinner"></div></div>`;
    refreshBtn.disabled = true;

    try {
        let headers, rows;

        // TRY Webhook Fetch First if URL exists
        if (WEBHOOK_URL) {
            try {
                const res = await fetch(WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'read' })
                });
                const json = await res.json();

                // Adapt: If json is Array of Objects (Direct Sheet Read)
                // If user returns raw rows:
                if (Array.isArray(json) && json.length > 0) {
                    headers = Object.keys(json[0]); // Get keys as headers
                    rows = json.map(obj => Object.values(obj)); // Convert values to rows
                }
                else if (json.headers && json.rows) {
                    headers = json.headers;
                    rows = json.rows;
                }
                // If n8n returns wrapper { data: [...] } ?
                else if (json.data && Array.isArray(json.data)) {
                    // Assuming data is array of objects
                    headers = Object.keys(json.data[0]);
                    rows = json.data.map(obj => Object.values(obj));
                }
                else {
                    // If empty array or unknown
                    if (Array.isArray(json) && json.length === 0) {
                        headers = []; rows = [];
                    } else {
                        throw new Error("Unknown Data Generation");
                    }
                }

                statusText.textContent = `연동됨 (최근 업데이트: ${new Date().toLocaleTimeString()})`;
            } catch (e) {
                console.warn("Webhook Fetch failed", e);
                statusText.textContent = "연동 실패 (클릭하여 수정)";
                throw e; // Fallback
            }
        }

        // Fallback to CSV if no Webhook or failed
        if (!WEBHOOK_URL) {
            const csvUrl = getCSVUrl();
            const proxyServices = [
                { name: 'Direct', url: csvUrl, options: { method: 'GET', mode: 'cors', cache: 'no-cache', headers: { 'Accept': 'text/csv' } } },
                { name: 'allorigins.win', url: `https://api.allorigins.win/raw?url=${encodeURIComponent(csvUrl)}` },
                { name: 'corsproxy.io', url: `https://corsproxy.io/?${encodeURIComponent(csvUrl)}` }
            ];
            let text = null;
            for (const proxy of proxyServices) {
                try {
                    const res = await fetch(proxy.url, proxy.options);
                    if (res.ok) { text = await res.text(); break; }
                } catch (e) { }
            }
            if (!text) throw new Error('불러오기 실패');
            if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
            const parsed = parseCSV(text);
            headers = parsed.headers;
            rows = parsed.rows;
            statusText.textContent = `최근 업데이트: ${new Date().toLocaleTimeString()} (읽기 전용)`;
        }

        globalRawHeaders = headers; // Store for Modal
        const filtered = filterData(headers, rows);

        // Urgent Section - Pass Row Objects to get original index
        updateUrgentSection(filtered.headers, filtered.rowObjects);

        if (rows.length === 0) {
            container.classList.add('is-empty');
            container.innerHTML = `
                <div class="state-container">
                    <div class="no-data-msg">과제가 없습니다 🎉</div>
                </div>
            `;
        } else {
            container.classList.remove('is-empty');
            container.innerHTML = renderInfiniteCards(filtered.headers, filtered.rowObjects);
            setupInfiniteScroll(container, rows.length);
            setupCardInteractions(container);
        }

        // Render Calendar
        renderCalendar(filtered.rowObjects);

    } catch (err) {
        console.error(err);
        container.innerHTML = `<div class="state-container"><div class="error-msg">오류 발생<br><span style="font-size:0.85em; opacity:0.8;">${escapeHtml(err.message)}</span></div></div>`;
    } finally {
        refreshBtn.disabled = false;
    }
}

// --- Urgent Tasks (Copied & Adjusted) ---
function findDateColumnIndex(headers) {
    const keywords = ['날짜', '기한', '마감', '일정', '제출'];
    for (let i = 0; i < headers.length; i++) {
        if (keywords.some(k => headers[i].includes(k))) return i;
    }
    return -1;
}

function parseDateString(dateStr) {
    const now = new Date();
    let year = now.getFullYear();

    // Clean string: remove non-digit separators
    const nums = dateStr.match(/\d+/g);
    if (!nums || nums.length < 2) return null;

    let month, day;

    if (nums.length >= 3) {
        // Assume YYYY.MM.DD if first part is 4 digits
        if (nums[0].length === 4) {
            year = parseInt(nums[0], 10);
            month = parseInt(nums[1], 10) - 1;
            day = parseInt(nums[2], 10);
        } else {
            // Fallback or other format? Assume MM.DD for first two
            month = parseInt(nums[0], 10) - 1;
            day = parseInt(nums[1], 10);
        }
    } else {
        // MM.DD
        month = parseInt(nums[0], 10) - 1;
        day = parseInt(nums[1], 10);

        // Smart Year Logic:
        // If detected date is > 6 months in the past compared to today, assume it's for next year.
        // (e.g., Today is Dec 2025, Date is "1.5" -> Jan 5. Default is Jan 5 2025 (Past). Treat as 2026).
        const tempDate = new Date(year, month, day);
        const sixMonths = 180 * 24 * 60 * 60 * 1000;
        if (now - tempDate > sixMonths) {
            year++;
        }
    }

    return new Date(year, month, day);
}

function updateUrgentSection(headers, rowObjects) {
    const urgentWrapper = document.getElementById('urgent-wrapper');
    const urgentList = document.getElementById('urgent-list');
    const dateColIndex = findDateColumnIndex(globalRawHeaders); // Use Global Headers

    if (dateColIndex === -1) { urgentWrapper.style.display = 'none'; return; }

    // Title should match the card's title (first non-ignored column)
    let titleIndex = 0;
    for (let i = 0; i < headers.length; i++) {
        if (!IGNORED_COLUMNS.includes(i)) {
            titleIndex = i;
            break;
        }
    }

    const today = new Date(); today.setHours(0, 0, 0, 0);

    let urgentHtml = '';
    let count = 0;

    rowObjects.forEach(obj => {
        const row = obj.fullData; // Use full data for logic
        const originalIndex = obj.originalIndex;

        const dateStr = row[dateColIndex];
        if (!dateStr) return;
        const taskDate = parseDateString(String(dateStr));
        if (!taskDate) return;
        const diffTime = taskDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= 1) {
            const displayTitle = obj.filteredData[0] || '제목 없음';
            const deadline = String(dateStr);
            const label = diffDays === 0 ? '오늘 마감' : '내일 마감';

            urgentHtml += `
                        <div class="urgent-card" onclick="scrollToItem(${originalIndex})">
                            <div style="font-size:12px; font-weight:700; color:#FF3B30;">${label}</div>
                            <div style="font-size:16px; font-weight:600;">${escapeHtml(displayTitle)}</div>
                            <div style="font-size:13px; color:#666;">${escapeHtml(deadline)}</div>
                        </div>`;
            count++;
        }
    });

    if (count > 0) { urgentList.innerHTML = urgentHtml; urgentWrapper.style.display = 'block'; }
    else { urgentWrapper.style.display = 'none'; }

    // Check for countdown timer (tasks due today with < 1 hour until midnight)
    checkCountdownTimer(rowObjects, dateColIndex);
}

// Countdown Timer Logic
let countdownInterval = null;

function checkCountdownTimer(rowObjects, dateColIndex) {
    const countdownWrapper = document.getElementById('countdown-wrapper');
    const countdownTaskName = document.getElementById('countdown-task-name');
    const countdownTimer = document.getElementById('countdown-timer');

    const now = new Date();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const midnight = new Date(today); midnight.setDate(midnight.getDate() + 1); // Next midnight

    const msUntilMidnight = midnight - now;
    const fourHours = 4 * 60 * 60 * 1000;

    // Only show timer if within 4 hours of midnight
    if (msUntilMidnight > fourHours) {
        countdownWrapper.style.display = 'none';
        if (countdownInterval) clearInterval(countdownInterval);
        return;
    }

    // Find ALL tasks due TODAY
    const urgentTasks = [];
    rowObjects.forEach(obj => {
        const dateStr = obj.fullData[dateColIndex];
        if (!dateStr) return;
        const taskDate = parseDateString(String(dateStr));
        if (!taskDate) return;

        const taskDay = new Date(taskDate); taskDay.setHours(0, 0, 0, 0);
        if (taskDay.getTime() === today.getTime()) {
            urgentTasks.push(obj.filteredData[0] || '수행평가');
        }
    });

    // Show countdown if there are urgent tasks
    if (urgentTasks.length > 0) {
        // Display all task names
        countdownTaskName.textContent = urgentTasks.join(', ');
        countdownWrapper.style.display = 'block';

        // Clear previous interval
        if (countdownInterval) clearInterval(countdownInterval);

        function updateCountdown() {
            const now = new Date();
            const midnight = new Date();
            midnight.setHours(24, 0, 0, 0);
            const diff = midnight - now;

            if (diff <= 0) {
                countdownTimer.textContent = '00:00:00';
                countdownWrapper.style.display = 'none';
                clearInterval(countdownInterval);
                return;
            }

            const hours = Math.floor(diff / (1000 * 60 * 60));
            const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const secs = Math.floor((diff % (1000 * 60)) / 1000);

            countdownTimer.textContent =
                String(hours).padStart(2, '0') + ':' +
                String(mins).padStart(2, '0') + ':' +
                String(secs).padStart(2, '0');
        }

        updateCountdown();
        countdownInterval = setInterval(updateCountdown, 1000);
    } else {
        countdownWrapper.style.display = 'none';
        if (countdownInterval) clearInterval(countdownInterval);
    }
}

// --- Calendar ---
function renderCalendar(rowObjects) {
    const now = new Date();
    // Reset hours for accurate date comparison
    now.setHours(0, 0, 0, 0);

    // Calculate Start Date: Sunday of Last Week
    const currentDayObj = new Date(now);
    const dayOfWeek = currentDayObj.getDay(); // 0(Sun) - 6(Sat)

    // Sunday of this week
    const sundayThisWeek = new Date(currentDayObj);
    sundayThisWeek.setDate(currentDayObj.getDate() - dayOfWeek);

    // Sunday of last week
    const startDate = new Date(sundayThisWeek);
    startDate.setDate(sundayThisWeek.getDate() - 7);

    // Total 28 days (Last week + This week + Next week + Week after)
    const totalDays = 28;

    // Calculate End Date for Title
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + totalDays - 1);

    // Set Title (Range)
    const startStr = `${startDate.getMonth() + 1}/${startDate.getDate()}`;
    const endStr = `${endDate.getMonth() + 1}/${endDate.getDate()}`;
    document.getElementById('calendar-title').textContent = `${startStr} ~ ${endStr} (4주 일정)`;

    // Collect tasks by date string key "YYYY-MM-DD"
    const tasksByDate = {};
    const dateColIndex = findDateColumnIndex(globalRawHeaders);

    if (dateColIndex !== -1) {
        rowObjects.forEach(obj => {
            const dateStr = obj.fullData[dateColIndex];
            if (!dateStr) return;
            const taskDate = parseDateString(String(dateStr));
            if (!taskDate) return;

            // Normalize task date
            taskDate.setHours(0, 0, 0, 0);

            // Check if within range
            // We add a buffer of few days around range just in case, but strictly checking >= start works
            if (taskDate >= startDate && taskDate <= endDate) {
                const key = `${taskDate.getFullYear()}-${taskDate.getMonth()}-${taskDate.getDate()}`;
                if (!tasksByDate[key]) tasksByDate[key] = [];
                tasksByDate[key].push(obj.filteredData[0] || '수행평가');
            }
        });
    }

    // Generate DaysGrid
    const calendarDays = document.getElementById('calendar-days');
    let html = '';

    // Iterate 28 days
    for (let i = 0; i < totalDays; i++) {
        const dayDate = new Date(startDate);
        dayDate.setDate(startDate.getDate() + i);

        const dow = dayDate.getDay();
        let classes = 'calendar-day';
        if (dow === 0) classes += ' sunday';
        if (dow === 6) classes += ' saturday';

        // Compare timestamps for 'today'
        if (dayDate.getTime() === now.getTime()) classes += ' today';

        const key = `${dayDate.getFullYear()}-${dayDate.getMonth()}-${dayDate.getDate()}`;
        const tasks = tasksByDate[key] || [];

        let taskHtml = '';
        if (tasks.length > 0) {
            const taskList = tasks.map(taskName => `<div class="task-item">${taskName}</div>`).join('');
            taskHtml = `<div class="task-list">${taskList}</div>`;
        }

        const dateNum = dayDate.getDate();
        // Add month label if it's the 1st day OR the very first tile and we want context
        // But usually just 1st day is enough. 
        // Let's add full date for the very first item if it's not 1st? No, keep it simple.
        // Just "M월 D일" if dateNum == 1
        const dateLabel = dateNum === 1 ? `${dayDate.getMonth() + 1}월 1일` : dateNum;

        html += `<div class="${classes}" title="${tasks.join(', ')}">
                    <div class="day-number">${dateLabel}</div>
                    ${taskHtml}
                </div>`;
    }

    calendarDays.innerHTML = html;
}

// --- Helpers ---
function getSubjectEmoji(subject) {
    if (!subject) return '📝';
    const s = subject.toLowerCase();
    if (s.includes('수학') || s.includes('math')) return '📐';
    if (s.includes('r&e') || s.includes('r & e')) return '📚';
    if (s.includes('영어') || s.includes('english')) return 'A';
    if (s.includes('국어') || s.includes('korean') || s.includes('문학') || s.includes('독서')) return '가';
    if (s.includes('생명')) return '🧬';
    if (s.includes('과학') || s.includes('science') || s.includes('물리') || s.includes('화학') || s.includes('지학')) return '🧪';
    if (s.includes('사회') || s.includes('역사') || s.includes('history') || s.includes('윤리') || s.includes('지리')) return '🌍';
    if (s.includes('음악') || s.includes('music')) return '🎵';
    if (s.includes('미술') || s.includes('art')) return '🎨';
    if (s.includes('체육') || s.includes('pe') || s.includes('운동')) return '⚽️';
    if (s.includes('정보') || s.includes('tech') || s.includes('코딩') || s.includes('컴퓨터')) return '💻';
    if (s.includes('가정') || s.includes('기술')) return '🔧';
    return '📝';
}

function scrollToItem(originalIndex) {
    const container = document.getElementById('scroll-container');
    const totalItems = window.singleSetCount || 10;

    // Target the 3rd set (Index 2) to be safe for infinite scroll
    const targetIndex = originalIndex + (totalItems * 2);

    const cards = container.querySelectorAll('.info-card');
    const targetCard = cards[targetIndex];

    if (!targetCard) return;

    // Get the container's scroll info
    const containerRect = container.getBoundingClientRect();
    const cardRect = targetCard.getBoundingClientRect();

    // Calculate how much to scroll to center the card
    const cardCenter = cardRect.left + cardRect.width / 2;
    const containerCenter = containerRect.left + containerRect.width / 2;
    const scrollAdjustment = cardCenter - containerCenter;

    const scrollPos = container.scrollLeft + scrollAdjustment;

    container.scrollTo({
        left: scrollPos,
        behavior: 'smooth'
    });

    // Highlight effect - faster response
    setTimeout(() => {
        targetCard.style.transition = 'transform 0.5s ease'; // Only transform needs inline transition
        targetCard.style.transform = 'scale(1.15) translateY(-20px)';

        // Add class for RED BACKGROUND only if not present? 
        // Actually, if we use a different class for temp highlight it would be cleaner,
        // but for now let's just preserve existing state.
        const wasUrgent = targetCard.classList.contains('highlight-urgent');
        if (!wasUrgent) targetCard.classList.add('highlight-urgent');

        setTimeout(() => {
            targetCard.style.transform = '';
            // Only remove if it wasn't there originally
            if (!wasUrgent) targetCard.classList.remove('highlight-urgent');
        }, 800); // Duration 0.8s
    }, 100); // Start almost immediately (100ms)
}

// --- 3D Interactions (Tilt & Flip) ---
function setupCardInteractions(container) {
    // Prevent duplicate listeners
    if (container.dataset.interactionsSetup === 'true') return;
    container.dataset.interactionsSetup = 'true';

    // 1. Tilt Effect (Mouse)
    container.addEventListener('mousemove', (e) => {
        const card = e.target.closest('.info-card');
        if (!card) return;

        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        // Subtle tilt
        const maxDeg = 10;

        const rotateX = ((y - centerY) / centerY) * -maxDeg; // Invert Y
        const rotateY = ((x - centerX) / centerX) * maxDeg;

        const inner = card.querySelector('.card-inner');
        // Only tilt if NOT scrolling
        if (inner && !card.classList.contains('flipped')) {
            inner.style.transition = 'transform 0.1s ease-out';
            inner.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
        }
    });

    // Reset on leave
    container.addEventListener('mouseout', (e) => {
        const card = e.target.closest('.info-card');
        if (!card) return;
        const inner = card.querySelector('.card-inner');
        if (inner) {
            inner.style.transition = 'transform 0.5s ease';
            inner.style.transform = '';
        }
    });

    // Reset on scroll start, but we want tilt during hover?
    // Actually, best to reset card tilt when scrolling starts
    container.addEventListener('scroll', () => {
        const cards = container.querySelectorAll('.info-card');
        /* cards.forEach(card => resetCard(card)); */
        // Resetting all is expensive. Just let CSS transition handle it naturally or ignore.
        // But if we want to be strict:
        const card = container.querySelector('.info-card:hover');
        if (card) resetCard(card);
    });

    // 2. Flip Logic (Click)
    container.addEventListener('click', (e) => {
        const card = e.target.closest('.info-card');
        if (!card) return;

        // Ignore clicks on buttons or editable fields
        if (e.target.closest('button') ||
            e.target.closest('.fab-add') ||
            e.target.isContentEditable) {
            return;
        }

        // Toggle Flip
        card.classList.toggle('flipped');

        // If flipping back to front, reset tilt
        if (!card.classList.contains('flipped')) {
            resetCard(card);
        } else {
            // If flipped, ensure it stays flat 180 (handled by CSS, but inline style might conflict).
            // Let's clear inline style when flipped.
            const inner = card.querySelector('.card-inner');
            if (inner) inner.style.transform = '';
        }
    });
}

function resetCard(card) {
    const inner = card.querySelector('.card-inner');
    if (inner) {
        inner.style.transition = 'transform 0.5s ease';
        inner.style.transform = '';
        // Clear inline styles after transition?
        setTimeout(() => { inner.style.transform = ''; }, 500);
    }
}

// --- Calendar Toggle ---
function toggleCalendar() {
    const section = document.getElementById('calendar-section');
    const btn = document.getElementById('calendarBtn');

    // Toggle class instead of style
    if (!section.classList.contains('show')) {
        section.style.display = 'flex'; // Ensure flex first
        // Small delay to allow transition
        setTimeout(() => {
            section.classList.add('show');
        }, 10);
        btn.classList.add('active');
    } else {
        section.classList.remove('show');
        btn.classList.remove('active');

        // Wait for transition to finish before hiding
        setTimeout(() => {
            section.style.display = 'none';
        }, 300);
    }
}

// --- Sheet Link ---
function openSheet() {
    window.open(`https://docs.google.com/spreadsheets/d/${SHEET_ID}`, '_blank');
}

window.addEventListener('DOMContentLoaded', loadData);

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
        .then(reg => console.log('Service Worker registered'))
        .catch(err => console.log('Service Worker failed:', err));
}

// --- Authentication System Logic ---
let authMode = 'login'; // 'login' or 'signup'
let isCaptchaVerified = false;

// Selected signup values
let selectedRole = 'student';
let selectedGrade = 1;
let selectedClass = 1;

// Device Mode
let deviceMode = localStorage.getItem('deviceMode');

function selectDeviceMode(mode) {
    deviceMode = mode;
    localStorage.setItem('deviceMode', mode);
    applyDeviceMode();

    // Hide selection overlay
    const overlay = document.getElementById('device-selection-overlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 300);
    }
}

function applyDeviceMode() {
    if (deviceMode === 'mobile') {
        document.body.classList.add('mobile-mode');
        document.body.classList.remove('web-mode');
    } else {
        document.body.classList.add('web-mode');
        document.body.classList.remove('mobile-mode');
    }
}

// Initialize Device Mode on Load
document.addEventListener('DOMContentLoaded', () => {
    // One-time Reload Logic before Device Selection
    if (!localStorage.getItem('deviceMode')) {
        if (!sessionStorage.getItem('hasReloadedForDevice')) {
            sessionStorage.setItem('hasReloadedForDevice', 'true');
            location.reload();
            return;
        }
    }

    if (deviceMode) {
        // If mode is already selected, hide overlay immediately
        const overlay = document.getElementById('device-selection-overlay');
        if (overlay) overlay.style.display = 'none';
        applyDeviceMode();
    }
    // Else: Overlay is visible by default in HTML
});

function initAuth() {
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    const authOverlay = document.getElementById('auth-overlay');
    const mainContent = document.getElementById('main-content');
    const userClass = localStorage.getItem('userClass');

    if (isLoggedIn) {
        authOverlay.style.display = 'none';
        mainContent.style.opacity = '1';
        mainContent.style.pointerEvents = 'auto';
        document.body.classList.remove('auth-locked');

        // --- Role & Class Logic ---
        const classTabs = document.querySelector('.class-tabs');
        const title = document.querySelector('h1');
        const currentUser = localStorage.getItem('currentUser');

        if (currentUser === 'admin') {
            // Admin has full access
            if (classTabs) classTabs.style.display = 'flex';
            if (title) title.textContent = `수행평가 (관리자)`;
        } else if (userClass) {
            currentClass = parseInt(userClass);
            // Hide class switching tabs for students
            if (classTabs) classTabs.style.display = 'none';
            // Update title to show specific class
            if (title) title.textContent = `수행평가 (${currentClass}반)`;


            // Switch to user's class and load their data
            switchClass(currentClass);
        } else {
            // For admin or first-time users, load default data
            loadData();
        }
    }

    // Initialize pill selection listeners
    document.querySelectorAll('.pill-group .pill').forEach(pill => {
        pill.addEventListener('click', (e) => {
            const group = e.target.closest('.pill-group').id;
            const value = e.target.dataset.role || e.target.dataset.grade || e.target.dataset.class;

            // Remove active from peers
            e.target.parentNode.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
            // Set active
            e.target.classList.add('active');

            // Update state
            if (group === 'grade-pills') selectedGrade = parseInt(value);
            if (group === 'class-pills') selectedClass = parseInt(value);
        });
    });
}

function handleCaptchaClick() {
    if (isCaptchaVerified) return;

    const loader = document.getElementById('captcha-loader');
    const checkbox = document.getElementById('captcha-checkbox-inner');
    const wrapper = document.getElementById('captcha-wrapper');

    loader.style.display = 'block';

    // Simulate verification delay
    setTimeout(() => {
        loader.style.display = 'none';
        checkbox.classList.add('verified');
        wrapper.classList.add('verified-bg');
        isCaptchaVerified = true;
        checkSignupValidity(); // Check validity after captcha
    }, 800);
}

// Check Signup Validity for Button Color
function checkSignupValidity() {
    if (authMode !== 'signup') return;

    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value.trim();
    const confirmPw = document.getElementById('auth-confirm-password').value.trim();
    const studentNum = document.getElementById('auth-student-num').value.trim();
    const mainBtn = document.getElementById('auth-main-btn');

    const isValid = (
        username.length > 0 &&
        password.length >= 4 &&
        password === confirmPw &&
        studentNum.length > 0 &&
        isCaptchaVerified
    );

    if (isValid) {
        mainBtn.classList.add('btn-valid');
    } else {
        mainBtn.classList.remove('btn-valid');
    }
}

// Attach Input Listeners for Real-time Check
function attachValidationListeners() {
    const inputs = [
        'auth-username',
        'auth-password',
        'auth-confirm-password',
        'auth-student-num'
    ];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', checkSignupValidity);
        }
    });
}
// Call this once on init
document.addEventListener('DOMContentLoaded', attachValidationListeners);


function switchAuthMode() {
    authMode = authMode === 'login' ? 'signup' : 'login';
    const title = document.getElementById('auth-title');
    const subtitle = document.getElementById('auth-subtitle');
    const mainBtn = document.getElementById('auth-main-btn');
    const switchBtn = document.getElementById('auth-switch-btn');
    const signupExtra = document.getElementById('signup-extra-fields');
    const confirmPwGroup = document.getElementById('confirm-password-group');
    const usernameLabel = document.getElementById('label-username');
    const passwordLabel = document.getElementById('label-password');

    if (authMode === 'signup') {
        title.textContent = '계정 생성';
        subtitle.textContent = '계속하려면 회원가입 정보를 입력하세요.';
        mainBtn.textContent = '회원가입';
        switchBtn.textContent = '이미 계정이 있으나요? 로그인';
        signupExtra.style.display = 'block';
        confirmPwGroup.style.display = 'block';
        usernameLabel.textContent = '아이디';
        passwordLabel.textContent = '비밀번호';
    } else {
        title.textContent = '로그인';
        subtitle.textContent = '계속하려면 주소를 입력하거나 로그인하세요.';
        mainBtn.textContent = '로그인';
        switchBtn.textContent = '계정이 없나요? 회원가입하기';
        signupExtra.style.display = 'none';
        confirmPwGroup.style.display = 'none';
        usernameLabel.textContent = '아이디';
        passwordLabel.textContent = '비밀번호';
    }

    // Reset inputs and captcha on mode switch
    document.getElementById('auth-username').value = '';
    document.getElementById('auth-password').value = '';
    const confirmPw = document.getElementById('auth-confirm-password');
    if (confirmPw) confirmPw.value = '';
    const studentNum = document.getElementById('auth-student-num');
    if (studentNum) studentNum.value = '';

    document.getElementById('auth-error-box').style.display = 'none';
    resetCaptcha();
    // Re-check validity (should clear valid state)
    checkSignupValidity();
}

function resetCaptcha() {
    isCaptchaVerified = false;
    const loader = document.getElementById('captcha-loader');
    const checkbox = document.getElementById('captcha-checkbox-inner');
    const wrapper = document.getElementById('captcha-wrapper');
    if (loader) loader.style.display = 'none';
    if (checkbox) checkbox.classList.remove('verified');
    if (wrapper) wrapper.classList.remove('verified-bg');
}

function handleAuthSubmit() {
    const user = document.getElementById('auth-username').value.trim();
    const pass = document.getElementById('auth-password').value.trim();
    const card = document.querySelector('.auth-card');

    // Basic Validation
    if (!user || !pass) {
        showAuthError('아이디와 비밀번호를 입력해주세요.');
        return;
    }

    // Special Check for Admin
    if (user === 'admin' && pass === 'admin') {
        processLogin('admin', null);
        return;
    }

    // Validations for Signup
    if (authMode === 'signup') {
        const confirmPass = document.getElementById('auth-confirm-password').value.trim();
        const studentNum = document.getElementById('auth-student-num').value.trim();

        if (pass !== confirmPass) {
            showAuthError('비밀번호가 일치하지 않습니다.');
            return;
        }

        if (!studentNum) {
            showAuthError('번호를 입력해주세요.');
            return;
        }

        // Check if student info already exists (as per image)
        const registrations = JSON.parse(localStorage.getItem('studentRegistrations') || '[]');
        const exists = registrations.find(r => r.grade === selectedGrade && r.class === selectedClass && r.num === studentNum);

        if (exists) {
            const errorBox = document.getElementById('auth-error-box');
            const errorDesc = document.getElementById('error-msg-desc');
            errorDesc.textContent = `${exists.username || user} (${selectedGrade}학년 ${selectedClass}반 ${studentNum}번)`;
            errorBox.style.display = 'flex';
            card.classList.remove('shake');
            void card.offsetWidth;
            card.classList.add('shake');
            return;
        }
    }

    // Validate Captcha
    if (!isCaptchaVerified) {
        showAuthError('로봇 방지 확인을 완료해주세요.');
        return;
    }

    if (authMode === 'signup') {
        const studentNum = document.getElementById('auth-student-num').value.trim();
        // Register User
        const existingUsers = JSON.parse(localStorage.getItem('registeredUsers') || '{}');
        if (existingUsers[user]) {
            showAuthError('이미 존재하는 아이디입니다.');
        } else {
            // Auto-detect class from ID (2nd digit) if it's a 4-digit number
            let finalClass = selectedClass;
            if (user.length === 4 && !isNaN(user)) {
                const classDigit = parseInt(user[1]);
                if (classDigit >= 1 && classDigit <= 9) {
                    finalClass = classDigit;
                }
            }

            // Save user credentials and their class
            existingUsers[user] = {
                password: pass,
                class: finalClass
            };
            localStorage.setItem('registeredUsers', JSON.stringify(existingUsers));

            // Store student registration
            const registrations = JSON.parse(localStorage.getItem('studentRegistrations') || '[]');
            registrations.push({
                username: user,
                role: 'student',
                grade: selectedGrade,
                class: finalClass,
                num: studentNum
            });
            localStorage.setItem('studentRegistrations', JSON.stringify(registrations));

            alert('회원가입이 완료되었습니다! 로그인해주세요.');
            switchAuthMode();
        }
    } else {
        // Simple login
        const existingUsers = JSON.parse(localStorage.getItem('registeredUsers') || '{}');
        const userData = existingUsers[user];

        // Support both old string format and new object format
        const storedPassword = (typeof userData === 'object') ? userData.password : userData;

        if (userData && storedPassword === pass) {
            // Success
            localStorage.setItem('isLoggedIn', 'true');
            localStorage.setItem('currentUser', user);

            // Set user class (if it exists in new format, else default to current selected or 1)
            const userClass = (typeof userData === 'object') ? userData.class : 1;
            localStorage.setItem('userClass', userClass);
            currentClass = userClass;

            // Visual Transition
            const authOverlay = document.getElementById('auth-overlay');
            const mainContent = document.getElementById('main-content');

            // Hide tabs and update title immediately
            const classTabs = document.querySelector('.class-tabs');
            if (classTabs) classTabs.style.display = 'none';
            const title = document.querySelector('h1');
            if (title) title.textContent = `수행평가 (${currentClass}반)`;

            card.style.transform = 'scale(0.9) translateY(-20px)';
            card.style.opacity = '0';

            setTimeout(() => {
                authOverlay.style.opacity = '0';
                setTimeout(() => {
                    authOverlay.style.display = 'none';
                    mainContent.style.opacity = '1';
                    mainContent.style.pointerEvents = 'auto';
                    document.body.classList.remove('auth-locked');
                    loadData();
                }, 500);
            }, 300);
        } else {
            showAuthError('아이디 또는 비밀번호가 일치하지 않습니다.');
        }
    }
}


function processLogin(user, userClass) {
    const card = document.querySelector('.auth-card');

    // Success
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('currentUser', user);

    if (user === 'admin') {
        localStorage.removeItem('userClass'); // Admin doesn't have a fixed class
    } else {
        localStorage.setItem('userClass', userClass);
        currentClass = userClass;
    }

    // Visual Transition
    const authOverlay = document.getElementById('auth-overlay');
    const mainContent = document.getElementById('main-content');

    // UI Updates based on role
    const classTabs = document.querySelector('.class-tabs');
    const title = document.querySelector('h1');

    if (user === 'admin') {
        if (classTabs) classTabs.style.display = 'flex';
        if (title) title.textContent = `수행평가 (관리자)`;
    } else {
        if (classTabs) classTabs.style.display = 'none';
        if (title) title.textContent = `수행평가 (${currentClass}반)`;
    }

    card.style.transform = 'scale(0.9) translateY(-20px)';
    card.style.opacity = '0';

    setTimeout(() => {
        // Force reload to ensure clean state and fresh data
        location.reload();
    }, 300);
}

function showAuthError(msg) {
    const card = document.querySelector('.auth-card');
    card.classList.remove('shake');
    void card.offsetWidth; // trigger reflow
    card.classList.add('shake');
    alert(msg);
}

function handleLogout() {
    if (confirm('로그아웃 하시겠습니까?')) {
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('currentUser');
        localStorage.removeItem('userClass');

        // Reset UI before reload or show overlay
        location.reload(); // Simplest way to reset all states securely
    }
}

// Call initAuth on load
window.addEventListener('load', initAuth);
