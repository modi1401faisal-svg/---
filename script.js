#!/usr/bin/env python3
"""تطبيق جميع الإصلاحات على script_final.js"""

FILE = '/home/z/my-project/download/script_final.js'

with open(FILE, 'r', encoding='utf-8') as f:
    code = f.read()

# ============ الإصلاح 1: استبدال تحميل المكتبات ============
old_load = '''(function loadExportLibraries() {
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
})();'''

new_load = '''(function loadExportLibraries() {
    /* تم حذف html2pdf نهائياً - نستخدم window.print بدلاً منه
       هذا يمنع ظهور رسالة الجدار الناري */
    if (!document.getElementById("xlsxLibScript")) {
        var s1 = document.createElement("script");
        s1.id = "xlsxLibScript";
        s1.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
        s1.onerror = function () {
            var alt = document.createElement("script");
            alt.id = "xlsxLibScript";
            alt.src = "https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js";
            document.head.appendChild(alt);
        };
        document.head.appendChild(s1);
    }
})();'''

if old_load in code:
    code = code.replace(old_load, new_load)
    print("OK 1) loadExportLibraries replaced")
else:
    print("WARN 1) loadExportLibraries not found")

# ============ الإصلاح 2: استبدال generatePDFFromHTML ============
old_pdf = '''function generatePDFFromHTML(content, filename, orientation, btn) {
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
}'''

new_pdf = '''function generatePDFFromHTML(content, filename, orientation, btn) {
    if (btn) {
        btn.disabled = true;
        btn.setAttribute("data-old-text", btn.innerText);
        btn.innerText = "جاري الإنشاء...";
    }
    /* استخدام window.print بدلاً من html2pdf - لا تحتاج مكتبة خارجية */
    try {
        var printArea = document.getElementById("printArea");
        if (!printArea) {
            printArea = document.createElement("div");
            printArea.id = "printArea";
            document.body.appendChild(printArea);
        }
        printArea.innerHTML = content;

        var style = document.getElementById("printStyle");
        if (!style) {
            style = document.createElement("style");
            style.id = "printStyle";
            document.head.appendChild(style);
        }
        style.innerHTML =
            "@media print{" +
                "body *{visibility:hidden !important;}" +
                "#printArea,#printArea *{visibility:visible !important;}" +
                "#printArea{position:absolute;left:0;top:0;width:100%;padding:15px;background:#fff;}" +
                "table{width:100% !important;border-collapse:collapse;}" +
                "tr{page-break-inside:avoid;}" +
                "thead{display:table-header-group;}" +
                "@page{margin:1cm;size:A4 " + (orientation === "landscape" ? "landscape" : "portrait") + ";}" +
            "}" +
            "@media screen{#printArea{display:none;}}";

        var imgs = printArea.querySelectorAll("img");
        var imgPromises = Array.from(imgs).map(function (img) {
            if (img.complete && img.naturalWidth > 0) return Promise.resolve();
            return new Promise(function (resolve) {
                img.onload = resolve;
                img.onerror = resolve;
                setTimeout(resolve, 8000);
            });
        });

        Promise.all(imgPromises).then(function () {
            setTimeout(function () {
                try { window.print(); } catch (e) { console.error(e); }
                if (btn) {
                    btn.disabled = false;
                    btn.innerText = btn.getAttribute("data-old-text");
                }
            }, 300);
        });
    } catch (e) {
        console.error("PDF error:", e);
        alert("حدث خطأ أثناء إنشاء ملف PDF: " + (e && e.message ? e.message : e));
        if (btn) {
            btn.disabled = false;
            btn.innerText = btn.getAttribute("data-old-text");
        }
    }
}'''

if old_pdf in code:
    code = code.replace(old_pdf, new_pdf)
    print("OK 2) generatePDFFromHTML replaced")
else:
    print("WARN 2) generatePDFFromHTML not found")

# ============ الإصلاح 3: إزالة فحص html2pdf في دوال التصدير ============
old_check = '    if (typeof html2pdf === "undefined") {\n        alert("جاري تحميل مكتبة PDF...\\nانتظر ثانية واحدة ثم اضغط الزر مرة أخرى");\n        return;\n    }'

new_check = '    /* نستخدم window.print - لا حاجة لـ html2pdf */'

