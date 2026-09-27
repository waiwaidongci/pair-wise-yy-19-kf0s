const storageKey = "wxyy-2-thin-section-index";
const state = JSON.parse(localStorage.getItem(storageKey) || '{"samples":[],"compare":[],"templates":[]}');
state.templates = state.templates || [];

const form = document.querySelector("#sampleForm");
const photoInput = document.querySelector("#photoInput");
const sampleGrid = document.querySelector("#sampleGrid");
const comparePane = document.querySelector("#comparePane");
const compareNotice = document.querySelector("#compareNotice");
const mineralFilter = document.querySelector("#mineralFilter");
const polarFilter = document.querySelector("#polarFilter");
const assemblyFilter = document.querySelector("#assemblyFilter");
const templateForm = document.querySelector("#templateForm");
const templateList = document.querySelector("#templateList");
const templateMsg = document.querySelector("#templateMsg");
const sampleSubmit = document.querySelector("#sampleSubmit");
const sampleCancelEdit = document.querySelector("#sampleCancelEdit");
const templateSubmit = document.querySelector("#templateSubmit");
const templateCancelEdit = document.querySelector("#templateCancelEdit");

let pendingPhoto = "";
let editingSampleId = "";
let editingTemplateId = "";
let compareMessage = "";

function save() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function readFileAsDataUrl(file) {
  return new Promise((resolve) => {
    if (!file) return resolve("");
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.readAsDataURL(file);
  });
}

function parseMinerals(text) {
  const minerals = [];
  (text || "").split(/[、，,;；\/|\s]+/).forEach((raw) => {
    const token = raw.replace(/[（(][^)）]*[)）]/g, "").trim();
    if (token && !minerals.some((item) => item.toLowerCase() === token.toLowerCase())) {
      minerals.push(token);
    }
  });
  return minerals;
}

function matchSample(sample) {
  const minerals = parseMinerals(sample.minerals).map((item) => item.toLowerCase());
  return state.templates
    .map((template) => {
      const missing = template.required.filter((item) => !minerals.includes(item.toLowerCase()));
      const assocHit = template.associated.filter((item) => minerals.includes(item.toLowerCase()));
      return { template, hit: missing.length === 0, missing, assocHit };
    })
    .filter((entry) => entry.hit);
}

function sharedTemplates(first, second) {
  const firstIds = new Set(matchSample(first).map((entry) => entry.template.id));
  return matchSample(second).filter((entry) => firstIds.has(entry.template.id));
}

function templateConflict(name, required) {
  const requiredKey = required.map((item) => item.toLowerCase()).sort().join("|");
  for (const template of state.templates) {
    if (template.id === editingTemplateId) continue;
    if (template.name === name) return `组合名称与已有组合「${template.name}」重复`;
    const key = template.required.map((item) => item.toLowerCase()).sort().join("|");
    if (key === requiredKey) return `必需矿物与已有组合「${template.name}」完全相同`;
  }
  return "";
}

function filteredSamples() {
  const mineral = mineralFilter.value.trim();
  const polarization = polarFilter.value;
  const assemblyId = assemblyFilter.value;
  return state.samples.filter((sample) => {
    const mineralMatch = !mineral || sample.minerals.includes(mineral);
    const polarMatch = !polarization || sample.polarization === polarization;
    const assemblyMatch = !assemblyId || matchSample(sample).some((entry) => entry.template.id === assemblyId);
    return mineralMatch && polarMatch && assemblyMatch;
  });
}

function enforceComparePair() {
  const pair = state.compare
    .map((id) => state.samples.find((sample) => sample.id === id))
    .filter(Boolean);
  if (pair.length === 2 && !sharedTemplates(pair[0], pair[1]).length) {
    state.compare = [];
    compareMessage = "两张样本不再命中同一组合，对比已退出，请重新选择。";
    save();
  }
}

function renderAssemblyFilter() {
  const current = assemblyFilter.value;
  assemblyFilter.innerHTML = "<option value=\"\">全部组合</option>" + state.templates
    .map((template) => `<option value="${template.id}">${template.name}</option>`)
    .join("");
  assemblyFilter.value = state.templates.some((template) => template.id === current) ? current : "";
}

function renderTemplates() {
  templateList.innerHTML = state.templates.length ? state.templates.map((template) => {
    const hits = state.samples.filter((sample) =>
      matchSample(sample).some((entry) => entry.template.id === template.id)
    ).length;
    return `
      <li class="template-item">
        <strong>${template.name}</strong>
        <p>必需：${template.required.join("、")}</p>
        <p>伴生：${template.associated.length ? template.associated.join("、") : "无"} · 命中 ${hits} 个样本</p>
        <div class="template-actions">
          <button type="button" data-edit-template="${template.id}">修改</button>
          <button type="button" data-delete-template="${template.id}">删除</button>
        </div>
      </li>
    `;
  }).join("") : "<li class=\"template-empty\">还没有组合模板，先登记一个共生组合。</li>";
}

