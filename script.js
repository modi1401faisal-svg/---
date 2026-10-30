/* =========================================================
   نظام مختبر جودة المشاريع
   النسخة النهائية: IndexedDB للصور + سحابة Supabase
   لا حذف لأي صورة — نقل فقط
   ========================================================= */

/* =========================================================
   1) الإعدادات
   ========================================================= */

const LAB_SUPABASE_KEY = "sb_publishable_HM4vP8LsEZJaZC9Cyug5fg_fhQ050qL";
const LAB_SUPABASE_URL = "https://uuhldvdgyyxvtmjqqwex.supabase.co"
const DEFAULT_ACTION_TEXT = "تم رفض الطلب وإبلاغ المقاول بالملاحظات";

/* =========================================================
   2) البيانات
   ========================================================= */

let clearances = JSON.parse(localStorage.getItem("clearances")) || [];
let emergencies = JSON.parse(localStorage.getItem("emergencies")) || [];
let notes = JSON.parse(localStorage.getItem("notes")) || [];

let editingClearance = -1;
let editingEmergency = -1;
let editingNote = -1;

let skippedImagesCount = 0;

/* =========================================================
   3) أدوات مساعدة
   ========================================================= */

function val(id) {
    const el = document.getElementById(id);
    return el ? el.value : "";
}

function setVal(id, value) {
    const el = document.getElementById(id);
    if (el) {
        el.value = value || "";
    }
}

function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise(function (_, reject) {
            setTimeout(function () {
                reject(new Error("انتهت المهلة"));
            }, ms);
        })
    ]);
}

function blobToDataUrl(blob) {
    return new Promise(function (resolve) {
        const reader = new FileReader();
        reader.onload = function () {
            resolve(reader.result);
        };
        reader.onerror = function () {
            resolve("");
        };
        reader.readAsDataURL(blob);
    });
}

/* =========================================================
   4) مخزن الصور IndexedDB (المساحة الكبيرة)
   ========================================================= */

let idbPromise = null;

function openImageDB() {
    if (idbPromise) {
        return idbPromise;
    }
    idbPromise = new Promise(function (resolve) {
        try {
            const req = indexedDB.open("labImagesDB", 1);
            req.onupgradeneeded = function (e) {
                const db = e.target.result;
                if (!db.objectStoreNames.contains("images")) {
                    db.createObjectStore("images");
                }
            };
            req.onsuccess = function (e) {
                resolve(e.target.result);
            };
            req.onerror = function () {
                resolve(null);
            };
        } catch (e) {
            resolve(null);
        }
    });
    return idbPromise;
}

async function idbPut(key, dataUrl) {
    const db = await openImageDB();
    if (!db) return false;
    return new Promise(function (resolve) {
        try {
            const tx = db.transaction("images", "readwrite");
            tx.objectStore("images").put(dataUrl, key);
            tx.oncomplete = function () { resolve(true); };
            tx.onerror = function () { resolve(false); };
        } catch (e) {
            resolve(false);
        }
    });
}

async function idbGet(key) {
    const db = await openImageDB();
    if (!db) return null;
    return new Promise(function (resolve) {
        try {
            const tx = db.transaction("images", "readonly");
            const req = tx.objectStore("images").get(key);
            req.onsuccess = function () { resolve(req.result || null); };
            req.onerror = function () { resolve(null); };
        } catch (e) {
            resolve(null);
        }
    });
}

async function idbDelete(key) {
    const db = await openImageDB();
    if (!db) return;
    return new Promise(function (resolve) {
        try {
            const tx = db.transaction("images", "readwrite");
            tx.objectStore("images").delete(key);
            tx.oncomplete = function () { resolve(true); };
            tx.onerror = function () { resolve(false); };
        } catch (e) {
            resolve(false);
        }
    });
}

function newImageRef() {
    return "idb://img_" + Date.now() + "_" + Math.random().toString(36).substring(2, 10);
}

function isIdbRef(value) {
    return typeof value === "string" && value.indexOf("idb://") === 0;
}

function idbKeyFromRef(ref) {
    return ref.substring(6);
}

async function storeImageInIdb(dataUrl) {
    const ref = newImageRef();
    const ok = await idbPut(idbKeyFromRef(ref), dataUrl);
    return ok ? ref : "";
}
async function saveClearance() {

    /* منع النقر المزدوج على زر الحفظ */
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

        if (missing.length > 0) {
            alert("يرجى تعبئة البيانات التالية:\n\n" + missing.join("\n"));
            return;
        }

        const imagesEl = document.getElementById("clearanceImages");
        const files = imagesEl ? imagesEl.files : [];
        const hasNewFiles = files && files.length > 0;

        setSaveBusy(true);

        /* 1) اقرأ الصور محلياً بسرعة (base64 مضغوط) — فوري */
        const localImages = hasNewFiles ? await readImagesFast(files) : [];

        const data = {
            permit: permit,
            contractor: contractor,
            owner: owner,
            location: location,
            images: localImages
        };

        let oldId = null;
        let oldImages = [];

        if (editingClearance >= 0) {
            const old = clearances[editingClearance] || {};
            oldId = old.id || null;
            oldImages = old.images || [];
            if (localImages.length === 0) {
                data.images = oldImages;
            }
            data.id = oldId;
            clearances[editingClearance] = data;
            editingClearance = -1;
        } else {
            clearances.push(data);
        }

        /* 2) احفظ محلياً فوراً (سريع جداً) */
        await saveLocalData("clearances", clearances);

        /* 3) اعرض الجدول فوراً */
        clearClearance();
        renderClearances();
        updateDashboard();

        /* 4) أظهر إشعار فوري للمستخدم (بدون انتظار السحابة) */
        if (hasNewFiles) {
            showToast("تم الحفظ محلياً ✅\nجارٍ رفع الصور للسحابة في الخلفية...", "success");
        } else {
            showToast("تم الحفظ ✅", "success");
        }

        /* 5) في الخلفية: ارفع الصور + السجل للسحابة (بدون حجب المستخدم) */
        (async function () {
            try {
                let finalImages = data.images;

                /* ارفع الصور الجديدة فقط (لو موجودة) */
                if (hasNewFiles) {
                    finalImages = await uploadImagesInBackground(files, localImages);
                    data.images = finalImages;
                }

                /* احفظ السجل في السحابة */
                if (oldId) {
                    const ok = await dbUpdate("clearances", oldId, clearanceToRow(data));
                    if (!ok) {
                        const inserted = await dbInsert("clearances", clearanceToRow(data));
                        if (inserted && inserted.id) {
                            data.id = inserted.id;
                        }
                    }
                } else {
                    const inserted = await dbInsert("clearances", clearanceToRow(data));
                    if (inserted && inserted.id) {
                        data.id = inserted.id;
                    }
                }

                /* حدّث النسخة المحلية بالروابط النهائية */
                await saveLocalData("clearances", clearances);
                renderClearances();

                if (hasNewFiles) {
                    showToast("تم رفع الصور للسحابة بنجاح ☁️", "success");
                }
            } catch (e) {
                console.warn("فشل الرفع في الخلفية:", e);
                showToast("سيُعاد رفع الصور تلقائياً عند توفر الاتصال", "warn");
            }
        })();

    } catch (error) {
        console.error("خطأ في حفظ رخصة الإخلاء:", error);
        showToast("حدث خطأ أثناء الحفظ: " + (error && error.message ? error.message : error), "error");
    } finally {
        setSaveBusy(false);
        window._savingClearance = false;
    }
}

function clearClearance() {
    ["clearancePermit", "clearanceContractor", "clearanceOwner", "clearanceLocation"]
        .forEach(function (id) {
            setVal(id, "");
        });
    const images = document.getElementById("clearanceImages");
    if (images) {
        images.value = "";
    }
    editingClearance = -1;
}

function renderClearances(data = clearances) {

    const tbody = ensureTableHeaders("clearanceTable", [
        "رقم التصريح",
        "اسم المقاول",
        "الجهة المالكة",
        "الموقع",
        "الصور",
        "الإجراءات"
    ]);

    if (!tbody) {
        return;
    }

    tbody.innerHTML = "";

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6">لا توجد رخص إخلاء مسجلة</td></tr>';
        return;
    }

    data.forEach(function (item) {

        const originalIndex = clearances.indexOf(item);

        let imagesHTML = "";
        if (item.images && item.images.length > 0) {
            item.images.forEach(function (img) {
                imagesHTML += imageThumb(img, "صورة رخصة الإخلاء");
            });
        } else {
            imagesHTML = "<span>لا توجد صور</span>";
        }

        tbody.innerHTML += `
            <tr>
                <td>${item.permit || ""}</td>
                <td>${item.contractor || ""}</td>
                <td>${item.owner || ""}</td>
                <td>${item.location || ""}</td>
                <td>${imagesHTML}</td>
                <td>
                    <button class="edit" onclick="editClearance(${originalIndex})">تعديل</button>
                    <button class="delete" onclick="deleteClearance(${originalIndex})">حذف</button>
                </td>
            </tr>
        `;
    });

    resolveIdbImages();
}

function searchClearance() {

    const input = document.getElementById("clearanceSearch");
    const result = document.getElementById("clearanceSearchResult");

    if (!input || !result) {
        return;
    }

    const value = input.value.trim().toLowerCase();

    if (!value) {
        result.innerHTML = '<div class="search-error">اكتب رقم رخصة الإخلاء أولاً</div>';
        renderClearances();
        return;
    }

    const results = clearances.filter(function (item) {
        return String(item.permit || "").toLowerCase().includes(value);
    });

    if (results.length === 0) {
        result.innerHTML = '<div class="search-error">لم يتم العثور على رخصة بهذا الرقم</div>';
        renderClearances([]);
        return;
    }

    result.innerHTML = '<div class="search-success">تم العثور على ' + results.length + ' رخصة إخلاء</div>';
    renderClearances(results);
}

function clearClearanceSearch() {
    const input = document.getElementById("clearanceSearch");
    const result = document.getElementById("clearanceSearchResult");
    if (input) {
        input.value = "";
    }
    if (result) {
        result.innerHTML = "";
    }
    renderClearances();
}

