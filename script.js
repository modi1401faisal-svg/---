/* =========================================================
   نظام مختبر جودة المشاريع - النسخة النظيفة المستقرة
   - اتصال مباشر بـ Supabase عبر fetch (بدون مكتبة خارجية)
   - حفظ سريع محلي + رفع للسحابة
   - يعمل على الجوال والكمبيوتر
   ========================================================= */

/* ====== الإعدادات ====== */
const LAB_SUPABASE_URL = "https://uuhldvdgyyxvtmjqqwex.supabase.co";
const LAB_SUPABASE_KEY = "sb_publishable_HM4vP8LsEZJaZC9Cyug5fg_fhQ050qL";
const REST_URL = LAB_SUPABASE_URL + "/rest/v1/";
const STORAGE_URL = LAB_SUPABASE_URL + "/storage/v1/object/";
const HEADERS = {
    "apikey": LAB_SUPABASE_KEY,
    "Authorization": "Bearer " + LAB_SUPABASE_KEY,
    "Content-Type": "application/json"
};
const DEFAULT_ACTION_TEXT = "تم رفض الطلب وإبلاغ المقاول بالملاحظات";
const LAB_LOGIN_PASSWORD = "lab2026";

/* ====== البيانات ====== */
let clearances = JSON.parse(localStorage.getItem("clearances") || "[]");
let emergencies = JSON.parse(localStorage.getItem("emergencies") || "[]");
let notes = JSON.parse(localStorage.getItem("notes") || "[]");
let editingClearance = -1, editingEmergency = -1, editingNote = -1;
let currentUserName = localStorage.getItem("labUserName") || "";
let skippedImagesCount = 0;

/* ====== أدوات مساعدة ====== */
function val(id) { const el = document.getElementById(id); return el ? el.value : ""; }
function setVal(id, value) { const el = document.getElementById(id); if (el) el.value = value || ""; }
function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise(function (_, reject) {
        setTimeout(function () { reject(new Error("انتهت المهلة")); }, ms);
    })]);
}
function blobToDataUrl(blob) {
    return new Promise(function (resolve) {
        const reader = new FileReader();
        reader.onload = function () { resolve(reader.result); };
        reader.onerror = function () { resolve(""); };
        reader.readAsDataURL(blob);
    });
}

/* ====== IndexedDB للصور ====== */
let idbPromise = null;
function openImageDB() {
    if (idbPromise) return idbPromise;
    idbPromise = new Promise(function (resolve) {
        try {
            const req = indexedDB.open("labImagesDB", 1);
            req.onupgradeneeded = function (e) {
                const db = e.target.result;
                if (!db.objectStoreNames.contains("images")) db.createObjectStore("images");
            };
            req.onsuccess = function (e) { resolve(e.target.result); };
            req.onerror = function () { resolve(null); };
        } catch (e) { resolve(null); }
    });
    return idbPromise;
}
async function idbPut(key, dataUrl) {
    const db = await openImageDB(); if (!db) return false;
    return new Promise(function (resolve) {
        try {
            const tx = db.transaction("images", "readwrite");
            tx.objectStore("images").put(dataUrl, key);
            tx.oncomplete = function () { resolve(true); };
            tx.onerror = function () { resolve(false); };
        } catch (e) { resolve(false); }
    });
}
async function idbGet(key) {
    const db = await openImageDB(); if (!db) return null;
    return new Promise(function (resolve) {
        try {
            const tx = db.transaction("images", "readonly");
            const req = tx.objectStore("images").get(key);
            req.onsuccess = function () { resolve(req.result || null); };
            req.onerror = function () { resolve(null); };
        } catch (e) { resolve(null); }
    });
}
async function idbDelete(key) {
    const db = await openImageDB(); if (!db) return;
    return new Promise(function (resolve) {
        try {
            const tx = db.transaction("images", "readwrite");
            tx.objectStore("images").delete(key);
            tx.oncomplete = function () { resolve(true); };
            tx.onerror = function () { resolve(false); };
        } catch (e) { resolve(false); }
    });
}
function newImageRef() { return "idb://img_" + Date.now() + "_" + Math.random().toString(36).substring(2, 10); }
function isIdbRef(value) { return typeof value === "string" && value.indexOf("idb://") === 0; }
function idbKeyFromRef(ref) { return ref.substring(6); }
async function storeImageInIdb(dataUrl) {
    const ref = newImageRef();
    const ok = await idbPut(idbKeyFromRef(ref), dataUrl);
    return ok ? ref : "";
}

/* ====== شارة حالة الاتصال بالسحابة ====== */
function showCloudStatus(state, message) {
    try {
        if (!document.body) { setTimeout(function () { showCloudStatus(state, message); }, 100); return; }
        let badge = document.getElementById("cloudStatusBadge");
        if (!badge) {
            badge = document.createElement("div");
            badge.id = "cloudStatusBadge";
            badge.style.cssText =
                "position:fixed;bottom:12px;left:12px;z-index:99999;padding:8px 14px;" +
                "border-radius:20px;font-size:13px;font-family:inherit;color:#fff;" +
                "box-shadow:0 2px 8px rgba(0,0,0,.3);direction:rtl;" +
                "min-height:24px;min-width:100px;text-align:center;";
            document.body.appendChild(badge);
        }
        badge.innerText = message;
        badge.style.display = "block";
        if (state === "ok") badge.style.background = "#1a7f4b";
        else if (state === "checking") badge.style.background = "#a86400";
        else badge.style.background = "#b3402a";
    } catch (e) {}
}

/* ====== طبقة قاعدة البيانات (fetch مباشر) ====== */
async function dbInsert(tableName, row) {
    try {
        var res = await fetch(REST_URL + tableName, {
            method: "POST",
            headers: Object.assign({}, HEADERS, { "Prefer": "return=representation" }),
            body: JSON.stringify(row)
        });
        if (!res.ok) {
            var txt = await res.text();
            console.error("خطأ إضافة في " + tableName + ": HTTP " + res.status, txt.substring(0, 200));
            return null;
        }
        var data = await res.json();
        var result = Array.isArray(data) ? data[0] : data;
        console.log("✅ تم إدراج سجل في " + tableName + " - id: " + (result && result.id));
        return result;
    } catch (e) { console.error("dbInsert:", e); return null; }
}

async function dbUpdate(tableName, id, changes) {
    if (!id) return false;
    try {
        var res = await fetch(REST_URL + tableName + "?id=eq." + id, {
            method: "PATCH",
            headers: Object.assign({}, HEADERS, { "Prefer": "return=representation" }),
            body: JSON.stringify(changes)
        });
        if (!res.ok) { console.error("خطأ تعديل في " + tableName + ": HTTP " + res.status); return false; }
        console.log("✅ تم تحديث سجل في " + tableName + " - id: " + id);
        return true;
    } catch (e) { console.error("dbUpdate:", e); return false; }
}

async function dbDelete(tableName, id) {
    if (!id) return false;
    try {
        var res = await fetch(REST_URL + tableName + "?id=eq." + id, {
            method: "DELETE",
            headers: HEADERS
        });
        if (!res.ok) { console.error("خطأ حذف في " + tableName + ": HTTP " + res.status); return false; }
        return true;
    } catch (e) { return false; }
}

async function dbFetchAll(tableName) {
    try {
        var allData = [];
        var offset = 0;
        var limit = 500;
        var pageCount = 0;
        while (true) {
            pageCount++;
            var url = REST_URL + tableName + "?select=*&order=id.asc&limit=" + limit + "&offset=" + offset;
            console.log("📄 جلب " + tableName + " - صفحة " + pageCount);
            var res = await fetch(url, { headers: HEADERS });
            if (!res.ok) {
                console.error("❌ خطأ قراءة " + tableName + ": HTTP " + res.status);
                return allData.length > 0 ? allData : null;
            }
            var pageData = await res.json();
            if (!Array.isArray(pageData) || pageData.length === 0) break;
            allData = allData.concat(pageData);
            console.log("✅ تم جلب " + pageData.length + " (المجموع: " + allData.length + ")");
            if (pageData.length < limit) break;
            offset += limit;
            if (offset > 100000) break;
        }
        console.log("✅ إجمالي " + tableName + ": " + allData.length + " سجل");
        return allData;
    } catch (e) { console.error("❌ dbFetchAll:", e); return null; }
}

function checkCloudHealth() {
    showCloudStatus("checking", "⏳ جاري التحقق من السحابة...");
    fetch(REST_URL + "clearances?select=id&limit=1", { headers: HEADERS })
        .then(function (res) {
            if (res.ok) { showCloudStatus("ok", "☁️ متصل بالسحابة ✅"); console.log("✅ Supabase متصل"); }
            else { showCloudStatus("bad", "❌ خطأ: HTTP " + res.status); }
        })
        .catch(function (err) { showCloudStatus("bad", "❌ لا يوجد اتصال"); console.error(err); });
}

/* ====== محولات البيانات ====== */
function stripIdbForDb(img) { return isIdbRef(img) ? "" : img; }
function clearanceToRow(item) {
    return { permit: item.permit || "", contractor: item.contractor || "", owner: item.owner || "", location: item.location || "", images: (item.images || []).map(stripIdbForDb) };
}
function rowToClearance(row) {
    return { id: row.id, permit: row.permit || "", contractor: row.contractor || "", owner: row.owner || "", location: row.location || "", images: Array.isArray(row.images) ? row.images : [] };
}
function emergencyToRow(item) {
    return { permit: item.permit || "", contractor: item.contractor || "", owner: item.owner || "", lab_receive: item.labReceive || "", work_start: item.start || "", work_end: item.end || "", location: item.location || "", images: (item.images || []).map(stripIdbForDb) };
}
function rowToEmergency(row) {
    return { id: row.id, permit: row.permit || "", contractor: row.contractor || "", owner: row.owner || "", labReceive: row.lab_receive || "", start: row.work_start || "", end: row.work_end || "", location: row.location || "", images: Array.isArray(row.images) ? row.images : [] };
}
function noteToRow(item) {
    return { type: item.type || "مشاريع الأمانة", note_date: item.date || "", permit: item.permit || "", contractor: item.contractor || "", owner: item.owner || "", reason: item.reason || "", action: item.action || "", before_image: isIdbRef(item.before) ? "" : (item.before || ""), after_image: isIdbRef(item.after) ? "" : (item.after || ""), completed: !!item.completed };
}
function rowToNote(row) {
    return { id: row.id, type: row.type || "مشاريع الأمانة", date: row.note_date || "", permit: row.permit || "", contractor: row.contractor || "", owner: row.owner || "", reason: row.reason || "", action: row.action || "", before: row.before_image || "", after: row.after_image || "", completed: !!row.completed };
}

/* ====== حفظ محلي آمن ====== */
async function moveBase64ToIdb(arr) {
    let moved = 0;
    for (const item of arr) {
        if (Array.isArray(item.images)) {
            for (let i = 0; i < item.images.length; i++) {
                if (typeof item.images[i] === "string" && item.images[i].indexOf("data:") === 0) {
                    const ref = await storeImageInIdb(item.images[i]);
                    if (ref) { item.images[i] = ref; moved++; }
                }
            }
        }
        if (typeof item.before === "string" && item.before.indexOf("data:") === 0) {
            const ref = await storeImageInIdb(item.before); if (ref) { item.before = ref; moved++; }
        }
        if (typeof item.after === "string" && item.after.indexOf("data:") === 0) {
            const ref = await storeImageInIdb(item.after); if (ref) { item.after = ref; moved++; }
        }
    }
    return moved;
}
async function saveLocalData(key, arr) {
    try { localStorage.setItem(key, JSON.stringify(arr)); return true; }
    catch (e) {
        const moved = await moveBase64ToIdb(arr);
        try { localStorage.setItem(key, JSON.stringify(arr)); return true; }
        catch (e2) { alert("تعذر الحفظ المحلي."); return false; }
    }
}
async function initialImageMigration() {
    const tasks = [{ arr: clearances, key: "clearances" }, { arr: emergencies, key: "emergencies" }, { arr: notes, key: "notes" }];
    let total = 0;
    for (const task of tasks) {
        const moved = await moveBase64ToIdb(task.arr);
        if (moved > 0) { total += moved; try { localStorage.setItem(task.key, JSON.stringify(task.arr)); } catch (e) {} }
    }
    if (total > 0) { renderClearances(); renderEmergencies(); renderNotes(); updateDashboard(); }
}