count = code.count(old_check)
code = code.replace(old_check, new_check)
print("OK 3) Removed " + str(count) + " html2pdf checks")

# ============ الإصلاح 4: تسريع readImage ============
old_read_image = '''async function readImage(file) {

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
}'''

new_read_image = '''async function readImage(file) {

    if (!file) {
        return "";
    }

    try {
        /* كشف الجوال لتقليل الأبعاد - مهم لمنع انهيار المتصفح */
        var isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
                       (window.innerWidth && window.innerWidth < 768);
        var maxDim = isMobile ? 500 : 800;
        var quality = isMobile ? 0.55 : 0.7;

        /* ضغط مرة واحدة فقط - يقلل استهلاك الذاكرة */
        var blob = await compressImageToBlob(file, maxDim, quality);
        if (!blob) {
            skippedImagesCount++;
            return "";
        }

        /* تخزين محلي فوري - سريع جداً */
        var dataUrl = await blobToDataUrl(blob);
        blob = null;

        if (!dataUrl) {
            skippedImagesCount++;
            return "";
        }

        var ref = await storeImageInIdb(dataUrl);
        dataUrl = null;

        if (!ref) {
            skippedImagesCount++;
            return "";
        }

        /* رفع للسحابة في الخلفية - بدون انتظار */
        backgroundUploadImage(ref);

        return ref;
    } catch (e) {
        console.warn("خطأ في معالجة الصورة:", e);
        skippedImagesCount++;
        return "";
    }
}

/* رفع صورة IndexedDB إلى السحابة في الخلفية - بدون انتظار */
async function backgroundUploadImage(ref) {
    try {
        var dataUrl = await idbGet(idbKeyFromRef(ref));
        if (!dataUrl) return;

        var res = await fetch(dataUrl);
        var blob = await res.blob();
        dataUrl = null;

        var cloudUrl = await withTimeout(uploadToSupabase(blob, "image/jpeg"), 60000);
        blob = null;

        if (!cloudUrl) return;

        var tasks = [
            { arr: clearances, table: "clearances", toRow: clearanceToRow },
            { arr: emergencies, table: "emergencies", toRow: emergencyToRow },
            { arr: notes, table: "notes", toRow: noteToRow }
        ];

        for (var t = 0; t < tasks.length; t++) {
            var task = tasks[t];
            for (var i = 0; i < task.arr.length; i++) {
                var item = task.arr[i];
                var changed = false;

                if (Array.isArray(item.images)) {
                    for (var j = 0; j < item.images.length; j++) {
                        if (item.images[j] === ref) {
                            item.images[j] = cloudUrl;
                            changed = true;
                        }
                    }
                }
                if (item.before === ref) {
                    item.before = cloudUrl;
                    changed = true;
                }
                if (item.after === ref) {
                    item.after = cloudUrl;
                    changed = true;
                }

                if (changed && item.id) {
                    try { await dbUpdate(task.table, item.id, task.toRow(item)); } catch (e) { }
                }
            }
        }

        try {
            localStorage.setItem("clearances", JSON.stringify(clearances));
            localStorage.setItem("emergencies", JSON.stringify(emergencies));
            localStorage.setItem("notes", JSON.stringify(notes));
        } catch (e) { }

        await idbDelete(idbKeyFromRef(ref));

        if (typeof renderClearances === "function") renderClearances();
        if (typeof renderEmergencies === "function") renderEmergencies();
        if (typeof renderNotes === "function") renderNotes();

        console.log("OK background upload done");
    } catch (e) {
        console.warn("Background upload failed:", e);
    }
}'''

if old_read_image in code:
    code = code.replace(old_read_image, new_read_image)
    print("OK 4) readImage replaced + backgroundUploadImage added")
else:
    print("WARN 4) readImage not found")

# ============ الإصلاح 5: تسريع readImages ============
old_read_images = '''async function readImages(files) {

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
}'''

new_read_images = '''async function readImages(files) {

    if (!files || files.length === 0) {
        return [];
    }

    /* معالجة تسلسلية مع تأخير صغير لتحرير الذاكرة - مهم للجوال */
    var result = [];
    var fileList = Array.from(files);

    for (var i = 0; i < fileList.length; i++) {
        try {
            var imageUrl = await readImage(fileList[i]);
            if (imageUrl) {
                result.push(imageUrl);
            }
        } catch (e) {
            console.warn("error processing image " + (i + 1) + ":", e);
        }

        if (i < fileList.length - 1) {
            await new Promise(function (resolve) {
                setTimeout(resolve, 150);
            });
        }
    }

    return result;
}'''

