const storageKey = "wxyy-2-thin-section-index";
const state = JSON.parse(localStorage.getItem(storageKey) || '{"samples":[],"compare":[],"templates":[]}');
state.samples ||= [];
state.compare ||= [];
state.templates ||= [];

const form = document.querySelector("#sampleForm");
const photoInput = document.querySelector("#photoInput");
const sampleGrid = document.querySelector("#sampleGrid");
const comparePane = document.querySelector("#comparePane");
const mineralFilter = document.querySelector("#mineralFilter");
const polarFilter = document.querySelector("#polarFilter");
const assemblageFilter = document.querySelector("#assemblageFilter");
const templateForm = document.querySelector("#templateForm");
const templateList = document.querySelector("#templateList");
const templateError = document.querySelector("#templateError");
const sampleSubmitBtn = document.querySelector("#sampleSubmitBtn");
const sampleCancelBtn = document.querySelector("#sampleCancelBtn");
const templateSubmitBtn = document.querySelector("#templateSubmitBtn");
const templateCancelBtn = document.querySelector("#templateCancelBtn");

let pendingPhoto = "";
let editingSampleId = null;
let editingTemplateId = null;
let notice = "";

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
  return [...new Set(String(text || "").split(/[、,，;；/\s]+/).map((item) => item.trim()).filter(Boolean))];
}

function templateHit(sample, template) {
  const tokens = parseMinerals(sample.minerals);
  const present = (mineral) => tokens.some((token) => token.includes(mineral));
  const matchedRequired = template.required.filter(present);
  const matchedAssociated = template.associated.filter(present);
  return {
    hit: matchedRequired.length === template.required.length,
    matchedRequired,
    matchedAssociated
  };
}

function sampleHits(sample) {
  return state.templates
    .map((template) => ({ template, ...templateHit(sample, template) }))
    .filter((result) => result.hit);
}

function sharedAssemblages(first, second) {
  const firstIds = new Set(sampleHits(first).map((result) => result.template.id));
  return sampleHits(second).filter((result) => firstIds.has(result.template.id)).map((result) => result.template);
}

function filteredSamples() {
  const mineral = mineralFilter.value.trim();
  const polarization = polarFilter.value;
  const template = state.templates.find((item) => item.id === assemblageFilter.value);
  return state.samples.filter((sample) => {
    const mineralMatch = !mineral || sample.minerals.includes(mineral);
    const polarMatch = !polarization || sample.polarization === polarization;
    const assemblageMatch = !template || templateHit(sample, template).hit;
    return mineralMatch && polarMatch && assemblageMatch;
  });
}

function validateCompare() {
  state.compare = state.compare.filter((id) => state.samples.some((sample) => sample.id === id));
  if (state.compare.length !== 2) return;
  const [first, second] = state.compare.map((id) => state.samples.find((sample) => sample.id === id));
  if (!sharedAssemblages(first, second).length) {
    state.compare = [];
    notice = "矿物信息变更后，原对比的两张样本不再命中同一组合，已退出对比，请重新选择";
  }
}

function cancelSampleEdit() {
  editingSampleId = null;
  pendingPhoto = "";
  photoInput.value = "";
  form.reset();
  sampleSubmitBtn.textContent = "保存样本";
  sampleCancelBtn.hidden = true;
}

function cancelTemplateEdit() {
  editingTemplateId = null;
  templateForm.reset();
  templateSubmitBtn.textContent = "保存模板";
  templateCancelBtn.hidden = true;
}