/* ====== المزامنة مع السحابة (دمج - لا حذف) ====== */
async function syncFromCloud() {
    const tasks = [
        { table: "clearances", array: clearances, toRow: clearanceToRow, fromRow: rowToClearance, key: "clearances", render: renderClearances },
        { table: "emergencies", array: emergencies, toRow: emergencyToRow, fromRow: rowToEmergency, key: "emergencies", render: renderEmergencies },
        { table: "notes", array: notes, toRow: noteToRow, fromRow: rowToNote, key: "notes", render: renderNotes }
    ];
    let anySynced = false;
    for (const task of tasks) {
        const cloud = await dbFetchAll(task.table);
        if (cloud === null) continue;
        anySynced = true;
        const cloudMap = {};
        cloud.forEach(function (row) { const item = task.fromRow(row); if (item && item.id) cloudMap[item.id] = item; });
        for (let i = 0; i < task.array.length; i++) {
            const item = task.array[i];
            if (item.id && cloudMap[item.id]) { task.array[i] = cloudMap[item.id]; delete cloudMap[item.id]; }
            else if (item.id && !cloudMap[item.id]) { try { const ins = await dbInsert(task.table, task.toRow(item)); if (ins && ins.id) item.id = ins.id; } catch (e) {} }
            else { try { const ins = await dbInsert(task.table, task.toRow(item)); if (ins && ins.id) item.id = ins.id; } catch (e) {} }
        }
        Object.values(cloudMap).forEach(function (item) { task.array.push(item); });
        await saveLocalData(task.key, task.array);
        task.render();
        console.log("✅ تم دمج " + task.table + ": " + task.array.length + " سجل");
    }
    if (anySynced) { updateDashboard(); console.log("تمت المزامنة ✅"); }
}
/* ====== الصور (ضغط + رفع + IndexedDB) ====== */
function compressImageToBlob(file, maxDim, quality) {
    return new Promise(function (resolve) {
        if (!file || !file.type || file.type.indexOf("image/") !== 0) { resolve(null); return; }
        const reader = new FileReader();
        reader.onload = function () {
            const img = new Image();
            img.onload = function () {
                try {
                    let w = img.width, h = img.height;
                    const scale = Math.min(1, maxDim / Math.max(w, h));
                    w = Math.round(w * scale); h = Math.round(h * scale);
                    const canvas = document.createElement("canvas");
                    canvas.width = w; canvas.height = h;
                    const ctx = canvas.getContext("2d");
                    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
                    ctx.drawImage(img, 0, 0, w, h);
                    canvas.toBlob(function (blob) { resolve(blob || null); }, "image/jpeg", quality);
                } catch (e) { resolve(null); }
            };
            img.onerror = function () { resolve(null); };
            img.src = reader.result;
        };
        reader.onerror = function () { resolve(null); };
        reader.readAsDataURL(file);
    });
}
async function uploadToSupabase(blobOrFile, mime) {
    const fileName = Date.now() + "_" + Math.random().toString(36).substring(2, 10) + ".jpg";
    const filePath = "uploads/" + fileName;
    try {
        const res = await fetch(STORAGE_URL + "images/" + filePath, {
            method: "POST",
            headers: {
                "apikey": LAB_SUPABASE_KEY,
                "Authorization": "Bearer " + LAB_SUPABASE_KEY,
                "Content-Type": mime || (blobOrFile && blobOrFile.type) || "image/jpeg"
            },
            body: blobOrFile
        });
        if (!res.ok) { console.error("خطأ رفع الصورة:", res.status); return ""; }
        return LAB_SUPABASE_URL + "/storage/v1/object/public/images/" + filePath;
    } catch (e) { console.error("استثناء رفع الصورة:", e); return ""; }
}
function isMobile() {
    try { return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768; }
    catch (e) { return false; }
}
async function readImageFast(file) {
    if (!file) return "";
    const blob = await compressImageToBlob(file, isMobile() ? 900 : 1100, isMobile() ? 0.7 : 0.78);
    if (!blob) return "";
    return await blobToDataUrl(blob);
}
async function readImagesFast(files) {
    if (!files || files.length === 0) return [];
    const promises = [];
    for (let i = 0; i < files.length; i++) promises.push(readImageFast(files[i]));
    const results = await Promise.all(promises);
    return results.filter(function (r) { return !!r; });
}
async function uploadSingleImageFast(file) {
    if (!file) return "";
    const blob = await compressImageToBlob(file, isMobile() ? 1000 : 1400, isMobile() ? 0.75 : 0.85);
    try {
        if (blob) return await withTimeout(uploadToSupabase(blob, "image/jpeg"), 20000) || "";
        return await withTimeout(uploadToSupabase(file, file.type), 20000) || "";
    } catch (e) { console.warn("تعذر رفع الصورة:", e); return ""; }
}
async function uploadImagesInBackground(files, fallbacks) {
    if (!files || files.length === 0) return fallbacks || [];
    const tasks = [];
    for (let i = 0; i < files.length; i++) tasks.push(uploadSingleImageFast(files[i]));
    const results = await Promise.all(tasks);
    const out = [];
    let fIdx = 0;
    for (let i = 0; i < results.length; i++) {
        if (results[i]) out.push(results[i]);
        else if (fallbacks && fallbacks[fIdx]) {
            const ref = await storeImageInIdb(fallbacks[fIdx]);
            out.push(ref || fallbacks[fIdx]); fIdx++;
        }
    }
    return out;
}

/* ====== عرض الصور ====== */
function imageThumb(image, title) {
    title = title || "عرض الصورة";
    if (!image) return "<span>لا توجد صورة</span>";
    if (isIdbRef(image)) {
        return '<img data-idb="' + image + '" alt="' + title + '" title="' + title +
            '" onclick="openImageRef(this)" style="width:50px;height:50px;object-fit:cover;border-radius:6px;cursor:pointer;margin:2px;background:#eee;">';
    }
    return '<img src="' + image + '" alt="' + title + '" title="' + title +
        '" onclick="openImage(this.src)" style="width:50px;height:50px;object-fit:cover;border-radius:6px;cursor:pointer;margin:2px;">';
}
async function resolveIdbImages() {
    const imgs = document.querySelectorAll("img[data-idb]:not([data-loaded])");
    if (imgs.length === 0) return;
    const promises = Array.from(imgs).map(async function (img) {
        try {
            const ref = img.getAttribute("data-idb");
            const data = await idbGet(idbKeyFromRef(ref));
            if (data) { img.src = data; img.setAttribute("data-loaded", "1"); }
        } catch (e) {}
    });
    await Promise.all(promises);
}
async function openImageRef(imgEl) {
    let src = imgEl.getAttribute("src") || "";
    if (!imgEl.getAttribute("data-loaded")) {
        const ref = imgEl.getAttribute("data-idb");
        if (ref) src = (await idbGet(idbKeyFromRef(ref))) || src;
    }
    if (src) openImage(src);
}
function openImage(image) {
    const w = window.open("", "_blank");
    if (!w) { alert("يرجى السماح بفتح النوافذ"); return; }
    w.document.write('<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>عرض الصورة</title><style>body{margin:0;background:#173f32;display:flex;justify-content:center;align-items:center;min-height:100vh;}img{max-width:95%;max-height:95vh;object-fit:contain;border-radius:12px;}</style></head><body><img src="' + image + '"></body></html>');
}

/* ====== مؤشر الحفظ + Toast ====== */
function setSaveBusy(busy) {
    try {
        document.querySelectorAll("button, input[type='button'], input[type='submit']").forEach(function (el) {
            const oc = el.getAttribute("onclick") || "";
            const wired = el.dataset ? el.dataset.wiredSave : "";
            const isSave = oc.indexOf("saveClearance") !== -1 || oc.indexOf("saveEmergency") !== -1 || oc.indexOf("saveNote") !== -1 || wired === "1";
            if (!isSave) return;
            if (busy) {
                if (!el.dataset.oldText) el.dataset.oldText = el.innerText || el.value || "";
                el.disabled = true; el.innerText = "⏳ جاري الحفظ...";
            } else {
                el.disabled = false;
                if (el.dataset.oldText) el.innerText = el.dataset.oldText;
            }
        });
    } catch (e) {}
}
function showToast(msg, type) {
    type = type || "success";
    let toast = document.getElementById("appToast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "appToast";
        toast.style.cssText =
            "position:fixed;top:15px;right:15px;left:15px;z-index:99999;color:#fff;padding:14px 18px;border-radius:10px;" +
            "box-shadow:0 8px 24px rgba(0,0,0,.28);font-family:inherit;font-size:14px;max-width:500px;margin:0 auto;" +
            "opacity:0;transform:translateY(-15px);transition:opacity .25s ease, transform .25s ease;" +
            "line-height:1.6;white-space:pre-line;text-align:center;";
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.background = type === "error" ? "#b00020" : type === "warn" ? "#a86400" : "#245c49";
    toast.style.opacity = "1"; toast.style.transform = "translateY(0)";
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () { toast.style.opacity = "0"; toast.style.transform = "translateY(-15px)"; }, 3500);
}

/* ====== التنقل بين الصفحات (يعمل على الجوال) ====== */
function showPage(page) {
    document.querySelectorAll(".page").forEach(function (p) {
        p.classList.remove("active");
        p.style.setProperty("display", "none", "important");
    });
    const selectedPage = document.getElementById(page);
    if (selectedPage) {
        selectedPage.classList.add("active");
        selectedPage.style.setProperty("display", "block", "important");
    }
    document.querySelectorAll(".navbar button").forEach(function (btn) {
        const onclick = btn.getAttribute("onclick") || "";
        if (onclick.indexOf("showPage") !== -1) {
            btn.classList.remove("active");
            if (onclick.indexOf("'" + page + "'") !== -1 || onclick.indexOf('"' + page + '"') !== -1) {
                btn.classList.add("active");
            }
        }
    });
    try { if (typeof updateDashboard === "function") updateDashboard(); } catch (e) {}
    try { if (typeof resolveIdbImages === "function") resolveIdbImages(); } catch (e) {}
}

/* ====== رؤوس الجداول ====== */
function ensureTableHeaders(bodyId, headers) {
    const bodyEl = document.getElementById(bodyId);
    if (!bodyEl) return null;
    let parentTable = null, tbody = bodyEl;
    if (bodyEl.tagName === "TABLE") {
        parentTable = bodyEl;
        tbody = bodyEl.querySelector("tbody");
        if (!tbody) { tbody = document.createElement("tbody"); bodyEl.appendChild(tbody); }
    } else if (bodyEl.tagName === "TBODY") {
        parentTable = bodyEl.closest("table");
    }
    if (parentTable) {
        let thead = parentTable.querySelector("thead");
        if (!thead) { thead = document.createElement("thead"); parentTable.insertBefore(thead, parentTable.firstChild); }
        thead.innerHTML = "<tr>" + headers.map(function (h) { return "<th>" + h + "</th>"; }).join("") + "</tr>";
    }
    return tbody;
}