function editClearance(index) {

    const item = clearances[index];
    if (!item) {
        return;
    }

    setVal("clearancePermit", item.permit);
    setVal("clearanceContractor", item.contractor);
    setVal("clearanceOwner", item.owner);
    setVal("clearanceLocation", item.location);

    editingClearance = index;

    showPage("clearance");
    window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteClearance(index) {

    if (!confirm("هل تريد حذف رخصة الإخلاء؟")) {
        return;
    }

    const item = clearances[index];

    /* حذف الصور المحلية من المخزن الكبير أيضاً */
    if (item && Array.isArray(item.images)) {
        for (const img of item.images) {
            if (isIdbRef(img)) {
                await idbDelete(idbKeyFromRef(img));
            }
        }
    }

    if (item && item.id) {
        await dbDelete("clearances", item.id);
    }

    clearances.splice(index, 1);
    await saveLocalData("clearances", clearances);

    renderClearances();
    updateDashboard();
    alert("تم حذف الرخصة");
}

/* =========================================================
   17) رخص الطوارئ
   ========================================================= */

async function saveEmergency() {

    /* منع النقر المزدوج */
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

        if (missing.length > 0) {
            alert("يرجى تعبئة البيانات التالية:\n\n" + missing.join("\n"));
            return;
        }

        const imagesEl = document.getElementById("emergencyImages");
        const files = imagesEl ? imagesEl.files : [];
        const hasNewFiles = files && files.length > 0;

        setSaveBusy(true);

        /* 1) اقرأ الصور محلياً بسرعة (base64 مضغوط) — فوري */
        const localImages = hasNewFiles ? await readImagesFast(files) : [];

        const data = {
            permit: permit,
            contractor: contractor,
            owner: owner,
            labReceive: labReceive,
            start: start,
            end: end,
            location: location,
            images: localImages
        };

        let oldId = null;
        let oldImages = [];

        if (editingEmergency >= 0) {
            const old = emergencies[editingEmergency] || {};
            oldId = old.id || null;
            oldImages = old.images || [];
            if (localImages.length === 0) {
                data.images = oldImages;
            }
            data.id = oldId;
            emergencies[editingEmergency] = data;
            editingEmergency = -1;
        } else {
            emergencies.push(data);
        }

        /* 2) احفظ محلياً فوراً */
        await saveLocalData("emergencies", emergencies);

        /* 3) اعرض الجدول فوراً */
        clearEmergency();
        renderEmergencies();
        updateDashboard();

        /* 4) أظهر إشعار فوري */
        if (hasNewFiles) {
            showToast("تم الحفظ محلياً ✅\nجارٍ رفع الصور للسحابة في الخلفية...", "success");
        } else {
            showToast("تم الحفظ ✅", "success");
        }

        /* 5) ارفع للسحابة في الخلفية */
        (async function () {
            try {
                let finalImages = data.images;

                if (hasNewFiles) {
                    finalImages = await uploadImagesInBackground(files, localImages);
                    data.images = finalImages;
                }

                if (oldId) {
                    const ok = await dbUpdate("emergencies", oldId, emergencyToRow(data));
                    if (!ok) {
                        const inserted = await dbInsert("emergencies", emergencyToRow(data));
                        if (inserted && inserted.id) {
                            data.id = inserted.id;
                        }
                    }
                } else {
                    const inserted = await dbInsert("emergencies", emergencyToRow(data));
                    if (inserted && inserted.id) {
                        data.id = inserted.id;
                    }
                }

                await saveLocalData("emergencies", emergencies);
                renderEmergencies();

                if (hasNewFiles) {
                    showToast("تم رفع الصور للسحابة بنجاح ☁️", "success");
                }
            } catch (e) {
                console.warn("فشل الرفع في الخلفية:", e);
                showToast("سيُعاد رفع الصور تلقائياً عند توفر الاتصال", "warn");
            }
        })();

    } catch (error) {
        console.error("خطأ في حفظ رخصة الطوارئ:", error);
        showToast("حدث خطأ أثناء الحفظ: " + (error && error.message ? error.message : error), "error");
    } finally {
        setSaveBusy(false);
        window._savingEmergency = false;
    }
}

function clearEmergency() {
    ["emergencyPermit", "emergencyContractor", "emergencyOwner",
     "labReceiveDate", "workStartDate", "workEndDate", "emergencyLocation"]
        .forEach(function (id) {
            setVal(id, "");
        });
    const images = document.getElementById("emergencyImages");
    if (images) {
        images.value = "";
    }
    editingEmergency = -1;
}

function renderEmergencies(data = emergencies) {

    const tbody = ensureTableHeaders("emergencyTable", [
        "رقم التصريح",
        "اسم المقاول",
        "الجهة المالكة",
        "تاريخ الاستلام بالمختبر",
        "تاريخ بداية العمل",
        "تاريخ انتهاء العمل",
        "الموقع",
        "الصور",
        "الإجراءات"
    ]);

    if (!tbody) {
        return;
    }

    tbody.innerHTML = "";

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9">لا توجد رخص طوارئ مسجلة</td></tr>';
        return;
    }

    data.forEach(function (item) {

        const originalIndex = emergencies.indexOf(item);

        let imagesHTML = "";
        if (item.images && item.images.length > 0) {
            item.images.forEach(function (img) {
                imagesHTML += imageThumb(img, "صورة رخصة الطوارئ");
            });
        } else {
            imagesHTML = "<span>لا توجد صور</span>";
        }

        tbody.innerHTML += `
            <tr>
                <td>${item.permit || ""}</td>
                <td>${item.contractor || ""}</td>
                <td>${item.owner || ""}</td>
                <td>${item.labReceive || ""}</td>
                <td>${item.start || ""}</td>
                <td>${item.end || ""}</td>
                <td>${item.location || ""}</td>
                <td>${imagesHTML}</td>
                <td>
                    <button class="edit" onclick="editEmergency(${originalIndex})">تعديل</button>
                    <button class="delete" onclick="deleteEmergency(${originalIndex})">حذف</button>
                </td>
            </tr>
        `;
    });

    resolveIdbImages();
}

function searchEmergency() {

    const input = document.getElementById("emergencySearch");
    const result = document.getElementById("emergencySearchResult");

    if (!input || !result) {
        return;
    }

    const value = input.value.trim().toLowerCase();

    if (!value) {
        result.innerHTML = '<div class="search-error">اكتب رقم رخصة الطوارئ أولاً</div>';
        renderEmergencies();
        return;
    }

    const results = emergencies.filter(function (item) {
        return String(item.permit || "").toLowerCase().includes(value);
    });

    if (results.length === 0) {
        result.innerHTML = '<div class="search-error">لم يتم العثور على رخصة بهذا الرقم</div>';
        renderEmergencies([]);
        return;
    }

    result.innerHTML = '<div class="search-success">تم العثور على ' + results.length + ' رخصة طوارئ</div>';
    renderEmergencies(results);
}

function clearEmergencySearch() {
    const input = document.getElementById("emergencySearch");
    const result = document.getElementById("emergencySearchResult");
    if (input) {
        input.value = "";
    }
    if (result) {
        result.innerHTML = "";
    }
    renderEmergencies();
}

function editEmergency(index) {

    const item = emergencies[index];
    if (!item) {
        return;
    }

    setVal("emergencyPermit", item.permit);
    setVal("emergencyContractor", item.contractor);
    setVal("emergencyOwner", item.owner);
    setVal("labReceiveDate", item.labReceive);
    setVal("workStartDate", item.start);
    setVal("workEndDate", item.end);
    setVal("emergencyLocation", item.location);

    editingEmergency = index;

    showPage("emergency");
    window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteEmergency(index) {

    if (!confirm("هل تريد حذف رخصة الطوارئ؟")) {
        return;
    }

    const item = emergencies[index];

    if (item && Array.isArray(item.images)) {
        for (const img of item.images) {
            if (isIdbRef(img)) {
                await idbDelete(idbKeyFromRef(img));
            }
        }
    }

    if (item && item.id) {
        await dbDelete("emergencies", item.id);
    }

    emergencies.splice(index, 1);
    await saveLocalData("emergencies", emergencies);

    renderEmergencies();
    updateDashboard();
    alert("تم حذف الرخصة");
}

/* =========================================================
   18) تصنيف الملاحظات
   ========================================================= */

function setNoteType(type) {

    const noteType = document.getElementById("noteType");
    if (noteType) {
        noteType.value = type;
    }

    document.querySelectorAll(".note-types button").forEach(function (button) {
        button.classList.remove("active");
    });

    document.querySelectorAll(".note-types button").forEach(function (button) {
        if (button.textContent.trim() === type) {
            button.classList.add("active");
        }
    });
}

/* =========================================================
   19) حفظ الملاحظة
   ========================================================= */

async function saveNote() {

    /* منع النقر المزدوج */
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

        if (missing.length > 0) {
            alert("يرجى تعبئة البيانات التالية:\n\n" + missing.join("\n"));
            return;
        }

        let oldNote = null;
        if (editingNote >= 0) {
            oldNote = notes[editingNote] || null;
        }

        const beforeEl = document.getElementById("beforeImage");
        const afterEl = document.getElementById("afterImage");

        const beforeFile = beforeEl && beforeEl.files.length > 0 ? beforeEl.files[0] : null;
        const afterFile = afterEl && afterEl.files.length > 0 ? afterEl.files[0] : null;

        setSaveBusy(true);

        /* 1) اقرأ الصورتين محلياً بسرعة (base64) — فوري */
        const [beforeLocal, afterLocal] = await Promise.all([
            readImageFast(beforeFile),
            readImageFast(afterFile)
        ]);

        const beforeImage = beforeLocal || (oldNote ? oldNote.before || "" : "");
        const afterImage = afterLocal || (oldNote ? oldNote.after || "" : "");

        const completed = afterImage !== "";

        const data = {
            type: type,
            date: date,
            permit: permit,
            contractor: contractor,
            owner: owner,
            reason: reason,
            action: action,
            before: beforeImage,
            after: afterImage,
            completed: completed
        };

        let oldId = null;

        if (editingNote >= 0) {
            const old = notes[editingNote] || {};
            oldId = old.id || null;
            data.id = oldId;
            notes[editingNote] = data;
            editingNote = -1;
        } else {
            notes.push(data);
        }

        /* 2) احفظ محلياً فوراً */
        await saveLocalData("notes", notes);

        /* 3) اعرض الجدول فوراً */
        clearNote();
        renderNotes();
        updateDashboard();

        /* 4) أظهر إشعار فوري */
        const hasNewFiles = beforeFile || afterFile;
        if (hasNewFiles) {
            showToast(completed ? "تم حفظ الملاحظة (معدلة) ✅\nجارٍ رفع الصور..." : "تم الحفظ ✅\nجارٍ رفع الصور...", "success");
        } else {
            showToast(completed ? "تم حفظ الملاحظة وتسجيلها كمعدلة ✅" : "تم حفظ الملاحظة ✅", "success");
        }

        /* 5) ارفع للسحابة في الخلفية */
        (async function () {
            try {
                /* ارفع الصورتين بالتوازي */
                const [beforeCloud, afterCloud] = await Promise.all([
                    beforeFile ? uploadSingleImageFast(beforeFile) : Promise.resolve(""),
                    afterFile  ? uploadSingleImageFast(afterFile)  : Promise.resolve("")
                ]);

                if (beforeFile) {
                    if (beforeCloud) {
                        data.before = beforeCloud;
                    } else {
                        /* خطة بديلة: IndexedDB */
                        const idbRef = await storeImageInIdb(beforeLocal);
                        data.before = idbRef || beforeLocal;
                    }
                }
                if (afterFile) {
                    if (afterCloud) {
                        data.after = afterCloud;
                    } else {
                        const idbRef = await storeImageInIdb(afterLocal);
                        data.after = idbRef || afterLocal;
                    }
                }

                if (oldId) {
                    const ok = await dbUpdate("notes", oldId, noteToRow(data));
                    if (!ok) {
                        const inserted = await dbInsert("notes", noteToRow(data));
                        if (inserted && inserted.id) {
                            data.id = inserted.id;
                        }
                    }
                } else {
                    const inserted = await dbInsert("notes", noteToRow(data));
                    if (inserted && inserted.id) {
                        data.id = inserted.id;
                    }
                }

                await saveLocalData("notes", notes);
                renderNotes();

                if (hasNewFiles) {
                    showToast("تم رفع الصور للسحابة بنجاح ☁️", "success");
                }
            } catch (e) {
                console.warn("فشل الرفع في الخلفية:", e);
                showToast("سيُعاد رفع الصور تلقائياً عند توفر الاتصال", "warn");
            }
        })();

    } catch (error) {
        console.error("خطأ في حفظ الملاحظة:", error);
        showToast("حدث خطأ أثناء الحفظ: " + (error && error.message ? error.message : error), "error");
    } finally {
        setSaveBusy(false);
        window._savingNote = false;
    }
}