if old_read_images in code:
    code = code.replace(old_read_images, new_read_images)
    print("OK 5) readImages replaced")
else:
    print("WARN 5) readImages not found")

# ============ الإصلاح 6: saveClearance - حفظ محلي فوري ============
old_save_clear = '''async function saveClearance() {

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
            alert("يرجى تعبئة البيانات التالية:\\n\\n" + missing.join("\\n"));
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
            : "تم الحفظ على هذا الجهاز (المخزن الكبير) ⚠️\\nسيُرفع للسحابة تلقائياً عند توفر الاتصال";

        if (skippedImagesCount > 0) {
            msg += "\\n\\n⚠️ لم تُحفظ " + skippedImagesCount + " صورة";
        }

        alert(msg);

    } catch (error) {
        console.error("خطأ في حفظ رخصة الإخلاء:", error);
        alert("حدث خطأ أثناء الحفظ:\\n" + (error && error.message ? error.message : error));
    } finally {
        setSaveBusy(false);
    }
}'''

new_save_clear = '''async function saveClearance() {

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
            alert("يرجى تعبئة البيانات التالية:\\n\\n" + missing.join("\\n"));
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

        /* حفظ محلي فوري - لا ننتظر الشبكة */
        let isEdit = editingClearance >= 0;
        let oldId = null;

        if (isEdit) {
            const old = clearances[editingClearance] || {};
            if (images.length === 0) {
                data.images = old.images || [];
            }
            oldId = old.id || null;
            data.id = oldId;
            clearances[editingClearance] = data;
            editingClearance = -1;
        } else {
            data.id = data.id || ("local_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7));
            clearances.push(data);
        }

        await saveLocalData("clearances", clearances);

        clearClearance();
        renderClearances();
        updateDashboard();

        alert("✅ تم حفظ رخصة الإخلاء بنجاح");

        /* مزامنة مع السحابة في الخلفية - بدون انتظار */
        (async function () {
            try {
                if (isEdit && oldId) {
                    var ok = await dbUpdate("clearances", oldId, clearanceToRow(data));
                    if (!ok) {
                        var inserted = await dbInsert("clearances", clearanceToRow(data));
                        if (inserted && inserted.id) data.id = inserted.id;
                    }
                } else {
                    var rowToSend = clearanceToRow(data);
                    var inserted = await dbInsert("clearances", rowToSend);
                    if (inserted && inserted.id) {
                        data.id = inserted.id;
                        await saveLocalData("clearances", clearances);
                        renderClearances();
                    }
                }
                console.log("OK cloud sync done");
            } catch (e) {
                console.warn("cloud sync failed:", e);
            }
        })();

    } catch (error) {
        console.error("خطأ في حفظ رخصة الإخلاء:", error);
        alert("حدث خطأ أثناء الحفظ:\\n" + (error && error.message ? error.message : error));
    } finally {
        setSaveBusy(false);
    }
}'''

if old_save_clear in code:
    code = code.replace(old_save_clear, new_save_clear)
    print("OK 6) saveClearance replaced")
else:
    print("WARN 6) saveClearance not found")

# ============ الإصلاح 7: deleteClearance ============
old_del_clear = '''async function deleteClearance(index) {

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
}'''

new_del_clear = '''async function deleteClearance(index, event) {

    if (event && event.preventDefault) {
        event.preventDefault();
        event.stopPropagation();
    }

    if (!confirm("هل تريد حذف رخصة الإخلاء؟")) {
        return false;
    }

    const item = clearances[index];
    if (!item) return false;

    /* حذف متفائل - إزالة من الشاشة فوراً */
    const backup = clearances[index];
    const backupIndex = index;
    clearances.splice(index, 1);

    renderClearances();
    updateDashboard();
    await saveLocalData("clearances", clearances);

    if (backup && Array.isArray(backup.images)) {
        for (const img of backup.images) {
            if (isIdbRef(img)) {
                try { await idbDelete(idbKeyFromRef(img)); } catch (e) { }
            }
        }
    }

    if (backup && backup.id) {
        (async function () {
            try {
                var ok = await dbDelete("clearances", backup.id);
                if (!ok) {
                    clearances.splice(backupIndex, 0, backup);
                    await saveLocalData("clearances", clearances);
                    renderClearances();
                    updateDashboard();
                    alert("⚠️ تعذر الحذف من السحابة، تمت الاستعادة");
                }
            } catch (e) {
                clearances.splice(backupIndex, 0, backup);
                await saveLocalData("clearances", clearances);
                renderClearances();
                updateDashboard();
            }
        })();
    }

    console.log("OK deleted locally");
    return false;
}'''