/* ====== رخص الإخلاء ====== */
async function saveClearance() {
    if (window._savingClearance) return;
    window._savingClearance = true;
    try {
        const permit = val("clearancePermit").trim();
        const contractor = val("clearanceContractor").trim();
        const owner = val("clearanceOwner").trim();
        const location = val("clearanceLocation").trim();
        let missing = [];
        if (!permit) missing.push("رقم التصريح");
        if (!contractor) missing.push("اسم المقاول");
        if (!owner) missing.push("الجهة المالكة");
        if (!location) missing.push("الموقع");
        if (missing.length > 0) { alert("يرجى تعبئة:\n" + missing.join("\n")); return; }

        const imagesEl = document.getElementById("clearanceImages");
        const files = imagesEl ? imagesEl.files : [];
        const hasNewFiles = files && files.length > 0;
        setSaveBusy(true);
        const localImages = hasNewFiles ? await readImagesFast(files) : [];
        const data = { permit, contractor, owner, location, images: localImages };
        let oldId = null, oldImages = [];

        if (editingClearance >= 0) {
            const old = clearances[editingClearance] || {};
            oldId = old.id || null;
            oldImages = old.images || [];
            if (localImages.length === 0) data.images = oldImages;
            data.id = oldId;
            clearances[editingClearance] = data;
            editingClearance = -1;
        } else { clearances.push(data); }

        try { localStorage.setItem("clearances", JSON.stringify(clearances)); } catch(e){}
        clearClearance(); renderClearances(); updateDashboard();
        showToast("جارٍ الحفظ على السحابة... ⏳", "success");

        (async function () {
            try {
                if (hasNewFiles) { data.images = await uploadImagesInBackground(files, localImages); }
                let cloudOk = false;
                if (oldId) {
                    const ok = await dbUpdate("clearances", oldId, clearanceToRow(data));
                    if (ok) cloudOk = true;
                    else { const ins = await dbInsert("clearances", clearanceToRow(data)); if (ins && ins.id) { data.id = ins.id; cloudOk = true; } }
                } else {
                    const ins = await dbInsert("clearances", clearanceToRow(data));
                    if (ins && ins.id) { data.id = ins.id; cloudOk = true; }
                }
                try { localStorage.setItem("clearances", JSON.stringify(clearances)); } catch(e){}
                renderClearances();
                if (cloudOk) showToast("تم الحفظ على السحابة ☁️✅", "success");
                else showToast("تم الحفظ محلياً ⚠️", "warn");
            } catch (e) { console.error(e); showToast("فشل الرفع للسحابة ❌", "error"); }
        })();
    } catch (error) { console.error(error); showToast("خطأ: " + error.message, "error"); }
    finally { setSaveBusy(false); window._savingClearance = false; }
}
function clearClearance() {
    ["clearancePermit", "clearanceContractor", "clearanceOwner", "clearanceLocation"].forEach(function (id) { setVal(id, ""); });
    const images = document.getElementById("clearanceImages"); if (images) images.value = "";
    editingClearance = -1;
}
function renderClearances(data) {
    data = data || clearances;
    const tbody = ensureTableHeaders("clearanceTable", ["رقم التصريح", "اسم المقاول", "الجهة المالكة", "الموقع", "الصور", "الإجراءات"]);
    if (!tbody) return;
    if (data.length === 0) { tbody.innerHTML = '<tr><td colspan="6">لا توجد رخص إخلاء مسجلة</td></tr>'; return; }
    let html = "";
    data.forEach(function (item) {
        const idx = clearances.indexOf(item);
        let imagesHTML = "";
        if (item.images && item.images.length > 0) { item.images.forEach(function (img) { imagesHTML += imageThumb(img, "صورة"); }); }
        else imagesHTML = "<span>لا توجد صور</span>";
        html += '<tr><td>' + (item.permit || "") + '</td><td>' + (item.contractor || "") + '</td><td>' + (item.owner || "") + '</td><td>' + (item.location || "") + '</td><td>' + imagesHTML + '</td><td><button class="edit" onclick="editClearance(' + idx + ')">تعديل</button> <button class="delete" onclick="deleteClearance(' + idx + ')">حذف</button></td></tr>';
    });
    tbody.innerHTML = html;
    setTimeout(function () { try { resolveIdbImages(); } catch (e) {} }, 50);
}
function searchClearance() {
    const input = document.getElementById("clearanceSearch");
    const result = document.getElementById("clearanceSearchResult");
    if (!input || !result) return;
    const value = input.value.trim().toLowerCase();
    if (!value) { result.innerHTML = '<div class="search-error">اكتب رقم رخصة الإخلاء</div>'; renderClearances(); return; }
    const results = clearances.filter(function (item) { return String(item.permit || "").toLowerCase().includes(value); });
    if (results.length === 0) { result.innerHTML = '<div class="search-error">لم يتم العثور</div>'; renderClearances([]); return; }
    result.innerHTML = '<div class="search-success">تم العثور على ' + results.length + '</div>';
    renderClearances(results);
}
function clearClearanceSearch() {
    const input = document.getElementById("clearanceSearch"); const result = document.getElementById("clearanceSearchResult");
    if (input) input.value = ""; if (result) result.innerHTML = ""; renderClearances();
}
function editClearance(index) {
    const item = clearances[index]; if (!item) return;
    setVal("clearancePermit", item.permit); setVal("clearanceContractor", item.contractor);
    setVal("clearanceOwner", item.owner); setVal("clearanceLocation", item.location);
    editingClearance = index; showPage("clearance");
    window.scrollTo({ top: 0, behavior: "smooth" });
}
async function deleteClearance(index) {
    if (!confirm("هل تريد حذف رخصة الإخلاء؟")) return;
    const item = clearances[index];
    clearances.splice(index, 1);
    try { localStorage.setItem("clearances", JSON.stringify(clearances)); } catch(e){}
    renderClearances(); updateDashboard();
    showToast("تم حذف الرخصة ✅", "success");
    (async function () {
        try {
            if (item && Array.isArray(item.images)) { for (const img of item.images) { if (isIdbRef(img)) { try { await idbDelete(idbKeyFromRef(img)); } catch(e){} } } }
            if (item && item.id) { try { await dbDelete("clearances", item.id); } catch(e){} }
        } catch (e) { console.warn(e); }
    })();
}

