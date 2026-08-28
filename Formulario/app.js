(() => {
  "use strict";

  const DRAFT_KEY = "visualed_campaign_form_draft_v1";
  const LOCAL_SUBMISSIONS_KEY = "visualed_campaign_local_submissions_v1";

  const form = document.querySelector("#campaignForm");
  const formPanel = document.querySelector(".form-panel");
  const campaignPanel = document.querySelector(".campaign");
  const successPanel = document.querySelector("#successPanel");
  const submitButton = document.querySelector("#submitButton");
  const formMessage = document.querySelector("#formMessage");
  const saveStatus = document.querySelector("#saveStatus");
  const progressBar = document.querySelector("#progressBar");
  const progressText = document.querySelector("#progressText");
  const activityCounter = document.querySelector("#activityCounter");
  const newRegistrationButton = document.querySelector("#newRegistration");
  const successSummary = document.querySelector("#successSummary");
  const successMessage = document.querySelector("#successMessage");
  const questionCards = [...document.querySelectorAll(".question-card")];

  if (!form) return;

  const fieldRules = {
    fullName: {
      errorId: "fullNameError",
      validate: (field) => field.value.trim().length >= 3,
      message: "Escribe tu nombre y apellido."
    },
    businessName: {
      errorId: "businessNameError",
      validate: (field) => field.value.trim().length >= 2,
      message: "Escribe el nombre de tu negocio o emprendimiento."
    },
    whatsapp: {
      errorId: "whatsappError",
      validate: (field) => isValidEcuadorPhone(field.value),
      message: "Ingresa un WhatsApp válido, por ejemplo 098 948 9429."
    },
    businessActivity: {
      errorId: "businessActivityError",
      validate: (field) => field.value.trim().length >= 4,
      message: "Cuéntanos brevemente a qué se dedica tu negocio."
    }
  };

  function normalizePhone(value) {
    const cleaned = value.trim().replace(/[\s().-]/g, "");
    if (cleaned.startsWith("+593")) return `0${cleaned.slice(4)}`;
    if (cleaned.startsWith("593")) return `0${cleaned.slice(3)}`;
    return cleaned;
  }

  function isValidEcuadorPhone(value) {
    return /^09\d{8}$/.test(normalizePhone(value));
  }

  function setError(field, errorId, message) {
    const error = document.querySelector(`#${errorId}`);
    const card = field.closest(".question-card, .consent-card");

    field.setAttribute("aria-invalid", "true");
    if (error) error.textContent = message;
    if (card) card.classList.add("has-error");
  }

  function clearError(field, errorId) {
    const error = document.querySelector(`#${errorId}`);
    const card = field.closest(".question-card, .consent-card");

    field.removeAttribute("aria-invalid");
    if (error) error.textContent = "";
    if (card) card.classList.remove("has-error");
  }

  function validateTextField(field, showError = true) {
    const rule = fieldRules[field.id];
    if (!rule) return true;

    const valid = rule.validate(field);
    if (valid) clearError(field, rule.errorId);
    else if (showError) setError(field, rule.errorId, rule.message);
    return valid;
  }

  function validateRadioGroup(name, errorId, showError = true) {
    const inputs = [...form.querySelectorAll(`input[name="${name}"]`)];
    const selected = inputs.find((input) => input.checked);
    const error = document.querySelector(`#${errorId}`);
    const card = inputs[0]?.closest(".question-card");

    if (selected) {
      inputs.forEach((input) => input.removeAttribute("aria-invalid"));
      if (error) error.textContent = "";
      if (card) card.classList.remove("has-error");
      return true;
    }

    if (showError) {
      inputs.forEach((input) => input.setAttribute("aria-invalid", "true"));
      if (error) error.textContent = name === "coupon"
        ? "Selecciona el porcentaje de tu cupón."
        : "Selecciona una de las opciones.";
      if (card) card.classList.add("has-error");
    }
    return false;
  }

  function validateConsent(showError = true) {
    const consent = form.elements.consent;
    const error = document.querySelector("#consentError");
    const card = consent.closest(".consent-card");

    if (consent.checked) {
      consent.removeAttribute("aria-invalid");
      error.textContent = "";
      card.classList.remove("has-error");
      return true;
    }

    if (showError) {
      consent.setAttribute("aria-invalid", "true");
      error.textContent = "Debes aceptar el uso de tus datos para completar el registro.";
      card.classList.add("has-error");
    }
    return false;
  }

  function isStepComplete(step) {
    switch (step) {
      case "1": return fieldRules.fullName.validate(form.elements.full_name);
      case "2": return fieldRules.businessName.validate(form.elements.business_name);
      case "3": return fieldRules.whatsapp.validate(form.elements.whatsapp);
      case "4": return fieldRules.businessActivity.validate(form.elements.business_activity);
      case "5": return Boolean(form.querySelector('input[name="plan_interest"]:checked'));
      case "6": return Boolean(form.querySelector('input[name="source"]:checked'));
      case "7": return Boolean(form.querySelector('input[name="coupon"]:checked'));
      default: return false;
    }
  }

  function updateProgress() {
    let completed = 0;

    questionCards.forEach((card) => {
      const isComplete = isStepComplete(card.dataset.step);
      card.classList.toggle("is-complete", isComplete);
      if (isComplete) completed += 1;
    });

    progressBar.style.width = `${(completed / questionCards.length) * 100}%`;
    progressText.textContent = `${completed} de ${questionCards.length}`;
  }

  function collectDraft() {
    const data = {};
    const formData = new FormData(form);

    for (const [key, value] of formData.entries()) {
      if (key !== "website") data[key] = value;
    }
    data.consent = form.elements.consent.checked;
    return data;
  }

  function setSaveStatus(message) {
    saveStatus.textContent = message;
  }

  let saveTimer;
  function saveDraft() {
    window.clearTimeout(saveTimer);
    setSaveStatus("Guardando avance…");

    saveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(collectDraft()));
        setSaveStatus("Avance guardado en este dispositivo.");
      } catch {
        setSaveStatus("El navegador no permitió guardar el avance.");
      }
    }, 280);
  }

  function restoreDraft() {
    let draft;
    try {
      draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    } catch {
      draft = null;
    }
    if (!draft || typeof draft !== "object") return;

    Object.entries(draft).forEach(([name, value]) => {
      if (name === "consent") {
        form.elements.consent.checked = Boolean(value);
        return;
      }

      const controls = [...form.querySelectorAll(`[name="${CSS.escape(name)}"]`)];
      controls.forEach((control) => {
        if (control.type === "radio") control.checked = control.value === value;
        else control.value = value;
      });
    });

    setSaveStatus("Recuperamos el avance guardado en este dispositivo.");
  }

  function updateActivityCounter() {
    activityCounter.textContent = `${form.elements.business_activity.value.length}/240`;
  }

  function validateForm() {
    const textFieldsValid = Object.keys(fieldRules)
      .map((id) => validateTextField(document.querySelector(`#${id}`), true))
      .every(Boolean);
    const planValid = validateRadioGroup("plan_interest", "planInterestError", true);
    const couponValid = validateRadioGroup("coupon", "couponError", true);
    const consentValid = validateConsent(true);

    return textFieldsValid && planValid && couponValid && consentValid;
  }

  function firstInvalidControl() {
    return form.querySelector('[aria-invalid="true"]');
  }

  function makeRegistrationPayload() {
    const data = collectDraft();
    return {
      id: typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `visualed-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      full_name: String(data.full_name || "").trim(),
      business_name: String(data.business_name || "").trim(),
      whatsapp: normalizePhone(String(data.whatsapp || "")),
      business_activity: String(data.business_activity || "").trim(),
      plan_interest: data.plan_interest,
      source: data.source || null,
      coupon_percent: Number(data.coupon),
      consent: Boolean(data.consent),
      campaign: "sorteo_un_mes_publicidad",
      created_at: new Date().toISOString()
    };
  }

  /*
   * Punto de conexión con Supabase.
   * En la siguiente etapa se reemplaza el bloque local por:
   * supabase.from("campaign_registrations").insert(payload)
   */
  async function submitRegistration(payload) {
    if (typeof window.visualedSupabaseSubmit === "function") {
      await window.visualedSupabaseSubmit(payload);
      return { mode: "supabase" };
    }

    const current = JSON.parse(localStorage.getItem(LOCAL_SUBMISSIONS_KEY) || "[]");
    current.push(payload);
    localStorage.setItem(LOCAL_SUBMISSIONS_KEY, JSON.stringify(current.slice(-100)));
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    return { mode: "local" };
  }

  function appendSummaryItem(label, value) {
    const item = document.createElement("div");
    const small = document.createElement("small");
    const strong = document.createElement("strong");

    item.className = "summary-item";
    small.textContent = label;
    strong.textContent = value;
    item.append(small, strong);
    successSummary.append(item);
  }

  function showSuccess(payload, mode) {
    successSummary.replaceChildren();
    appendSummaryItem("Participante", payload.full_name);
    appendSummaryItem("Negocio", payload.business_name);
    appendSummaryItem("WhatsApp", payload.whatsapp);
    appendSummaryItem("Cupón", `${payload.coupon_percent}% de descuento`);

    successMessage.textContent = mode === "supabase"
      ? "Tus datos fueron registrados correctamente. VisuaLed se pondrá en contacto contigo si resultas ganador."
      : "El registro de prueba quedó guardado en este dispositivo. Cuando conectemos Supabase, se enviará directamente a VisuaLed.";

    campaignPanel.hidden = true;
    formPanel.hidden = true;
    successPanel.hidden = false;
    successPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetRegistration() {
    form.reset();
    localStorage.removeItem(DRAFT_KEY);
    questionCards.forEach((card) => card.classList.remove("is-complete", "has-error"));
    document.querySelectorAll(".field-error").forEach((error) => { error.textContent = ""; });
    document.querySelectorAll('[aria-invalid="true"]').forEach((field) => field.removeAttribute("aria-invalid"));
    formMessage.textContent = "";
    successPanel.hidden = true;
    campaignPanel.hidden = false;
    formPanel.hidden = false;
    updateActivityCounter();
    updateProgress();
    setSaveStatus("Tu avance se guarda en este dispositivo.");
    campaignPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  form.addEventListener("input", (event) => {
    const field = event.target;
    if (field.id && fieldRules[field.id] && field.hasAttribute("aria-invalid")) {
      validateTextField(field, true);
    }
    if (field.id === "businessActivity") updateActivityCounter();
    formMessage.textContent = "";
    updateProgress();
    saveDraft();
  });

  form.addEventListener("change", (event) => {
    if (event.target.name === "plan_interest") validateRadioGroup("plan_interest", "planInterestError", false);
    if (event.target.name === "coupon") validateRadioGroup("coupon", "couponError", false);
    if (event.target.name === "consent") validateConsent(false);
    updateProgress();
    saveDraft();
  });

  form.addEventListener("focusout", (event) => {
    if (event.target.id && fieldRules[event.target.id]) validateTextField(event.target, true);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    formMessage.textContent = "";

    if (form.elements.website.value) return;

    if (!validateForm()) {
      formMessage.textContent = "Revisa los campos señalados antes de registrar tu participación.";
      const invalid = firstInvalidControl();
      invalid?.focus({ preventScroll: true });
      invalid?.closest(".question-card, .consent-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
      updateProgress();
      return;
    }

    const payload = makeRegistrationPayload();
    const originalLabel = submitButton.querySelector("span").textContent;
    submitButton.disabled = true;
    submitButton.querySelector("span").textContent = "Registrando…";

    try {
      const result = await submitRegistration(payload);
      localStorage.removeItem(DRAFT_KEY);
      showSuccess(payload, result.mode);
    } catch (error) {
      console.error("No se pudo registrar la participación", error);
      formMessage.textContent = "No pudimos guardar el registro. Revisa el espacio disponible del navegador e inténtalo otra vez.";
    } finally {
      submitButton.disabled = false;
      submitButton.querySelector("span").textContent = originalLabel;
    }
  });

  newRegistrationButton.addEventListener("click", resetRegistration);

  restoreDraft();
  updateActivityCounter();
  updateProgress();
})();