if old_del_clear in code:
    code = code.replace(old_del_clear, new_del_clear)
    print("OK 7) deleteClearance replaced")
else:
    print("WARN 7) deleteClearance not found")

# ============ الإصلاح 8: deleteEmergency ============
old_del_emg = '''async function deleteEmergency(index) {

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
}'''

new_del_emg = '''async function deleteEmergency(index, event) {

    if (event && event.preventDefault) {
        event.preventDefault();
        event.stopPropagation();
    }

    if (!confirm("هل تريد حذف رخصة الطوارئ؟")) {
        return false;
    }

    const item = emergencies[index];
    if (!item) return false;

    const backup = emergencies[index];
    const backupIndex = index;
    emergencies.splice(index, 1);

    renderEmergencies();
    updateDashboard();
    await saveLocalData("emergencies", emergencies);

    if (backup && Array.isArray(backup.images)) {
        for (const img of backup.images) {
            if (isIdbRef(img)) {
                try { await idbDelete(idbKeyFromRef(img)); } catch (e) { }
            }
        }
    }

    if (backup && backup.id) {
        (async function () {
            try {
                var ok = await dbDelete("emergencies", backup.id);
                if (!ok) {
                    emergencies.splice(backupIndex, 0, backup);
                    await saveLocalData("emergencies", emergencies);
                    renderEmergencies();
                    updateDashboard();
                    alert("⚠️ تعذر الحذف من السحابة، تمت الاستعادة");
                }
            } catch (e) {
                emergencies.splice(backupIndex, 0, backup);
                await saveLocalData("emergencies", emergencies);
                renderEmergencies();
                updateDashboard();
            }
        })();
    }

    console.log("OK emergency deleted locally");
    return false;
}'''

if old_del_emg in code:
    code = code.replace(old_del_emg, new_del_emg)
    print("OK 8) deleteEmergency replaced")
else:
    print("WARN 8) deleteEmergency not found")

# ============ الإصلاح 9: deleteNote ============
old_del_note = '''async function deleteNote(index) {

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
}'''

new_del_note = '''async function deleteNote(index, event) {

    if (event && event.preventDefault) {
        event.preventDefault();
        event.stopPropagation();
    }

    if (!confirm("هل تريد حذف الملاحظة؟")) {
        return false;
    }

    const item = notes[index];
    if (!item) return false;

    const backup = notes[index];
    const backupIndex = index;
    notes.splice(index, 1);

    renderNotes();
    updateDashboard();
    await saveLocalData("notes", notes);

    if (backup) {
        if (isIdbRef(backup.before)) {
            try { await idbDelete(idbKeyFromRef(backup.before)); } catch (e) { }
        }
        if (isIdbRef(backup.after)) {
            try { await idbDelete(idbKeyFromRef(backup.after)); } catch (e) { }
        }
    }

    if (backup && backup.id) {
        (async function () {
            try {
                var ok = await dbDelete("notes", backup.id);
                if (!ok) {
                    notes.splice(backupIndex, 0, backup);
                    await saveLocalData("notes", notes);
                    renderNotes();
                    updateDashboard();
                    alert("⚠️ تعذر الحذف من السحابة، تمت الاستعادة");
                }
            } catch (e) {
                notes.splice(backupIndex, 0, backup);
                await saveLocalData("notes", notes);
                renderNotes();
                updateDashboard();
            }
        })();
    }

    console.log("OK note deleted locally");
    return false;
}'''

if old_del_note in code:
    code = code.replace(old_del_note, new_del_note)
    print("OK 9) deleteNote replaced")
else:
    print("WARN 9) deleteNote not found")

