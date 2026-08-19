/* =========================================================
   نظام مختبر جودة المشاريع
   الملف الكامل — استبدل به ملف JavaScript بالكامل
   ========================================================= */

/* =========================================================
   1) الإعدادات العامة
   ========================================================= */

const LAB_SUPABASE_URL = "https://uuhldvdgyyxvtmjqqwex.supabase.co";
const LAB_SUPABASE_KEY = "sb_publishable_HM4vP8LSEZJaZC9Cyug5fg_fhQ05QqL";

/* النص الافتراضي لحقل (الإجراء المتخذ) في الملاحظات */
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

/* =========================================================
   3) أدوات مساعدة عامة
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

/* مهلة زمنية لأي عملية قد تتعطل */
function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise(function (resolve, reject) {
            setTimeout(function () {
                reject(new Error("انتهت المهلة"));
            }, ms);
        })
    ]);
}

/* =========================================================
   4) تهيئة Supabase (مصححة)
   ========================================================= */

let sbClient = null;
let sbLoadPromise = null;

function createSbClient() {
    try {
        /* إذا وُجد عميل جاهز في الصفحة نستخدمه مباشرة */
        if (typeof supabase !== "undefined" && supabase) {
            if (supabase.storage) {
                return supabase;
            }
            if (typeof supabase.createClient === "function") {
                return supabase.createClient(LAB_SUPABASE_URL, LAB_SUPABASE_KEY);
            }
        }
        /* بعض الإصدارات تعرّف createClient مباشرة */
        if (typeof createClient === "function") {
            return createClient(LAB_SUPABASE_URL, LAB_SUPABASE_KEY);
        }
    } catch (e) {
        console.error("خطأ في إنشاء عميل Supabase:", e);
    }
    return null;
}

function initSupabase() {

    if (sbClient) {
        return Promise.resolve(sbClient);
    }

    /* إنشاء العميل فورًا إذا كانت المكتبة محملة */
    const immediate = createSbClient();
    if (immediate) {
        sbClient = immediate;
        return Promise.resolve(sbClient);
    }

    if (sbLoadPromise) {
        return sbLoadPromise;
    }

    /* تحميل المكتبة مرة واحدة فقط */
    sbLoadPromise = new Promise(function (resolve) {

        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

        script.onload = function () {
            sbClient = createSbClient();
            if (sbClient) {
                console.log("تم تهيئة Supabase بنجاح ✅");
            } else {
                console.warn("تعذر إنشاء عميل Supabase — سيتم حفظ الصور محلياً");
            }
            resolve(sbClient);
        };

        script.onerror = function () {
            console.warn("تعذر تحميل مكتبة Supabase — سيتم حفظ الصور محلياً");
            resolve(null);
        };

        document.head.appendChild(script);
    });

    return sbLoadPromise;
}

/* =========================================================
   5) الصور
   ========================================================= */

async function uploadToSupabase(file) {

    const client = await initSupabase();

    if (!client) {
        return "";
    }

    const nameParts = String(file.name || "image").split(".");
    const fileExt = nameParts.length > 1 ? nameParts.pop().toLowerCase() : "jpg";

    const fileName =
        Date.now() + "_" +
        Math.random().toString(36).substring(2, 10) +
        "." + fileExt;

    const filePath = "uploads/" + fileName;

    const { error } = await client.storage
        .from("images")
        .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type || "image/jpeg"
        });

    if (error) {
        console.error("خطأ في رفع الصورة إلى Supabase:", error);
        return "";
    }

    const { data: urlData } = client.storage
        .from("images")
        .getPublicUrl(filePath);

    return urlData && urlData.publicUrl ? urlData.publicUrl : "";
}

/* حفظ الصورة محلياً داخل المتصفح (الخطة البديلة) */
function readLocalImage(file) {
    return new Promise(function (resolve) {
        const reader = new FileReader();
        reader.onload = function () {
            resolve(reader.result);
        };
        reader.onerror = function () {
            resolve("");
        };
        reader.readAsDataURL(file);
    });
}

/* رفع صورة واحدة: السحابة أولاً ثم محلياً عند الفشل */
async function readImage(file) {

    if (!file) {
        return "";
    }

    let cloudUrl = "";

    try {
        cloudUrl = await withTimeout(uploadToSupabase(file), 30000);
    } catch (error) {
        console.warn("فشل أو تأخر رفع الصورة للسحابة، سيتم الحفظ محلياً:", error);
    }

    if (cloudUrl) {
        return cloudUrl;
    }

    return readLocalImage(file);
}

