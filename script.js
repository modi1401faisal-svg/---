/* =========================================================

   نظام مختبر جودة المشاريع

   JavaScript متوافق مع HTML المرسل

   ========================================================= */

/* =========================

   تحميل البيانات

========================= */
const SUPABASE_URL = "https://efceexzzjmvscjqlgmio.supabase.co/rest/v1/";

 const SUPABASE_ANON_KEY =  "sb_publishable_F40NK174mIl6_nAfFEGBYw_mPAA27Ft";
let clearances = JSON.parse(localStorage.getItem("clearances")) || [];

let emergencies = JSON.parse(localStorage.getItem("emergencies")) || [];

let notes = JSON.parse(localStorage.getItem("notes")) || [];

/* =========================

   مؤشرات التعديل

========================= */

let editingClearance = -1;

let editingEmergency = -1;

let editingNote = -1;

/* =========================

   التنقل بين الصفحات

========================= */

function showPage(page) {

    document.querySelectorAll(".page").forEach(function (p) {

        p.classList.remove("active");

    });

    const selectedPage = document.getElementById(page);

    if (selectedPage) {

        selectedPage.classList.add("active");

    }

    updateDashboard();

}

/* =========================================================

   الصور

========================================================= */

function readImage(file) {

    return new Promise(function (resolve) {

        if (!file) {

            resolve("");

            return;

        }

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

async function readImages(files) {

    const result = [];

    if (!files) {

        return result;

    }

    for (const file of files) {

        const image = await readImage(file);

        if (image) {

            result.push(image);

        }

    }

    return result;

}

/* =========================

   عرض الصورة

========================= */

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

            style="

                width:70px;

                height:70px;

                object-fit:cover;

                border-radius:8px;

                cursor:pointer;

                margin:3px;

            "

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

                body {

                    margin:0;

                    background:#173f32;

                    display:flex;

                    justify-content:center;

                    align-items:center;

                    min-height:100vh;

                }

                img {

                    max-width:95%;

                    max-height:95vh;

                    object-fit:contain;

                    border-radius:12px;

                }

            </style>

        </head>

        <body>

            <img src="${image}">

        </body>

        </html>

    `);

}

/* =========================================================

   رخص الإخلاءات

========================================================= */

async function saveClearance() {

    const permitEl = document.getElementById("clearancePermit");

    const contractorEl = document.getElementById("clearanceContractor");

    const ownerEl = document.getElementById("clearanceOwner");

    const locationEl = document.getElementById("clearanceLocation");

    const imagesEl = document.getElementById("clearanceImages");

    if (

        !permitEl ||

        !contractorEl ||

        !ownerEl ||

        !locationEl

    ) {

        alert("يوجد خطأ في حقول رخصة الإخلاء");

        return;

    }

    const permit = permitEl.value.trim();

    const contractor = contractorEl.value.trim();

    const owner = ownerEl.value.trim();

    const location = locationEl.value.trim();

    let missing = [];

    if (!permit) {

        missing.push("رقم التصريح");

    }

    if (!contractor) {

        missing.push("اسم المقاول");

    }

    if (!owner) {

        missing.push("الجهة المالكة");

    }

    if (!location) {

        missing.push("الموقع");

    }

    if (missing.length > 0) {

        alert(

            "يرجى تعبئة البيانات التالية:\n\n" +

            missing.join("\n")

        );

        return;

    }

    const files = imagesEl ? imagesEl.files : [];

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

            data.images =

                clearances[editingClearance].images || [];

        }

        clearances[editingClearance] = data;

        editingClearance = -1;

    } else {

        clearances.push(data);

    }

    localStorage.setItem(

        "clearances",

        JSON.stringify(clearances)

    );

    clearClearance();

    renderClearances();

    updateDashboard();

    alert("تم حفظ رخصة الإخلاء بنجاح ✅");

}

function clearClearance() {

    const fields = [

        "clearancePermit",

        "clearanceContractor",

        "clearanceOwner",

        "clearanceLocation"

    ];

    fields.forEach(function (id) {

        const el = document.getElementById(id);

        if (el) {

            el.value = "";

        }

    });

    const images = document.getElementById("clearanceImages");

    if (images) {

        images.value = "";

    }

    editingClearance = -1;

}

function renderClearances(data = clearances) {

    const table = document.getElementById("clearanceTable");

    if (!table) {

        return;

    }

    table.innerHTML = "";

    if (data.length === 0) {

        table.innerHTML = `

            <tr>

                <td colspan="6">

                    لا توجد رخص إخلاء مسجلة

                </td>

            </tr>

        `;

        return;

    }

    data.forEach(function (item) {

        const originalIndex =

            clearances.indexOf(item);

        let imagesHTML = "";

        if (

            item.images &&

            item.images.length > 0

        ) {

            item.images.forEach(function (img) {

                imagesHTML += imageThumb(

                    img,

                    "صورة رخصة الإخلاء"

                );

            });

        } else {

            imagesHTML =

                "<span>لا توجد صور</span>";

        }

        table.innerHTML += `

            <tr>

                <td>${item.permit || ""}</td>

                <td>${item.contractor || ""}</td>

                <td>${item.owner || ""}</td>

                <td>${item.location || ""}</td>

                <td>${imagesHTML}</td>

                <td>

                    <button

                        class="edit"

                        onclick="editClearance(${originalIndex})"

                    >

                        تعديل

                    </button>

                    <button

                        class="delete"

                        onclick="deleteClearance(${originalIndex})"

                    >

                        حذف

                    </button>

                </td>

            </tr>

        `;

    });

}

function searchClearance() {

    const input =

        document.getElementById("clearanceSearch");

    const result =

        document.getElementById("clearanceSearchResult");

    if (!input || !result) {

        return;

    }

    const value =

        input.value.trim().toLowerCase();

    if (!value) {

        result.innerHTML =

            `<div class="search-error">

                اكتب رقم رخصة الإخلاء أولاً

            </div>`;

        renderClearances();

        return;

    }

    const results =

        clearances.filter(function (item) {

            return String(

                item.permit || ""

            )

            .toLowerCase()

            .includes(value);

        });

    if (results.length === 0) {

        result.innerHTML =

            `<div class="search-error">

                لم يتم العثور على رخصة بهذا الرقم

            </div>`;

        renderClearances([]);

        return;

    }

    result.innerHTML =

        `<div class="search-success">

            تم العثور على ${results.length} رخصة إخلاء

        </div>`;

    renderClearances(results);

}

function clearClearanceSearch() {

    const input =

        document.getElementById("clearanceSearch");

    const result =

        document.getElementById("clearanceSearchResult");

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

    document.getElementById(

        "clearancePermit"

    ).value = item.permit || "";

    document.getElementById(

        "clearanceContractor"

    ).value = item.contractor || "";

    document.getElementById(

        "clearanceOwner"

    ).value = item.owner || "";

    document.getElementById(

        "clearanceLocation"

    ).value = item.location || "";

    editingClearance = index;

    showPage("clearance");

    window.scrollTo({

        top:0,

        behavior:"smooth"

    });

}

function deleteClearance(index) {

    if (!confirm("هل تريد حذف رخصة الإخلاء؟")) {

        return;

    }

    clearances.splice(index, 1);

    localStorage.setItem(

        "clearances",

        JSON.stringify(clearances)

    );

    renderClearances();

    updateDashboard();

    alert("تم حذف الرخصة");

}

/* =========================================================

   رخص الطوارئ

========================================================= */

async function saveEmergency() {

    const permit =

        document.getElementById(

            "emergencyPermit"

        ).value.trim();

    const contractor =

        document.getElementById(

            "emergencyContractor"

        ).value.trim();

    const owner =

        document.getElementById(

            "emergencyOwner"

        ).value.trim();

    const labReceive =

        document.getElementById(

            "labReceiveDate"

        ).value;

    const start =

        document.getElementById(

            "workStartDate"

        ).value;

    const end =

        document.getElementById(

            "workEndDate"

        ).value;

    const location =

        document.getElementById(

            "emergencyLocation"

        ).value.trim();

    const files =

        document.getElementById(

            "emergencyImages"

        ).files;

    let missing = [];

    if (!permit) {

        missing.push("رقم التصريح");

    }

    if (!contractor) {

        missing.push("اسم المقاول");

    }

    if (!owner) {

        missing.push("الجهة المالكة");

    }

    if (missing.length > 0) {

        alert(

            "يرجى تعبئة البيانات التالية:\n\n" +

            missing.join("\n")

        );

        return;

    }

    const images =

        await readImages(files);

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

            data.images =

                emergencies[editingEmergency].images || [];

        }

        emergencies[editingEmergency] = data;

        editingEmergency = -1;

    } else {

        emergencies.push(data);

    }

    localStorage.setItem(

        "emergencies",

        JSON.stringify(emergencies)

    );

    clearEmergency();

    renderEmergencies();

    updateDashboard();

    alert("تم حفظ رخصة الطوارئ بنجاح ✅");

}

function clearEmergency() {

    const fields = [

        "emergencyPermit",

        "emergencyContractor",

        "emergencyOwner",

        "labReceiveDate",

        "workStartDate",

        "workEndDate",

        "emergencyLocation"

    ];

    fields.forEach(function (id) {

        const el =

            document.getElementById(id);

        if (el) {

            el.value = "";

        }

    });

    const images =

        document.getElementById(

            "emergencyImages"

        );

    if (images) {

        images.value = "";

    }

    editingEmergency = -1;

}

function renderEmergencies(data = emergencies) {

    const table =

        document.getElementById(

            "emergencyTable"

        );

    if (!table) {

        return;

    }

    table.innerHTML = "";

    if (data.length === 0) {

        table.innerHTML = `

            <tr>

                <td colspan="9">

                    لا توجد رخص طوارئ مسجلة

                </td>

            </tr>

        `;

        return;

    }

    data.forEach(function (item) {

        const originalIndex =

            emergencies.indexOf(item);

        let imagesHTML = "";

        if (

            item.images &&

            item.images.length > 0

        ) {

            item.images.forEach(function (img) {

                imagesHTML += imageThumb(

                    img,

                    "صورة رخصة الطوارئ"

                );

            });

        } else {

            imagesHTML =

                "<span>لا توجد صور</span>";

        }

        table.innerHTML += `

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

                    <button

                        class="edit"

                        onclick="editEmergency(${originalIndex})"

                    >

                        تعديل

                    </button>

                    <button

                        class="delete"

                        onclick="deleteEmergency(${originalIndex})"

                    >

                        حذف

                    </button>

                </td>

            </tr>

        `;

    });

}

function searchEmergency() {

    const input =

        document.getElementById(

            "emergencySearch"

        );

    const result =

        document.getElementById(

            "emergencySearchResult"

        );

    if (!input || !result) {

        return;

    }

    const value =

        input.value.trim().toLowerCase();

    if (!value) {

        result.innerHTML =

            `<div class="search-error">

                اكتب رقم رخصة الطوارئ أولاً

            </div>`;

        renderEmergencies();

        return;

    }

    const results =

        emergencies.filter(function (item) {

            return String(

                item.permit || ""

            )

            .toLowerCase()

            .includes(value);

        });

    if (results.length === 0) {

        result.innerHTML =

            `<div class="search-error">

                لم يتم العثور على رخصة بهذا الرقم

            </div>`;

        renderEmergencies([]);

        return;

    }

    result.innerHTML =

        `<div class="search-success">

            تم العثور على ${results.length} رخصة طوارئ

        </div>`;

    renderEmergencies(results);

}

function clearEmergencySearch() {

    const input =

        document.getElementById(

            "emergencySearch"

        );

    const result =

        document.getElementById(

            "emergencySearchResult"

        );

    if (input) {

        input.value = "";

    }

    if (result) {

        result.innerHTML = "";

    }

    renderEmergencies();

}

function editEmergency(index) {

    const item =

        emergencies[index];

    if (!item) {

        return;

    }

    document.getElementById(

        "emergencyPermit"

    ).value = item.permit || "";

    document.getElementById(

        "emergencyContractor"

    ).value = item.contractor || "";

    document.getElementById(

        "emergencyOwner"

    ).value = item.owner || "";

    document.getElementById(

        "labReceiveDate"

    ).value = item.labReceive || "";

    document.getElementById(

        "workStartDate"

    ).value = item.start || "";

    document.getElementById(

        "workEndDate"

    ).value = item.end || "";

    document.getElementById(

        "emergencyLocation"

    ).value = item.location || "";

    editingEmergency = index;

    showPage("emergency");

    window.scrollTo({

        top:0,

        behavior:"smooth"

    });

}

function deleteEmergency(index) {

    if (!confirm("هل تريد حذف رخصة الطوارئ؟")) {

        return;

    }

    emergencies.splice(index, 1);

    localStorage.setItem(

        "emergencies",

        JSON.stringify(emergencies)

    );

    renderEmergencies();

    updateDashboard();

    alert("تم حذف الرخصة");

}

/* =========================================================

   تصنيف الملاحظات

========================================================= */

/*

   التصنيف محفوظ داخل البيانات ولكن

   لا يظهر كعمود في الجدول.

*/

function setNoteType(type) {

    const noteType =

        document.getElementById(

            "noteType"

        );

    if (noteType) {

        noteType.value = type;

    }

    /*

       تمييز الزر المختار

    */

    document.querySelectorAll(

        ".note-types button"

    ).forEach(function (button) {

        button.classList.remove("active");

    });

    const buttons =

        document.querySelectorAll(

            ".note-types button"

        );

    buttons.forEach(function (button) {

        if (

            button.textContent.trim() ===

            type

        ) {

            button.classList.add("active");

        }

    });

}

/* =========================================================

   حفظ الملاحظة

========================================================= */

async function saveNote() {

    /* --------------------------------

       جلب الحقول

    -------------------------------- */

    const dateEl =

        document.getElementById("noteDate");

    const permitEl =

        document.getElementById("notePermit");

    const contractorEl =

        document.getElementById(

            "noteContractor"

        );

    const ownerEl =

        document.getElementById(

            "noteOwner"

        );

    const reasonEl =

        document.getElementById(

            "noteReason"

        );

    const actionEl =

        document.getElementById(

            "noteAction"

        );

    const typeEl =

        document.getElementById(

            "noteType"

        );

    const beforeEl =

        document.getElementById(

            "beforeImage"

        );

    const afterEl =

        document.getElementById(

            "afterImage"

        );

    /* --------------------------------

       التأكد من وجود الحقول

    -------------------------------- */

    if (

        !dateEl ||

        !permitEl ||

        !contractorEl ||

        !ownerEl ||

        !reasonEl ||

        !actionEl ||

        !typeEl

    ) {

        alert(

            "حدث خطأ في حقول الملاحظة.\n" +

            "تأكد من أن HTML مطابق للكود."

        );

        return;

    }

    /* --------------------------------

       قراءة البيانات

    -------------------------------- */

    const date =

        dateEl.value;

    const permit =

        permitEl.value.trim();

    const contractor =

        contractorEl.value.trim();

    const owner =

        ownerEl.value.trim();

    const reason =

        reasonEl.value.trim();

    const action =

        actionEl.value.trim();

    const type =

        typeEl.value ||

        "مشاريع الأمانة";

    /* --------------------------------

       فحص الحقول

    -------------------------------- */

    let missing = [];

    if (!date) {

        missing.push("تاريخ الملاحظة");

    }

    if (!permit) {

        missing.push("رقم التصريح");

    }

    if (!contractor) {

        missing.push("اسم المقاول");

    }

    if (!owner) {

        missing.push("الجهة المالكة");

    }

    if (!reason) {

        missing.push("أسباب الرفض");

    }

    if (!action) {

        missing.push("الإجراء المتخذ");

    }

    if (missing.length > 0) {

        alert(

            "يرجى تعبئة البيانات التالية:\n\n" +

            missing.join("\n")

        );

        return;

    }

    /* --------------------------------

       البيانات القديمة عند التعديل

    -------------------------------- */

    let oldNote = null;

    if (editingNote >= 0) {

        oldNote =

            notes[editingNote] || null;

    }

    /* --------------------------------

       الصور

    -------------------------------- */

    const beforeFile =

        beforeEl &&

        beforeEl.files.length > 0

            ? beforeEl.files[0]

            : null;

    const afterFile =

        afterEl &&

        afterEl.files.length > 0

            ? afterEl.files[0]

            : null;

    const before =

        await readImage(beforeFile);

    const after =

        await readImage(afterFile);

    /* --------------------------------

       الاحتفاظ بالصور القديمة

    -------------------------------- */

    const beforeImage =

        before ||

        (oldNote ? oldNote.before || "" : "");

    const afterImage =

        after ||

        (oldNote ? oldNote.after || "" : "");

    /* --------------------------------

       تحديد الحالة

    -------------------------------- */

    const completed =

        afterImage !== "";

    /* --------------------------------

       إنشاء الملاحظة

    -------------------------------- */

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

    /* --------------------------------

       حفظ أو تعديل

    -------------------------------- */

    if (editingNote >= 0) {

        notes[editingNote] = data;

        editingNote = -1;

    } else {

        notes.push(data);

    }

    /* --------------------------------

       التخزين

    -------------------------------- */

    localStorage.setItem(

        "notes",

        JSON.stringify(notes)

    );

    /* --------------------------------

       تنظيف وإعادة العرض

    -------------------------------- */

    clearNote();

    renderNotes();

    updateDashboard();

    if (completed) {

        alert(

            "تم حفظ الملاحظة وتسجيلها كمعدلة ✅"

        );

    } else {

        alert(

            "تم حفظ الملاحظة بنجاح ✅"

        );

    }

}

/* =========================================================

   تفريغ نموذج الملاحظات

========================================================= */

function clearNote() {

    const fields = [

        "noteDate",

        "notePermit",

        "noteContractor",

        "noteOwner",

        "noteReason"

    ];

    fields.forEach(function (id) {

        const el =

            document.getElementById(id);

        if (el) {

            el.value = "";

        }

    });

    const before =

        document.getElementById(

            "beforeImage"

        );

    const after =

        document.getElementById(

            "afterImage"

        );

    if (before) {

        before.value = "";

    }

    if (after) {

        after.value = "";

    }

    const action =

        document.getElementById(

            "noteAction"

        );

    if (action) {

        action.value =

            "تم إبلاغ المقاول بالملاحظات واتخاذ الإجراء اللازم";

    }

    const type =

        document.getElementById(

            "noteType"

        );

    if (type) {

        type.value =

            "مشاريع الأمانة";

    }

    document.querySelectorAll(

        ".note-types button"

    ).forEach(function (button) {

        button.classList.remove("active");

    });

    editingNote = -1;

}

/* =========================================================

   حساب الأيام

========================================================= */

function daysPassed(date) {

    if (!date) {

        return 0;

    }

    const today =

        new Date();

    today.setHours(

        0, 0, 0, 0

    );

    const noteDate =

        new Date(date);

    noteDate.setHours(

        0, 0, 0, 0

    );

    const difference =

        today - noteDate;

    return Math.floor(

        difference /

        (1000 * 60 * 60 * 24)

    );

}

/* =========================================================

   الملاحظة متأخرة

========================================================= */

function isLate(note) {

    if (note.completed) {

        return false;

    }

    return daysPassed(note.date) >= 5;

}

/* =========================================================

   عرض الملاحظات وتصنيفها

========================================================= */

function renderNotes() {

    const table =

        document.getElementById(

            "notesTable"

        );

    if (!table) {

        return;

    }

    table.innerHTML = "";

    if (!notes || notes.length === 0) {

        table.innerHTML = `

            <tr>

                <td colspan="10">

                    لا توجد ملاحظات مسجلة

                </td>

            </tr>

        `;

        return;

    }

    /*

       ترتيب التصنيفات

    */

    const categories = [

        "مشاريع الأمانة",

        "المياه الوطنية",

        "الكهرباء",

        "الاتصالات",

        "مشاريع خاصة"

    ];

    categories.forEach(function (category) {

        const categoryNotes =

            notes.filter(function (item) {

                return (

                    (item.type ||

                    "مشاريع الأمانة") ===

                    category

                );

            });

        if (categoryNotes.length === 0) {

            return;

        }

        /* --------------------------------

           عنوان التصنيف

        -------------------------------- */

        table.innerHTML += `

            <tr class="note-category-row">

                <td colspan="10"

                    style="

                        font-weight:bold;

                        text-align:right;

                        padding:12px;

                    "

                >

                    📁 ${category}

                </td>

            </tr>

        `;

        /* --------------------------------

           الملاحظات داخل التصنيف

        -------------------------------- */

        categoryNotes.forEach(function (item) {

            const index =

                notes.indexOf(item);

            const late =

                isLate(item);

            let status = "";

            if (item.completed) {

                status =

                    `<span class="status-done">

                        ✅ تم التعديل

                    </span>`;

            } else if (late) {

                status =

                    `<span class="status-open">

                        🔴 متأخرة

                    </span>`;

            } else {

                status =

                    `<span class="status-follow">

                        قيد المتابعة

                    </span>`;

            }

            /* --------------------------------

               الصور

            -------------------------------- */

            let imagesHTML = "";

            if (item.before) {

                imagesHTML += `

                    <div>

                        <small>

                            قبل التعديل

                        </small>

                        <br>

                        ${imageThumb(

                            item.before,

                            "صورة الملاحظة"

                        )}

                    </div>

                `;

            }

            if (item.after) {

                imagesHTML += `

                    <div>

                        <small>

                            بعد التعديل

                        </small>

                        <br>

                        ${imageThumb(

                            item.after,

                            "صورة الملاحظة بعد التعديل"

                        )}

                    </div>

                `;

            }

            if (!imagesHTML) {

                imagesHTML =

                    "<span>لا توجد صور</span>";

            }

            /* --------------------------------

               الصف

               لا يوجد عمود نوع الملاحظة

            -------------------------------- */

            table.innerHTML += `

                <tr

                    ${late

                        ? 'style="background:#fff0f0;"'

                        : ""

                    }

                >

                    <td>

                        ${item.date || ""}

                    </td>

                    <td>

                        ${item.permit || ""}

                    </td>

                    <td>

                        ${item.contractor || ""}

                    </td>

                    <td>

                        ${item.owner || ""}

                    </td>

                    <td>

                        ${item.reason || ""}

                    </td>

                    <td>

                        ${item.action || ""}

                    </td>

                    <td>

                        ${status}

                    </td>

                    <td>

                        ${imagesHTML}

                    </td>

                    <td>

                        <button

                            class="edit"

                            onclick="editNote(${index})"

                        >

                            تعديل

                        </button>

                        <button

                            class="delete"

                            onclick="deleteNote(${index})"

                        >

                            حذف

                        </button>

                    </td>

                </tr>

            `;

        });

    });

}

/* =========================================================

   تعديل الملاحظة

========================================================= */

function editNote(index) {

    const item =

        notes[index];

    if (!item) {

        return;

    }

    document.getElementById(

        "noteType"

    ).value =

        item.type ||

        "مشاريع الأمانة";

    document.getElementById(

        "noteDate"

    ).value =

        item.date || "";

    document.getElementById(

        "notePermit"

    ).value =

        item.permit || "";

    document.getElementById(

        "noteContractor"

    ).value =

        item.contractor || "";

    document.getElementById(

        "noteOwner"

    ).value =

        item.owner || "";

    document.getElementById(

        "noteReason"

    ).value =

        item.reason || "";

    document.getElementById(

        "noteAction"

    ).value =

        item.action ||

        "تم إبلاغ المقاول بالملاحظات واتخاذ الإجراء اللازم";

    editingNote = index;

    setNoteType(

        item.type ||

        "مشاريع الأمانة"

    );

    showPage("notes");

    window.scrollTo({

        top:0,

        behavior:"smooth"

    });

}

/* =========================================================

   حذف الملاحظة

========================================================= */

function deleteNote(index) {

    if (!confirm("هل تريد حذف الملاحظة؟")) {

        return;

    }

    notes.splice(index, 1);

    localStorage.setItem(

        "notes",

        JSON.stringify(notes)

    );

    renderNotes();

    updateDashboard();

    alert("تم حذف الملاحظة");

}

/* =========================================================

   التنبيهات

========================================================= */

function updateAlerts() {

    const late =

        notes.filter(function (note) {

            return isLate(note);

        });

    const lateCounter =

        document.getElementById(

            "lateNotesCount"

        );

    const completedCounter =

        document.getElementById(

            "completedNotesCount"

        );

    const alertsBox =

        document.getElementById(

            "alerts"

        );

    if (lateCounter) {

        lateCounter.innerText =

            late.length;

    }

    if (completedCounter) {

        completedCounter.innerText =

            notes.filter(function (note) {

                return note.completed;

            }).length;

    }

    if (!alertsBox) {

        return;

    }

    if (late.length === 0) {

        alertsBox.innerHTML =

            "لا توجد ملاحظات متأخرة حالياً";

        return;

    }

    alertsBox.innerHTML = "";

    late.forEach(function (note) {

        const days =

            daysPassed(note.date);

        const index =

            notes.indexOf(note);

        alertsBox.innerHTML += `

            <div class="alert-item">

                <strong>

                    🔴 ملاحظة تجاوزت 5 أيام

                </strong>

                <br><br>

                تاريخ الملاحظة:

                ${note.date}

                <br>

                رقم التصريح:

                ${note.permit}

                <br>

                المقاول:

                ${note.contractor}

                <br>

                التصنيف:

                ${note.type || "مشاريع الأمانة"}

                <br>

                سبب الرفض:

                ${note.reason}

                <br>

                مضى على الملاحظة:

                <strong>

                    ${days} أيام

                </strong>

                <br><br>

                <button

                    class="edit"

                    onclick="editNote(${index})"

                >

                    فتح الملاحظة

                </button>

            </div>

        `;

    });

}

/* =========================================================

   لوحة المتابعة

========================================================= */

function updateDashboard() {

    const clearanceCounter =

        document.getElementById(

            "clearanceCount"

        );

    const emergencyCounter =

        document.getElementById(

            "emergencyCount"

        );

    if (clearanceCounter) {

        clearanceCounter.innerText =

            clearances.length;

    }

    if (emergencyCounter) {

        emergencyCounter.innerText =

            emergencies.length;

    }

    updateAlerts();

}

/* =========================================================

   التشغيل عند فتح الصفحة

========================================================= */

document.addEventListener(

    "DOMContentLoaded",

    function () {

        /* البحث */

        const clearanceSearch =

            document.getElementById(

                "clearanceSearch"

            );

        const emergencySearch =

            document.getElementById(

                "emergencySearch"

            );

        if (clearanceSearch) {

            clearanceSearch.addEventListener(

                "keydown",

                function (event) {

                    if (event.key === "Enter") {

                        searchClearance();

                    }

                }

            );

        }

        if (emergencySearch) {

            emergencySearch.addEventListener(

                "keydown",

                function (event) {

                    if (event.key === "Enter") {

                        searchEmergency();

                    }

                }

            );

        }

        /* عرض البيانات */

        renderClearances();

        renderEmergencies();

        renderNotes();

        updateDashboard();

        /* اختيار التصنيف الافتراضي */

        setNoteType(

            "مشاريع الأمانة"

        );

    }

);

/* =========================================================

   تحديث التنبيهات تلقائياً

========================================================= */
/* =========================================================
   نظام تصدير البيانات إلى Excel و PDF - النسخة المحسّنة
   الصق في آخر ملف JavaScript بعد حذف الكود القديم
   ========================================================= */

/* =========================
   دوال مساعدة
========================= */
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
    if (item.completed) { return "تم التعديل"; }
    if (isLate(item)) { return "متأخرة"; }
    return "قيد المتابعة";
}

var PDF_TH = "padding:8px;border:1px solid #999;background:#173f32;color:#ffffff;font-size:12px;text-align:center;";
var PDF_TD = "padding:6px 8px;border:1px solid #999;font-size:12px;";
var PDF_TD_CENTER = "padding:6px 8px;border:1px solid #999;font-size:12px;text-align:center;";

function pdfReportHeader(title, info) {
    return '<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;">' +
        '<div style="text-align:center;border-bottom:3px solid #173f32;padding-bottom:8px;margin-bottom:12px;">' +
        '<h2 style="color:#173f32;margin:0;">نظام مختبر جودة المشاريع</h2>' +
        '<h3 style="color:#333;margin:8px 0 4px;">' + title + '</h3>' +
        '<p style="color:#666;margin:0;font-size:12px;">' + info + ' | تاريخ التقرير: ' + exportDate() + '</p>' +
        '</div>';
}

function pdfReportFooter() {
    return '<p style="text-align:center;color:#999;font-size:11px;margin-top:15px;">تم إنشاء التقرير بواسطة نظام مختبر جودة المشاريع</p></div>';
}

/* =========================
   فحص النظام - للتشخيص
   اضغط F12 ثم اكتب: checkExportSystem()
========================= */
function checkExportSystem() {
    var lines = [];
    lines.push("===== فحص نظام التصدير =====");
    lines.push("مكتبة Excel: " + (typeof XLSX !== "undefined" ? "محملة بنجاح" : "غير محملة"));
    lines.push("مكتبة PDF: " + (typeof html2pdf !== "undefined" ? "محملة بنجاح" : "غير محملة"));
    lines.push("جدول الإخلاءات: " + (document.getElementById("clearanceTable") ? "موجود" : "غير موجود"));
    lines.push("جدول الطوارئ: " + (document.getElementById("emergencyTable") ? "موجود" : "غير موجود"));
    lines.push("جدول الملاحظات: " + (document.getElementById("notesTable") ? "موجود" : "غير موجود"));
    lines.push("عدد رخص الإخلاء: " + (typeof clearances !== "undefined" ? clearances.length : "غير معرف"));
    lines.push("عدد رخص الطوارئ: " + (typeof emergencies !== "undefined" ? emergencies.length : "غير معرف"));
    lines.push("عدد الملاحظات: " + (typeof notes !== "undefined" ? notes.length : "غير معرف"));
    var msg = lines.join("\n");
    console.log(msg);
    alert(msg);
}

/* =========================
   تحميل المكتبات الاحتياطي
========================= */
var __triedXLSX = false;
var __triedPdf = false;

function ensureLibraries() {
    if (typeof XLSX === "undefined" && !__triedXLSX) {
        __triedXLSX = true;
        var s1 = document.createElement("script");
        s1.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
        document.head.appendChild(s1);
    }
    if (typeof html2pdf === "undefined" && !__triedPdf) {
        __triedPdf = true;
        var s2 = document.createElement("script");
        s2.src = "https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js";
        document.head.appendChild(s2);
    }
}

/* =========================
   بديل PDF: نافذة طباعة
========================= */
function printHTMLFallback(content) {
    var w = window.open("", "_blank");
    if (!w) {
        alert("يرجى السماح بالنوافذ المنبثقة للمتصفح");
        return;
    }
    w.document.open();
    w.document.write('<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>تقرير</title></head><body>' + content + '</body></html>');
    w.document.close();
    setTimeout(function () {
        try { w.print(); } catch (e) { }
    }, 800);
}

/* =========================
   بديل Excel: ملف CSV
========================= */
function downloadCSV(rows, filename) {
    if (!rows || rows.length === 0) { return; }
    var headers = [];
    var key;
    for (key in rows[0]) {
        if (rows[0].hasOwnProperty(key)) { headers.push(key); }
    }
    var lines = [];
    lines.push(headers.join(","));
    for (var i = 0; i < rows.length; i++) {
        var vals = [];
        for (var j = 0; j < headers.length; j++) {
            var v = String(rows[i][headers[j]] == null ? "" : rows[i][headers[j]]);
            v = v.replace(/"/g, '""');
            vals.push('"' + v + '"');
        }
        lines.push(vals.join(","));
    }
    var csv = "\uFEFF" + lines.join("\r\n");
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    var link = document.createElement("a");
    var url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename.replace(/\.xlsx$/i, "") + ".csv";
    document.body.appendChild(link);
    link.click();
    setTimeout(function () {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, 100);
}

/* =========================
   إنشاء PDF مع حماية كاملة
========================= */
function generatePDFFromHTML(content, filename, orientation, btn) {
    var oldText = "";
    if (btn) {
        oldText = btn.innerText;
        btn.disabled = true;
        btn.innerText = "جاري الإنشاء...";
    }
    function restore() {
        if (btn) {
            btn.disabled = false;
            btn.innerText = oldText;
        }
    }
    if (typeof html2pdf === "undefined") {
        restore();
        alert("مكتبة PDF غير محملة.\nسيتم فتح نافذة الطباعة - اختر (حفظ كـ PDF).");
        printHTMLFallback(content);
        return;
    }
    try {
        var element = document.createElement("div");
        element.innerHTML = content;
        html2pdf().set({
            margin: 10,
            filename: filename,
            image: { type: "jpeg", quality: 0.95 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: "mm", format: "a4", orientation: orientation || "landscape" },
            pagebreak: { mode: ["css", "legacy"], avoid: ["tr"] }
        }).from(element).save().then(function () {
            restore();
        }).catch(function (err) {
            restore();
            console.error("خطأ PDF:", err);
            alert("تعذر إنشاء PDF.\nسيتم فتح نافذة الطباعة كبديل.");
            printHTMLFallback(content);
        });
    } catch (err) {
        restore();
        console.error("خطأ PDF:", err);
        printHTMLFallback(content);
    }
}

/* =========================
   إنشاء Excel
========================= */
function downloadExcel(rows, sheetName, cols, filename) {
    if (typeof XLSX === "undefined") {
        downloadCSV(rows, filename);
        return;
    }
    try {
        var ws = XLSX.utils.json_to_sheet(rows);
        ws["!cols"] = cols;
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        if (!wb.Workbook) { wb.Workbook = {}; }
        if (!wb.Workbook.Views) { wb.Workbook.Views = []; }
        wb.Workbook.Views.push({ RTL: true });
        XLSX.writeFile(wb, filename);
    } catch (err) {
        console.error("خطأ Excel:", err);
        alert("حدث خطأ في تصدير Excel، سيتم التصدير بصيغة CSV");
        downloadCSV(rows, filename);
    }
}

/* =========================================================
   رخص الإخلاء
========================================================= */
function exportClearancesToExcel() {
    if (!clearances || clearances.length === 0) {
        alert("لا توجد رخص إخلاء للتصدير");
        return;
    }
    var rows = [];
    for (var i = 0; i < clearances.length; i++) {
        var item = clearances[i];
        rows.push({
            "م": i + 1,
            "رقم التصريح": item.permit || "",
            "اسم المقاول": item.contractor || "",
            "الجهة المالكة": item.owner || "",
            "الموقع": item.location || "",
            "عدد الصور": (item.images || []).length
        });
    }
    downloadExcel(rows, "رخص الإخلاء",
        [{ wch: 5 }, { wch: 18 }, { wch: 28 }, { wch: 28 }, { wch: 32 }, { wch: 10 }],
        "رخص_الإخلاء_" + exportDate() + ".xlsx");
}

function exportClearancesToPDF(btn) {
    if (!clearances || clearances.length === 0) {
        alert("لا توجد رخص إخلاء للتصدير");
        return;
    }
    var rows = "";
    for (var i = 0; i < clearances.length; i++) {
        var item = clearances[i];
        var imagesHTML = "";
        var imgs = item.images || [];
        for (var j = 0; j < imgs.length; j++) {
            imagesHTML += '<img src="' + imgs[j] + '" style="width:60px;height:60px;object-fit:cover;border-radius:4px;margin:2px;">';
        }
        if (!imagesHTML) {
            imagesHTML = '<span style="color:#999;font-size:11px;">لا توجد صور</span>';
        }
        rows += '<tr>' +
            '<td style="' + PDF_TD_CENTER + '">' + (i + 1) + '</td>' +
            '<td style="' + PDF_TD + '">' + (item.permit || "") + '</td>' +
            '<td style="' + PDF_TD + '">' + (item.contractor || "") + '</td>' +
            '<td style="' + PDF_TD + '">' + (item.owner || "") + '</td>' +
            '<td style="' + PDF_TD + '">' + (item.location || "") + '</td>' +
            '<td style="' + PDF_TD + '">' + imagesHTML + '</td>' +
            '</tr>';
    }
    var content = pdfReportHeader("تقرير رخص الإخلاء", "إجمالي الرخص: " + clearances.length) +
        '<table style="width:100%;border-collapse:collapse;"><thead><tr>' +
        '<th style="' + PDF_TH + '">م</th>' +
        '<th style="' + PDF_TH + '">رقم التصريح</th>' +
        '<th style="' + PDF_TH + '">اسم المقاول</th>' +
        '<th style="' + PDF_TH + '">الجهة المالكة</th>' +
        '<th style="' + PDF_TH + '">الموقع</th>' +
        '<th style="' + PDF_TH + '">الصور</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>' + pdfReportFooter();
    generatePDFFromHTML(content, "رخص_الإخلاء_" + exportDate() + ".pdf", "landscape", btn);
}

/* =========================================================
   رخص الطوارئ
========================================================= */
function exportEmergenciesToExcel() {
    if (!emergencies || emergencies.length === 0) {
        alert("لا توجد رخص طوارئ للتصدير");
        return;
    }
    var rows = [];
    for (var i = 0; i < emergencies.length; i++) {
        var item = emergencies[i];
        rows.push({
            "م": i + 1,
            "رقم التصريح": item.permit || "",
            "اسم المقاول": item.contractor || "",
            "الجهة المالكة": item.owner || "",
            "تاريخ الاستلام بالمختبر": item.labReceive || "",
            "تاريخ بداية العمل": item.start || "",
            "تاريخ انتهاء العمل": item.end || "",
            "الموقع": item.location || "",
            "عدد الصور": (item.images || []).length
        });
    }
    downloadExcel(rows, "رخص الطوارئ",
        [{ wch: 5 }, { wch: 18 }, { wch: 25 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 30 }, { wch: 10 }],
        "رخص_الطوارئ_" + exportDate() + ".xlsx");
}

function exportEmergenciesToPDF(btn) {
    if (!emergencies || emergencies.length === 0) {
        alert("لا توجد رخص طوارئ للتصدير");
        return;
    }
    var rows = "";
    for (var i = 0; i < emergencies.length; i++) {
        var item = emergencies[i];
        var imagesHTML = "";
        var imgs = item.images || [];
        for (var j = 0; j < imgs.length; j++) {
            imagesHTML += '<img src="' + imgs[j] + '" style="width:60px;height:60px;object-fit:cover;border-radius:4px;margin:2px;">';
        }
        if (!imagesHTML) {
            imagesHTML = '<span style="color:#999;font-size:11px;">لا توجد صور</span>';
        }
        rows += '<tr>' +
            '<td style="' + PDF_TD_CENTER + '">' + (i + 1) + '</td>' +
            '<td style="' + PDF_TD + '">' + (item.permit || "") + '</td>' +
            '<td style="' + PDF_TD + '">' + (item.contractor || "") + '</td>' +
            '<td style="' + PDF_TD + '">' + (item.owner || "") + '</td>' +
            '<td style="' + PDF_TD_CENTER + '">' + (item.labReceive || "") + '</td>' +
            '<td style="' + PDF_TD_CENTER + '">' + (item.start || "") + '</td>' +
            '<td style="' + PDF_TD_CENTER + '">' + (item.end || "") + '</td>' +
            '<td style="' + PDF_TD + '">' + (item.location || "") + '</td>' +
            '<td style="' + PDF_TD + '">' + imagesHTML + '</td>' +
            '</tr>';
    }
    var content = pdfReportHeader("تقرير رخص الطوارئ", "إجمالي الرخص: " + emergencies.length) +
        '<table style="width:100%;border-collapse:collapse;"><thead><tr>' +
        '<th style="' + PDF_TH + '">م</th>' +
        '<th style="' + PDF_TH + '">رقم التصريح</th>' +
        '<th style="' + PDF_TH + '">اسم المقاول</th>' +
        '<th style="' + PDF_TH + '">الجهة المالكة</th>' +
        '<th style="' + PDF_TH + '">تاريخ الاستلام</th>' +
        '<th style="' + PDF_TH + '">بداية العمل</th>' +
        '<th style="' + PDF_TH + '">انتهاء العمل</th>' +
        '<th style="' + PDF_TH + '">الموقع</th>' +
        '<th style="' + PDF_TH + '">الصور</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>' + pdfReportFooter();
    generatePDFFromHTML(content, "رخص_الطوارئ_" + exportDate() + ".pdf", "landscape", btn);
}

/* =========================================================
   الملاحظات (الكل)
========================================================= */
function exportNotesToExcel() {
    if (!notes || notes.length === 0) {
        alert("لا توجد ملاحظات للتصدير");
        return;
    }
    var rows = [];
    for (var i = 0; i < notes.length; i++) {
        var item = notes[i];
        rows.push({
            "م": i + 1,
            "التصنيف": item.type || "مشاريع الأمانة",
            "تاريخ الملاحظة": item.date || "",
            "رقم التصريح": item.permit || "",
            "اسم المقاول": item.contractor || "",
            "الجهة المالكة": item.owner || "",
            "أسباب الرفض": item.reason || "",
            "الإجراء المتخذ": item.action || "",
            "الحالة": noteStatusText(item),
            "عدد الأيام المنقضية": daysPassed(item.date),
            "صورة قبل التعديل": item.before ? "يوجد" : "لا يوجد",
            "صورة بعد التعديل": item.after ? "يوجد" : "لا يوجد"
        });
    }
    downloadExcel(rows, "الملاحظات",
        [{ wch: 5 }, { wch: 18 }, { wch: 15 }, { wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 35 }, { wch: 35 }, { wch: 14 }, { wch: 16 }, { wch: 15 }, { wch: 15 }],
        "الملاحظات_" + exportDate() + ".xlsx");
}

function exportNotesToPDF(btn) {
    if (!notes || notes.length === 0) {
        alert("لا توجد ملاحظات للتصدير");
        return;
    }
    var categories = ["مشاريع الأمانة", "المياه الوطنية", "الكهرباء", "الاتصالات", "مشاريع خاصة"];
    var rows = "";
    for (var c = 0; c < categories.length; c++) {
        var category = categories[c];
        var categoryNotes = [];
        for (var i = 0; i < notes.length; i++) {
            if ((notes[i].type || "مشاريع الأمانة") === category) {
                categoryNotes.push(notes[i]);
            }
        }
        if (categoryNotes.length === 0) { continue; }
        rows += '<tr><td colspan="8" style="padding:10px;border:1px solid #999;background:#e8f5ee;color:#173f32;font-weight:bold;font-size:14px;text-align:right;">' + category + ' (عدد الملاحظات: ' + categoryNotes.length + ')</td></tr>';
        for (var n = 0; n < categoryNotes.length; n++) {
            var item = categoryNotes[n];
            var imagesHTML = "";
            if (item.before) {
                imagesHTML += '<div style="text-align:center;"><small style="color:#666;">قبل</small><br><img src="' + item.before + '" style="width:55px;height:55px;object-fit:cover;border-radius:4px;margin:2px;"></div>';
            }
            if (item.after) {
                imagesHTML += '<div style="text-align:center;"><small style="color:#666;">بعد</small><br><img src="' + item.after + '" style="width:55px;height:55px;object-fit:cover;border-radius:4px;margin:2px;"></div>';
            }
            if (!imagesHTML) {
                imagesHTML = '<span style="color:#999;font-size:11px;">لا توجد صور</span>';
            }
            var rowStyle = isLate(item) ? ' style="background:#fff0f0;"' : "";
            rows += '<tr' + rowStyle + '>' +
                '<td style="' + PDF_TD_CENTER + '">' + (item.date || "") + '</td>' +
                '<td style="' + PDF_TD + '">' + (item.permit || "") + '</td>' +
                '<td style="' + PDF_TD + '">' + (item.contractor || "") + '</td>' +
                '<td style="' + PDF_TD + '">' + (item.owner || "") + '</td>' +
                '<td style="' + PDF_TD + '">' + (item.reason || "") + '</td>' +
                '<td style="' + PDF_TD + '">' + (item.action || "") + '</td>' +
                '<td style="' + PDF_TD_CENTER + '">' + noteStatusText(item) + '</td>' +
                '<td style="' + PDF_TD + '">' + imagesHTML + '</td>' +
                '</tr>';
        }
    }
    var content = pdfReportHeader("تقرير الملاحظات", "إجمالي الملاحظات: " + notes.length) +
        '<table style="width:100%;border-collapse:collapse;"><thead><tr>' +
        '<th style="' + PDF_TH + '">التاريخ</th>' +
        '<th style="' + PDF_TH + '">رقم التصريح</th>' +
        '<th style="' + PDF_TH + '">اسم المقاول</th>' +
        '<th style="' + PDF_TH + '">الجهة المالكة</th>' +
        '<th style="' + PDF_TH + '">أسباب الرفض</th>' +
        '<th style="' + PDF_TH + '">الإجراء المتخذ</th>' +
        '<th style="' + PDF_TH + '">الحالة</th>' +
        '<th style="' + PDF_TH + '">الصور</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>' + pdfReportFooter();
    generatePDFFromHTML(content, "الملاحظات_" + exportDate() + ".pdf", "landscape", btn);
}

/* =========================================================
   ملاحظة واحدة
========================================================= */
function exportSingleNoteToExcel(index) {
    var item = notes ? notes[index] : null;
    if (!item) {
        alert("الملاحظة غير موجودة");
        return;
    }
    var rows = [{
        "التصنيف": item.type || "مشاريع الأمانة",
        "تاريخ الملاحظة": item.date || "",
        "رقم التصريح": item.permit || "",
        "اسم المقاول": item.contractor || "",
        "الجهة المالكة": item.owner || "",
        "أسباب الرفض": item.reason || "",
        "الإجراء المتخذ": item.action || "",
        "الحالة": noteStatusText(item),
        "عدد الأيام المنقضية": daysPassed(item.date),
        "صورة قبل التعديل": item.before ? "يوجد" : "لا يوجد",
        "صورة بعد التعديل": item.after ? "يوجد" : "لا يوجد"
    }];
    downloadExcel(rows, "الملاحظة",
        [{ wch: 18 }, { wch: 15 }, { wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 35 }, { wch: 35 }, { wch: 14 }, { wch: 16 }, { wch: 15 }, { wch: 15 }],
        "ملاحظة_" + safeFileName(item.permit) + ".xlsx");
}

function exportSingleNoteToPDF(index, btn) {
    var item = notes ? notes[index] : null;
    if (!item) {
        alert("الملاحظة غير موجودة");
        return;
    }
    var labelStyle = "padding:10px;border:1px solid #999;background:#173f32;color:#ffffff;font-weight:bold;font-size:13px;width:30%;";
    var valueStyle = "padding:10px;border:1px solid #999;font-size:13px;";

    function row(label, value) {
        return '<tr><td style="' + labelStyle + '">' + label + '</td><td style="' + valueStyle + '">' + value + '</td></tr>';
    }

    var imagesHTML = "";
    if (item.before || item.after) {
        imagesHTML = '<div style="text-align:center;margin-top:20px;">';
        if (item.before) {
            imagesHTML += '<div style="display:inline-block;vertical-align:top;margin:10px;"><h4 style="color:#173f32;margin:0 0 8px;">صورة قبل التعديل</h4><img src="' + item.before + '" style="max-width:300px;width:90%;border:1px solid #ccc;border-radius:8px;"></div>';
        }
        if (item.after) {
            imagesHTML += '<div style="display:inline-block;vertical-align:top;margin:10px;"><h4 style="color:#173f32;margin:0 0 8px;">صورة بعد التعديل</h4><img src="' + item.after + '" style="max-width:300px;width:90%;border:1px solid #ccc;border-radius:8px;"></div>';
        }
        imagesHTML += '</div>';
    } else {
        imagesHTML = '<p style="text-align:center;color:#999;">لا توجد صور لهذه الملاحظة</p>';
    }

    var content = pdfReportHeader("تفاصيل الملاحظة", "رقم التصريح: " + (item.permit || "")) +
        '<table style="width:100%;border-collapse:collapse;margin-top:5px;">' +
        row("التصنيف", item.type || "مشاريع الأمانة") +
        row("تاريخ الملاحظة", item.date || "") +
        row("رقم التصريح", item.permit || "") +
        row("اسم المقاول", item.contractor || "") +
        row("الجهة المالكة", item.owner || "") +
        row("أسباب الرفض", item.reason || "") +
        row("الإجراء المتخذ", item.action || "") +
        row("الحالة", noteStatusText(item)) +
        row("مضى على الملاحظة", daysPassed(item.date) + " يوم") +
        '</table>' + imagesHTML +
        '<p style="text-align:center;color:#999;font-size:11px;margin-top:25px;">تم إنشاء التقرير بواسطة نظام مختبر جودة المشاريع - ' + exportDate() + '</p></div>';

    generatePDFFromHTML(content, "ملاحظة_" + safeFileName(item.permit) + "_" + exportDate() + ".pdf", "portrait", btn);
}

/* =========================================================
   إضافة الأزرار تلقائياً
========================================================= */
var EXPORT_BTN_STYLE = "background:#173f32;color:#ffffff;border:none;padding:10px 18px;border-radius:8px;cursor:pointer;font-size:14px;font-family:inherit;margin:3px;";
var EXPORT_BTN_SMALL = "background:#173f32;color:#ffffff;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-family:inherit;margin:2px;";

function insertButtonsHTML(tableId, divId, buttonsHTML) {
    var tableEl = document.getElementById(tableId);
    if (!tableEl) { return; }
    var target = tableEl;
    if (tableEl.tagName === "TBODY") {
        target = tableEl.parentElement || tableEl;
    }
    var container = document.createElement("div");
    container.id = divId;
    container.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin:15px 0;";
    container.innerHTML = buttonsHTML;
    if (target && target.parentNode) {
        target.parentNode.insertBefore(container, target);
    }
}

function injectSectionExportButtons() {
    if (document.getElementById("clearanceTable") && !document.getElementById("clearanceExportButtons")) {
        insertButtonsHTML("clearanceTable", "clearanceExportButtons",
            '<button type="button" style="' + EXPORT_BTN_STYLE + '" onclick="exportClearancesToExcel()">📥 تصدير رخص الإخلاء - Excel</button>' +
            '<button type="button" style="' + EXPORT_BTN_STYLE + '" onclick="exportClearancesToPDF(this)">📄 تصدير رخص الإخلاء - PDF</button>');
    }
    if (document.getElementById("emergencyTable") && !document.getElementById("emergencyExportButtons")) {
        insertButtonsHTML("emergencyTable", "emergencyExportButtons",
            '<button type="button" style="' + EXPORT_BTN_STYLE + '" onclick="exportEmergenciesToExcel()">📥 تصدير رخص الطوارئ - Excel</button>' +
            '<button type="button" style="' + EXPORT_BTN_STYLE + '" onclick="exportEmergenciesToPDF(this)">📄 تصدير رخص الطوارئ - PDF</button>');
    }
    if (document.getElementById("notesTable") && !document.getElementById("notesExportButtons")) {
        insertButtonsHTML("notesTable", "notesExportButtons",
            '<button type="button" style="' + EXPORT_BTN_STYLE + '" onclick="exportNotesToExcel()">📥 تصدير الملاحظات - Excel</button>' +
            '<button type="button" style="' + EXPORT_BTN_STYLE + '" onclick="exportNotesToPDF(this)">📄 تصدير الملاحظات - PDF</button>');
    }
}

function addNoteExportButtons() {
    var table = document.getElementById("notesTable");
    if (!table) { return; }
    var deleteButtons = table.querySelectorAll("button.delete");
    for (var i = 0; i < deleteButtons.length; i++) {
        var deleteBtn = deleteButtons[i];
        var cell = deleteBtn.parentElement;
        if (!cell || cell.querySelector(".note-export-btn")) { continue; }
        var onclickAttr = deleteBtn.getAttribute("onclick") || "";
        var match = onclickAttr.match(/deleteNote\((\d+)\)/);
        if (!match) { continue; }
        var index = match[1];

        var pdfBtn = document.createElement("button");
        pdfBtn.type = "button";
        pdfBtn.className = "note-export-btn";
        pdfBtn.style.cssText = EXPORT_BTN_SMALL;
        pdfBtn.setAttribute("onclick", "exportSingleNoteToPDF(" + index + ", this)");
        pdfBtn.innerText = "📄 PDF";

        var excelBtn = document.createElement("button");
        excelBtn.type = "button";
        excelBtn.className = "note-export-btn";
        excelBtn.style.cssText = EXPORT_BTN_SMALL;
        excelBtn.setAttribute("onclick", "exportSingleNoteToExcel(" + index + ")");
        excelBtn.innerText = "📊 Excel";

        cell.appendChild(pdfBtn);
        cell.appendChild(excelBtn);
    }
}

/* =========================
   التشغيل التلقائي
   يفحص كل ثانيتين ويضمن بقاء الأزرار دائماً
========================= */
function injectAllExportButtons() {
    injectSectionExportButtons();
    addNoteExportButtons();
}

function setupExportFeatures() {
    injectAllExportButtons();
    setInterval(function () {
        injectAllExportButtons();
    }, 2000);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
        setTimeout(setupExportFeatures, 200);
    });
} else {
    setTimeout(setupExportFeatures, 200);
}