function render() {
  enforceComparePair();
  renderAssemblyFilter();
  renderTemplates();

  const rows = filteredSamples();
  const emptyText = state.samples.length ? "没有符合当前筛选的样本。" : "还没有样本，先从左侧录入一张薄片照片。";
  sampleGrid.innerHTML = rows.length ? rows.map((sample) => {
    const combos = matchSample(sample).map((entry) => entry.template.name).join("、");
    return `
    <article class="sample-card">
      ${sample.photo ? `<img src="${sample.photo}" alt="${sample.code}显微照片">` : "<div class=\"photo-placeholder\"></div>"}
      <div class="sample-body">
        <h3>${sample.code}</h3>
        <p>${sample.location || "未记录地点"} · ${sample.magnification || "未记录倍数"} · ${sample.polarization}</p>
        <p>矿物：${sample.minerals || "未记录"}</p>
        <p>组合：${combos || "未命中"}</p>
        <p>结构：${sample.texture || "未记录"}</p>
        <p>${sample.comment || "未填写批注"}</p>
        <div class="card-actions">
          <label><input type="checkbox" data-compare="${sample.id}" ${state.compare.includes(sample.id) ? "checked" : ""}>对比</label>
          <span class="card-buttons">
            <button type="button" data-edit="${sample.id}">编辑</button>
            <button type="button" data-delete="${sample.id}">删除</button>
          </span>
        </div>
      </div>
    </article>
  `;
  }).join("") : `<p>${emptyText}</p>`;

  const compareSamples = state.compare
    .map((id) => state.samples.find((sample) => sample.id === id))
    .filter(Boolean)
    .slice(0, 2);

  const shared = compareSamples.length === 2
    ? sharedTemplates(compareSamples[0], compareSamples[1]).map((entry) => entry.template.name).join("、")
    : "";

  compareNotice.hidden = !compareMessage;
  compareNotice.textContent = compareMessage;

  comparePane.innerHTML = (shared ? `<p class="shared-combo">同属组合：${shared}</p>` : "") + (compareSamples.length ? compareSamples.map((sample) => `
    <article class="compare-item">
      ${sample.photo ? `<img src="${sample.photo}" alt="${sample.code}对比图">` : ""}
      <h3>${sample.code}</h3>
      <p>${sample.polarization} · ${sample.minerals || "未记录矿物"}</p>
      <p>${sample.texture || "未记录结构"}</p>
    </article>
  `).join("") : "<p>勾选同一组合的两张样本后可并排对比。</p>");
}

function exitSampleEditing() {
  editingSampleId = "";
  sampleSubmit.textContent = "保存样本";
  sampleCancelEdit.hidden = true;
}

function exitTemplateEditing() {
  editingTemplateId = "";
  templateSubmit.textContent = "保存组合";
  templateCancelEdit.hidden = true;
}

photoInput.addEventListener("change", async () => {
  pendingPhoto = await readFileAsDataUrl(photoInput.files[0]);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  if (!pendingPhoto && photoInput.files[0]) {
    pendingPhoto = await readFileAsDataUrl(photoInput.files[0]);
  }
  const fields = {
    code: data.get("code").trim(),
    location: data.get("location").trim(),
    magnification: data.get("magnification").trim(),
    polarization: data.get("polarization"),
    minerals: data.get("minerals").trim(),
    texture: data.get("texture").trim(),
    comment: data.get("comment").trim()
  };
  if (editingSampleId) {
    const sample = state.samples.find((item) => item.id === editingSampleId);
    if (sample) {
      Object.assign(sample, fields, pendingPhoto ? { photo: pendingPhoto } : {});
    }
  } else {
    state.samples.unshift({
      id: crypto.randomUUID(),
      photo: pendingPhoto,
      ...fields,
      createdAt: new Date().toISOString()
    });
  }
  exitSampleEditing();
  pendingPhoto = "";
  photoInput.value = "";
  form.reset();
  save();
  render();
});

sampleCancelEdit.addEventListener("click", () => {
  exitSampleEditing();
  pendingPhoto = "";
  photoInput.value = "";
  form.reset();
});

templateForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(templateForm);
  const name = data.get("name").trim();
  const required = parseMinerals(data.get("required"));
  const associated = parseMinerals(data.get("associated"))
    .filter((item) => !required.some((req) => req.toLowerCase() === item.toLowerCase()));
  if (required.length < 2 || required.length > 4) {
    templateMsg.textContent = `必需矿物需 2–4 种，当前去重后为 ${required.length} 种。`;
    return;
  }
  const conflict = templateConflict(name, required);
  if (conflict) {
    templateMsg.textContent = `未保存：${conflict}。`;
    return;
  }
  if (editingTemplateId) {
    const template = state.templates.find((item) => item.id === editingTemplateId);
    if (template) {
      Object.assign(template, { name, required, associated });
    }
  } else {
    state.templates.push({
      id: crypto.randomUUID(),
      name,
      required,
      associated,
      createdAt: new Date().toISOString()
    });
  }
  exitTemplateEditing();
  templateMsg.textContent = "";
  templateForm.reset();
  save();
  render();
});

templateCancelEdit.addEventListener("click", () => {
  exitTemplateEditing();
  templateMsg.textContent = "";
  templateForm.reset();
});

templateList.addEventListener("click", (event) => {
  const deleteId = event.target.dataset.deleteTemplate;
  if (deleteId) {
    state.templates = state.templates.filter((template) => template.id !== deleteId);
    if (editingTemplateId === deleteId) exitTemplateEditing();
    save();
    render();
    return;
  }
  const editId = event.target.dataset.editTemplate;
  if (editId) {
    const template = state.templates.find((item) => item.id === editId);
    if (template) {
      editingTemplateId = editId;
      templateForm.elements.name.value = template.name;
      templateForm.elements.required.value = template.required.join("、");
      templateForm.elements.associated.value = template.associated.join("、");
      templateSubmit.textContent = "保存修改";
      templateCancelEdit.hidden = false;
      templateMsg.textContent = "";
    }
  }
});

sampleGrid.addEventListener("click", (event) => {
  const deleteId = event.target.dataset.delete;
  if (deleteId) {
    state.samples = state.samples.filter((sample) => sample.id !== deleteId);
    state.compare = state.compare.filter((id) => id !== deleteId);
    if (editingSampleId === deleteId) exitSampleEditing();
    save();
    render();
    return;
  }
  const editId = event.target.dataset.edit;
  if (editId) {
    const sample = state.samples.find((item) => item.id === editId);
    if (sample) {
      editingSampleId = editId;
      form.elements.code.value = sample.code;
      form.elements.location.value = sample.location;
      form.elements.magnification.value = sample.magnification;
      form.elements.polarization.value = sample.polarization;
      form.elements.minerals.value = sample.minerals;
      form.elements.texture.value = sample.texture;
      form.elements.comment.value = sample.comment;
      pendingPhoto = "";
      photoInput.value = "";
      sampleSubmit.textContent = "保存修改";
      sampleCancelEdit.hidden = false;
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
});

sampleGrid.addEventListener("change", (event) => {
  const id = event.target.dataset.compare;
  if (!id) return;
  compareMessage = "";
  if (event.target.checked) {
    const sample = state.samples.find((item) => item.id === id);
    const other = state.samples.find((item) => item.id === state.compare.find((entry) => entry !== id));
    if (sample && other && !sharedTemplates(sample, other).length) {
      compareMessage = "两张样本未命中同一组合，无法对比，请重新选择。";
      render();
      return;
    }
    state.compare = [id, ...state.compare.filter((item) => item !== id)].slice(0, 2);
  } else {
    state.compare = state.compare.filter((item) => item !== id);
  }
  save();
  render();
});

[mineralFilter, polarFilter, assemblyFilter].forEach((field) => field.addEventListener("input", render));

document.querySelector("#exportBtn").addEventListener("click", () => {
  const checklist = filteredSamples().map((sample) => {
    const hits = matchSample(sample);
    return {
      样本编号: sample.code,
      采样地点: sample.location,
      放大倍数: sample.magnification,
      偏光类型: sample.polarization,
      主要矿物: sample.minerals,
      颗粒结构: sample.texture,
      老师批注: sample.comment,
      命中组合: hits.map((entry) => entry.template.name).join("、") || "未命中",
      匹配依据: hits.map((entry) =>
        `「${entry.template.name}」必需矿物齐全（${entry.template.required.join("、")}）` +
        (entry.assocHit.length ? `，伴生矿物命中：${entry.assocHit.join("、")}` : "")
      ).join("；") || "—"
    };
  });
  const blob = new Blob([JSON.stringify(checklist, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "thin-section-checklist.json";
  link.click();
  URL.revokeObjectURL(link.href);
});

render();