/* ====== رخص الطوارئ ====== */
async function saveEmergency() {
    if (window._savingEmergency) return;
    window._savingEmergency = true;
    try {
        const permit = val("emergencyPermit").trim();
        const contractor = val("emergencyContractor").trim();
        const owner = val("emergencyOwner").trim();
        const labReceive = val("labReceiveDate");
        const start = val("workStartDate");
        const end = val("workEndDate");
        const location = val("emergencyLocation").trim();
        let missing = [];
        if (!permit) missing.push("رقم التصريح");
        if (!contractor) missing.push("اسم المقاول");
        if (!owner) missing.push("الجهة المالكة");
        if (missing.length > 0) { alert("يرجى تعبئة:\n" + missing.join("\n")); return; }

        const imagesEl = document.getElementById("emergencyImages");
        const files = imagesEl ? imagesEl.files : [];
        const hasNewFiles = files && files.length > 0;
        setSaveBusy(true);
        const localImages = hasNewFiles ? await readImagesFast(files) : [];
        const data = { permit, contractor, owner, labReceive, start, end, location, images: localImages };
        let oldId = null, oldImages = [];

        if (editingEmergency >= 0) {
            const old = emergencies[editingEmergency] || {};
            oldId = old.id || null; oldImages = old.images || [];
            if (localImages.length === 0) data.images = oldImages;
            data.id = oldId;
            emergencies[editingEmergency] = data;
            editingEmergency = -1;
        } else { emergencies.push(data); }

        try { localStorage.setItem("emergencies", JSON.stringify(emergencies)); } catch(e){}
        clearEmergency(); renderEmergencies(); updateDashboard();
        showToast("جارٍ الحفظ على السحابة... ⏳", "success");

        (async function () {
            try {
                if (hasNewFiles) { data.images = await uploadImagesInBackground(files, localImages); }
                let cloudOk = false;
                if (oldId) {
                    const ok = await dbUpdate("emergencies", oldId, emergencyToRow(data));
                    if (ok) cloudOk = true;
                    else { const ins = await dbInsert("emergencies", emergencyToRow(data)); if (ins && ins.id) { data.id = ins.id; cloudOk = true; } }
                } else {
                    const ins = await dbInsert("emergencies", emergencyToRow(data));
                    if (ins && ins.id) { data.id = ins.id; cloudOk = true; }
                }
                try { localStorage.setItem("emergencies", JSON.stringify(emergencies)); } catch(e){}
                renderEmergencies();
                if (cloudOk) showToast("تم الحفظ على السحابة ☁️✅", "success");
                else showToast("تم الحفظ محلياً ⚠️", "warn");
            } catch (e) { console.error(e); showToast("فشل الرفع ❌", "error"); }
        })();
    } catch (error) { console.error(error); showToast("خطأ: " + error.message, "error"); }
    finally { setSaveBusy(false); window._savingEmergency = false; }
}
function clearEmergency() {
    ["emergencyPermit", "emergencyContractor", "emergencyOwner", "labReceiveDate", "workStartDate", "workEndDate", "emergencyLocation"].forEach(function (id) { setVal(id, ""); });
    const images = document.getElementById("emergencyImages"); if (images) images.value = "";
    editingEmergency = -1;
}
function renderEmergencies(data) {
    data = data || emergencies;
    const tbody = ensureTableHeaders("emergencyTable", ["رقم التصريح", "اسم المقاول", "الجهة المالكة", "تاريخ الاستلام", "بداية العمل", "انتهاء العمل", "الموقع", "الصور", "الإجراءات"]);
    if (!tbody) return;
    if (data.length === 0) { tbody.innerHTML = '<tr><td colspan="9">لا توجد رخص طوارئ</td></tr>'; return; }
    let html = "";
    data.forEach(function (item) {
        const idx = emergencies.indexOf(item);
        let imagesHTML = "";
        if (item.images && item.images.length > 0) { item.images.forEach(function (img) { imagesHTML += imageThumb(img, "صورة"); }); }
        else imagesHTML = "<span>لا توجد صور</span>";
        html += '<tr><td>' + (item.permit || "") + '</td><td>' + (item.contractor || "") + '</td><td>' + (item.owner || "") + '</td><td>' + (item.labReceive || "") + '</td><td>' + (item.start || "") + '</td><td>' + (item.end || "") + '</td><td>' + (item.location || "") + '</td><td>' + imagesHTML + '</td><td><button class="edit" onclick="editEmergency(' + idx + ')">تعديل</button> <button class="delete" onclick="deleteEmergency(' + idx + ')">حذف</button></td></tr>';
    });
    tbody.innerHTML = html;
    setTimeout(function () { try { resolveIdbImages(); } catch (e) {} }, 50);
}
function searchEmergency() {
    const input = document.getElementById("emergencySearch");
    const result = document.getElementById("emergencySearchResult");
    if (!input || !result) return;
    const value = input.value.trim().toLowerCase();
    if (!value) { result.innerHTML = '<div class="search-error">اكتب رقم رخصة الطوارئ</div>'; renderEmergencies(); return; }
    const results = emergencies.filter(function (item) { return String(item.permit || "").toLowerCase().includes(value); });
    if (results.length === 0) { result.innerHTML = '<div class="search-error">لم يتم العثور</div>'; renderEmergencies([]); return; }
    result.innerHTML = '<div class="search-success">تم العثور على ' + results.length + '</div>';
    renderEmergencies(results);
}
function clearEmergencySearch() {
    const input = document.getElementById("emergencySearch"); const result = document.getElementById("emergencySearchResult");
    if (input) input.value = ""; if (result) result.innerHTML = ""; renderEmergencies();
}
function editEmergency(index) {
    const item = emergencies[index]; if (!item) return;
    setVal("emergencyPermit", item.permit); setVal("emergencyContractor", item.contractor);
    setVal("emergencyOwner", item.owner); setVal("labReceiveDate", item.labReceive);
    setVal("workStartDate", item.start); setVal("workEndDate", item.end);
    setVal("emergencyLocation", item.location);
    editingEmergency = index; showPage("emergency");
    window.scrollTo({ top: 0, behavior: "smooth" });
}
async function deleteEmergency(index) {
    if (!confirm("هل تريد حذف رخصة الطوارئ؟")) return;
    const item = emergencies[index];
    emergencies.splice(index, 1);
    try { localStorage.setItem("emergencies", JSON.stringify(emergencies)); } catch(e){}
    renderEmergencies(); updateDashboard();
    showToast("تم الحذف ✅", "success");
    (async function () {
        try {
            if (item && Array.isArray(item.images)) { for (const img of item.images) { if (isIdbRef(img)) { try { await idbDelete(idbKeyFromRef(img)); } catch(e){} } } }
            if (item && item.id) { try { await dbDelete("emergencies", item.id); } catch(e){} }
        } catch (e) {}
    })();
}
/* ====== الملاحظات ====== */
function setNoteType(type) {
    const noteType = document.getElementById("noteType");
    if (noteType) noteType.value = type;
    document.querySelectorAll(".note-types button").forEach(function (b) { b.classList.remove("active"); });
    document.querySelectorAll(".note-types button").forEach(function (b) { if (b.textContent.trim() === type) b.classList.add("active"); });
}
async function saveNote() {
    if (window._savingNote) return;
    window._savingNote = true;
    try {
        const date = val("noteDate");
        const permit = val("notePermit").trim();
        const contractor = val("noteContractor").trim();
        const owner = val("noteOwner").trim();
        const reason = val("noteReason").trim();
        const action = val("noteAction").trim();
        const type = val("noteType") || "مشاريع الأمانة";
        let missing = [];
        if (!date) missing.push("تاريخ الملاحظة");
        if (!permit) missing.push("رقم التصريح");
        if (!contractor) missing.push("اسم المقاول");
        if (!owner) missing.push("الجهة المالكة");
        if (!reason) missing.push("أسباب الرفض");
        if (!action) missing.push("الإجراء المتخذ");
        if (missing.length > 0) { alert("يرجى تعبئة:\n" + missing.join("\n")); return; }

        let oldNote = null;
        if (editingNote >= 0) oldNote = notes[editingNote] || null;
        const beforeEl = document.getElementById("beforeImage");
        const afterEl = document.getElementById("afterImage");
        const beforeFile = beforeEl && beforeEl.files.length > 0 ? beforeEl.files[0] : null;
        const afterFile = afterEl && afterEl.files.length > 0 ? afterEl.files[0] : null;
        setSaveBusy(true);
        const [beforeLocal, afterLocal] = await Promise.all([readImageFast(beforeFile), readImageFast(afterFile)]);
        const beforeImage = beforeLocal || (oldNote ? oldNote.before || "" : "");
        const afterImage = afterLocal || (oldNote ? oldNote.after || "" : "");
        const completed = afterImage !== "";
        const data = { type, date, permit, contractor, owner, reason, action, before: beforeImage, after: afterImage, completed };
        let oldId = null;
        if (editingNote >= 0) {
            const old = notes[editingNote] || {};
            oldId = old.id || null; data.id = oldId;
            notes[editingNote] = data; editingNote = -1;
        } else { notes.push(data); }

        try { localStorage.setItem("notes", JSON.stringify(notes)); } catch(e){}
        clearNote(); renderNotes(); updateDashboard();
        showToast("جارٍ الحفظ على السحابة... ⏳", "success");

        (async function () {
            try {
                const [beforeCloud, afterCloud] = await Promise.all([
                    beforeFile ? uploadSingleImageFast(beforeFile) : Promise.resolve(""),
                    afterFile ? uploadSingleImageFast(afterFile) : Promise.resolve("")
                ]);
                if (beforeFile) { if (beforeCloud) data.before = beforeCloud; else { const r = await storeImageInIdb(beforeLocal); data.before = r || beforeLocal; } }
                if (afterFile) { if (afterCloud) data.after = afterCloud; else { const r = await storeImageInIdb(afterLocal); data.after = r || afterLocal; } }
                let cloudOk = false;
                if (oldId) {
                    const ok = await dbUpdate("notes", oldId, noteToRow(data));
                    if (ok) cloudOk = true;
                    else { const ins = await dbInsert("notes", noteToRow(data)); if (ins && ins.id) { data.id = ins.id; cloudOk = true; } }
                } else {
                    const ins = await dbInsert("notes", noteToRow(data));
                    if (ins && ins.id) { data.id = ins.id; cloudOk = true; }
                }
                try { localStorage.setItem("notes", JSON.stringify(notes)); } catch(e){}
                renderNotes();
                if (cloudOk) showToast("تم الحفظ على السحابة ☁️✅", "success");
                else showToast("تم الحفظ محلياً ⚠️", "warn");
            } catch (e) { console.error(e); showToast("فشل الرفع ❌", "error"); }
        })();
    } catch (error) { console.error(error); showToast("خطأ: " + error.message, "error"); }
    finally { setSaveBusy(false); window._savingNote = false; }
}
function clearNote() {
    ["noteDate", "notePermit", "noteContractor", "noteOwner", "noteReason"].forEach(function (id) { setVal(id, ""); });
    const before = document.getElementById("beforeImage"); const after = document.getElementById("afterImage");
    if (before) before.value = ""; if (after) after.value = "";
    setVal("noteAction", DEFAULT_ACTION_TEXT); setVal("noteType", "مشاريع الأمانة");
    document.querySelectorAll(".note-types button").forEach(function (b) { b.classList.remove("active"); });
    editingNote = -1;
}
function daysPassed(date) {
    if (!date) return 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    return Math.floor((today - d) / (1000 * 60 * 60 * 24));
}
function isLate(note) { if (note.completed) return false; return daysPassed(note.date) >= 5; }
function renderNotes() {
    const tbody = document.getElementById("notesTable");
    if (!tbody) return;
    if (!notes || notes.length === 0) { tbody.innerHTML = '<tr><td colspan="10">لا توجد ملاحظات</td></tr>'; return; }
    const categories = ["مشاريع الأمانة", "المياه الوطنية", "الكهرباء", "الاتصالات", "مشاريع خاصة"];
    let html = "";
    categories.forEach(function (category) {
        const catNotes = notes.filter(function (item) { return (item.type || "مشاريع الأمانة") === category; });
        if (catNotes.length === 0) return;
        html += '<tr class="note-category-row"><td colspan="10" style="font-weight:bold;text-align:right;padding:12px;background:#eaf3ee;color:#1d4d3d;border-bottom:2px solid #1d4d3d;font-size:15px;">📁 ' + category + '</td></tr>';
        catNotes.forEach(function (item) {
            const index = notes.indexOf(item);
            const late = isLate(item);
            let status = item.completed ? '<span class="status-done">✅ تم التعديل</span>' : (late ? '<span class="status-open">🔴 متأخرة</span>' : '<span class="status-follow">قيد المتابعة</span>');
            let imagesHTML = "<span>لا توجد صور</span>";
            if (item.before || item.after) {
                imagesHTML = "";
                if (item.before) imagesHTML += '<div style="display:inline-block;text-align:center;margin:2px;"><small>قبل</small><br>' + imageThumb(item.before, "صورة") + '</div>';
                if (item.after) imagesHTML += '<div style="display:inline-block;text-align:center;margin:2px;"><small>بعد</small><br>' + imageThumb(item.after, "صورة") + '</div>';
            }
            html += '<tr ' + (late ? 'style="background:#fff0f0;"' : "") + '><td>' + (item.date || "") + '</td><td>' + (item.type || "مشاريع الأمانة") + '</td><td>' + (item.permit || "") + '</td><td>' + (item.contractor || "") + '</td><td>' + (item.owner || "") + '</td><td>' + (item.reason || "") + '</td><td>' + (item.action || "") + '</td><td>' + status + '</td><td>' + imagesHTML + '</td><td><button class="edit" onclick="editNote(' + index + ')">تعديل</button> <button class="delete" onclick="deleteNote(' + index + ')">حذف</button></td></tr>';
        });
    });
    tbody.innerHTML = html;
    setTimeout(function () { try { resolveIdbImages(); } catch (e) {} }, 50);
}
function editNote(index) {
    const item = notes[index]; if (!item) return;
    setVal("noteType", item.type || "مشاريع الأمانة");
    setVal("noteDate", item.date); setVal("notePermit", item.permit);
    setVal("noteContractor", item.contractor); setVal("noteOwner", item.owner);
    setVal("noteReason", item.reason); setVal("noteAction", item.action || DEFAULT_ACTION_TEXT);
    editingNote = index; setNoteType(item.type || "مشاريع الأمانة");
    showPage("notes"); window.scrollTo({ top: 0, behavior: "smooth" });
}
async function deleteNote(index) {
    if (!confirm("هل تريد حذف الملاحظة؟")) return;
    const item = notes[index];
    notes.splice(index, 1);
    try { localStorage.setItem("notes", JSON.stringify(notes)); } catch(e){}
    renderNotes(); updateDashboard();
    showToast("تم الحذف ✅", "success");
    (async function () {
        try {
            if (item) {
                if (isIdbRef(item.before)) { try { await idbDelete(idbKeyFromRef(item.before)); } catch(e){} }
                if (isIdbRef(item.after)) { try { await idbDelete(idbKeyFromRef(item.after)); } catch(e){} }
            }
            if (item && item.id) { try { await dbDelete("notes", item.id); } catch(e){} }
        } catch (e) {}
    })();
}

/* ====== التنبيهات ولوحة المتابعة ====== */
function updateAlerts() {
    const late = notes.filter(function (n) { return isLate(n); });
    const lateCounter = document.getElementById("lateNotesCount");
    const completedCounter = document.getElementById("completedNotesCount");
    const alertsBox = document.getElementById("alerts");
    if (lateCounter) lateCounter.innerText = late.length;
    if (completedCounter) completedCounter.innerText = notes.filter(function (n) { return n.completed; }).length;
    if (!alertsBox) return;
    if (late.length === 0) { alertsBox.innerHTML = "لا توجد ملاحظات متأخرة حالياً"; return; }
    alertsBox.innerHTML = "";
    late.forEach(function (note) {
        const days = daysPassed(note.date); const index = notes.indexOf(note);
        alertsBox.innerHTML += '<div class="alert-item"><strong>🔴 ملاحظة تجاوزت 5 أيام</strong><br><br>تاريخ: ' + note.date + '<br>رقم التصريح: ' + note.permit + '<br>المقاول: ' + note.contractor + '<br>التصنيف: ' + (note.type || "مشاريع الأمانة") + '<br>السبب: ' + note.reason + '<br>مضى: <strong>' + days + ' أيام</strong><br><br><button class="edit" onclick="editNote(' + index + ')">فتح الملاحظة</button></div>';
    });
}
function updateDashboard() {
    const c = document.getElementById("clearanceCount");
    const e = document.getElementById("emergencyCount");
    if (c) c.innerText = clearances.length;
    if (e) e.innerText = emergencies.length;
    updateAlerts();
}