/* رفع عدة صور */
async function readImages(files) {

    const result = [];

    if (!files || files.length === 0) {
        return result;
    }

    for (let i = 0; i < files.length; i++) {
        const imageUrl = await readImage(files[i]);
        if (imageUrl) {
            result.push(imageUrl);
        }
    }

    return result;
}

/* عرض الصورة المصغرة */
function imageThumb(image, title = "عرض الصورة") {
    if (!image) {
        return "<span>لا توجد صورة</span>";
    }

    return `
        <img
            src="${image}"
            alt="${title}"
            title="${title}"
            onclick="openImage(this.src)"
            style="width:70px;height:70px;object-fit:cover;border-radius:8px;cursor:pointer;margin:3px;"
        >
    `;
}

function openImage(image) {
    const newWindow = window.open("", "_blank");

    if (!newWindow) {
        alert("يرجى السماح بفتح النوافذ المنبثقة");
        return;
    }

    newWindow.document.write(`
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

/* =========================================================
   6) مؤشر (جاري الحفظ) — لا يكسر عملية الحفظ أبداً
   ========================================================= */

function setSaveBusy(busy) {
    try {
        document.querySelectorAll("button, input[type='button'], input[type='submit']").forEach(function (el) {

            const oc = el.getAttribute("onclick") || "";
            const wired = el.dataset ? el.dataset.wiredSave : "";

            const isSave =
                oc.indexOf("saveClearance") !== -1 ||
                oc.indexOf("saveEmergency") !== -1 ||
                oc.indexOf("saveNote") !== -1 ||
                wired === "1";

            if (!isSave) {
                return;
            }

            if (busy) {
                if (!el.dataset.oldText) {
                    el.dataset.oldText = el.innerText || el.value || "";
                }
                el.disabled = true;
                if (el.tagName === "BUTTON") {
                    el.innerText = "⏳ جاري الحفظ...";
                } else {
                    el.value = "⏳ جاري الحفظ...";
                }
            } else {
                el.disabled = false;
                if (el.dataset.oldText) {
                    if (el.tagName === "BUTTON") {
                        el.innerText = el.dataset.oldText;
                    } else {
                        el.value = el.dataset.oldText;
                    }
                }
            }
        });
    } catch (e) {
        /* تجاهل — هذه الوظيفة تجميلية فقط */
    }
}

/* =========================================================
   7) التنقل بين الصفحات
   ========================================================= */

function showPage(page) {

    document.querySelectorAll(".page").forEach(function (p) {
        p.classList.remove("active");
    });

    const selectedPage = document.getElementById(page);
    if (selectedPage) {
        selectedPage.classList.add("active");
    }

    /* تمييز زر التنقل الحالي */
    document.querySelectorAll("button").forEach(function (btn) {
        const onclick = btn.getAttribute("onclick") || "";
        if (onclick.indexOf("showPage") !== -1) {
            btn.classList.remove("active");
            if (
                onclick.indexOf("'" + page + "'") !== -1 ||
                onclick.indexOf('"' + page + '"') !== -1
            ) {
                btn.classList.add("active");
            }
        }
    });

    updateDashboard();
}

/* =========================================================
   8) رأس الجدول — يُبنى من الكود لضمان تطابق الأعمدة
   ========================================================= */

function ensureTableHeaders(bodyId, headers) {

    const bodyEl = document.getElementById(bodyId);
    if (!bodyEl) {
        return null;
    }

    let parentTable = null;
    let tbody = bodyEl;

    if (bodyEl.tagName === "TABLE") {
        parentTable = bodyEl;
        tbody = bodyEl.querySelector("tbody");
        if (!tbody) {
            tbody = document.createElement("tbody");
            bodyEl.appendChild(tbody);
        }
    } else if (bodyEl.tagName === "TBODY") {
        parentTable = bodyEl.closest("table");
    }

    if (parentTable) {
        let thead = parentTable.querySelector("thead");
        if (!thead) {
            thead = document.createElement("thead");
            parentTable.insertBefore(thead, parentTable.firstChild);
        }
        thead.innerHTML =
            "<tr>" +
            headers.map(function (h) {
                return "<th>" + h + "</th>";
            }).join("") +
            "</tr>";
    }

    return tbody;
}

/* =========================================================
   9) رخص الإخلاءات
   ========================================================= */

async function saveClearance() {

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

        setSaveBusy(true);

        const images = await readImages(files);

        const data = {
            permit: permit,
            contractor: contractor,
            owner: owner,
            location: location,
            images: images
        };

        if (editingClearance >= 0) {
            if (images.length === 0) {
                data.images = clearances[editingClearance].images || [];
            }
            clearances[editingClearance] = data;
            editingClearance = -1;
        } else {
            clearances.push(data);
        }

        localStorage.setItem("clearances", JSON.stringify(clearances));

        clearClearance();
        renderClearances();
        updateDashboard();

        alert("تم حفظ رخصة الإخلاء بنجاح ✅");

    } catch (error) {
        console.error("خطأ في حفظ رخصة الإخلاء:", error);
        alert(
            "حدث خطأ أثناء الحفظ:\n" +
            (error && error.message ? error.message : error)
        );
    } finally {
        setSaveBusy(false);
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

function deleteClearance(index) {

    if (!confirm("هل تريد حذف رخصة الإخلاء؟")) {
        return;
    }

    clearances.splice(index, 1);
    localStorage.setItem("clearances", JSON.stringify(clearances));

    renderClearances();
    updateDashboard();
    alert("تم حذف الرخصة");
}

/* =========================================================
   10) رخص الطوارئ
   ========================================================= */

async function saveEmergency() {

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

        setSaveBusy(true);

        const images = await readImages(files);

        const data = {
            permit: permit,
            contractor: contractor,
            owner: owner,
            labReceive: labReceive,
            start: start,
            end: end,
            location: location,
            images: images
        };

        if (editingEmergency >= 0) {
            if (images.length === 0) {
                data.images = emergencies[editingEmergency].images || [];
            }
            emergencies[editingEmergency] = data;
            editingEmergency = -1;
        } else {
            emergencies.push(data);
        }

        localStorage.setItem("emergencies", JSON.stringify(emergencies));

        clearEmergency();
        renderEmergencies();
        updateDashboard();

        alert("تم حفظ رخصة الطوارئ بنجاح ✅");

    } catch (error) {
        console.error("خطأ في حفظ رخصة الطوارئ:", error);
        alert(
            "حدث خطأ أثناء الحفظ:\n" +
            (error && error.message ? error.message : error)
        );
    } finally {
        setSaveBusy(false);
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

function deleteEmergency(index) {

    if (!confirm("هل تريد حذف رخصة الطوارئ؟")) {
        return;
    }

    emergencies.splice(index, 1);
    localStorage.setItem("emergencies", JSON.stringify(emergencies));

    renderEmergencies();
    updateDashboard();
    alert("تم حذف الرخصة");
}

/* =========================================================
   11) تصنيف الملاحظات
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
   12) حفظ الملاحظة
   ========================================================= */

async function saveNote() {

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

        const before = await readImage(beforeFile);
        const after = await readImage(afterFile);

        /* الاحتفاظ بالصور القديمة عند التعديل */
        const beforeImage = before || (oldNote ? oldNote.before || "" : "");
        const afterImage = after || (oldNote ? oldNote.after || "" : "");

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

        if (editingNote >= 0) {
            notes[editingNote] = data;
            editingNote = -1;
        } else {
            notes.push(data);
        }

        localStorage.setItem("notes", JSON.stringify(notes));

        clearNote();
        renderNotes();
        updateDashboard();

        if (completed) {
            alert("تم حفظ الملاحظة وتسجيلها كمعدلة ✅");
        } else {
            alert("تم حفظ الملاحظة بنجاح ✅");
        }

    } catch (error) {
        console.error("خطأ في حفظ الملاحظة:", error);
        alert(
            "حدث خطأ أثناء الحفظ:\n" +
            (error && error.message ? error.message : error)
        );
    } finally {
        setSaveBusy(false);
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

    /* النص الافتراضي الجديد */
    setVal("noteAction", DEFAULT_ACTION_TEXT);
    setVal("noteType", "مشاريع الأمانة");

    document.querySelectorAll(".note-types button").forEach(function (button) {
        button.classList.remove("active");
    });

    editingNote = -1;
}

/* =========================================================
   13) حساب الأيام والحالة
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
   14) عرض الملاحظات (10 أعمدة تطابق الرأس تماماً)
   ========================================================= */

function renderNotes() {

    const tbody = ensureTableHeaders("notesTable", [
        "م",
        "التاريخ",
        "رقم التصريح",
        "اسم المقاول",
        "الجهة المالكة",
        "أسباب الرفض",
        "الإجراء المتخذ",
        "الحالة",
        "الصور",
        "الإجراءات"
    ]);

    if (!tbody) {
        return;
    }

    tbody.innerHTML = "";

    if (!notes || notes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10">لا توجد ملاحظات مسجلة</td></tr>';
        return;
    }

    const categories = [
        "مشاريع الأمانة",
        "المياه الوطنية",
        "الكهرباء",
        "الاتصالات",
        "مشاريع خاصة"
    ];

    categories.forEach(function (category) {

        const categoryNotes = notes.filter(function (item) {
            return (item.type || "مشاريع الأمانة") === category;
        });

        if (categoryNotes.length === 0) {
            return;
        }

        tbody.innerHTML += `
            <tr class="note-category-row">
                <td colspan="10" style="font-weight:bold;text-align:right;padding:12px;">
                    📁 ${category}
                </td>
            </tr>
        `;

        categoryNotes.forEach(function (item) {

            const index = notes.indexOf(item);
            const late = isLate(item);

            let status = "";
            if (item.completed) {
                status = '<span class="status-done">✅ تم التعديل</span>';
            } else if (late) {
                status = '<span class="status-open">🔴 متأخرة</span>';
            } else {
                status = '<span class="status-follow">قيد المتابعة</span>';
            }

            let imagesHTML = "";

            if (item.before) {
                imagesHTML += `
                    <div>
                        <small>قبل التعديل</small>
                        <br>
                        ${imageThumb(item.before, "صورة الملاحظة")}
                    </div>
                `;
            }

            if (item.after) {
                imagesHTML += `
                    <div>
                        <small>بعد التعديل</small>
                        <br>
                        ${imageThumb(item.after, "صورة الملاحظة بعد التعديل")}
                    </div>
                `;
            }

            if (!imagesHTML) {
                imagesHTML = "<span>لا توجد صور</span>";
            }

            tbody.innerHTML += `
                <tr ${late ? 'style="background:#fff0f0;"' : ""}>
                    <td>${index + 1}</td>
                    <td>${item.date || ""}</td>
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

function deleteNote(index) {

    if (!confirm("هل تريد حذف الملاحظة؟")) {
        return;
    }

    notes.splice(index, 1);
    localStorage.setItem("notes", JSON.stringify(notes));

    renderNotes();
    updateDashboard();
    alert("تم حذف الملاحظة");
}

/* =========================================================
   15) التنبيهات ولوحة المتابعة
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
   16) ربط الأزرار تلقائياً (يضمن عمل أزرار الحفظ والتنقل)
   ========================================================= */

function autoWireButtons() {

    /* أزرار الحفظ والمسح والبحث داخل كل صفحة */
    const pageWiring = [
        {
            pageId: "clearance",
            save: saveClearance,
            clear: clearClearance,
            search: searchClearance,
            resetSearch: clearClearanceSearch
        },
        {
            pageId: "emergency",
            save: saveEmergency,
            clear: clearEmergency,
            search: searchEmergency,
            resetSearch: clearEmergencySearch
        },
        {
            pageId: "notes",
            save: saveNote,
            clear: clearNote,
            search: null,
            resetSearch: null
        }
    ];

    pageWiring.forEach(function (w) {

        const page = document.getElementById(w.pageId);
        if (!page) {
            return;
        }

        page.querySelectorAll("button, input[type='button'], input[type='submit']").forEach(function (btn) {

            /* الأزرار المرتبطة بـ onclick تعمل أصلاً */
            if (btn.getAttribute("onclick")) {
                return;
            }
            if (btn.dataset.autoWired) {
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
            } else if (
                text.indexOf("مسح") !== -1 ||
                text.indexOf("تفريغ") !== -1 ||
                text.indexOf("جديد") !== -1
            ) {
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
            } else if (
                (text.indexOf("الكل") !== -1 || text.indexOf("إلغاء") !== -1) &&
                w.resetSearch
            ) {
                btn.dataset.autoWired = "1";
                btn.addEventListener("click", function (event) {
                    event.preventDefault();
                    w.resetSearch();
                });
            }
        });
    });

    /* أزرار التنقل بين الصفحات */
    const navMap = [
        { keyword: "لوحة المتابعة", page: "dashboard" },
        { keyword: "الرئيسية", page: "dashboard" },
        { keyword: "الإخلاء", page: "clearance" },
        { keyword: "الطوارئ", page: "emergency" },
        { keyword: "الملاحظات", page: "notes" }
    ];

    document.querySelectorAll("button").forEach(function (btn) {

        if (btn.getAttribute("onclick")) {
            return;
        }
        if (btn.dataset.autoWired || btn.dataset.navWired) {
            return;
        }

        const text = (btn.textContent || "").trim();

        /* تجاوز أزرار النماذج والجداول */
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
   17) إضافة أزرار تصدير Excel و PDF تلقائياً
   ========================================================= */

function addExportButtons() {

    const configs = [
        {
            pageId: "clearance",
            buttons: [
                {
                    text: "📥 تصدير Excel",
                    handler: function () {
                        exportClearancesToExcel();
                    }
                },
                {
                    text: "📄 تصدير PDF",
                    handler: function () {
                        exportClearancesToPDF(this);
                    }
                }
            ]
        },
        {
            pageId: "emergency",
            buttons: [
                {
                    text: "📥 تصدير Excel",
                    handler: function () {
                        exportEmergenciesToExcel();
                    }
                },
                {
                    text: "📄 تصدير PDF",
                    handler: function () {
                        exportEmergenciesToPDF(this);
                    }
                }
            ]
        },
        {
            pageId: "notes",
            buttons: [
                {
                    text: "📥 تصدير Excel",
                    handler: function () {
                        exportNotesToExcel();
                    }
                },
                {
                    text: "📄 تصدير PDF",
                    handler: function () {
                        exportNotesToPDF(this);
                    }
                }
            ]
        }
    ];

    configs.forEach(function (cfg) {

        const page = document.getElementById(cfg.pageId);
        if (!page) {
            return;
        }

        /* عدم التكرار إذا كانت هناك أزرار تصدير موجودة */
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
   18) التشغيل عند فتح الصفحة
   ========================================================= */

document.addEventListener("DOMContentLoaded", function () {

    /* تهيئة Supabase مبكراً */
    initSupabase();

    /* البحث عند الضغط على Enter */
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

    /* النص الافتراضي الجديد للإجراء المتخذ */
    const actionEl = document.getElementById("noteAction");
    if (actionEl && !actionEl.value.trim()) {
        actionEl.value = DEFAULT_ACTION_TEXT;
    }

    /* ربط الأزرار تلقائياً */
    autoWireButtons();

    /* إضافة أزرار التصدير */
    addExportButtons();

    /* عرض البيانات */
    renderClearances();
    renderEmergencies();
    renderNotes();
    updateDashboard();

    /* التصنيف الافتراضي */
    setNoteType("مشاريع الأمانة");

    /* التأكد من وجود صفحة ظاهرة */
    if (!document.querySelector(".page.active")) {
        const firstPage = document.querySelector(".page");
        if (firstPage) {
            firstPage.classList.add("active");
        }
    }
});

/* تحديث التنبيهات كل ساعة */
setInterval(updateAlerts, 60 * 60 * 1000);

/* =========================================================
   =========================================================
   تصدير البيانات إلى Excel و PDF
   =========================================================
   ========================================================= */

/* تحميل المكتبات تلقائياً */
(function loadExportLibraries() {
    if (!document.getElementById("xlsxLibScript")) {
        var s1 = document.createElement("script");
        s1.id = "xlsxLibScript";
        s1.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
        document.head.appendChild(s1);
    }
    if (!document.getElementById("html2pdfLibScript")) {
        var s2 = document.createElement("script");
        s2.id = "html2pdfLibScript";
        s2.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
        document.head.appendChild(s2);
    }
})();

/* دوال مساعدة */
function exportDate() {
    var d = new Date();
    var day = ("0" + d.getDate()).slice(-2);
    var month = ("0" + (d.getMonth() + 1)).slice(-2);
    return d.getFullYear() + "-" + month + "-" + day;
}

function safeFileName(text) {
    return String(text || "بدون").replace(/[\\\/:*?"<>|]/g, "-");
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
function exportClearancesToPDF(btn) {
    if (typeof html2pdf === "undefined") {
        alert("جاري تحميل مكتبة PDF...\nانتظر ثانية واحدة ثم اضغط الزر مرة أخرى");
        return;
    }
    if (clearances.length === 0) {
        alert("لا توجد رخص إخلاء للتصدير");
        return;
    }
    var rows = "";
    clearances.forEach(function (item, index) {
        var imagesHTML = "";
        (item.images || []).forEach(function (img) {
            imagesHTML += '<img src="' + img + '" style="width:60px;height:60px;object-fit:cover;border-radius:4px;margin:2px;">';
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
function exportEmergenciesToPDF(btn) {
    if (typeof html2pdf === "undefined") {
        alert("جاري تحميل مكتبة PDF...\nانتظر ثانية واحدة ثم اضغط الزر مرة أخرى");
        return;
    }
    if (emergencies.length === 0) {
        alert("لا توجد رخص طوارئ للتصدير");
        return;
    }
    var rows = "";
    emergencies.forEach(function (item, index) {
        var imagesHTML = "";
        (item.images || []).forEach(function (img) {
            imagesHTML += '<img src="' + img + '" style="width:60px;height:60px;object-fit:cover;border-radius:4px;margin:2px;">';
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
function exportNotesToPDF(btn) {
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

    var rows = "";
    notes.forEach(function (item, index) {

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