# ============ الإصلاح 10: اعتراض عالمي + استعادة الصفحة ============
extra_code = '''

/* =========================================================
   إصلاحات إضافية لمنع مشاكل الجوال والجدار الناري
   ========================================================= */
(function () {
    "use strict";

    /* اعتراض عالمي: إضافة type="button" لكل زر بدون type
       لمنع submit الافتراضي الذي يُسبب إعادة تحميل الصفحة */
    document.addEventListener("click", function (e) {
        try {
            var target = e.target;
            while (target && target !== document.body) {
                if (target.tagName === "BUTTON") {
                    if (!target.getAttribute("type")) {
                        target.setAttribute("type", "button");
                    }
                    if (target.getAttribute("type") === "submit") {
                        var form = target.closest("form");
                        if (!form || form.getAttribute("data-real-form") !== "true") {
                            target.setAttribute("type", "button");
                        }
                    }
                    break;
                }
                target = target.parentElement;
            }
        } catch (err) { }
    }, true);

    /* حفظ الصفحة النشطة في sessionStorage */
    var LAB_PAGE_KEY = "labLastActivePage";
    var _origShowPage = window.showPage;
    if (typeof _origShowPage === "function") {
        window.showPage = function (page) {
            try { sessionStorage.setItem(LAB_PAGE_KEY, page); } catch (e) { }
            return _origShowPage.apply(this, arguments);
        };
    }

    /* استعادة الصفحة المحفوظة بعد التحميل */
    document.addEventListener("DOMContentLoaded", function () {
        setTimeout(function () {
            try {
                var saved = sessionStorage.getItem(LAB_PAGE_KEY);
                if (saved && document.getElementById(saved)) {
                    var active = document.querySelector(".page.active");
                    if (!active || active.id !== saved) {
                        document.querySelectorAll(".page").forEach(function (p) {
                            p.classList.remove("active");
                        });
                        document.getElementById(saved).classList.add("active");
                    }
                }
            } catch (e) { }
        }, 200);
    });

    console.log("OK extra fixes loaded");
})();
'''

code = code.rstrip() + extra_code

with open(FILE, 'w', encoding='utf-8') as f:
    f.write(code)

print("\nFinal file size: " + str(len(code)) + " bytes")
/* =========================================================
   إصلاح شامل: يحل مشكلة الجدار الناري + إظهار الصفحات + الحفظ السريع
   يُلصق في نهاية ملف script.js فقط - لا يلمس الكود الأصلي
   ========================================================= */
