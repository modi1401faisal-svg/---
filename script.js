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
        { table: "emergencies", array: emergencies, toRow: emergencyToRow, fromRow: rowToEmergency, key: "emergencies", render: renderEmergencies },
        { table: "notes", array: notes, toRow: noteToRow, fromRow: rowToNote, key: "notes", render: renderNotes }
    ];

    let anySynced = false;

    for (const task of tasks) {

        const cloud = await dbFetchAll(task.table);

        if (cloud === null) {
            continue;
        }

        anySynced = true;

        const notUploaded = [];
        for (const item of task.array) {
            if (!item.id) {
                const inserted = await dbInsert(task.table, task.toRow(item));
                if (inserted && inserted.id) {
                    item.id = inserted.id;
                    cloud.push(inserted);
                } else {
                    notUploaded.push(item);
                }
            }
        }

        const merged = cloud.map(task.fromRow);
        notUploaded.forEach(function (x) {
            merged.push(x);
        });

        task.array.length = 0;
        merged.forEach(function (x) {
            task.array.push(x);
        });

        await saveLocalData(task.key, task.array);
        task.render();
    }

    if (anySynced) {
        updateDashboard();
        console.log("تمت مزامنة البيانات مع Supabase ✅");
    }
}

/* =========================================================
   11) الصور — ضغط + رفع سحابة + IndexedDB كخطة بديلة
   ========================================================= */

function compressImageToBlob(file, maxDim, quality) {
    return new Promise(function (resolve) {

        if (!file || !file.type || file.type.indexOf("image/") !== 0) {
            resolve(null);
            return;
        }

        const reader = new FileReader();

        reader.onload = function () {
            const img = new Image();

            img.onload = function () {
                try {
                    let w = img.width;
                    let h = img.height;

                    const scale = Math.min(1, maxDim / Math.max(w, h));
                    w = Math.round(w * scale);
                    h = Math.round(h * scale);

                    const canvas = document.createElement("canvas");
                    canvas.width = w;
                    canvas.height = h;

                    const ctx = canvas.getContext("2d");

                    ctx.fillStyle = "#ffffff";
                    ctx.fillRect(0, 0, w, h);

                    ctx.drawImage(img, 0, 0, w, h);

                    canvas.toBlob(function (blob) {
                        resolve(blob || null);
                    }, "image/jpeg", quality);

                } catch (e) {
                    resolve(null);
                }
            };

            img.onerror = function () {
                resolve(null);
            };

            img.src = reader.result;
        };

        reader.onerror = function () {
            resolve(null);
        };

        reader.readAsDataURL(file);
    });
}

async function uploadToSupabase(blobOrFile, mime) {

    const client = await initSupabase();

    if (!client) {
        return "";
    }

    const fileName =
        Date.now() + "_" +
        Math.random().toString(36).substring(2, 10) + ".jpg";

    const filePath = "uploads/" + fileName;

    try {
        const { error } = await client.storage
            .from("images")
            .upload(filePath, blobOrFile, {
                cacheControl: "3600",
                upsert: false,
                contentType: mime || (blobOrFile && blobOrFile.type) || "image/jpeg"
            });

        if (error) {
            console.error("خطأ في رفع الصورة إلى السحابة:", error.message);
            return "";
        }

        const { data: urlData } = client.storage
            .from("images")
            .getPublicUrl(filePath);

        return urlData && urlData.publicUrl ? urlData.publicUrl : "";

    } catch (e) {
        console.error("استثناء أثناء رفع الصورة:", e);
        return "";
    }
}

/* معالجة صورة واحدة:
   1) ضغط ورفع للسحابة
   2) عند الفشل: تخزين في IndexedDB (المساحة الكبيرة) — لا حذف */
async function readImage(file) {

    if (!file) {
        return "";
    }

    const uploadBlob = await compressImageToBlob(file, 1400, 0.85);

    let cloudUrl = "";

    try {
        if (uploadBlob) {
            cloudUrl = await withTimeout(uploadToSupabase(uploadBlob, "image/jpeg"), 60000);
        }
        if (!cloudUrl) {
            cloudUrl = await withTimeout(uploadToSupabase(file, file.type), 60000);
        }
    } catch (error) {
        console.warn("تعذر رفع الصورة للسحابة: " + (error && error.message ? error.message : error));
    }

    if (cloudUrl) {
        console.log("تم رفع الصورة للسحابة ✅");
        return cloudUrl;
    }

    /* الخطة البديلة: IndexedDB — مساحة كبيرة لا تنفد */
    let fallbackBlob = uploadBlob;

    if (!fallbackBlob) {
        fallbackBlob = await compressImageToBlob(file, 1000, 0.7);
    }

    if (fallbackBlob) {
        const dataUrl = await blobToDataUrl(fallbackBlob);
        if (dataUrl) {
            const ref = await storeImageInIdb(dataUrl);
            if (ref) {
                console.warn("تم تخزين الصورة في المخزن الكبير — ستُرفع للسحابة تلقائياً عند توفر الاتصال");
                return ref;
            }
        }
    }

    skippedImagesCount++;
    return "";
}

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