/* ====== ربط الأزرار تلقائياً ====== */
function autoWireButtons() {
    const pageWiring = [
        { pageId: "clearance", save: saveClearance, clear: clearClearance, search: searchClearance, resetSearch: clearClearanceSearch },
        { pageId: "emergency", save: saveEmergency, clear: clearEmergency, search: searchEmergency, resetSearch: clearEmergencySearch },
        { pageId: "notes", save: saveNote, clear: clearNote, search: null, resetSearch: null }
    ];
    pageWiring.forEach(function (w) {
        const page = document.getElementById(w.pageId);
        if (!page) return;
        page.querySelectorAll("button, input[type='button'], input[type='submit']").forEach(function (btn) {
            if (btn.getAttribute("onclick") || btn.dataset.autoWired) return;
            const text = ((btn.innerText || btn.value || "") + "").trim();
            if (text.indexOf("حفظ") !== -1) {
                btn.dataset.autoWired = "1"; btn.dataset.wiredSave = "1";
                btn.addEventListener("click", function (event) { event.preventDefault(); w.save(); });
            } else if (text.indexOf("مسح") !== -1 || text.indexOf("تفريغ") !== -1 || text.indexOf("جديد") !== -1) {
                btn.dataset.autoWired = "1";
                btn.addEventListener("click", function (event) { event.preventDefault(); w.clear(); });
            } else if (text.indexOf("بحث") !== -1 && w.search) {
                btn.dataset.autoWired = "1";
                btn.addEventListener("click", function (event) { event.preventDefault(); w.search(); });
            } else if ((text.indexOf("الكل") !== -1 || text.indexOf("إلغاء") !== -1) && w.resetSearch) {
                btn.dataset.autoWired = "1";
                btn.addEventListener("click", function (event) { event.preventDefault(); w.resetSearch(); });
            }
        });
    });
}
function addExportButtons() {
    const configs = [
        { pageId: "clearance", buttons: [{ text: "📥 Excel", handler: function () { exportClearancesToExcel(); } }, { text: "📄 PDF", handler: function () { exportClearancesToPDF(this); } }] },
        { pageId: "emergency", buttons: [{ text: "📥 Excel", handler: function () { exportEmergenciesToExcel(); } }, { text: "📄 PDF", handler: function () { exportEmergenciesToPDF(this); } }] },
        { pageId: "notes", buttons: [{ text: "📥 Excel", handler: function () { exportNotesToExcel(); } }, { text: "📄 PDF", handler: function () { exportNotesToPDF(this); } }] }
    ];
    configs.forEach(function (cfg) {
        const page = document.getElementById(cfg.pageId); if (!page) return;
        let exists = false;
        page.querySelectorAll("button").forEach(function (btn) {
            const content = (btn.getAttribute("onclick") || "") + (btn.textContent || "");
            if (content.indexOf("export") !== -1 || content.indexOf("تصدير") !== -1) exists = true;
        });
        if (exists) return;
        const bar = document.createElement("div");
        bar.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;padding:10px;background:#f4f7f5;border-radius:10px;";
        cfg.buttons.forEach(function (b) {
            const btn = document.createElement("button");
            btn.type = "button"; btn.innerText = b.text;
            btn.style.cssText = "background:#173f32;color:#fff;border:none;padding:9px 18px;border-radius:8px;cursor:pointer;font-size:14px;font-family:inherit;min-height:44px;";
            btn.addEventListener("click", b.handler);
            bar.appendChild(btn);
        });
        page.insertBefore(bar, page.firstChild);
    });
}