(function () {
    "use strict";

    /* 1) منع رسالة الجدار الناري: تعطيل html2pdf نهائياً */
    window.html2pdf = function () {
        return {
            set: function () { return this; },
            from: function () { return this; },
            save: function () { return Promise.resolve(); }
        };
    };

    /* 2) استبدال generatePDFFromHTML بـ window.print - لا يحتاج مكتبة */
    window.generatePDFFromHTML = function (content, filename, orientation, btn) {
        if (btn) {
            btn.disabled = true;
            btn.setAttribute("data-old-text", btn.innerText);
            btn.innerText = "جاري الإنشاء...";
        }
        try {
            var printArea = document.getElementById("printArea");
            if (!printArea) {
                printArea = document.createElement("div");
                printArea.id = "printArea";
                document.body.appendChild(printArea);
            }
            printArea.innerHTML = content;

            var style = document.getElementById("printStyle");
            if (!style) {
                style = document.createElement("style");
                style.id = "printStyle";
                document.head.appendChild(style);
            }
            style.innerHTML =
                "@media print{" +
                "body *{visibility:hidden !important;}" +
                "#printArea,#printArea *{visibility:visible !important;}" +
                "#printArea{position:absolute;left:0;top:0;width:100%;padding:15px;background:#fff;}" +
                "table{width:100% !important;border-collapse:collapse;}" +
                "tr{page-break-inside:avoid;}" +
                "thead{display:table-header-group;}" +
                "@page{margin:1cm;size:A4 " + (orientation === "landscape" ? "landscape" : "portrait") + ";}" +
                "}" +
                "@media screen{#printArea{display:none;}}";

            var imgs = printArea.querySelectorAll("img");
            var imgPromises = Array.from(imgs).map(function (img) {
                if (img.complete && img.naturalWidth > 0) return Promise.resolve();
                return new Promise(function (resolve) {
                    img.onload = resolve;
                    img.onerror = resolve;
                    setTimeout(resolve, 8000);
                });
            });

            Promise.all(imgPromises).then(function () {
                setTimeout(function () {
                    try { window.print(); } catch (e) { console.error(e); }
                    if (btn) {
                        btn.disabled = false;
                        btn.innerText = btn.getAttribute("data-old-text");
                    }
                }, 300);
            });
        } catch (e) {
            console.error("PDF error:", e);
            alert("حدث خطأ في PDF: " + (e && e.message ? e.message : e));
            if (btn) {
                btn.disabled = false;
                btn.innerText = btn.getAttribute("data-old-text");
            }
        }
    };

    /* 3) منع فحص html2pdf من إيقاف العملية */
    var origExportClear = window.exportClearancesToPDF;
    if (origExportClear) {
        window.exportClearancesToPDF = async function (btn) {
            try {
                if (window.clearances && clearances.length === 0) {
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
                    if (!imagesHTML) imagesHTML = '<span style="color:#999;font-size:11px;">لا توجد صور</span>';
                    rows += '<tr><td style="padding:6px 8px;border:1px solid #999;text-align:center;">' + (index + 1) + '</td>' +
                        '<td style="padding:6px 8px;border:1px solid #999;">' + (item.permit || "") + '</td>' +
                        '<td style="padding:6px 8px;border:1px solid #999;">' + (item.contractor || "") + '</td>' +
                        '<td style="padding:6px 8px;border:1px solid #999;">' + (item.owner || "") + '</td>' +
                        '<td style="padding:6px 8px;border:1px solid #999;">' + (item.location || "") + '</td>' +
                        '<td style="padding:6px 8px;border:1px solid #999;">' + imagesHTML + '</td></tr>';
                });
                var content = '<div dir="rtl" style="font-family:Arial,sans-serif;">' +
                    '<div style="text-align:center;border-bottom:3px solid #173f32;padding-bottom:8px;margin-bottom:12px;">' +
                    '<h2 style="color:#173f32;margin:0;">نظام مختبر جودة المشاريع</h2>' +
                    '<h3 style="color:#333;margin:8px 0 4px;">تقرير رخص الإخلاء</h3>' +
                    '<p style="color:#666;margin:0;font-size:12px;">إجمالي الرخص: ' + clearances.length + '</p>' +
                    '</div><table style="width:100%;border-collapse:collapse;">' +
                    '<thead><tr>' +
                    '<th style="padding:8px;border:1px solid #999;background:#173f32;color:#fff;">م</th>' +
                    '<th style="padding:8px;border:1px solid #999;background:#173f32;color:#fff;">رقم التصريح</th>' +
                    '<th style="padding:8px;border:1px solid #999;background:#173f32;color:#fff;">اسم المقاول</th>' +
                    '<th style="padding:8px;border:1px solid #999;background:#173f32;color:#fff;">الجهة المالكة</th>' +
                    '<th style="padding:8px;border:1px solid #999;background:#173f32;color:#fff;">الموقع</th>' +
                    '<th style="padding:8px;border:1px solid #999;background:#173f32;color:#fff;">الصور</th>' +
                    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
                generatePDFFromHTML(content, "clearances.pdf", "landscape", btn);
            } catch (e) {
                console.error("Export PDF error:", e);
                alert("خطأ في تصدير PDF: " + e.message);
            }
        };
    }

    /* 4) ضمان ظهور الصفحات */
    function showFirstPage() {
        try {
            var active = document.querySelector(".page.active");
            if (!active) {
                var first = document.querySelector(".page");
                if (first) first.classList.add("active");
            }
        } catch (e) { }
    }

    /* تشغيل فوري */
    showFirstPage();

    /* تشغيل بعد تحميل DOM */
    document.addEventListener("DOMContentLoaded", showFirstPage);

    /* تشغيل بعد ثانية (احتياط) */
    setTimeout(showFirstPage, 1000);
    setTimeout(showFirstPage, 3000);

    /* 5) اعتراض عالمي لمنع submit الافتراضي على الأزرار */
    document.addEventListener("click", function (e) {
        try {
            var target = e.target;
            while (target && target !== document.body) {
                if (target.tagName === "BUTTON") {
                    if (!target.getAttribute("type")) {
                        target.setAttribute("type", "button");
                    }
                    break;
                }
                target = target.parentElement;
            }
        } catch (err) { }
    }, true);

    console.log("✅ تم تحميل الإصلاحات بنجاح");
})();