/* =========================================================
   12) عرض الصور — يدعم idb:// والروابط العادية
   ========================================================= */

function imageThumb(image, title = "عرض الصورة") {
    if (!image) {
        return "<span>لا توجد صورة</span>";
    }

    if (isIdbRef(image)) {
        return `
            <img
                data-idb="${image}"
                alt="${title}"
                title="${title}"
                onclick="openImageRef(this)"
                style="width:70px;height:70px;object-fit:cover;border-radius:8px;cursor:pointer;margin:3px;background:#eee;"
            >
        `;
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

/* ملء الصور المخزنة في IndexedDB بعد عرض الجدول */
async function resolveIdbImages() {
    const imgs = document.querySelectorAll("img[data-idb]");
    for (let i = 0; i < imgs.length; i++) {
        const img = imgs[i];
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
            src = await idbGet(idbKeyFromRef(ref)) || src;
        }
    }

    if (!src) {
        return;
    }

    openImage(src);
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
   13) مؤشر (جاري الحفظ)
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
                el.innerText = "⏳ جاري الحفظ...";
            } else {
                el.disabled = false;
                if (el.dataset.oldText) {
                    el.innerText = el.dataset.oldText;
                }
            }
        });
    } catch (e) {
        /* تجاهل */
    }
}

/* =========================================================
   14) التنقل بين الصفحات
   ========================================================= */

function showPage(page) {

    document.querySelectorAll(".page").forEach(function (p) {
        p.classList.remove("active");
    });

    const selectedPage = document.getElementById(page);
    if (selectedPage) {
        selectedPage.classList.add("active");
    }

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
    resolveIdbImages();
}