function clearNote() {

    ["noteDate", "notePermit", "noteContractor", "noteOwner", "noteReason"]
        .forEach(function (id) {
            setVal(id, "");
        });

    const before = document.getElementById("beforeImage");
    const after = document.getElementById("afterImage");

    if (before) {
        before.value = "";
    }
    if (after) {
        after.value = "";
    }

    setVal("noteAction", DEFAULT_ACTION_TEXT);
    setVal("noteType", "مشاريع الأمانة");

    document.querySelectorAll(".note-types button").forEach(function (button) {
        button.classList.remove("active");
    });

    editingNote = -1;
}

/* =========================================================
   20) حساب الأيام والحالة
   ========================================================= */

function daysPassed(date) {
    if (!date) {
        return 0;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const noteDate = new Date(date);
    noteDate.setHours(0, 0, 0, 0);
    return Math.floor((today - noteDate) / (1000 * 60 * 60 * 24));
}

function isLate(note) {
    if (note.completed) {
        return false;
    }
    return daysPassed(note.date) >= 5;
}

/* =========================================================
   21) عرض الملاحظات
   ========================================================= */
/* =========================================================
   21) عرض الملاحظات (مصنفة في جدول واحد)
   ========================================================= */
function renderNotes() {
    const tbody = document.getElementById("notesTable");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!notes || notes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10">لا توجد ملاحظات مسجلة</td></tr>';
        return;
    }

    // ترتيب التصنيفات ليظهر كل قسم تحت الآخر
    const categories = [
        "مشاريع الأمانة",
        "المياه الوطنية",
        "الكهرباء",
        "الاتصالات",
        "مشاريع خاصة"
    ];

    // المرور على كل تصنيف لرسم ملاحظاته تحته
    categories.forEach(function (category) {

        // فلترة الملاحظات التي تنتمي لهذا التصنيف فقط
        const categoryNotes = notes.filter(function (item) {
            return (item.type || "مشاريع الأمانة") === category;
        });

        // إذا لم يكن هناك ملاحظات في هذا التصنيف، نتجاوزه
        if (categoryNotes.length === 0) return;

        // 1. رسم صف الفاصل (عنوان التصنيف)
        tbody.innerHTML += `
            <tr class="note-category-row">
                <td colspan="10" style="font-weight:bold; text-align:right; padding:12px; background:#eaf3ee; color:#1d4d3d; border-bottom:2px solid #1d4d3d; font-size:15px;">
                    📁 ${category}
                </td>
            </tr>
        `;

        // 2. رسم ملاحظات هذا التصنيف
        categoryNotes.forEach(function (item) {
            
            const index = notes.indexOf(item); // معرفة رقمه الفعلي في الذاكرة
            const late = isLate(item);

            let status = "";
            if (item.completed) {
                status = '<span class="status-done">✅ تم التعديل</span>';
            } else if (late) {
                status = '<span class="status-open">🔴 متأخرة</span>';
            } else {
                status = '<span class="status-follow">قيد المتابعة</span>';
            }

            let imagesHTML = "<span>لا توجد صور</span>";
            if (item.before || item.after) {
                imagesHTML = "";
                if (item.before) {
                    imagesHTML += `<div style="display:inline-block; text-align:center; margin:2px;"><small>قبل</small><br>${imageThumb(item.before, "صورة الملاحظة")}</div>`;
                }
                if (item.after) {
                    imagesHTML += `<div style="display:inline-block; text-align:center; margin:2px;"><small>بعد</small><br>${imageThumb(item.after, "صورة الملاحظة بعد التعديل")}</div>`;
                }
            }

            // رسم صف الملاحظة
            tbody.innerHTML += `
                <tr ${late ? 'style="background:#fff0f0;"' : ""}>
                    <td>${item.date || ""}</td>
                    <td>${item.type || "مشاريع الأمانة"}</td>
                    <td>${item.permit || ""}</td>
                    <td>${item.contractor || ""}</td>
                    <td>${item.owner || ""}</td>
                    <td>${item.reason || ""}</td>
                    <td>${item.action || ""}</td>
                    <td>${status}</td>
                    <td>${imagesHTML}</td>
                    <td>
                        <button class="edit" onclick="editNote(${index})">تعديل</button>
                        <button class="delete" onclick="deleteNote(${index})">حذف</button>
                    </td>
                </tr>
            `;
        });
    });

    // تحميل الصور المحلية إن وجدت
    if (typeof resolveIdbImages === 'function') {
        resolveIdbImages();
    }
}
function editNote(index) {

    const item = notes[index];
    if (!item) {
        return;
    }

    setVal("noteType", item.type || "مشاريع الأمانة");
    setVal("noteDate", item.date);
    setVal("notePermit", item.permit);
    setVal("noteContractor", item.contractor);
    setVal("noteOwner", item.owner);
    setVal("noteReason", item.reason);
    setVal("noteAction", item.action || DEFAULT_ACTION_TEXT);

    editingNote = index;

    setNoteType(item.type || "مشاريع الأمانة");

    showPage("notes");
    window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteNote(index) {

    if (!confirm("هل تريد حذف الملاحظة؟")) {
        return;
    }

    const item = notes[index];

    if (item) {
        if (isIdbRef(item.before)) {
            await idbDelete(idbKeyFromRef(item.before));
        }
        if (isIdbRef(item.after)) {
            await idbDelete(idbKeyFromRef(item.after));
        }
    }

    if (item && item.id) {
        await dbDelete("notes", item.id);
    }
   
    notes.splice(index, 1);
    await saveLocalData("notes", notes);

    renderNotes();
    updateDashboard();
    alert("تم حذف الملاحظة");
}

/* =========================================================
   22) التنبيهات ولوحة المتابعة
   ========================================================= */

function updateAlerts() {

    const late = notes.filter(function (note) {
        return isLate(note);
    });

    const lateCounter = document.getElementById("lateNotesCount");
    const completedCounter = document.getElementById("completedNotesCount");
    const alertsBox = document.getElementById("alerts");

    if (lateCounter) {
        lateCounter.innerText = late.length;
    }

    if (completedCounter) {
        completedCounter.innerText = notes.filter(function (note) {
            return note.completed;
        }).length;
    }

    if (!alertsBox) {
        return;
    }

    if (late.length === 0) {
        alertsBox.innerHTML = "لا توجد ملاحظات متأخرة حالياً";
        return;
    }

    alertsBox.innerHTML = "";

    late.forEach(function (note) {

        const days = daysPassed(note.date);
        const index = notes.indexOf(note);

        alertsBox.innerHTML += `
            <div class="alert-item">
                <strong>🔴 ملاحظة تجاوزت 5 أيام</strong>
                <br><br>
                تاريخ الملاحظة: ${note.date}
                <br>
                رقم التصريح: ${note.permit}
                <br>
                المقاول: ${note.contractor}
                <br>
                التصنيف: ${note.type || "مشاريع الأمانة"}
                <br>
                سبب الرفض: ${note.reason}
                <br>
                مضى على الملاحظة: <strong>${days} أيام</strong>
                <br><br>
                <button class="edit" onclick="editNote(${index})">فتح الملاحظة</button>
            </div>
        `;
    });
}

function updateDashboard() {

    const clearanceCounter = document.getElementById("clearanceCount");
    const emergencyCounter = document.getElementById("emergencyCount");

    if (clearanceCounter) {
        clearanceCounter.innerText = clearances.length;
    }
    if (emergencyCounter) {
        emergencyCounter.innerText = emergencies.length;
    }

    updateAlerts();
}

/* =========================================================
   23) ربط الأزرار تلقائياً
   ========================================================= */

function autoWireButtons() {

    const pageWiring = [
        { pageId: "clearance", save: saveClearance, clear: clearClearance, search: searchClearance, resetSearch: clearClearanceSearch },
        { pageId: "emergency", save: saveEmergency, clear: clearEmergency, search: searchEmergency, resetSearch: clearEmergencySearch },
        { pageId: "notes", save: saveNote, clear: clearNote, search: null, resetSearch: null }
    ];

    pageWiring.forEach(function (w) {

        const page = document.getElementById(w.pageId);
        if (!page) {
            return;
        }

        page.querySelectorAll("button, input[type='button'], input[type='submit']").forEach(function (btn) {

            if (btn.getAttribute("onclick") || btn.dataset.autoWired) {
                return;
            }

            const text = ((btn.innerText || btn.value || "") + "").trim();

            if (text.indexOf("حفظ") !== -1) {
                btn.dataset.autoWired = "1";
                btn.dataset.wiredSave = "1";
                btn.addEventListener("click", function (event) {
                    event.preventDefault();
                    w.save();
                });
            } else if (text.indexOf("مسح") !== -1 || text.indexOf("تفريغ") !== -1 || text.indexOf("جديد") !== -1) {
                btn.dataset.autoWired = "1";
                btn.addEventListener("click", function (event) {
                    event.preventDefault();
                    w.clear();
                });
            } else if (text.indexOf("بحث") !== -1 && w.search) {
                btn.dataset.autoWired = "1";
                btn.addEventListener("click", function (event) {
                    event.preventDefault();
                    w.search();
                });
            } else if ((text.indexOf("الكل") !== -1 || text.indexOf("إلغاء") !== -1) && w.resetSearch) {
                btn.dataset.autoWired = "1";
                btn.addEventListener("click", function (event) {
                    event.preventDefault();
                    w.resetSearch();
                });
            }
        });
    });

    const navMap = [
        { keyword: "لوحة المتابعة", page: "dashboard" },
        { keyword: "الرئيسية", page: "dashboard" },
        { keyword: "الإخلاء", page: "clearance" },
        { keyword: "الطوارئ", page: "emergency" },
        { keyword: "الملاحظات", page: "notes" }
    ];

    document.querySelectorAll("button").forEach(function (btn) {

        if (btn.getAttribute("onclick") || btn.dataset.autoWired || btn.dataset.navWired) {
            return;
        }

        const text = (btn.textContent || "").trim();

        if (
            text.indexOf("حفظ") !== -1 ||
            text.indexOf("مسح") !== -1 ||
            text.indexOf("تعديل") !== -1 ||
            text.indexOf("حذف") !== -1 ||
            text.indexOf("بحث") !== -1 ||
            text.indexOf("فتح") !== -1 ||
            text.indexOf("تصدير") !== -1
        ) {
            return;
        }

        navMap.forEach(function (m) {
            if (text.indexOf(m.keyword) !== -1 && document.getElementById(m.page)) {
                btn.dataset.navWired = "1";
                btn.addEventListener("click", function () {
                    showPage(m.page);
                });
            }
        });
    });
}

/* =========================================================
   24) أزرار التصدير تلقائياً
   ========================================================= */

function addExportButtons() {

    const configs = [
        {
            pageId: "clearance",
            buttons: [
                { text: "📥 تصدير Excel", handler: function () { exportClearancesToExcel(); } },
                { text: "📄 تصدير PDF", handler: function () { exportClearancesToPDF(this); } }
            ]
        },
        {
            pageId: "emergency",
            buttons: [
                { text: "📥 تصدير Excel", handler: function () { exportEmergenciesToExcel(); } },
                { text: "📄 تصدير PDF", handler: function () { exportEmergenciesToPDF(this); } }
            ]
        },
        {
            pageId: "notes",
            buttons: [
                { text: "📥 تصدير Excel", handler: function () { exportNotesToExcel(); } },
                { text: "📄 تصدير PDF", handler: function () { exportNotesToPDF(this); } }
            ]
        }
    ];

    configs.forEach(function (cfg) {

        const page = document.getElementById(cfg.pageId);
        if (!page) {
            return;
        }

        let exists = false;
        page.querySelectorAll("button").forEach(function (btn) {
            const content = (btn.getAttribute("onclick") || "") + (btn.textContent || "");
            if (content.indexOf("export") !== -1 || content.indexOf("تصدير") !== -1) {
                exists = true;
            }
        });
        if (exists) {
            return;
        }

        const bar = document.createElement("div");
        bar.style.cssText =
            "display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;padding:10px;" +
            "background:#f4f7f5;border-radius:10px;";

        cfg.buttons.forEach(function (b) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.innerText = b.text;
            btn.style.cssText =
                "background:#173f32;color:#ffffff;border:none;padding:9px 18px;" +
                "border-radius:8px;cursor:pointer;font-size:14px;font-family:inherit;";
            btn.addEventListener("click", b.handler);
            bar.appendChild(btn);
        });

        page.insertBefore(bar, page.firstChild);
    });
}

