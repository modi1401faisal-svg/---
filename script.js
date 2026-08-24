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
    if (!db) {
        return false;
    }
    return new Promise(function (resolve) {
        try {
            const tx = db.transaction("images", "readwrite");
            tx.objectStore("images").put(dataUrl, key);
            tx.oncomplete = function () {
                resolve(true);
            };
            tx.onerror = function () {
                resolve(false);
            };
        } catch (e) {
            resolve(false);
        }
    });
}

async function idbGet(key) {
    const db = await openImageDB();
    if (!db) {
        return null;
    }
    return new Promise(function (resolve) {
        try {
            const tx = db.transaction("images", "readonly");
            const req = tx.objectStore("images").get(key);
            req.onsuccess = function () {
                resolve(req.result || null);
            };
            req.onerror = function () {
                resolve(null);
            };
        } catch (e) {
            resolve(null);
        }
    });
}

async function idbDelete(key) {
    const db = await openImageDB();
    if (!db) {
        return;
    }
    return new Promise(function (resolve) {
        try {
            const tx = db.transaction("images", "readwrite");
            tx.objectStore("images").delete(key);
            tx.oncomplete = function () {
                resolve(true);
            };
            tx.onerror = function () {
                resolve(false);
            };
        } catch (e) {
            resolve(false);
        }
    });
}

/* إنشاء مفتاح جديد وصيغة مرجع idb:// */
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

/* تخزين صورة (dataUrl) في IndexedDB وإرجاع المرجع */
async function storeImageInIdb(dataUrl) {
    const ref = newImageRef();
    const ok = await idbPut(idbKeyFromRef(ref), dataUrl);
    return ok ? ref : "";
}

/* =========================================================
   5) تهيئة Supabase (النسخة المضمونة)
   ========================================================= */

let sbClient = null;
let sbLoadPromise = null;

function createSbClient() {
    try {
        if (typeof supabase !== "undefined" && supabase && typeof supabase.createClient === "function") {
            return supabase.createClient(LAB_SUPABASE_URL, LAB_SUPABASE_KEY);
        }
        if (typeof createClient === "function") {
            return createClient(LAB_SUPABASE_URL, LAB_SUPABASE_KEY);
        }
    } catch (e) {
        console.error("خطأ في إنشاء عميل Supabase:", e);
    }
    return null;
}

/* شارة حالة الاتصال — تظهر أسفل يسار الشاشة */
function showCloudStatus(state, message) {
    try {
        if (!document.body) return;
        let badge = document.getElementById("cloudStatusBadge");
        if (!badge) {
            badge = document.createElement("div");
            badge.id = "cloudStatusBadge";
            badge.style.cssText =
                "position:fixed;bottom:10px;left:10px;z-index:99999;padding:6px 12px;" +
                "border-radius:20px;font-size:12px;font-family:inherit;color:#fff;" +
                "box-shadow:0 2px 8px rgba(0,0,0,.3);direction:rtl;";
            document.body.appendChild(badge);
        }
        badge.innerText = message;
        badge.style.background = state === "ok" ? "#1a7f4b" : "#b3402a";
    } catch (e) { }
}

/* فحص فوري بعد الاتصال: هل الجداول تستجيب؟ */
function checkCloudHealth(client) {
    try {
        client.from("clearances").select("id").limit(1).then(function (res) {
            if (res.error) {
                showCloudStatus("bad", "❌ سحابة متصلة — لكن الجداول ترفض: " + res.error.message);
                console.log("خطأ الجداول:", res.error.message);
            } else {
                showCloudStatus("ok", "☁️ متصل بالسحابة ✅");
                console.log("فحص الجداول: سليم ✅");
            }
        });
    } catch (e) { }
}