/* ====== تصدير Excel/PDF (بدائل محلية) ====== */
window.XLSX = {
    utils: {
        json_to_sheet: function (d) { return d || []; },
        book_new: function () { return { Sheets: {}, SheetNames: [], _data: [] }; },
        book_append_sheet: function (wb, ws, n) { wb.Sheets[n] = ws; wb.SheetNames.push(n); wb._data = ws; }
    },
    writeFile: function (wb, fn) {
        var csv = '\uFEFF';
        if (wb._data && wb._data.length) {
            var keys = Object.keys(wb._data[0]);
            csv += keys.join(',') + '\n';
            wb._data.forEach(function (r) { csv += keys.map(function (k) { return '"' + String(r[k] || '').replace(/"/g, '""') + '"'; }).join(',') + '\n'; });
        }
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = fn.replace('.xlsx', '.csv');
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
};
window.html2pdf = function () { return { set: function () { return this; }, from: function () { return this; }, save: function () { return Promise.resolve(); } }; };
function exportDate() {
    var d = new Date();
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
}
function noteStatusText(item) { if (item.completed) return "تم التعديل"; if (isLate(item)) return "متأخرة"; return "قيد المتابعة"; }
function loadImageAsDataUrl(url) {
    return new Promise(function (resolve) {
        try {
            const img = new Image(); img.crossOrigin = "anonymous";
            img.onload = function () {
                try {
                    const canvas = document.createElement("canvas");
                    const maxDim = 900;
                    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
                    canvas.width = Math.round(img.naturalWidth * scale);
                    canvas.height = Math.round(img.naturalHeight * scale);
                    const ctx = canvas.getContext("2d");
                    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL("image/jpeg", 0.85));
                } catch (e) { resolve(""); }
            };
            img.onerror = function () { resolve(""); };
            img.src = url;
        } catch (e) { resolve(""); }
    });
}
async function resolveImageForExport(ref) {
    try {
        if (!ref) return "";
        if (isIdbRef(ref)) return await idbGet(idbKeyFromRef(ref)) || "";
        if (ref.indexOf("data:") === 0) return ref;
        try { const res = await fetch(ref); if (res.ok) { const blob = await res.blob(); const dataUrl = await blobToDataUrl(blob); if (dataUrl) return dataUrl; } } catch (e) {}
        return await loadImageAsDataUrl(ref);
    } catch (e) { return ""; }
}
async function resolveExportItems(items) {
    const out = [];
    for (const item of items) {
        const copy = Object.assign({}, item);
        if (Array.isArray(copy.images)) { const imgs = []; for (const img of copy.images) imgs.push(await resolveImageForExport(img)); copy.images = imgs; }
        if (copy.before) copy.before = await resolveImageForExport(copy.before);
        if (copy.after) copy.after = await resolveImageForExport(copy.after);
        out.push(copy);
    }
    return out;
}
var PDF_TH = "padding:8px;border:1px solid #999;background:#173f32;color:#fff;font-size:12px;text-align:center;";
var PDF_TD = "padding:6px 8px;border:1px solid #999;font-size:12px;";
var PDF_TD_CENTER = "padding:6px 8px;border:1px solid #999;font-size:12px;text-align:center;";
function pdfReportHeader(title, info) {
    return '<div dir="rtl" style="font-family:Arial,sans-serif;"><div style="text-align:center;border-bottom:3px solid #173f32;padding-bottom:8px;margin-bottom:12px;"><h2 style="color:#173f32;margin:0;">نظام مختبر جودة المشاريع</h2><h3 style="color:#333;margin:8px 0 4px;">' + title + '</h3><p style="color:#666;margin:0;font-size:12px;">' + info + ' | ' + exportDate() + '</p></div>';
}
window.generatePDFFromHTML = function (content, filename, orientation, btn) {
    if (btn) { btn.disabled = true; btn.setAttribute("data-old-text", btn.innerText); btn.innerText = "جاري..."; }
    try {
        var printArea = document.getElementById("printArea");
        if (!printArea) { printArea = document.createElement("div"); printArea.id = "printArea"; document.body.appendChild(printArea); }
        printArea.innerHTML = content;
        var st = document.getElementById("printStyle");
        if (!st) { st = document.createElement("style"); st.id = "printStyle"; document.head.appendChild(st); }
        st.innerHTML = "@media print{body *{visibility:hidden !important;}#printArea,#printArea *{visibility:visible !important;}#printArea{position:absolute;left:0;top:0;width:100%;padding:15px;background:#fff;}table{width:100% !important;border-collapse:collapse;}tr{page-break-inside:avoid;}thead{display:table-header-group;}@page{margin:1cm;size:A4 " + (orientation === "landscape" ? "landscape" : "portrait") + ";}}@media screen{#printArea{display:none;}}";
        var imgs = printArea.querySelectorAll("img");
        var promises = Array.from(imgs).map(function (img) {
            if (img.complete && img.naturalWidth > 0) return Promise.resolve();
            return new Promise(function (resolve) { img.onload = resolve; img.onerror = resolve; setTimeout(resolve, 8000); });
        });
        Promise.all(promises).then(function () {
            setTimeout(function () {
                try { window.print(); } catch (e) { console.error(e); }
                if (btn) { btn.disabled = false; btn.innerText = btn.getAttribute("data-old-text"); }
            }, 300);
        });
    } catch (e) { console.error(e); if (btn) { btn.disabled = false; btn.innerText = btn.getAttribute("data-old-text"); } }
};
function downloadExcel(rows, sheetName, cols, filename) {
    var ws = XLSX.utils.json_to_sheet(rows); ws["!cols"] = cols;
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, sheetName);
    if (!wb.Workbook) wb.Workbook = {}; if (!wb.Workbook.Views) wb.Workbook.Views = []; wb.Workbook.Views.push({ RTL: true });
    XLSX.writeFile(wb, filename);
}
function exportClearancesToExcel() {
    if (clearances.length === 0) { alert("لا توجد رخص"); return; }
    downloadExcel(clearances.map(function (item, i) { return { "م": i + 1, "رقم التصريح": item.permit || "", "اسم المقاول": item.contractor || "", "الجهة المالكة": item.owner || "", "الموقع": item.location || "", "عدد الصور": (item.images || []).length }; }), "رخص الإخلاء", [{ wch: 5 }, { wch: 18 }, { wch: 28 }, { wch: 28 }, { wch: 32 }, { wch: 10 }], "رخص_الإخلاء_" + exportDate() + ".xlsx");
}
async function exportClearancesToPDF(btn) {
    if (clearances.length === 0) { alert("لا توجد رخص"); return; }
    var data = await resolveExportItems(clearances); var rows = "";
    data.forEach(function (item, i) {
        var imagesHTML = "";
        (item.images || []).forEach(function (img) { if (img) imagesHTML += '<img src="' + img + '" style="width:60px;height:60px;object-fit:cover;border-radius:4px;margin:2px;">'; });
        if (!imagesHTML) imagesHTML = '<span style="color:#999;font-size:11px;">لا توجد صور</span>';
        rows += '<tr><td style="' + PDF_TD_CENTER + '">' + (i + 1) + '</td><td style="' + PDF_TD + '">' + (item.permit || "") + '</td><td style="' + PDF_TD + '">' + (item.contractor || "") + '</td><td style="' + PDF_TD + '">' + (item.owner || "") + '</td><td style="' + PDF_TD + '">' + (item.location || "") + '</td><td style="' + PDF_TD + '">' + imagesHTML + '</td></tr>';
    });
    window.generatePDFFromHTML(pdfReportHeader("تقرير رخص الإخلاء", "إجمالي: " + clearances.length) + '<table style="width:100%;border-collapse:collapse;"><thead><tr><th style="' + PDF_TH + '">م</th><th style="' + PDF_TH + '">رقم التصريح</th><th style="' + PDF_TH + '">اسم المقاول</th><th style="' + PDF_TH + '">الجهة المالكة</th><th style="' + PDF_TH + '">الموقع</th><th style="' + PDF_TH + '">الصور</th></tr></thead><tbody>' + rows + '</tbody></table></div>', "رخص_الإخلاء_" + exportDate() + ".pdf", "landscape", btn);
}
function exportEmergenciesToExcel() {
    if (emergencies.length === 0) { alert("لا توجد رخص"); return; }
    downloadExcel(emergencies.map(function (item, i) { return { "م": i + 1, "رقم التصريح": item.permit || "", "اسم المقاول": item.contractor || "", "الجهة المالكة": item.owner || "", "تاريخ الاستلام": item.labReceive || "", "بداية العمل": item.start || "", "انتهاء العمل": item.end || "", "الموقع": item.location || "", "عدد الصور": (item.images || []).length }; }), "رخص الطوارئ", [{ wch: 5 }, { wch: 18 }, { wch: 25 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 30 }, { wch: 10 }], "رخص_الطوارئ_" + exportDate() + ".xlsx");
}
async function exportEmergenciesToPDF(btn) {
    if (emergencies.length === 0) { alert("لا توجد رخص"); return; }
    var data = await resolveExportItems(emergencies); var rows = "";
    data.forEach(function (item, i) {
        var imagesHTML = "";
        (item.images || []).forEach(function (img) { if (img) imagesHTML += '<img src="' + img + '" style="width:60px;height:60px;object-fit:cover;border-radius:4px;margin:2px;">'; });
        if (!imagesHTML) imagesHTML = '<span style="color:#999;font-size:11px;">لا توجد صور</span>';
        rows += '<tr><td style="' + PDF_TD_CENTER + '">' + (i + 1) + '</td><td style="' + PDF_TD + '">' + (item.permit || "") + '</td><td style="' + PDF_TD + '">' + (item.contractor || "") + '</td><td style="' + PDF_TD + '">' + (item.owner || "") + '</td><td style="' + PDF_TD_CENTER + '">' + (item.labReceive || "") + '</td><td style="' + PDF_TD_CENTER + '">' + (item.start || "") + '</td><td style="' + PDF_TD_CENTER + '">' + (item.end || "") + '</td><td style="' + PDF_TD + '">' + (item.location || "") + '</td><td style="' + PDF_TD + '">' + imagesHTML + '</td></tr>';
    });
    window.generatePDFFromHTML(pdfReportHeader("تقرير رخص الطوارئ", "إجمالي: " + emergencies.length) + '<table style="width:100%;border-collapse:collapse;"><thead><tr><th style="' + PDF_TH + '">م</th><th style="' + PDF_TH + '">رقم التصريح</th><th style="' + PDF_TH + '">اسم المقاول</th><th style="' + PDF_TH + '">الجهة المالكة</th><th style="' + PDF_TH + '">الاستلام</th><th style="' + PDF_TH + '">البداية</th><th style="' + PDF_TH + '">النهاية</th><th style="' + PDF_TH + '">الموقع</th><th style="' + PDF_TH + '">الصور</th></tr></thead><tbody>' + rows + '</tbody></table></div>', "رخص_الطوارئ_" + exportDate() + ".pdf", "landscape", btn);
}
function exportNotesToExcel() {
    if (notes.length === 0) { alert("لا توجد ملاحظات"); return; }
    downloadExcel(notes.map(function (item, i) { return { "م": i + 1, "التصنيف": item.type || "مشاريع الأمانة", "التاريخ": item.date || "", "رقم التصريح": item.permit || "", "اسم المقاول": item.contractor || "", "الجهة المالكة": item.owner || "", "أسباب الرفض": item.reason || "", "الإجراء المتخذ": item.action || "", "الحالة": noteStatusText(item) }; }), "الملاحظات", [{ wch: 5 }, { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 25 }, { wch: 25 }, { wch: 30 }, { wch: 30 }, { wch: 14 }], "الملاحظات_" + exportDate() + ".xlsx");
}
async function exportNotesToPDF(btn) {
    if (notes.length === 0) { alert("لا توجد ملاحظات"); return; }
    var lateCount = 0; notes.forEach(function (item) { if (isLate(item)) lateCount++; });
    var data = await resolveExportItems(notes); var rows = "";
    data.forEach(function (item, i) {
        var imagesHTML = "";
        if (item.before) imagesHTML += '<div style="text-align:center;"><small>قبل</small><br><img src="' + item.before + '" style="width:60px;height:60px;object-fit:cover;border-radius:4px;margin:2px;"></div>';
        if (item.after) imagesHTML += '<div style="text-align:center;"><small>بعد</small><br><img src="' + item.after + '" style="width:60px;height:60px;object-fit:cover;border-radius:4px;margin:2px;"></div>';
        if (!imagesHTML) imagesHTML = '<span style="color:#999;font-size:11px;">لا توجد صور</span>';
        rows += '<tr><td style="' + PDF_TD_CENTER + '">' + (i + 1) + '</td><td style="' + PDF_TD + '">' + (item.type || "مشاريع الأمانة") + '</td><td style="' + PDF_TD_CENTER + '">' + (item.date || "") + '</td><td style="' + PDF_TD + '">' + (item.permit || "") + '</td><td style="' + PDF_TD + '">' + (item.contractor || "") + '</td><td style="' + PDF_TD + '">' + (item.owner || "") + '</td><td style="' + PDF_TD + '">' + (item.reason || "") + '</td><td style="' + PDF_TD + '">' + (item.action || "") + '</td><td style="' + PDF_TD_CENTER + '">' + noteStatusText(item) + '</td><td style="' + PDF_TD + '">' + imagesHTML + '</td></tr>';
    });
    window.generatePDFFromHTML(pdfReportHeader("تقرير الملاحظات", "إجمالي: " + notes.length + " | المتأخرة: " + lateCount) + '<table style="width:100%;border-collapse:collapse;"><thead><tr><th style="' + PDF_TH + '">م</th><th style="' + PDF_TH + '">التصنيف</th><th style="' + PDF_TH + '">التاريخ</th><th style="' + PDF_TH + '">رقم التصريح</th><th style="' + PDF_TH + '">اسم المقاول</th><th style="' + PDF_TH + '">الجهة المالكة</th><th style="' + PDF_TH + '">أسباب الرفض</th><th style="' + PDF_TH + '">الإجراء المتخذ</th><th style="' + PDF_TH + '">الحالة</th><th style="' + PDF_TH + '">الصور</th></tr></thead><tbody>' + rows + '</tbody></table></div>', "الملاحظات_" + exportDate() + ".pdf", "landscape", btn);
}

/* ====== نظام دخول الموظفين ====== */
function createLoginScreen() {
    const old = document.getElementById("loginScreen"); if (old) old.remove();
    const screen = document.createElement("div");
    screen.id = "loginScreen";
    screen.style.cssText = "position:fixed;inset:0;z-index:999999;background:linear-gradient(135deg,#173f32,#0d241c);display:flex;justify-content:center;align-items:center;font-family:inherit;direction:rtl;padding:20px;";
    screen.innerHTML = '<div style="background:#fff;border-radius:14px;padding:28px 22px;width:100%;max-width:380px;box-shadow:0 15px 40px rgba(0,0,0,.4);"><div style="text-align:center;margin-bottom:20px;"><h2 style="color:#173f32;margin:0 0 6px;font-size:20px;">نظام مختبر جودة المشاريع</h2><p style="color:#666;font-size:14px;margin:0 0 20px;">أدخل اسمك للمتابعة</p></div><label style="display:block;font-size:13px;color:#333;margin-bottom:6px;font-weight:bold;">الاسم الكامل</label><input type="text" id="loginName" placeholder="اكتب اسمك هنا" style="width:100%;padding:14px;border:2px solid #ddd;border-radius:8px;font-size:16px;font-family:inherit;box-sizing:border-box;margin-bottom:14px;min-height:48px;"><label style="display:block;font-size:13px;color:#333;margin-bottom:6px;font-weight:bold;">كلمة المرور</label><input type="password" id="loginPassword" placeholder="كلمة مرور المختبر" style="width:100%;padding:14px;border:2px solid #ddd;border-radius:8px;font-size:16px;font-family:inherit;box-sizing:border-box;margin-bottom:14px;min-height:48px;"><div id="loginError" style="color:#c0392b;font-size:13px;text-align:center;margin-bottom:12px;display:none;"></div><button onclick="doLogin()" style="width:100%;background:#173f32;color:#fff;border:none;padding:14px;border-radius:8px;font-size:16px;cursor:pointer;font-family:inherit;min-height:48px;">دخول</button></div>';
    document.body.appendChild(screen);
    document.getElementById("loginPassword").addEventListener("keydown", function (e) { if (e.key === "Enter") doLogin(); });
    document.getElementById("loginName").addEventListener("keydown", function (e) { if (e.key === "Enter") document.getElementById("loginPassword").focus(); });
}
function doLogin() {
    const name = document.getElementById("loginName").value.trim();
    const password = document.getElementById("loginPassword").value;
    const errorEl = document.getElementById("loginError");
    if (!name) { errorEl.textContent = "يرجى كتابة اسمك أولاً"; errorEl.style.display = "block"; return; }
    if (password !== LAB_LOGIN_PASSWORD) { errorEl.textContent = "كلمة المرور غير صحيحة"; errorEl.style.display = "block"; return; }
    currentUserName = name; localStorage.setItem("labUserName", name);
    const screen = document.getElementById("loginScreen"); if (screen) screen.remove();
    showUserBadge();
}
function showUserBadge() {
    const old = document.getElementById("userBadge"); if (old) old.remove();
    const badge = document.createElement("div");
    badge.id = "userBadge";
    badge.style.cssText = "position:fixed;top:8px;left:8px;z-index:99998;background:#173f32;color:#fff;padding:8px 12px;border-radius:20px;font-size:12px;font-family:inherit;display:flex;align-items:center;gap:8px;direction:rtl;box-shadow:0 2px 8px rgba(0,0,0,.3);max-width:200px;";
    badge.innerHTML = '<span>👤 ' + currentUserName + '</span><button onclick="doLogout()" style="background:#c0392b;color:#fff;border:none;padding:4px 10px;border-radius:12px;cursor:pointer;font-size:11px;font-family:inherit;min-height:28px;">خروج</button>';
    document.body.appendChild(badge);
}
function doLogout() {
    if (!confirm("هل تريد تسجيل الخروج؟")) return;
    localStorage.removeItem("labUserName"); currentUserName = "";
    const badge = document.getElementById("userBadge"); if (badge) badge.remove();
    createLoginScreen();
}

/* ====== الإكمال التلقائي للأسماء ====== */
(function () {
    let activeList = null, activeInput = null;
    const AUTOCOMPLETE_FIELDS = [
        { id: "clearanceContractor", source: "contractor" }, { id: "clearanceOwner", source: "owner" }, { id: "clearanceLocation", source: "location" },
        { id: "emergencyContractor", source: "contractor" }, { id: "emergencyOwner", source: "owner" }, { id: "emergencyLocation", source: "location" },
        { id: "noteContractor", source: "contractor" }, { id: "noteOwner", source: "owner" }
    ];
    function collectSuggestions(source) {
        const values = new Set();
        clearances.forEach(function (item) { if (source === "contractor" && item.contractor) values.add(item.contractor); if (source === "owner" && item.owner) values.add(item.owner); if (source === "location" && item.location) values.add(item.location); });
        emergencies.forEach(function (item) { if (source === "contractor" && item.contractor) values.add(item.contractor); if (source === "owner" && item.owner) values.add(item.owner); if (source === "location" && item.location) values.add(item.location); });
        notes.forEach(function (item) { if (source === "contractor" && item.contractor) values.add(item.contractor); if (source === "owner" && item.owner) values.add(item.owner); });
        return Array.from(values).sort();
    }
    function matches(value, typed) { try { return String(value).toLowerCase().indexOf(String(typed).toLowerCase()) !== -1; } catch (e) { return false; } }
    function closeList() { if (activeList) { activeList.remove(); activeList = null; activeInput = null; } }
    function applyChoice(inputEl, value) { inputEl.value = value; closeList(); inputEl.focus(); try { inputEl.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {} }
    function createDropdown(inputEl, items) {
        closeList(); if (!items || items.length === 0) return;
        const list = document.createElement("div");
        list.style.cssText = "position:absolute;z-index:100000;background:#fff;border:2px solid #173f32;border-radius:8px;max-height:220px;overflow-y:auto;box-shadow:0 8px 25px rgba(0,0,0,.25);direction:rtl;font-family:inherit;";
        items.forEach(function (item) {
            const option = document.createElement("div");
            option.textContent = item;
            option.style.cssText = "padding:10px 14px;cursor:pointer;font-size:14px;border-bottom:1px solid #eee;user-select:none;";
            option.addEventListener("mouseenter", function () { option.style.background = "#e8f2ee"; });
            option.addEventListener("mouseleave", function () { option.style.background = "#fff"; });
            option.addEventListener("mousedown", function (e) { e.preventDefault(); applyChoice(inputEl, item); });
            list.appendChild(option);
        });
        document.body.appendChild(list);
        const rect = inputEl.getBoundingClientRect();
        list.style.top = (rect.bottom + (window.pageYOffset || 0) + 4) + "px";
        list.style.left = (rect.left + (window.pageXOffset || 0)) + "px";
        list.style.width = Math.max(rect.width, 220) + "px";
        activeList = list; activeInput = inputEl;
    }
    function setupField(config) {
        const inputEl = document.getElementById(config.id); if (!inputEl) return;
        let debounceTimer = null;
        inputEl.addEventListener("keydown", function (e) {
            if (!activeList || activeInput !== inputEl) return;
            const options = activeList.querySelectorAll("div"); let current = -1;
            options.forEach(function (opt, i) { if (opt.style.background === "rgb(232, 242, 238)") current = i; });
            if (e.key === "ArrowDown") { e.preventDefault(); const next = (current + 1) % options.length; options.forEach(function (o) { o.style.background = "#fff"; }); if (options[next]) { options[next].style.background = "#e8f2ee"; options[next].scrollIntoView({ block: "nearest" }); } }
            else if (e.key === "ArrowUp") { e.preventDefault(); const prev = (current - 1 + options.length) % options.length; options.forEach(function (o) { o.style.background = "#fff"; }); if (options[prev]) { options[prev].style.background = "#e8f2ee"; options[prev].scrollIntoView({ block: "nearest" }); } }
            else if (e.key === "Enter") { if (current >= 0 && options[current]) { e.preventDefault(); applyChoice(inputEl, options[current].textContent); } }
            else if (e.key === "Escape") { closeList(); }
        });
        inputEl.addEventListener("input", function () {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(function () {
                const typed = inputEl.value.trim();
                if (typed.length === 0) { closeList(); return; }
                createDropdown(inputEl, collectSuggestions(config.source).filter(function (v) { return matches(v, typed); }).slice(0, 15));
            }, 120);
        });
        inputEl.addEventListener("blur", function () { setTimeout(function () { if (activeInput === inputEl) closeList(); }, 300); });
    }
    document.addEventListener("mousedown", function (e) { if (activeList && !activeList.contains(e.target) && e.target !== activeInput) closeList(); });
    document.addEventListener("DOMContentLoaded", function () { AUTOCOMPLETE_FIELDS.forEach(function (config) { setupField(config); }); });
})();

/* ====== صفحة تصنيف المقاولين ====== */
var barChartInstance = null, pieChartInstance = null;
function goToPerformance() {
    var pages = document.querySelectorAll('.page');
    for (var i = 0; i < pages.length; i++) pages[i].classList.remove('active');
    var perfPage = document.getElementById('performance');
    if (perfPage) { perfPage.classList.add('active'); perfPage.style.display = 'block'; }
    renderPerformanceData();
}
function renderPerformanceData() {
    var tbody = document.getElementById("performanceTableBody"); if (!tbody) return;
    if (typeof Chart === 'undefined' || typeof clearances === 'undefined') { setTimeout(renderPerformanceData, 1000); return; }
    var contractorStats = {};
    clearances.concat(emergencies).forEach(function (p) { var name = (p.contractor || "غير معروف").trim(); if (name) { if (!contractorStats[name]) contractorStats[name] = { permits: 0, notes: 0 }; contractorStats[name].permits++; } });
    notes.forEach(function (n) { var name = (n.contractor || "غير معروف").trim(); if (name) { if (!contractorStats[name]) contractorStats[name] = { permits: 0, notes: 0 }; contractorStats[name].notes++; } });
    var labels = Object.keys(contractorStats);
    if (labels.length === 0) { tbody.innerHTML = '<tr><td colspan="5">لا توجد بيانات</td></tr>'; return; }
    var tableRows = '', chartLabels = [], chartPermits = [], chartNotes = [], classCounts = { A: 0, B: 0, C: 0, D: 0 };
    labels.forEach(function (c) {
        var data = contractorStats[c]; var ratio = data.permits > 0 ? (data.notes / data.permits) * 100 : 0;
        var classification = '', classColor = '';
        if (ratio === 0) { classification = '🟢 A'; classColor = 'background:#dcefe4;color:#24704d;'; classCounts.A++; }
        else if (ratio <= 30) { classification = '🔵 B'; classColor = 'background:#e8eee9;color:#5d7066;'; classCounts.B++; }
        else if (ratio <= 60) { classification = '🟡 C'; classColor = 'background:#fff8e1;color:#8a6d3b;'; classCounts.C++; }
        else { classification = '🔴 D'; classColor = 'background:#f7dddd;color:#a33f3f;'; classCounts.D++; }
        chartLabels.push(c); chartPermits.push(data.permits); chartNotes.push(data.notes);
        tableRows += '<tr><td style="font-weight:bold;">' + c + '</td><td style="text-align:center;">' + data.permits + '</td><td style="text-align:center;">' + data.notes + '</td><td style="text-align:center;font-weight:bold;">' + ratio.toFixed(1) + '%</td><td style="text-align:center;font-weight:bold;padding:8px;border-radius:8px;' + classColor + '">' + classification + '</td></tr>';
    });
    tbody.innerHTML = tableRows;
    var barCtx = document.getElementById('contractorBarChart');
    if (barCtx) { if (barChartInstance) barChartInstance.destroy(); barChartInstance = new Chart(barCtx, { type: 'bar', data: { labels: chartLabels, datasets: [{ label: 'التصاريح', data: chartPermits, backgroundColor: '#245c49' }, { label: 'الملاحظات', data: chartNotes, backgroundColor: '#b3402a' }] }, options: { responsive: true, animation: false, scales: { y: { beginAtZero: true } }, plugins: { legend: { labels: { font: { size: 11 } } } } } }); }
    var pieCtx = document.getElementById('classificationPieChart');
    if (pieCtx) { if (pieChartInstance) pieChartInstance.destroy(); pieChartInstance = new Chart(pieCtx, { type: 'doughnut', data: { labels: ['A ممتاز', 'B جيد', 'C متوسط', 'D خطر'], datasets: [{ data: [classCounts.A, classCounts.B, classCounts.C, classCounts.D], backgroundColor: ['#24704d', '#5d7066', '#8a6d3b', '#a33f3f'] }] }, options: { responsive: true, animation: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } } }); }
}
setTimeout(renderPerformanceData, 3000);
function getPerformanceDataArray() {
    if (typeof clearances === 'undefined') return []; var stats = {};
    clearances.concat(emergencies || []).forEach(function (p) { var n = (p.contractor || "غير معروف").trim(); if (n) { if (!stats[n]) stats[n] = { permits: 0, notes: 0 }; stats[n].permits++; } });
    notes.forEach(function (n) { var name = (n.contractor || "غير معروف").trim(); if (name) { if (!stats[name]) stats[name] = { permits: 0, notes: 0 }; stats[name].notes++; } });
    var arr = [], i = 1;
    Object.keys(stats).forEach(function (name) { var d = stats[name]; var r = d.permits > 0 ? (d.notes / d.permits) * 100 : 0; arr.push({ "م": i++, "اسم المقاول": name, "التصاريح": d.permits, "الملاحظات": d.notes, "نسبة الأخطاء (%)": r.toFixed(1), "التصنيف": r === 0 ? 'ممتاز (A)' : r <= 30 ? 'جيد (B)' : r <= 60 ? 'متوسط (C)' : 'خطر عالي (D)' }); });
    return arr;
}
function exportPerformanceToExcel() {
    if (typeof XLSX === 'undefined') return alert("جاري تحميل مكتبة Excel...");
    var data = getPerformanceDataArray(); if (data.length === 0) return alert("لا توجد بيانات");
    var ws = XLSX.utils.json_to_sheet(data); ws["!cols"] = [{ wch: 5 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "المقاولين");
    if (!wb.Workbook) wb.Workbook = {}; if (!wb.Workbook.Views) wb.Workbook.Views = []; wb.Workbook.Views.push({ RTL: true }); XLSX.writeFile(wb, "تصنيف_المقاولين.xlsx");
}
function exportPerformanceToPDF() { window.print(); }

/* ====== لوحة القيادة التنفيذية ====== */
var analyticsCharts = {};
function renderAnalyticsPage() {
    if (typeof clearances === 'undefined' || typeof Chart === 'undefined') return;
    var currentYear = new Date().getFullYear();
    var yearSpan = document.getElementById('analyticsCurrentYear'); if (yearSpan) yearSpan.innerText = "(" + currentYear + ")";
    var qHeaders = document.querySelectorAll('.annual-q-header');
    if (qHeaders.length === 4) { qHeaders[0].innerText = "ربع 1 " + currentYear; qHeaders[1].innerText = "ربع 2 " + currentYear; qHeaders[2].innerText = "ربع 3 " + currentYear; qHeaders[3].innerText = "ربع 4 " + currentYear; }
    var totalPermits = clearances.length + emergencies.length; var totalNotes = notes.length; var today = new Date().toISOString().split('T')[0];
    var activePermits = emergencies.filter(function (e) { return (e.start && e.end && e.start <= today && e.end >= today); }).length;
    var completedNotes = notes.filter(function (n) { return n.completed; }).length;
    var allLateNotes = notes.filter(function (n) { var d = (typeof daysPassed === 'function') ? daysPassed(n.date) : 0; return !n.completed && d >= 5; });
    var criticalNotes = notes.filter(function (n) { var d = (typeof daysPassed === 'function') ? daysPassed(n.date) : 0; return !n.completed && d > 10; });
    var overduePermits = emergencies.filter(function (e) { return e.end && e.end < today; }).length;
    var closureRate = totalNotes > 0 ? Math.round((completedNotes / totalNotes) * 100) : 0;
    var errorRate = totalPermits > 0 ? Math.round((totalNotes / totalPermits) * 100) : 0;
    document.getElementById('kpiTotalPermits').innerText = totalPermits; document.getElementById('kpiActivePermits').innerText = activePermits; document.getElementById('kpiTotalNotes').innerText = totalNotes;
    document.getElementById('kpiClosureRate').innerText = closureRate + '%'; document.getElementById('kpiErrorRate').innerText = errorRate + '%'; document.getElementById('kpiLateNotes').innerText = allLateNotes.length;
    document.getElementById('kpiCriticalNotes').innerText = criticalNotes.length; document.getElementById('kpiOverduePermits').innerText = overduePermits; document.getElementById('gaugeValue').innerText = closureRate + '%';
    var emergTable = document.getElementById('emergencyNotesTable');
    if (allLateNotes.length === 0) { emergTable.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#24704d;font-weight:bold;padding:15px;">لا توجد ملاحظات طارئة ✅</td></tr>'; }
    else {
        allLateNotes.sort(function (a, b) { return daysPassed(b.date) - daysPassed(a.date); }); var rows = "";
        allLateNotes.forEach(function (n) {
            var days = (typeof daysPassed === 'function') ? daysPassed(n.date) : 0;
            var status = days > 10 ? '<span style="color:#5e0d0d;font-weight:bold;">حرجة جداً</span>' : '<span style="color:#b3402a;">متأخرة</span>';
            rows += '<tr style="background:#fff0f0;"><td>' + (n.date || "") + '</td><td>' + (n.permit || "") + '</td><td>' + (n.contractor || "") + '</td><td>' + (n.type || "") + '</td><td>' + (n.reason || "") + '</td><td style="font-weight:bold;color:#b3402a;">' + days + '</td><td>' + status + '</td></tr>';
        });
        emergTable.innerHTML = rows;
    }
    var ctx1 = document.getElementById('complianceGaugeChart');
    if (ctx1) { try { if (analyticsCharts.gauge) analyticsCharts.gauge.destroy(); } catch (e) {} analyticsCharts.gauge = new Chart(ctx1, { type: 'doughnut', data: { datasets: [{ data: [closureRate, 100 - closureRate], backgroundColor: ['#24704d', '#e0ebe5'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, animation: false, cutout: '75%', circumference: 180, rotation: -90, plugins: { legend: { display: false }, tooltip: { enabled: false } } } }); }
    var ctx2 = document.getElementById('workDistributionChart');
    if (ctx2) { try { if (analyticsCharts.polar) analyticsCharts.polar.destroy(); } catch (e) {} analyticsCharts.polar = new Chart(ctx2, { type: 'polarArea', data: { labels: ['رخص الإخلاء', 'رخص الطوارئ', 'الملاحظات'], datasets: [{ data: [clearances.length, emergencies.length, notes.length], backgroundColor: ['rgba(36,92,73,0.7)', 'rgba(57,116,93,0.7)', 'rgba(192,57,43,0.7)'] }] }, options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } } }); }
    var ctx3 = document.getElementById('notesByEntityChart');
    if (ctx3) { try { if (analyticsCharts.stacked) analyticsCharts.stacked.destroy(); } catch (e) {} var entityStats = {};
        notes.forEach(function (n) { var type = n.type || "غير مصنف"; if (!entityStats[type]) entityStats[type] = { completed: 0, late: 0 }; if (n.completed) entityStats[type].completed++; else entityStats[type].late++; });
        analyticsCharts.stacked = new Chart(ctx3, { type: 'bar', data: { labels: Object.keys(entityStats), datasets: [{ label: 'تم تعديلها', data: Object.values(entityStats).map(function (e) { return e.completed; }), backgroundColor: '#24704d' }, { label: 'متأخرة', data: Object.values(entityStats).map(function (e) { return e.late; }), backgroundColor: '#b3402a' }] }, options: { responsive: true, maintainAspectRatio: false, animation: false, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } } });
    }
    var q1 = { clearance: 0, emergency: 0, notes: 0 }, q2 = { clearance: 0, emergency: 0, notes: 0 }, q3 = { clearance: 0, emergency: 0, notes: 0 }, q4 = { clearance: 0, emergency: 0, notes: 0 }, totalAnnual = { clearance: 0, emergency: 0, notes: 0 };
    function getQuarter(dateStr) { if (!dateStr) return -1; var d = new Date(dateStr); if (isNaN(d.getTime())) return -1; if (d.getFullYear() !== currentYear) return -1; var m = d.getMonth(); if (m <= 2) return 1; if (m <= 5) return 2; if (m <= 8) return 3; return 4; }
    clearances.forEach(function (c) { var q = getQuarter(c.date || c.labReceive); if (q !== -1) { totalAnnual.clearance++; if (q === 1) q1.clearance++; else if (q === 2) q2.clearance++; else if (q === 3) q3.clearance++; else q4.clearance++; } });
    emergencies.forEach(function (e) { var q = getQuarter(e.labReceive || e.start); if (q !== -1) { totalAnnual.emergency++; if (q === 1) q1.emergency++; else if (q === 2) q2.emergency++; else if (q === 3) q3.emergency++; else q4.emergency++; } });
    notes.forEach(function (n) { var q = getQuarter(n.date); if (q !== -1) { totalAnnual.notes++; if (q === 1) q1.notes++; else if (q === 2) q2.notes++; else if (q === 3) q3.notes++; else q4.notes++; } });
    var annualTable = document.getElementById('annualStatsTable');
    if (annualTable) {
        annualTable.innerHTML = '<tr><td style="padding:8px;border:1px solid #e0ebe5;font-weight:bold;">رخص الإخلاء</td><td style="padding:8px;border:1px solid #e0ebe5;">' + q1.clearance + '</td><td style="padding:8px;border:1px solid #e0ebe5;">' + q2.clearance + '</td><td style="padding:8px;border:1px solid #e0ebe5;">' + q3.clearance + '</td><td style="padding:8px;border:1px solid #e0ebe5;">' + q4.clearance + '</td><td style="padding:8px;border:1px solid #e0ebe5;font-weight:bold;color:#245c49;">' + totalAnnual.clearance + '</td></tr><tr><td style="padding:8px;border:1px solid #e0ebe5;font-weight:bold;">رخص الطوارئ</td><td style="padding:8px;border:1px solid #e0ebe5;">' + q1.emergency + '</td><td style="padding:8px;border:1px solid #e0ebe5;">' + q2.emergency + '</td><td style="padding:8px;border:1px solid #e0ebe5;">' + q3.emergency + '</td><td style="padding:8px;border:1px solid #e0ebe5;">' + q4.emergency + '</td><td style="padding:8px;border:1px solid #e0ebe5;font-weight:bold;color:#245c49;">' + totalAnnual.emergency + '</td></tr><tr><td style="padding:8px;border:1px solid #e0ebe5;font-weight:bold;">الملاحظات</td><td style="padding:8px;border:1px solid #e0ebe5;">' + q1.notes + '</td><td style="padding:8px;border:1px solid #e0ebe5;">' + q2.notes + '</td><td style="padding:8px;border:1px solid #e0ebe5;">' + q3.notes + '</td><td style="padding:8px;border:1px solid #e0ebe5;">' + q4.notes + '</td><td style="padding:8px;border:1px solid #e0ebe5;font-weight:bold;color:#245c49;">' + totalAnnual.notes + '</td></tr>';
    }
}
setTimeout(function () { if (typeof renderAnalyticsPage === 'function') renderAnalyticsPage(); }, 2000);
function exportAnalyticsToExcel() {
    if (typeof XLSX === 'undefined') return alert("جاري تحميل مكتبة Excel...");
    var lateNotes = notes.filter(function (n) { return !n.completed && typeof isLate === 'function' && isLate(n); });
    var ws1 = XLSX.utils.json_to_sheet([{ "المؤشر": "رخص الإخلاء", "العدد": clearances.length }, { "المؤشر": "رخص الطوارئ", "العدد": emergencies.length }, { "المؤشر": "إجمالي الملاحظات", "العدد": notes.length }, { "المؤشر": "ملاحظات طارئة", "العدد": lateNotes.length }]); ws1["!cols"] = [{ wch: 20 }, { wch: 10 }];
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws1, "المؤشرات");
    if (lateNotes.length > 0) { var ws2 = XLSX.utils.json_to_sheet(lateNotes.map(function (n, i) { return { "م": i + 1, "التاريخ": n.date || "", "رقم التصريح": n.permit || "", "المقاول": n.contractor || "", "الجهة": n.type || "", "سبب الرفض": n.reason || "", "مضى": daysPassed(n.date) }; })); ws2["!cols"] = [{ wch: 5 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 30 }, { wch: 10 }]; XLSX.utils.book_append_sheet(wb, ws2, "الطارئة"); }
    if (!wb.Workbook) wb.Workbook = {}; if (!wb.Workbook.Views) wb.Workbook.Views = []; wb.Workbook.Views.push({ RTL: true }); XLSX.writeFile(wb, "تقرير_المؤشرات.xlsx");
}
function exportAnalyticsToPDF() { window.print(); }

/* ====== تشغيل أزرار التنقل (للجوال) ====== */
(function () {
    "use strict";
    function setupNavClicks() {
        var buttons = document.querySelectorAll("button, a");
        for (var i = 0; i < buttons.length; i++) {
            (function (btn) {
                if (btn.dataset.navFixed) return;
                var oc = btn.getAttribute("onclick") || "";
                var match = oc.match(/showPage\s*\(\s*['"]([^'"]+)['"]\s*\)/);
                if (match) {
                    btn.dataset.navFixed = "1";
                    var pageName = match[1];
                    btn.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); showPage(pageName); });
                }
            })(buttons[i]);
        }
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setupNavClicks);
    else setupNavClicks();
    setTimeout(setupNavClicks, 1000);
    setTimeout(setupNavClicks, 3000);
})();

/* ====== CSS احتياطي لإظهار الصفحات ====== */
try {
    var styleEl = document.createElement("style");
    styleEl.innerHTML = ".page{display:none !important;}.page.active{display:block !important;}";
    document.head.appendChild(styleEl);
} catch (e) {}

/* ====== التشغيل عند فتح الصفحة ====== */
document.addEventListener("DOMContentLoaded", function () {
    checkCloudHealth();
    setInterval(checkCloudHealth, 60000);

    const clearanceSearch = document.getElementById("clearanceSearch");
    if (clearanceSearch) clearanceSearch.addEventListener("keydown", function (event) { if (event.key === "Enter") searchClearance(); });
    const emergencySearch = document.getElementById("emergencySearch");
    if (emergencySearch) emergencySearch.addEventListener("keydown", function (event) { if (event.key === "Enter") searchEmergency(); });
    const actionEl = document.getElementById("noteAction");
    if (actionEl && !actionEl.value.trim()) actionEl.value = DEFAULT_ACTION_TEXT;

    autoWireButtons();
    addExportButtons();

    renderClearances();
    renderEmergencies();
    renderNotes();
    updateDashboard();

    setNoteType("مشاريع الأمانة");

    if (!document.querySelector(".page.active")) {
        const firstPage = document.querySelector(".page");
        if (firstPage) { firstPage.classList.add("active"); firstPage.style.display = "block"; }
    }

    initialImageMigration()
        .then(function () { return syncFromCloud(); })
        .then(function () { return initialImageMigration(); })
        .then(function () { renderClearances(); renderEmergencies(); renderNotes(); updateDashboard(); })
        .catch(function (e) { console.warn("خطأ في المزامنة:", e); });

    if (currentUserName) showUserBadge();
    else createLoginScreen();
});

setInterval(updateAlerts, 60 * 60 * 1000);

/* ====== استدعاء فوري عند تحميل script.js ====== */
try {
    showCloudStatus("checking", "⏳ جاري الاتصال بالسحابة...");
    checkCloudHealth();
    setInterval(checkCloudHealth, 30000);
    if (document.body) {
        if (!document.querySelector('.page.active')) {
            var firstPage = document.querySelector('.page');
            if (firstPage) { firstPage.classList.add('active'); firstPage.style.display = 'block'; }
        }
    } else {
        setTimeout(function () {
            if (!document.querySelector('.page.active')) {
                var firstPage = document.querySelector('.page');
                if (firstPage) { firstPage.classList.add('active'); firstPage.style.display = 'block'; }
            }
        }, 100);
    }
    console.log("✅ تم تحميل نظام مختبر جودة المشاريع بنجاح");
} catch (e) {
    console.error("خطأ في التحميل المبكر:", e);
}