/* =========================================================
   25) التشغيل عند فتح الصفحة
   ========================================================= */

document.addEventListener("DOMContentLoaded", function () {

    initSupabase();

    const clearanceSearch = document.getElementById("clearanceSearch");
    if (clearanceSearch) {
        clearanceSearch.addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
                searchClearance();
            }
        });
    }

    const emergencySearch = document.getElementById("emergencySearch");
    if (emergencySearch) {
        emergencySearch.addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
                searchEmergency();
            }
        });
    }

    const actionEl = document.getElementById("noteAction");
    if (actionEl && !actionEl.value.trim()) {
        actionEl.value = DEFAULT_ACTION_TEXT;
    }

    autoWireButtons();
    addExportButtons();

    renderClearances();
    renderEmergencies();
    renderNotes();
    updateDashboard();

    setNoteType("مشاريع الأمانة");

    if (!document.querySelector(".page.active")) {
        const firstPage = document.querySelector(".page");
        if (firstPage) {
            firstPage.classList.add("active");
        }
    }

    /* تسلسل النقل الآمن:
       1) نقل الصور الموجودة من localStorage إلى المخزن الكبير (يحرر المساحة فوراً — بدون حذف)
       2) مزامنة البيانات مع السحابة
       3) رفع صور المخزن الكبير إلى السحابة في الخلفية */
    initialImageMigration()
        .then(function () {
            return syncFromCloud();
        })
        .then(function () {
            return initialImageMigration(); /* معالجة أي Base64 قادم من السحابة */
        })
        .then(function () {
            return migrateIdbImagesToCloud();
        });
});

setInterval(updateAlerts, 60 * 60 * 1000);

/* =========================================================
   =========================================================
   تصدير Excel و PDF (يدعم صور المخزن الكبير)
   =========================================================
   ========================================================= */