function initSupabase() {

    if (sbClient) {
        return Promise.resolve(sbClient);
    }

    /* إنشاء العميل فورًا إذا كانت المكتبة محملة */
    const immediate = createSbClient();
    if (immediate) {
        sbClient = immediate;
        console.log("تم تهيئة Supabase بنجاح ✅");
        checkCloudHealth(sbClient);
        return Promise.resolve(sbClient);
    }

    if (sbLoadPromise) {
        return sbLoadPromise;
    }

    sbLoadPromise = new Promise(function (resolve) {

        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js";

        script.onload = function () {
            sbClient = createSbClient();
            if (sbClient) {
                console.log("تم تهيئة Supabase بنجاح ✅");
                checkCloudHealth(sbClient);
            } else {
                showCloudStatus("bad", "❌ المكتبة حُمّلت لكن إنشاء العميل فشل");
            }
            resolve(sbClient);
        };

        script.onerror = function () {
            /* المصدر البديل */
            const alt = document.createElement("script");
            alt.src = "https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js";
            alt.onload = function () {
                sbClient = createSbClient();
                if (sbClient) {
                    console.log("تم تهيئة Supabase عبر unpkg ✅");
                    checkCloudHealth(sbClient);
                } else {
                    showCloudStatus("bad", "❌ تعذر إنشاء العميل");
                }
                resolve(sbClient);
            };
            alt.onerror = function () {
                console.warn("تعذر تحميل مكتبة Supabase من كل المصادر");
                showCloudStatus("bad", "❌ تعذر تحميل مكتبة Supabase");
                resolve(null);
            };
            document.head.appendChild(alt);
        };

        document.head.appendChild(script);
    });

    return sbLoadPromise;
}
/* =========================================================
   6) طبقة قاعدة البيانات (الجداول)
   ========================================================= */

async function dbInsert(tableName, row) {
    const client = await initSupabase();
    if (!client) {
        return null;
    }
    try {
        const { data, error } = await client
            .from(tableName)
            .insert(row)
            .select()
            .single();
        if (error) {
            console.warn("خطأ إضافة في " + tableName + ": " + error.message);
            return null;
        }
        return data;
    } catch (e) {
        return null;
    }
}

async function dbUpdate(tableName, id, changes) {
    const client = await initSupabase();
    if (!client || !id) {
        return false;
    }
    try {
        const { error } = await client
            .from(tableName)
            .update(changes)
            .eq("id", id);
        if (error) {
            console.warn("خطأ تعديل في " + tableName + ": " + error.message);
            return false;
        }
        return true;
    } catch (e) {
        return false;
    }
}

async function dbDelete(tableName, id) {
    const client = await initSupabase();
    if (!client || !id) {
        return false;
    }
    try {
        const { error } = await client
            .from(tableName)
            .delete()
            .eq("id", id);
        if (error) {
            console.warn("خطأ حذف في " + tableName + ": " + error.message);
            return false;
        }
        return true;
    } catch (e) {
        return false;
    }
}

async function dbFetchAll(tableName) {
    const client = await initSupabase();
    if (!client) {
        return null;
    }
    try {
        const { data, error } = await client
            .from(tableName)
            .select("*")
            .order("id", { ascending: true });
        if (error) {
            console.warn("خطأ قراءة " + tableName + ": " + error.message);
            return null;
        }
        return data || [];
    } catch (e) {
        return null;
    }
}

/* =========================================================
   7) محولات البيانات
   ========================================================= */

function clearanceToRow(item) {
    return {
        permit: item.permit || "",
        contractor: item.contractor || "",
        owner: item.owner || "",
        location: item.location || "",
        images: (item.images || []).map(stripIdbForDb)
    };
}

function stripIdbForDb(img) {
    /* idb:// لا يفهمه الخادم — نرسل سلسلة فارغة مؤقتاً
       وسيُستبدل بالرابط السحابي بعد الرفع في الخلفية */
    return isIdbRef(img) ? "" : img;
}

function rowToClearance(row) {
    return {
        id: row.id,
        permit: row.permit || "",
        contractor: row.contractor || "",
        owner: row.owner || "",
        location: row.location || "",
        images: Array.isArray(row.images) ? row.images : []
    };
}

