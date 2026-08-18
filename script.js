/* =========================================================

   نظام مختبر جودة المشاريع

   JavaScript متوافق مع HTML المرسل

   ========================================================= */

/* =========================

   بتحميل البيانات

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
    }

    .then(({ error }) => {

        if (error) {

            console.error("Supabase Error:", error);

            alert("لم يتم حفظ البيانات في قاعدة البيانات");

        } else {

            console.log("تم الحفظ في Supabase بنجاح");

        }

    });

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