/* بدائل محلية للمكتبات الخارجية - تعمل بدون إنترنت */
window.XLSX = {
    utils: {
        json_to_sheet: function(d) { return d || []; },
        book_new: function() { return {Sheets:{}, SheetNames:[], _data:[]}; },
        book_append_sheet: function(wb, ws, n) { wb.Sheets[n]=ws; wb.SheetNames.push(n); wb._data=ws; }
    },
    writeFile: function(wb, fn) {
        var csv = '\uFEFF';
        if (wb._data && wb._data.length) {
            var keys = Object.keys(wb._data[0]);
            csv += keys.join(',') + '\n';
            wb._data.forEach(function(r) {
                csv += keys.map(function(k) { return '"' + String(r[k]||'').replace(/"/g,'""') + '"'; }).join(',') + '\n';
            });
        }
        var blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = fn.replace('.xlsx','.csv');
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
};

window.html2pdf = function() {
    return { set:function(){return this;}, from:function(){return this;}, save:function(){return Promise.resolve();} };
};

function exportDate() {
    var d = new Date();
    var day = ("0" + d.getDate()).slice(-2);
    var month = ("0" + (d.getMonth() + 1)).slice(-2);
    return d.getFullYear() + "-" + month + "-" + day;
}

function noteStatusText(item) {
    if (item.completed) {
        return "تم التعديل";
    }
    if (isLate(item)) {
        return "متأخرة";
    }
    return "قيد المتابعة";
}
    if (isIdbRef(ref)) {
        return await idbGet(idbKeyFromRef(ref)) || "";
    }
    return ref || "";
}

async function resolveExportItems(items) {
    const out = [];
    for (const item of items) {
        const copy = Object.assign({}, item);
        if (Array.isArray(copy.images)) {
            const imgs = [];
            for (const img of copy.images) {
                imgs.push(await resolveImageForExport(img));
            }
            copy.images = imgs;
        }
        if (copy.before) {
            copy.before = await resolveImageForExport(copy.before);
        }
        if (copy.after) {
            copy.after = await resolveImageForExport(copy.after);
        }
        out.push(copy);
    }
    return out;
}
var PDF_TH = "padding:8px;border:1px solid #999;background:#173f32;color:#ffffff;font-size:12px;text-align:center;";
var PDF_TD = "padding:6px 8px;border:1px solid #999;font-size:12px;";
var PDF_TD_CENTER = "padding:6px 8px;border:1px solid #999;font-size:12px;text-align:center;";

function pdfReportHeader(title, info) {
    return `
        <div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;">
            <div style="text-align:center;border-bottom:3px solid #173f32;padding-bottom:8px;margin-bottom:12px;">
                <h2 style="color:#173f32;margin:0;">نظام مختبر جودة المشاريع</h2>
                <h3 style="color:#333;margin:8px 0 4px;">${title}</h3>
                <p style="color:#666;margin:0;font-size:12px;">${info} &nbsp;|&nbsp; تاريخ التقرير: ${exportDate()}</p>
            </div>
    `;
}

function generatePDFFromHTML(content, filename, orientation, btn) {
    if (btn) {
        btn.disabled = true;
        btn.setAttribute("data-old-text", btn.innerText);
        btn.innerText = "جاري الإنشاء...";
    }
    var element = document.createElement("div");
    element.innerHTML = content;
    html2pdf().set({
        margin: 10,
        filename: filename,
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: orientation || "landscape" },
        pagebreak: { mode: ["css", "legacy"], avoid: ["tr", ".pdf-avoid-break"] }
    }).from(element).save().then(function () {
        if (btn) {
            btn.disabled = false;
            btn.innerText = btn.getAttribute("data-old-text");
        }
    }).catch(function () {
        if (btn) {
            btn.disabled = false;
            btn.innerText = btn.getAttribute("data-old-text");
        }
        alert("حدث خطأ أثناء إنشاء ملف PDF، حاول مرة أخرى");
    });
}

function downloadExcel(rows, sheetName, cols, filename) {
    var ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = cols;
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    if (!wb.Workbook) {
        wb.Workbook = {};
    }
    if (!wb.Workbook.Views) {
        wb.Workbook.Views = [];
    }
    wb.Workbook.Views.push({ RTL: true });
    XLSX.writeFile(wb, filename);
}

/* ===== رخص الإخلاء - Excel ===== */
function exportClearancesToExcel() {
    if (typeof XLSX === "undefined") {
        alert("جاري تحميل مكتبة Excel...\nانتظر ثانية واحدة ثم اضغط الزر مرة أخرى");
        return;
    }
    if (clearances.length === 0) {
        alert("لا توجد رخص إخلاء للتصدير");
        return;
    }
    var rows = clearances.map(function (item, index) {
        return {
            "م": index + 1,
            "رقم التصريح": item.permit || "",
            "اسم المقاول": item.contractor || "",
            "الجهة المالكة": item.owner || "",
            "الموقع": item.location || "",
            "عدد الصور": (item.images || []).length
        };
    });
    downloadExcel(
        rows,
        "رخص الإخلاء",
        [{ wch: 5 }, { wch: 18 }, { wch: 28 }, { wch: 28 }, { wch: 32 }, { wch: 10 }],
        "رخص_الإخلاء_" + exportDate() + ".xlsx"
    );
}

/* ===== رخص الإخلاء - PDF ===== */
async function exportClearancesToPDF(btn) {
    if (typeof html2pdf === "undefined") {
        alert("جاري تحميل مكتبة PDF...\nانتظر ثانية واحدة ثم اضغط الزر مرة أخرى");
        return;
    }
    if (clearances.length === 0) {
        alert("لا توجد رخص إخلاء للتصدير");
        return;
    }

    var data = await resolveExportItems(clearances);
    var rows = "";

    data.forEach(function (item, index) {
        var imagesHTML = "";
        (item.images || []).forEach(function (img) {
            if (img) {
                imagesHTML += '<img src="' + img + '" style="width:60px;height:60px;object-fit:cover;border-radius:4px;margin:2px;">';
            }
        });
        if (!imagesHTML) {
            imagesHTML = '<span style="color:#999;font-size:11px;">لا توجد صور</span>';
        }
        rows += `
            <tr>
                <td style="${PDF_TD_CENTER}">${index + 1}</td>
                <td style="${PDF_TD}">${item.permit || ""}</td>
                <td style="${PDF_TD}">${item.contractor || ""}</td>
                <td style="${PDF_TD}">${item.owner || ""}</td>
                <td style="${PDF_TD}">${item.location || ""}</td>
                <td style="${PDF_TD}">${imagesHTML}</td>
            </tr>
        `;
    });

    var content = pdfReportHeader("تقرير رخص الإخلاء", "إجمالي الرخص: " + clearances.length) + `
        <table style="width:100%;border-collapse:collapse;">
            <thead>
                <tr>
                    <th style="${PDF_TH}">م</th>
                    <th style="${PDF_TH}">رقم التصريح</th>
                    <th style="${PDF_TH}">اسم المقاول</th>
                    <th style="${PDF_TH}">الجهة المالكة</th>
                    <th style="${PDF_TH}">الموقع</th>
                    <th style="${PDF_TH}">الصور</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
        <p style="text-align:center;color:#999;font-size:11px;margin-top:15px;">تم إنشاء التقرير بواسطة نظام مختبر جودة المشاريع</p>
        </div>
    `;

    generatePDFFromHTML(content, "رخص_الإخلاء_" + exportDate() + ".pdf", "landscape", btn);
}

/* ===== رخص الطوارئ - Excel ===== */
function exportEmergenciesToExcel() {
    if (typeof XLSX === "undefined") {
        alert("جاري تحميل مكتبة Excel...\nانتظر ثانية واحدة ثم اضغط الزر مرة أخرى");
        return;
    }
    if (emergencies.length === 0) {
        alert("لا توجد رخص طوارئ للتصدير");
        return;
    }
    var rows = emergencies.map(function (item, index) {
        return {
            "م": index + 1,
            "رقم التصريح": item.permit || "",
            "اسم المقاول": item.contractor || "",
            "الجهة المالكة": item.owner || "",
            "تاريخ الاستلام بالمختبر": item.labReceive || "",
            "تاريخ بداية العمل": item.start || "",
            "تاريخ انتهاء العمل": item.end || "",
            "الموقع": item.location || "",
            "عدد الصور": (item.images || []).length
        };
    });
    downloadExcel(
        rows,
        "رخص الطوارئ",
        [{ wch: 5 }, { wch: 18 }, { wch: 25 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 30 }, { wch: 10 }],
        "رخص_الطوارئ_" + exportDate() + ".xlsx"
    );
}

/* ===== رخص الطوارئ - PDF ===== */
async function exportEmergenciesToPDF(btn) {
    if (typeof html2pdf === "undefined") {
        alert("جاري تحميل مكتبة PDF...\nانتظر ثانية واحدة ثم اضغط الزر مرة أخرى");
        return;
    }
    if (emergencies.length === 0) {
        alert("لا توجد رخص طوارئ للتصدير");
        return;
    }

    var data = await resolveExportItems(emergencies);
    var rows = "";

    data.forEach(function (item, index) {
        var imagesHTML = "";
        (item.images || []).forEach(function (img) {
            if (img) {
                imagesHTML += '<img src="' + img + '" style="width:60px;height:60px;object-fit:cover;border-radius:4px;margin:2px;">';
            }
        });
        if (!imagesHTML) {
            imagesHTML = '<span style="color:#999;font-size:11px;">لا توجد صور</span>';
        }
        rows += `
            <tr>
                <td style="${PDF_TD_CENTER}">${index + 1}</td>
                <td style="${PDF_TD}">${item.permit || ""}</td>
                <td style="${PDF_TD}">${item.contractor || ""}</td>
                <td style="${PDF_TD}">${item.owner || ""}</td>
                <td style="${PDF_TD_CENTER}">${item.labReceive || ""}</td>
                <td style="${PDF_TD_CENTER}">${item.start || ""}</td>
                <td style="${PDF_TD_CENTER}">${item.end || ""}</td>
                <td style="${PDF_TD}">${item.location || ""}</td>
                <td style="${PDF_TD}">${imagesHTML}</td>
            </tr>
        `;
    });

    var content = pdfReportHeader("تقرير رخص الطوارئ", "إجمالي الرخص: " + emergencies.length) + `
        <table style="width:100%;border-collapse:collapse;">
            <thead>
                <tr>
                    <th style="${PDF_TH}">م</th>
                    <th style="${PDF_TH}">رقم التصريح</th>
                    <th style="${PDF_TH}">اسم المقاول</th>
                    <th style="${PDF_TH}">الجهة المالكة</th>
                    <th style="${PDF_TH}">تاريخ الاستلام</th>
                    <th style="${PDF_TH}">بداية العمل</th>
                    <th style="${PDF_TH}">انتهاء العمل</th>
                    <th style="${PDF_TH}">الموقع</th>
                    <th style="${PDF_TH}">الصور</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
        <p style="text-align:center;color:#999;font-size:11px;margin-top:15px;">تم إنشاء التقرير بواسطة نظام مختبر جودة المشاريع</p>
        </div>
    `;
   
    generatePDFFromHTML(content, "رخص_الطوارئ_" + exportDate() + ".pdf", "landscape", btn);
}

/* ===== الملاحظات - Excel ===== */
function exportNotesToExcel() {
    if (typeof XLSX === "undefined") {
        alert("جاري تحميل مكتبة Excel...\nانتظر ثانية واحدة ثم اضغط الزر مرة أخرى");
        return;
    }
    if (notes.length === 0) {
        alert("لا توجد ملاحظات للتصدير");
        return;
    }
    var rows = notes.map(function (item, index) {
        return {
            "م": index + 1,
            "التصنيف": item.type || "مشاريع الأمانة",
            "التاريخ": item.date || "",
            "رقم التصريح": item.permit || "",
            "اسم المقاول": item.contractor || "",
            "الجهة المالكة": item.owner || "",
            "أسباب الرفض": item.reason || "",
            "الإجراء المتخذ": item.action || "",
            "الحالة": noteStatusText(item)
        };
    });
    downloadExcel(
        rows,
        "الملاحظات",
        [{ wch: 5 }, { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 25 }, { wch: 25 }, { wch: 30 }, { wch: 30 }, { wch: 14 }],
        "الملاحظات_" + exportDate() + ".xlsx"
    );
}

/* ===== الملاحظات - PDF ===== */
async function exportNotesToPDF(btn) {
    if (typeof html2pdf === "undefined") {
        alert("جاري تحميل مكتبة PDF...\nانتظر ثانية واحدة ثم اضغط الزر مرة أخرى");
        return;
    }
    if (notes.length === 0) {
        alert("لا توجد ملاحظات للتصدير");
        return;
    }

    var lateCount = 0;
    notes.forEach(function (item) {
        if (isLate(item)) {
            lateCount++;
        }
    });

    var data = await resolveExportItems(notes);
    var rows = "";

    data.forEach(function (item, index) {

        var imagesHTML = "";
        if (item.before) {
            imagesHTML += '<div style="text-align:center;"><small>قبل</small><br><img src="' + item.before + '" style="width:60px;height:60px;object-fit:cover;border-radius:4px;margin:2px;"></div>';
        }
        if (item.after) {
            imagesHTML += '<div style="text-align:center;"><small>بعد</small><br><img src="' + item.after + '" style="width:60px;height:60px;object-fit:cover;border-radius:4px;margin:2px;"></div>';
        }
        if (!imagesHTML) {
            imagesHTML = '<span style="color:#999;font-size:11px;">لا توجد صور</span>';
        }

        rows += `
            <tr>
                <td style="${PDF_TD_CENTER}">${index + 1}</td>
                <td style="${PDF_TD}">${item.type || "مشاريع الأمانة"}</td>
                <td style="${PDF_TD_CENTER}">${item.date || ""}</td>
                <td style="${PDF_TD}">${item.permit || ""}</td>
                <td style="${PDF_TD}">${item.contractor || ""}</td>
                <td style="${PDF_TD}">${item.owner || ""}</td>
                <td style="${PDF_TD}">${item.reason || ""}</td>
                <td style="${PDF_TD}">${item.action || ""}</td>
                <td style="${PDF_TD_CENTER}">${noteStatusText(item)}</td>
                <td style="${PDF_TD}">${imagesHTML}</td>
            </tr>
        `;
    });

    var content = pdfReportHeader(
        "تقرير الملاحظات",
        "إجمالي الملاحظات: " + notes.length + " | المتأخرة: " + lateCount
    ) + `
        <table style="width:100%;border-collapse:collapse;">
            <thead>
                <tr>
                    <th style="${PDF_TH}">م</th>
                    <th style="${PDF_TH}">التصنيف</th>
                    <th style="${PDF_TH}">التاريخ</th>
                    <th style="${PDF_TH}">رقم التصريح</th>
                    <th style="${PDF_TH}">اسم المقاول</th>
                    <th style="${PDF_TH}">الجهة المالكة</th>
                    <th style="${PDF_TH}">أسباب الرفض</th>
                    <th style="${PDF_TH}">الإجراء المتخذ</th>
                    <th style="${PDF_TH}">الحالة</th>
                    <th style="${PDF_TH}">الصور</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
        <p style="text-align:center;color:#999;font-size:11px;margin-top:15px;">تم إنشاء التقرير بواسطة نظام مختبر جودة المشاريع</p>
        </div>
    `;

    generatePDFFromHTML(content, "الملاحظات_" + exportDate() + ".pdf", "landscape", btn);
}
/* =========================================================
   نظام دخول الموظفين — بالاسم فقط بدون بريد إلكتروني
   ========================================================= */

/* كلمة المرور المشتركة — المدير يغيّرها من هذا السطر فقط */
const LAB_LOGIN_PASSWORD = "lab2026";

let currentUserName = localStorage.getItem("labUserName") || "";

function createLoginScreen() {

    const old = document.getElementById("loginScreen");
    if (old) old.remove();

    const screen = document.createElement("div");
    screen.id = "loginScreen";
    screen.style.cssText =
        "position:fixed;inset:0;z-index:999999;" +
        "background:linear-gradient(135deg,#173f32,#0d241c);" +
        "display:flex;justify-content:center;align-items:center;" +
        "font-family:inherit;direction:rtl;";

    screen.innerHTML = `
        <div style="background:#fff;border-radius:16px;padding:35px;width:90%;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,.4);">
            <div style="text-align:center;margin-bottom:25px;">
                <h2 style="color:#173f32;margin:10px 0 5px;">نظام مختبر جودة المشاريع</h2>
                <p style="color:#666;font-size:14px;margin:0;">أدخل اسمك للمتابعة</p>
            </div>
            <div style="margin-bottom:15px;">
                <label style="display:block;font-size:13px;color:#333;margin-bottom:5px;">الاسم الكامل</label>
                <input type="text" id="loginName" placeholder="اكتب اسمك هنا"
                    style="width:100%;padding:12px;border:2px solid #ddd;border-radius:8px;font-size:15px;box-sizing:border-box;text-align:right;">
            </div>
            <div style="margin-bottom:20px;">
                <label style="display:block;font-size:13px;color:#333;margin-bottom:5px;">كلمة المرور</label>
                <input type="password" id="loginPassword" placeholder="كلمة مرور المختبر"
                    style="width:100%;padding:12px;border:2px solid #ddd;border-radius:8px;font-size:15px;box-sizing:border-box;">
            </div>
            <div id="loginError" style="color:#c0392b;font-size:13px;text-align:center;margin-bottom:15px;display:none;"></div>
            <button id="loginBtn" onclick="doLogin()"
                style="width:100%;background:#173f32;color:#fff;border:none;padding:14px;border-radius:8px;font-size:16px;cursor:pointer;font-family:inherit;">
                دخول
            </button>
        </div>
    `;

    document.body.appendChild(screen);

    document.getElementById("loginPassword").addEventListener("keydown", function (e) {
        if (e.key === "Enter") doLogin();
    });
    document.getElementById("loginName").addEventListener("keydown", function (e) {
        if (e.key === "Enter") document.getElementById("loginPassword").focus();
    });
}

function doLogin() {

    const name = document.getElementById("loginName").value.trim();
    const password = document.getElementById("loginPassword").value;
    const errorEl = document.getElementById("loginError");

    if (!name) {
        errorEl.textContent = "يرجى كتابة اسمك أولاً";
        errorEl.style.display = "block";
        return;
    }

    if (password !== LAB_LOGIN_PASSWORD) {
        errorEl.textContent = "كلمة المرور غير صحيحة";
        errorEl.style.display = "block";
        return;
    }

    currentUserName = name;
    localStorage.setItem("labUserName", name);

    removeLoginScreen();
    showUserBadge();
}

function removeLoginScreen() {
    const screen = document.getElementById("loginScreen");
    if (screen) screen.remove();
}

function showUserBadge() {

    const old = document.getElementById("userBadge");
    if (old) old.remove();

    const badge = document.createElement("div");
    badge.id = "userBadge";
    badge.style.cssText =
        "position:fixed;top:10px;left:10px;z-index:99998;" +
        "background:#173f32;color:#fff;padding:8px 14px;" +
        "border-radius:20px;font-size:13px;font-family:inherit;" +
        "display:flex;align-items:center;gap:10px;direction:rtl;" +
        "box-shadow:0 2px 8px rgba(0,0,0,.3);";

    badge.innerHTML = `
        <span>👤 ${currentUserName}</span>
        <button onclick="doLogout()" style="background:#c0392b;color:#fff;border:none;padding:4px 10px;border-radius:12px;cursor:pointer;font-size:11px;font-family:inherit;">
            خروج
        </button>
    `;

    document.body.appendChild(badge);
}

function doLogout() {

    if (!confirm("هل تريد تسجيل الخروج؟")) return;

    localStorage.removeItem("labUserName");
    currentUserName = "";

    const badge = document.getElementById("userBadge");
    if (badge) badge.remove();

    createLoginScreen();
}

document.addEventListener("DOMContentLoaded", function () {
    if (currentUserName) {
        showUserBadge();
    } else {
        createLoginScreen();
    }
});
/* =========================================================
   إصلاح عرض الصور — يُلصق في آخر الملف
   هذه النسخ تتجاوز أي نسخ قديمة أو معطوبة
   ========================================================= */

function openImageDB() {
    if (window.__labIdbPromise) {
        return window.__labIdbPromise;
    }
    window.__labIdbPromise = new Promise(function (resolve) {
        try {
            const req = indexedDB.open("labImagesDB", 1);
            req.onupgradeneeded = function (e) {
                const db = e.target.result;
                if (!db.objectStoreNames.contains("images")) {
                    db.createObjectStore("images");
                }
            };
            req.onsuccess = function (e) {
                resolve(e.target.result);
            };
            req.onerror = function () {
                resolve(null);
            };
        } catch (e) {
            resolve(null);
        }
    });
    return window.__labIdbPromise;
}

async function idbPut(key, dataUrl) {
    const db = await openImageDB();
    if (!db) return false;
    return new Promise(function (resolve) {
        try {
            const tx = db.transaction("images", "readwrite");
            tx.objectStore("images").put(dataUrl, key);
            tx.oncomplete = function () { resolve(true); };
            tx.onerror = function () { resolve(false); };
        } catch (e) {
            resolve(false);
        }
    });
}

async function idbGet(key) {
    const db = await openImageDB();
    if (!db) return null;
    return new Promise(function (resolve) {
        try {
            const tx = db.transaction("images", "readonly");
            const req = tx.objectStore("images").get(key);
            req.onsuccess = function () { resolve(req.result || null); };
            req.onerror = function () { resolve(null); };
        } catch (e) {
            resolve(null);
        }
    });
}

async function idbDelete(key) {
    const db = await openImageDB();
    if (!db) return;
    return new Promise(function (resolve) {
        try {
            const tx = db.transaction("images", "readwrite");
            tx.objectStore("images").delete(key);
            tx.oncomplete = function () { resolve(true); };
            tx.onerror = function () { resolve(false); };
        } catch (e) {
            resolve(false);
        }
    });
}

function newImageRef() {
    return "idb://img_" + Date.now() + "_" +
        Math.random().toString(36).substring(2, 10);
}

function isIdbRef(value) {
    return typeof value === "string" && value.indexOf("idb://") === 0;
}

function idbKeyFromRef(ref) {
    return ref.substring(6);
}

async function storeImageInIdb(dataUrl) {
    const ref = newImageRef();
    const ok = await idbPut(idbKeyFromRef(ref), dataUrl);
    return ok ? ref : "";
}

function blobToDataUrl(blob) {
    return new Promise(function (resolve) {
        const reader = new FileReader();
        reader.onload = function () { resolve(reader.result); };
        reader.onerror = function () { resolve(""); };
        reader.readAsDataURL(blob);
    });
}

function imageThumb(image, title) {
    title = title || "عرض الصورة";
    if (!image) {
        return "<span>لا توجد صورة</span>";
    }
    if (isIdbRef(image)) {
        return '<img data-idb="' + image + '" alt="' + title + '" title="' + title +
            '" onclick="openImageRef(this)" ' +
            'style="width:70px;height:70px;object-fit:cover;border-radius:8px;cursor:pointer;margin:3px;background:#eee;">';
    }
    return '<img src="' + image + '" alt="' + title + '" title="' + title +
        '" onclick="openImage(this.src)" ' +
        'style="width:70px;height:70px;object-fit:cover;border-radius:8px;cursor:pointer;margin:3px;">';
}

async function resolveIdbImages() {
    const imgs = document.querySelectorAll("img[data-idb]");
    for (let i = 0; i < imgs.length; i++) {
        const img = imgs[i];
        if (img.getAttribute("data-loaded")) continue;
        const ref = img.getAttribute("data-idb");
        const data = await idbGet(idbKeyFromRef(ref));
        if (data) {
            img.src = data;
            img.setAttribute("data-loaded", "1");
        }
    }
}

async function openImageRef(imgEl) {
    let src = imgEl.getAttribute("src") || "";
    if (!imgEl.getAttribute("data-loaded")) {
        const ref = imgEl.getAttribute("data-idb");
        if (ref) {
            src = (await idbGet(idbKeyFromRef(ref))) || src;
        }
    }
    if (src) openImage(src);
}

function openImage(image) {
    const w = window.open("", "_blank");
    if (!w) {
        alert("يرجى السماح بفتح النوافذ المنبثقة");
        return;
    }
    w.document.write(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>عرض الصورة</title>
            <style>
                body {margin:0;background:#173f32;display:flex;justify-content:center;align-items:center;min-height:100vh;}
                img {max-width:95%;max-height:95vh;object-fit:contain;border-radius:12px;}
            </style>
        </head>
        <body>
            <img src="${image}">
        </body>
        </html>
    `);
}

/* ===== إصلاح ظهور الصور في ملف PDF ===== */

function loadImageAsDataUrl(url) {
    return new Promise(function (resolve) {
        try {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = function () {
                try {
                    const canvas = document.createElement("canvas");
                    const maxDim = 900;
                    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
                    canvas.width = Math.round(img.naturalWidth * scale);
                    canvas.height = Math.round(img.naturalHeight * scale);
                    const ctx = canvas.getContext("2d");
                    ctx.fillStyle = "#ffffff";
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL("image/jpeg", 0.85));
                } catch (e) {
                    resolve("");
                }
            };
            img.onerror = function () {
                resolve("");
            };
            img.src = url;
        } catch (e) {
            resolve("");
        }
    });
}

async function resolveImageForExport(ref) {
    try {
        if (!ref) return "";

        if (isIdbRef(ref)) {
            return await idbGet(idbKeyFromRef(ref)) || "";
        }

        if (ref.indexOf("data:") === 0) {
            return ref;
        }

        try {
            const res = await fetch(ref);
            if (res.ok) {
                const blob = await res.blob();
                const dataUrl = await blobToDataUrl(blob);
                if (dataUrl) return dataUrl;
            }
        } catch (e1) {
        }

        return await loadImageAsDataUrl(ref);

    } catch (e) {
        return "";
    }
}

async function resolveExportItems(items) {

    const out = [];

    for (const item of items) {
        const copy = Object.assign({}, item);

        if (Array.isArray(copy.images)) {
            const imgs = [];
            for (const img of copy.images) {
                imgs.push(await resolveImageForExport(img));
            }
            copy.images = imgs;
        }

        if (copy.before) {
            copy.before = await resolveImageForExport(copy.before);
        }

        if (copy.after) {
            copy.after = await resolveImageForExport(copy.after);
        }

        out.push(copy);
    }

    return out;
}
/* =========================================================
   الإكمال التلقائي — يقترح الأسماء المدخلة سابقاً
   الصق هذا الكود في آخر ملف script.js
   ========================================================= */
/* =========================================================
   الإكمال التلقائي — النسخة المصححة
   النقر يعمل + الأرقام تعمل + لوحة المفاتيح مدعومة
   ========================================================= */

(function () {

    let activeList = null;
    let activeInput = null;

    const AUTOCOMPLETE_FIELDS = [
        { id: "clearanceContractor", source: "contractor" },
        { id: "clearanceOwner", source: "owner" },
        { id: "clearanceLocation", source: "location" },
        { id: "emergencyContractor", source: "contractor" },
        { id: "emergencyOwner", source: "owner" },
        { id: "emergencyLocation", source: "location" },
        { id: "noteContractor", source: "contractor" },
        { id: "noteOwner", source: "owner" }
    ];

    function collectSuggestions(source) {

        const values = new Set();

        clearances.forEach(function (item) {
            if (source === "contractor" && item.contractor) values.add(item.contractor);
            if (source === "owner" && item.owner) values.add(item.owner);
            if (source === "location" && item.location) values.add(item.location);
        });

        emergencies.forEach(function (item) {
            if (source === "contractor" && item.contractor) values.add(item.contractor);
            if (source === "owner" && item.owner) values.add(item.owner);
            if (source === "location" && item.location) values.add(item.location);
        });

        notes.forEach(function (item) {
            if (source === "contractor" && item.contractor) values.add(item.contractor);
            if (source === "owner" && item.owner) values.add(item.owner);
        });

        return Array.from(values).sort();
    }

    function matches(value, typed) {
        try {
            const v = String(value).toLowerCase();
            const t = String(typed).toLowerCase();
            return t.length > 0 && v.indexOf(t) !== -1;
        } catch (e) {
            return false;
        }
    }

    function closeList() {
        if (activeList) {
            activeList.remove();
            activeList = null;
            activeInput = null;
        }
    }

    /* استخدام mousedown بدل click — يعمل قبل blur
       وهذا يمنع اختفاء القائمة قبل النقر */
    function applyChoice(inputEl, value) {
        inputEl.value = value;
        closeList();
        inputEl.focus();

        /* إطلاق حدث input حتى تعمل أي معالجات أخرى */
        try {
            inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        } catch (e) { }
    }

    function createDropdown(inputEl, items) {

        closeList();

        if (!items || items.length === 0) {
            return;
        }

        const list = document.createElement("div");
        list.style.cssText =
            "position:absolute;z-index:100000;background:#fff;border:2px solid #173f32;" +
            "border-radius:8px;max-height:220px;overflow-y:auto;" +
            "box-shadow:0 8px 25px rgba(0,0,0,.25);direction:rtl;font-family:inherit;";

        items.forEach(function (item, index) {

            const option = document.createElement("div");
            option.textContent = item;
            option.style.cssText =
                "padding:10px 14px;cursor:pointer;font-size:14px;" +
                "border-bottom:1px solid #eee;user-select:none;";

            option.addEventListener("mouseenter", function () {
                option.style.background = "#e8f2ee";
            });
            option.addEventListener("mouseleave", function () {
                option.style.background = "#fff";
            });

            /* mousedown هو الحل الجوهري — يُنفذ قبل blur */
            option.addEventListener("mousedown", function (e) {
                e.preventDefault();
                applyChoice(inputEl, item);
            });

            list.appendChild(option);
        });

        document.body.appendChild(list);

        const rect = inputEl.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

        list.style.top = (rect.bottom + scrollTop + 4) + "px";
        list.style.left = (rect.left + scrollLeft) + "px";
        list.style.width = Math.max(rect.width, 220) + "px";

        activeList = list;
        activeInput = inputEl;
    }

    function setupField(config) {

        const inputEl = document.getElementById(config.id);
        if (!inputEl) return;

        let debounceTimer = null;

        /* keydown: الأسهم + Enter + Escape */
        inputEl.addEventListener("keydown", function (e) {

            if (!activeList || activeInput !== inputEl) {
                return;
            }

            const options = activeList.querySelectorAll("div");
            let current = -1;

            options.forEach(function (opt, i) {
                if (opt.style.background === "rgb(232, 242, 238)") {
                    current = i;
                }
            });

            if (e.key === "ArrowDown") {
                e.preventDefault();
                const next = (current + 1) % options.length;
                options.forEach(function (o) { o.style.background = "#fff"; });
                if (options[next]) {
                    options[next].style.background = "#e8f2ee";
                    options[next].scrollIntoView({ block: "nearest" });
                }
                return;
            }

            if (e.key === "ArrowUp") {
                e.preventDefault();
                const prev = (current - 1 + options.length) % options.length;
                options.forEach(function (o) { o.style.background = "#fff"; });
                if (options[prev]) {
                    options[prev].style.background = "#e8f2ee";
                    options[prev].scrollIntoView({ block: "nearest" });
                }
                return;
            }

            if (e.key === "Enter") {
                if (current >= 0 && options[current]) {
                    e.preventDefault();
                    applyChoice(inputEl, options[current].textContent);
                }
                return;
            }

            if (e.key === "Escape") {
                closeList();
                return;
            }
        });

        /* input: كل كتابة عادية — حروف وأرقام عادية ومن لوحة الأرقام */
        inputEl.addEventListener("input", function () {

            clearTimeout(debounceTimer);

            debounceTimer = setTimeout(function () {

                const typed = inputEl.value.trim();

                if (typed.length === 0) {
                    closeList();
                    return;
                }

                const all = collectSuggestions(config.source);
                const filtered = all.filter(function (v) {
                    return matches(v, typed);
                }).slice(0, 15);

                createDropdown(inputEl, filtered);

            }, 120);
        });

        /* blur بتأخير أطول حتى يلحق mousedown بالنقر */
        inputEl.addEventListener("blur", function () {
            setTimeout(function () {
                if (activeInput === inputEl) {
                    closeList();
                }
            }, 300);
        });
    }

    /* إغلاق القائمة عند النقر خارجها */
    document.addEventListener("mousedown", function (e) {
        if (activeList && !activeList.contains(e.target) && e.target !== activeInput) {
            closeList();
        }
    });

    function initAutocomplete() {
        AUTOCOMPLETE_FIELDS.forEach(function (config) {
            setupField(config);
        });
    }

    document.addEventListener("DOMContentLoaded", initAutocomplete);
})();
// =========================================================
// كود صفحة تصنيف المقاولين (مستقل تماماً ولا يؤثر على أي أزرار)
// =========================================================

var barChartInstance = null;
var pieChartInstance = null;

// 1. دالة التنقل الخاصة بصفحة التصنيف فقط
function goToPerformance() {
    var pages = document.querySelectorAll('.page');
    for (var i = 0; i < pages.length; i++) {
        pages[i].classList.remove('active');
    }
    var perfPage = document.getElementById('performance');
    if (perfPage) {
        perfPage.classList.add('active');
    }
    renderPerformanceData();
}

// 2. دالة جمع البيانات ورسم الجدول والمخططات
function renderPerformanceData() {
    var tbody = document.getElementById("performanceTableBody");
    if (!tbody) return; // نخرج إذا لم نكن في الصفحة

    // التأكد من تحميل المكتبة والبيانات
    if (typeof Chart === 'undefined' || typeof clearances === 'undefined' || typeof emergencies === 'undefined' || typeof notes === 'undefined') {
        setTimeout(renderPerformanceData, 1000); // نحاول مرة أخرى بعد ثانية
        return;
    }

    var contractorStats = {};

    // دمج التصاريح
    var allPermits = clearances.concat(emergencies);
    allPermits.forEach(function(p) {
        var name = (p.contractor || "غير معروف").trim();
        if (name) {
            if (!contractorStats[name]) contractorStats[name] = { permits: 0, notes: 0 };
            contractorStats[name].permits++;
        }
    });

    // دمج الملاحظات
    notes.forEach(function(n) {
        var name = (n.contractor || "غير معروف").trim();
        if (name) {
            if (!contractorStats[name]) contractorStats[name] = { permits: 0, notes: 0 };
            contractorStats[name].notes++;
        }
    });

    var labels = Object.keys(contractorStats);
    if (labels.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">لا توجد بيانات حالياً</td></tr>';
        return;
    }

    var tableRows = '';
    var chartLabels = [];
    var chartPermits = [];
    var chartNotes = [];
    var classCounts = { A: 0, B: 0, C: 0, D: 0 };

    // تصنيف كل مقاول
    labels.forEach(function(c) {
        var data = contractorStats[c];
        var ratio = data.permits > 0 ? (data.notes / data.permits) * 100 : 0;
        var classification = '';
        var classColor = '';

        if (ratio === 0) {
            classification = '🟢 A (ممتاز)';
            classColor = 'background:#dcefe4; color:#24704d;';
            classCounts.A++;
        } else if (ratio <= 30) {
            classification = '🔵 B (جيد)';
            classColor = 'background:#e8eee9; color:#5d7066;';
            classCounts.B++;
        } else if (ratio <= 60) {
            classification = '🟡 C (متوسط)';
            classColor = 'background:#fff8e1; color:#8a6d3b;';
            classCounts.C++;
        } else {
            classification = '🔴 D (خطر عالي)';
            classColor = 'background:#f7dddd; color:#a33f3f;';
            classCounts.D++;
        }

        chartLabels.push(c);
        chartPermits.push(data.permits);
        chartNotes.push(data.notes);

        tableRows += '<tr>' +
            '<td style="font-weight:bold;">' + c + '</td>' +
            '<td style="text-align:center;">' + data.permits + '</td>' +
            '<td style="text-align:center;">' + data.notes + '</td>' +
            '<td style="text-align:center; font-weight:bold;">' + ratio.toFixed(1) + '%</td>' +
            '<td style="text-align:center; font-weight:bold; padding:8px; border-radius:8px; ' + classColor + '">' + classification + '</td>' +
        '</tr>';
    });

    // تحديث الجدول
    tbody.innerHTML = tableRows;

    // رسم المخطط العمودي
    var barCtx = document.getElementById('contractorBarChart');
    if (barCtx) {
        if (barChartInstance) barChartInstance.destroy();
        barChartInstance = new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: chartLabels,
                datasets: [
                    { label: 'إجمالي التصاريح', data: chartPermits, backgroundColor: '#245c49' },
                    { label: 'إجمالي الملاحظات', data: chartNotes, backgroundColor: '#b3402a' }
                ]
            },
            options: { responsive: true, scales: { y: { beginAtZero: true } } }
        });
    }

    // رسم المخطط الدائري
    var pieCtx = document.getElementById('classificationPieChart');
    if (pieCtx) {
        if (pieChartInstance) pieChartInstance.destroy();
        pieChartInstance = new Chart(pieCtx, {
            type: 'doughnut',
            data: {
                labels: ['ممتاز (A)', 'جيد (B)', 'متوسط (C)', 'خطر عالي (D)'],
                datasets: [{
                    data: [classCounts.A, classCounts.B, classCounts.C, classCounts.D],
                    backgroundColor: ['#24704d', '#5d7066', '#8a6d3b', '#a33f3f']
                }]
            },
            options: { responsive: true }
        });
    }
}

// 3. تشغيل تلقائي عند فتح التطبيق (بعد 3 ثوانٍ لضمان جلب البيانات من السحابة)
setTimeout(renderPerformanceData, 3000);
// =========================================================
// مستمع آمن لزر التصنيف (يرسم البيانات عند فتح الصفحة)
// =========================================================
document.addEventListener("DOMContentLoaded", function() {
    var navButtons = document.querySelectorAll('.navbar button');
    navButtons.forEach(function(btn) {
        var onclickAttr = btn.getAttribute('onclick') || '';
        // إذا كان الزر هو زر صفحة التصنيف (performance)
        if (onclickAttr.indexOf("performance") !== -1) {
            btn.addEventListener('click', function() {
                // ننتظر نصف ثانية حتى تفتح الصفحة، ثم نرسم البيانات
                setTimeout(function() {
                    if (typeof renderPerformanceData === 'function') {
                        renderPerformanceData();
                    }
                }, 500);
            });
        }
    });
});
/* =========================================================
   إصلاحات بسيطة - 3 فقط - في نهاية الملف
   ========================================================= */

/* 1) إظهار الصفحات فوراً + CSS احتياطي */
try {
    var style = document.createElement("style");
    style.innerHTML = ".page{display:none;}.page.active{display:block !important;}.page:first-of-type{display:block !important;}";
    document.head.appendChild(style);
} catch(e){}

function showFirstPageSafe() {
    try {
        if (!document.querySelector(".page.active")) {
            var first = document.querySelector(".page");
            if (first) first.classList.add("active");
        }
    } catch(e){}
}
showFirstPageSafe();
document.addEventListener("DOMContentLoaded", showFirstPageSafe);
setTimeout(showFirstPageSafe, 1000);
setTimeout(showFirstPageSafe, 3000);

/* 2) منع رسالة الجدار الناري: تعطيل html2pdf */
try {
    window.html2pdf = function() {
        return { set: function(){return this;}, from: function(){return this;}, save: function(){return Promise.resolve();} };
    };
} catch(e){}

/* 3) PDF عبر window.print بدلاً من html2pdf */
try {
    window.generatePDFFromHTML = function(content, filename, orientation, btn) {
        if (btn) { btn.disabled = true; btn.setAttribute("data-old-text", btn.innerText); btn.innerText = "جاري..."; }
        try {
            var printArea = document.getElementById("printArea");
            if (!printArea) { printArea = document.createElement("div"); printArea.id = "printArea"; document.body.appendChild(printArea); }
            printArea.innerHTML = content;
            var st = document.getElementById("printStyle");
            if (!st) { st = document.createElement("style"); st.id = "printStyle"; document.head.appendChild(st); }
            st.innerHTML = "@media print{body *{visibility:hidden !important;}#printArea,#printArea *{visibility:visible !important;}#printArea{position:absolute;left:0;top:0;width:100%;padding:15px;background:#fff;}table{width:100% !important;border-collapse:collapse;}tr{page-break-inside:avoid;}thead{display:table-header-group;}@page{margin:1cm;size:A4 " + (orientation === "landscape" ? "landscape" : "portrait") + ";}}@media screen{#printArea{display:none;}}";
            var imgs = printArea.querySelectorAll("img");
            var promises = Array.from(imgs).map(function(img) {
                if (img.complete && img.naturalWidth > 0) return Promise.resolve();
                return new Promise(function(resolve) { img.onload = resolve; img.onerror = resolve; setTimeout(resolve, 8000); });
            });
            Promise.all(promises).then(function() {
                setTimeout(function() {
                    try { window.print(); } catch(e){ console.error(e); }
                    if (btn) { btn.disabled = false; btn.innerText = btn.getAttribute("data-old-text"); }
                }, 300);
            });
        } catch(e) {
            console.error("PDF error:", e);
            if (btn) { btn.disabled = false; btn.innerText = btn.getAttribute("data-old-text"); }
        }
    };
} catch(e){}

console.log("✅ تم تحميل الإصلاحات البسيطة");
/* =========================================================
   تشغيل أزرار التنقل بين الصفحات
   يُضاف بعد الإصلاحات السابقة في نهاية الملف
   ========================================================= */
(function () {
    "use strict";

    function setupNavButtons() {
        try {
            /* خريطة بين نص الزر واسم الصفحة */
            var navMap = [
                { keywords: ["لوحة المتابعة", "الرئيسية", "القيادة", "dashboard"], page: "dashboard" },
                { keywords: ["تصنيف المقاولين", "المقاولين", "performance", "تصنيف"], page: "performance" },
                { keywords: ["الإخلاء", "الإخلاءات", "clearance"], page: "clearance" },
                { keywords: ["الطوارئ", "emergency"], page: "emergency" },
                { keywords: ["الملاحظات", "notes"], page: "notes" }
            ];

            document.querySelectorAll("button, a").forEach(function (btn) {
                /* تخطي الأزرار المرتبطة مسبقاً */
                if (btn.dataset.navFixed === "1") return;

                var text = (btn.textContent || btn.innerText || "").trim();
                var onclickAttr = btn.getAttribute("onclick") || "";

                /* إذا الزر يحتوي onclick مع showPage - نتأكد أنه يعمل */
                if (onclickAttr.indexOf("showPage") !== -1 || onclickAttr.indexOf("goToPerformance") !== -1) {
                    btn.dataset.navFixed = "1";
                    /* لا نضيف شيء - الكود الأصلي سيتولى الأمر */
                    return;
                }

                /* مطابقة النص مع الخريطة */
                for (var i = 0; i < navMap.length; i++) {
                    var map = navMap[i];
                    for (var j = 0; j < map.keywords.length; j++) {
                        if (text.indexOf(map.keywords[j]) !== -1) {
                            /* التحقق من وجود الصفحة */
                            if (document.getElementById(map.page)) {
                                btn.dataset.navFixed = "1";
                                (function (pageName, btnEl) {
                                    btnEl.addEventListener("click", function (e) {
                                        e.preventDefault();
                                        try { showPage(pageName); } catch (err) { console.error(err); }
                                    });
                                })(map.page, btn);
                            }
                            return;
                        }
                    }
                }
            });

            /* التأكد من ظهور صفحة افتراضية */
            if (!document.querySelector(".page.active")) {
                var first = document.querySelector(".page");
                if (first) first.classList.add("active");
            }
        } catch (e) {
            console.warn("setupNavButtons error:", e);
        }
    }

    /* تشغيل عدة مرات لضمان عمله */
    setupNavButtons();
    document.addEventListener("DOMContentLoaded", setupNavButtons);
    setTimeout(setupNavButtons, 500);
    setTimeout(setupNavButtons, 2000);
    setTimeout(setupNavButtons, 5000);

    console.log("✅ تم تشغيل أزرار التنقل");
})();