function emergencyToRow(item) {
    return {
        permit: item.permit || "",
        contractor: item.contractor || "",
        owner: item.owner || "",
        lab_receive: item.labReceive || "",
        work_start: item.start || "",
        work_end: item.end || "",
        location: item.location || "",
        images: (item.images || []).map(stripIdbForDb)
    };
}

function rowToEmergency(row) {
    return {
        id: row.id,
        permit: row.permit || "",
        contractor: row.contractor || "",
        owner: row.owner || "",
        labReceive: row.lab_receive || "",
        start: row.work_start || "",
        end: row.work_end || "",
        location: row.location || "",
        images: Array.isArray(row.images) ? row.images : []
    };
}

function noteToRow(item) {
    return {
        type: item.type || "مشاريع الأمانة",
        note_date: item.date || "",
        permit: item.permit || "",
        contractor: item.contractor || "",
        owner: item.owner || "",
        reason: item.reason || "",
        action: item.action || "",
        before_image: isIdbRef(item.before) ? "" : (item.before || ""),
        after_image: isIdbRef(item.after) ? "" : (item.after || ""),
        completed: !!item.completed
    };
}

function rowToNote(row) {
    return {
        id: row.id,
        type: row.type || "مشاريع الأمانة",
        date: row.note_date || "",
        permit: row.permit || "",
        contractor: row.contractor || "",
        owner: row.owner || "",
        reason: row.reason || "",
        action: row.action || "",
        before: row.before_image || "",
        after: row.after_image || "",
        completed: !!row.completed
    };
}

/* =========================================================
   8) حفظ محلي آمن — ينقل الصور للمخزن الكبير بدل الحذف
   ========================================================= */

/* نقل كل صور Base64 داخل السجلات إلى IndexedDB
   وإرجاع عدد ما تم نقله */
async function moveBase64ToIdb(arr) {

    let moved = 0;

    for (const item of arr) {

        if (Array.isArray(item.images)) {
            for (let i = 0; i < item.images.length; i++) {
                const img = item.images[i];
                if (typeof img === "string" && img.indexOf("data:") === 0) {
                    const ref = await storeImageInIdb(img);
                    if (ref) {
                        item.images[i] = ref;
                        moved++;
                    }
                }
            }
        }

        if (typeof item.before === "string" && item.before.indexOf("data:") === 0) {
            const ref = await storeImageInIdb(item.before);
            if (ref) {
                item.before = ref;
                moved++;
            }
        }

        if (typeof item.after === "string" && item.after.indexOf("data:") === 0) {
            const ref = await storeImageInIdb(item.after);
            if (ref) {
                item.after = ref;
                moved++;
            }
        }
    }

    return moved;
}

/* حفظ آمن: عند امتلاء المساحة ينقل الصور تلقائياً
   إلى IndexedDB ثم يعيد المحاولة — بدون حذف أي صورة */
async function saveLocalData(key, arr) {

    try {
        localStorage.setItem(key, JSON.stringify(arr));
        return true;
    } catch (e) {

        console.warn("مساحة localStorage ممتلئة — نقل الصور إلى المخزن الكبير...");

        const moved = await moveBase64ToIdb(arr);

        try {
            localStorage.setItem(key, JSON.stringify(arr));
            if (moved > 0) {
                console.log("تم نقل " + moved + " صورة إلى المخزن الكبير وتحرير المساحة ✅");
            }
            return true;
        } catch (e2) {
            alert(
                "تعذر الحفظ المحلي رغم نقل الصور.\n" +
                "تأكد من وجود اتصال بالإنترنت حتى تُحفظ البيانات في السحابة."
            );
            return false;
        }
    }
}

/* نقل أولي عند التشغيل: يحرر مساحة localStorage فوراً
   من الصور القديمة بدون فقدان أي صورة */