function render() {
  const currentAssemblage = assemblageFilter.value;
  assemblageFilter.innerHTML = `<option value="">全部组合</option>${state.templates.map((template) => `<option value="${template.id}">${template.name}</option>`).join("")}`;
  assemblageFilter.value = state.templates.some((template) => template.id === currentAssemblage) ? currentAssemblage : "";

  templateList.innerHTML = state.templates.length ? state.templates.map((template) => {
    const hitCount = state.samples.filter((sample) => templateHit(sample, template).hit).length;
    return `<li>
      <span class="tpl-name">${template.name}</span>
      <span class="tpl-meta">必需：${template.required.join("、")}</span>
      <span class="tpl-meta">伴生：${template.associated.join("、") || "无"}</span>
      <span class="tpl-meta">命中 ${hitCount} 张样本</span>
      <span class="tpl-actions">
        <button type="button" data-edit-template="${template.id}">编辑</button>
        <button type="button" data-delete-template="${template.id}">删除</button>
      </span>
    </li>`;
  }).join("") : `<li class="tpl-empty">还没有组合模板，先在上方登记一个。</li>`;

  const rows = filteredSamples();
  const emptyText = state.samples.length ? "当前筛选条件下没有命中样本。" : "还没有样本，先从左侧录入一张薄片照片。";
  sampleGrid.innerHTML = rows.length ? rows.map((sample) => {
    const hits = sampleHits(sample);
    return `
    <article class="sample-card">
      ${sample.photo ? `<img src="${sample.photo}" alt="${sample.code}显微照片">` : "<div class=\"photo-placeholder\"></div>"}
      <div class="sample-body">
        <h3>${sample.code}</h3>
        <p>${sample.location || "未记录地点"} · ${sample.magnification || "未记录倍数"} · ${sample.polarization}</p>
        <p>矿物：${sample.minerals || "未记录"}</p>
        <p>结构：${sample.texture || "未记录"}</p>
        <p>命中组合：${hits.length ? hits.map((result) => result.template.name).join("、") : "无"}</p>
        <p>${sample.comment || "未填写批注"}</p>
        <div class="card-actions">
          <label><input type="checkbox" data-compare="${sample.id}" ${state.compare.includes(sample.id) ? "checked" : ""}>对比</label>
          <span class="card-buttons">
            <button type="button" data-edit="${sample.id}">编辑</button>
            <button type="button" data-delete="${sample.id}">删除</button>
          </span>
        </div>
      </div>
    </article>`;
  }).join("") : `<p>${emptyText}</p>`;

  const compareSamples = state.compare
    .map((id) => state.samples.find((sample) => sample.id === id))
    .filter(Boolean)
    .slice(0, 2);

  comparePane.innerHTML = (notice ? `<p class="notice">${notice}</p>` : "") + (compareSamples.length ? compareSamples.map((sample) => `
    <article class="compare-item">
      ${sample.photo ? `<img src="${sample.photo}" alt="${sample.code}对比图">` : ""}
      <h3>${sample.code}</h3>
      <p>${sample.polarization} · ${sample.minerals || "未记录矿物"}</p>
      <p>${sample.texture || "未记录结构"}</p>
    </article>
  `).join("") : "<p>勾选两张命中同一组合的样本后可并排对比。</p>");
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
      Object.assign(sample, fields);
      if (pendingPhoto) sample.photo = pendingPhoto;
    }
  } else {
    state.samples.unshift({
      id: crypto.randomUUID(),
      photo: pendingPhoto,
      ...fields,
      createdAt: new Date().toISOString()
    });
  }
  cancelSampleEdit();
  validateCompare();
  save();
  render();
});

sampleCancelBtn.addEventListener("click", cancelSampleEdit);
templateCancelBtn.addEventListener("click", () => {
  cancelTemplateEdit();
  templateError.textContent = "";
});

templateForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(templateForm);
  const name = data.get("templateName").trim();
  const required = parseMinerals(data.get("requiredMinerals"));
  const associated = parseMinerals(data.get("associatedMinerals")).filter((mineral) => !required.includes(mineral));

  if (!name) {
    templateError.textContent = "未保存：请填写组合名称";
    return;
  }
  if (required.length < 2 || required.length > 4) {
    templateError.textContent = `未保存：必需矿物需 2–4 种，当前为 ${required.length} 种`;
    return;
  }
  const others = state.templates.filter((template) => template.id !== editingTemplateId);
  const nameClash = others.find((template) => template.name === name);
  if (nameClash) {
    templateError.textContent = `未保存：与已有模板「${nameClash.name}」重名`;
    return;
  }
  const requiredKey = (list) => [...list].sort().join("、");
  const requiredClash = others.find((template) => requiredKey(template.required) === requiredKey(required));
  if (requiredClash) {
    templateError.textContent = `未保存：必需矿物与模板「${requiredClash.name}」相同（${required.join("、")}）`;
    return;
  }

  if (editingTemplateId) {
    const template = state.templates.find((item) => item.id === editingTemplateId);
    if (template) Object.assign(template, { name, required, associated });
  } else {
    state.templates.push({ id: crypto.randomUUID(), name, required, associated, createdAt: new Date().toISOString() });
  }
  templateError.textContent = "";
  cancelTemplateEdit();
  validateCompare();
  save();
  render();
});

templateList.addEventListener("click", (event) => {
  const editId = event.target.dataset.editTemplate;
  const deleteId = event.target.dataset.deleteTemplate;
  if (editId) {
    const template = state.templates.find((item) => item.id === editId);
    if (!template) return;
    editingTemplateId = editId;
    templateForm.elements.templateName.value = template.name;
    templateForm.elements.requiredMinerals.value = template.required.join("、");
    templateForm.elements.associatedMinerals.value = template.associated.join("、");
    templateSubmitBtn.textContent = "保存模板修改";
    templateCancelBtn.hidden = false;
    templateError.textContent = "";
  }
  if (deleteId) {
    state.templates = state.templates.filter((template) => template.id !== deleteId);
    if (editingTemplateId === deleteId) cancelTemplateEdit();
    validateCompare();
    save();
    render();
  }
});

sampleGrid.addEventListener("click", (event) => {
  const deleteId = event.target.dataset.delete;
  const editId = event.target.dataset.edit;
  if (deleteId) {
    state.samples = state.samples.filter((sample) => sample.id !== deleteId);
    state.compare = state.compare.filter((id) => id !== deleteId);
    if (editingSampleId === deleteId) cancelSampleEdit();
    validateCompare();
    save();
    render();
  }
  if (editId) {
    const sample = state.samples.find((item) => item.id === editId);
    if (!sample) return;
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
    sampleSubmitBtn.textContent = "保存样本修改";
    sampleCancelBtn.hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

sampleGrid.addEventListener("change", (event) => {
  const id = event.target.dataset.compare;
  if (!id) return;
  if (event.target.checked) {
    const sample = state.samples.find((item) => item.id === id);
    const kept = state.compare.filter((item) => item !== id).slice(0, 1);
    const other = kept.length ? state.samples.find((item) => item.id === kept[0]) : null;
    if (sample && other && !sharedAssemblages(other, sample).length) {
      notice = `「${other.code}」与「${sample.code}」没有共同命中的组合，双选对比需来自同一组合`;
      render();
      return;
    }
    state.compare = sample ? [id, ...kept] : kept;
    notice = "";
  } else {
    state.compare = state.compare.filter((item) => item !== id);
  }
  save();
  render();
});

[mineralFilter, polarFilter, assemblageFilter].forEach((field) => field.addEventListener("input", render));

document.querySelector("#exportBtn").addEventListener("click", () => {
  const checklist = filteredSamples().map((sample) => {
    const hits = sampleHits(sample);
    return {
      样本编号: sample.code,
      采样地点: sample.location,
      放大倍数: sample.magnification,
      偏光类型: sample.polarization,
      主要矿物: sample.minerals,
      颗粒结构: sample.texture,
      老师批注: sample.comment,
      命中组合: hits.length ? hits.map((result) => result.template.name).join("、") : "未命中",
      匹配依据: hits.length ? hits.map((result) => {
        const assoc = result.matchedAssociated.length ? `，伴生命中：${result.matchedAssociated.join("、")}` : "";
        return `${result.template.name}（必需矿物齐全：${result.matchedRequired.join("、")}${assoc}）`;
      }).join("；") : "无"
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