/* =========================================================
   15) رؤوس الجداول من الكود
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
   16) رخص الإخلاءات
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
        skippedImagesCount = 0;

        const images = await readImages(files);

        const data = {
            permit: permit,
            contractor: contractor,
            owner: owner,
            location: location,
            images: images
        };

        let cloudOk = true;

        if (editingClearance >= 0) {
            const old = clearances[editingClearance] || {};
            if (images.length === 0) {
                data.images = old.images || [];
            }
            data.id = old.id || null;
            clearances[editingClearance] = data;
            editingClearance = -1;

            if (data.id) {
                cloudOk = await dbUpdate("clearances", data.id, clearanceToRow(data));
            } else {
                const inserted = await dbInsert("clearances", clearanceToRow(data));
                if (inserted && inserted.id) {
                    data.id = inserted.id;
                }
                cloudOk = !!(inserted && inserted.id);
            }
        } else {
            const inserted = await dbInsert("clearances", clearanceToRow(data));
            if (inserted && inserted.id) {
                data.id = inserted.id;
            }
            cloudOk = !!(inserted && inserted.id);
            clearances.push(data);
        }

        await saveLocalData("clearances", clearances);

        clearClearance();
        renderClearances();
        updateDashboard();

        let msg = cloudOk
            ? "تم حفظ رخصة الإخلاء بنجاح ✅"
            : "تم الحفظ على هذا الجهاز (المخزن الكبير) ⚠️\nسيُرفع للسحابة تلقائياً عند توفر الاتصال";

        if (skippedImagesCount > 0) {
            msg += "\n\n⚠️ لم تُحفظ " + skippedImagesCount + " صورة";
        }

        alert(msg);

    } catch (error) {
        console.error("خطأ في حفظ رخصة الإخلاء:", error);
        alert("حدث خطأ أثناء الحفظ:\n" + (error && error.message ? error.message : error));
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
        skippedImagesCount = 0;

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

        let cloudOk = true;

        if (editingEmergency >= 0) {
            const old = emergencies[editingEmergency] || {};
            if (images.length === 0) {
                data.images = old.images || [];
            }
            data.id = old.id || null;
            emergencies[editingEmergency] = data;
            editingEmergency = -1;

            if (data.id) {
                cloudOk = await dbUpdate("emergencies", data.id, emergencyToRow(data));
            } else {
                const inserted = await dbInsert("emergencies", emergencyToRow(data));
                if (inserted && inserted.id) {
                    data.id = inserted.id;
                }
                cloudOk = !!(inserted && inserted.id);
            }
        } else {
            const inserted = await dbInsert("emergencies", emergencyToRow(data));
            if (inserted && inserted.id) {
                data.id = inserted.id;
            }
            cloudOk = !!(inserted && inserted.id);
            emergencies.push(data);
        }

        await saveLocalData("emergencies", emergencies);

        clearEmergency();
        renderEmergencies();
        updateDashboard();

        let msg = cloudOk
            ? "تم حفظ رخصة الطوارئ بنجاح ✅"
            : "تم الحفظ على هذا الجهاز (المخزن الكبير) ⚠️\nسيُرفع للسحابة تلقائياً عند توفر الاتصال";

        if (skippedImagesCount > 0) {
            msg += "\n\n⚠️ لم تُحفظ " + skippedImagesCount + " صورة";
        }

        alert(msg);

    } catch (error) {
        console.error("خطأ في حفظ رخصة الطوارئ:", error);
        alert("حدث خطأ أثناء الحفظ:\n" + (error && error.message ? error.message : error));
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
        skippedImagesCount = 0;

        const before = await readImage(beforeFile);
        const after = await readImage(afterFile);

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

        let cloudOk = true;

        if (editingNote >= 0) {
            const old = notes[editingNote] || {};
            data.id = old.id || null;
            notes[editingNote] = data;
            editingNote = -1;

            if (data.id) {
                cloudOk = await dbUpdate("notes", data.id, noteToRow(data));
            } else {
                const inserted = await dbInsert("notes", noteToRow(data));
                if (inserted && inserted.id) {
                    data.id = inserted.id;
                }
                cloudOk = !!(inserted && inserted.id);
            }
        } else {
            const inserted = await dbInsert("notes", noteToRow(data));
            if (inserted && inserted.id) {
                data.id = inserted.id;
            }
            cloudOk = !!(inserted && inserted.id);
            notes.push(data);
        }

        await saveLocalData("notes", notes);

        clearNote();
        renderNotes();
        updateDashboard();

        let msg;
        if (cloudOk) {
            msg = completed
                ? "تم حفظ الملاحظة وتسجيلها كمعدلة ✅"
                : "تم حفظ الملاحظة بنجاح ✅";
        } else {
            msg = "تم الحفظ على هذا الجهاز (المخزن الكبير) ⚠️\nسيُرفع للسحابة تلقائياً عند توفر الاتصال";
        }

        if (skippedImagesCount > 0) {
            msg += "\n\n⚠️ لم تُحفظ " + skippedImagesCount + " صورة";
        }

        alert(msg);

    } catch (error) {
        console.error("خطأ في حفظ الملاحظة:", error);
        alert("حدث خطأ أثناء الحفظ:\n" + (error && error.message ? error.message : error));
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

    resolveIdbImages();
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

async function resolveImageForExport(ref) {
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
                <div style="font-size:45px;">🏗️</div>
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
// ==========================================
// كود الحذف الصارم (يُلصق في نهاية ملف script.js)
// ==========================================

window.deleteClearance = async function(index) {
    if (!confirm("هل أنت متأكد من حذف هذه الرخصة نهائياً؟")) return;
    
    const item = clearances[index];
    
    if (!item.id) {
        alert("خطأ: التطبيق لا يعرف الـ ID الخاص بهذه الرخصة. تأكد أن كود جلب البيانات (Select) يجلب عمود id.");
        return;
    }

    try {
        const { error } = await supabase.from('clearances').delete().eq('id', item.id);
        
        if (error) {
            alert("رفضت قاعدة البيانات الحذف! السبب: " + error.message);
            return; 
        }
        
        clearances.splice(index, 1);
        renderClearances();
        updateDashboard();
        alert("تم الحذف بنجاح من قاعدة البيانات");
        
    } catch (err) {
        alert("خطأ غير متوقع: " + err.message);
    }
};

window.deleteEmergency = async function(index) {
    if (!confirm("هل أنت متأكد من الحذف نهائياً؟")) return;
    
    const item = emergencies[index];
    
    if (!item.id) {
        alert("خطأ: التطبيق لا يعرف الـ ID الخاص بهذه الرخصة.");
        return;
    }

    try {
        const { error } = await supabase.from('emergencies').delete().eq('id', item.id);
        if (error) {
            alert("رفضت قاعدة البيانات الحذف! السبب: " + error.message);
            return;
        }
        emergencies.splice(index, 1);
        renderEmergencies();
        updateDashboard();
        alert("تم الحذف بنجاح من قاعدة البيانات");
    } catch (err) {
        alert("خطأ غير متوقع: " + err.message);
    }
};

window.deleteNote = async function(index) {
    if (!confirm("هل أنت متأكد من الحذف نهائياً؟")) return;
    
    const item = notes[index];
    
    if (!item.id) {
        alert("خطأ: التطبيق لا يعرف الـ ID الخاص بهذه الملاحظة.");
        return;
    }

    try {
        const { error } = await supabase.from('notes').delete().eq('id', item.id);
        if (error) {
            alert("رفضت قاعدة البيانات الحذف! السبب: " + error.message);
            return;
        }
        notes.splice(index, 1);
        renderNotes();
        updateDashboard();
        alert("تم الحذف بنجاح من قاعدة البيانات");
    } catch (err) {
        alert("خطأ غير متوقع: " + err.message);
    }
};