async function initialImageMigration() {

    const tasks = [
        { arr: clearances, key: "clearances" },
        { arr: emergencies, key: "emergencies" },
        { arr: notes, key: "notes" }
    ];

    let totalMoved = 0;

    for (const task of tasks) {
        const moved = await moveBase64ToIdb(task.arr);
        if (moved > 0) {
            totalMoved += moved;
            try {
                localStorage.setItem(task.key, JSON.stringify(task.arr));
            } catch (e) {
                /* تجاهل — سنحاول لاحقاً */
            }
        }
    }

    if (totalMoved > 0) {
        console.log("تم نقل " + totalMoved + " صورة موجودة إلى المخزن الكبير — لم تُحذف أي صورة ✅");
        renderClearances();
        renderEmergencies();
        renderNotes();
        updateDashboard();
    }

    reportStorageUsage();
}

function reportStorageUsage() {
    try {
        let total = 0;
        ["clearances", "emergencies", "notes"].forEach(function (k) {
            total += (localStorage.getItem(k) || "").length;
        });
        console.log("مساحة localStorage المستخدمة: " + Math.round(total / 1024) + " KB (الصور منفصلة في المخزن الكبير)");
    } catch (e) {
        /* تجاهل */
    }
}

/* =========================================================
   9) رفع صور idb:// إلى السحابة في الخلفية
   ثم استبدال المراجع بروابط سحابية
   ========================================================= */

async function uploadDataUrlToCloud(dataUrl) {
    try {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        return await uploadToSupabase(blob, "image/jpeg");
    } catch (e) {
        return "";
    }
}

async function migrateIdbImagesToCloud() {

    const client = await initSupabase();
    if (!client) {
        return;
    }

    const tasks = [
        { arr: clearances, table: "clearances", key: "clearances", toRow: clearanceToRow },
        { arr: emergencies, table: "emergencies", key: "emergencies", toRow: emergencyToRow },
        { arr: notes, table: "notes", key: "notes", toRow: noteToRow }
    ];

    let migrated = 0;

    for (const task of tasks) {

        for (const item of task.arr) {

            let changed = false;

            if (Array.isArray(item.images)) {
                for (let i = 0; i < item.images.length; i++) {
                    if (isIdbRef(item.images[i])) {
                        const data = await idbGet(idbKeyFromRef(item.images[i]));
                        if (data) {
                            const url = await uploadDataUrlToCloud(data);
                            if (url) {
                                item.images[i] = url;
                                changed = true;
                                migrated++;
                            }
                        }
                    }
                }
            }

            const fields = ["before", "after"];
            for (let f = 0; f < fields.length; f++) {
                const fieldName = fields[f];
                if (isIdbRef(item[fieldName])) {
                    const data = await idbGet(idbKeyFromRef(item[fieldName]));
                    if (data) {
                        const url = await uploadDataUrlToCloud(data);
                        if (url) {
                            item[fieldName] = url;
                            changed = true;
                            migrated++;
                        }
                    }
                }
            }

            if (changed) {
                if (item.id) {
                    await dbUpdate(task.table, item.id, task.toRow(item));
                } else {
                    const inserted = await dbInsert(task.table, task.toRow(item));
                    if (inserted && inserted.id) {
                        item.id = inserted.id;
                    }
                }
                try {
                    localStorage.setItem(task.key, JSON.stringify(task.arr));
                } catch (e) {
                    /* تجاهل */
                }
            }
        }
    }

    if (migrated > 0) {
        console.log("تم رفع " + migrated + " صورة إلى السحابة ✅");
        renderClearances();
        renderEmergencies();
        renderNotes();
        updateDashboard();
    }
}

/* =========================================================
   10) المزامنة مع السحابة
   ========================================================= */

async function syncFromCloud() {

    const tasks = [
        { table: "clearances", array: clearances, toRow: clearanceToRow, fromRow: rowToClearance, key: "clearances", render: renderClearances },
        { table: "
