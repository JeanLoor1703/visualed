'use strict';

(() => {
  const config = window.VISUALED_CRM_CONFIG;
  const sdk = window.supabase;
  const views = [...document.querySelectorAll('.auth-view')];
  const messageBox = document.querySelector('#global-message');
  const genericAccessError = 'No pudimos completar el acceso. Verifica tus credenciales e inténtalo nuevamente.';
  const motion = window.anime;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobileNavMedia = window.matchMedia('(max-width: 880px)');
  const studioRaffleTiming = Object.freeze({
    prepare: 250,
    countdownStep: 650,
    spin: 11000,
    decelerate: 2800,
    reveal: 900,
    celebrate: 1200
  });

  let demoParticipants = [
    { name: 'Julissa Castro', business: 'VisuaLed', phone: '099 000 0101', activity: 'Diseño y comunicación visual', interest: 'Sí, quiero que me contacten', source: 'Otro', coupon: '10%', status: 'Nuevo', time: 'Ahora', isDemo: true },
    { name: 'Kayal', business: 'Creacom', phone: '099 000 0102', activity: 'Productos personalizados para emprendedores', interest: 'Quizás, quiero más información', source: 'Redes sociales', coupon: '15%', status: 'Nuevo', time: 'Ahora', isDemo: true },
    { name: 'Ivis', business: 'All in Construcción', phone: '099 000 0103', activity: 'Servicios para pequeños negocios', interest: 'Por ahora solo deseo participar en el sorteo', source: 'Recomendación', coupon: '20%', status: 'Nuevo', time: 'Ahora', isDemo: true }
  ];

  let client;
  let routingPromise = null;
  let animateNextAccess = false;
  let raffleBusy = false;
  let studioRaffleMode = 'demo';
  let studioRaffleTimer = null;
  let currentMemberRole = 'viewer';
  let selectedRecordIndex = 0;
  let activeRecordFilter = 'all';
  let participantChannel = null;
  let unreadParticipantCount = 0;

  const elements = {
    loginForm: document.querySelector('#login-form'),
    setPasswordForm: document.querySelector('#set-password-form'),
    memberName: document.querySelector('#member-name'),
    memberRole: document.querySelector('#member-role'),
    memberAvatar: document.querySelector('#member-avatar'),
    crmShell: document.querySelector('.studio-shell'),
    crmContent: document.querySelector('#crm-workspace-main'),
    dashboardSearch: document.querySelector('#dashboard-search'),
    dashboardTableBody: document.querySelector('#dashboard-table-body'),
    dashboardTableCount: document.querySelector('#dashboard-table-count'),
    addParticipantButton: document.querySelector('#studio-add-participant'),
    exportExcelButton: document.querySelector('#studio-export-excel'),
    addParticipantDialog: document.querySelector('#add-participant-dialog'),
    addParticipantForm: document.querySelector('#add-participant-form'),
    addParticipantError: document.querySelector('#add-participant-error'),
    addParticipantCounter: document.querySelector('[data-add-counter]'),
    recordStatus: document.querySelector('#record-status'),
    studioRaffleCoupon: document.querySelector('#studio-raffle-coupon'),
    studioRaffleStart: document.querySelector('#studio-raffle-start'),
    studioRaffleModeBadge: document.querySelector('#studio-raffle-mode-badge'),
    studioRaffleCompanyCount: document.querySelector('#studio-raffle-company-count'),
    studioRaffleTicketCount: document.querySelector('#studio-raffle-ticket-count'),
    studioRafflePoolCount: document.querySelector('#studio-raffle-pool-count'),
    studioRaffleStatus: document.querySelector('#studio-raffle-status'),
    studioRaffleStage: document.querySelector('.studio-raffle__stage'),
    studioRaffleTicker: document.querySelector('#studio-raffle-ticker'),
    studioRaffleWinnerCard: document.querySelector('#studio-raffle-winner-card'),
    studioRaffleWinnerName: document.querySelector('#studio-raffle-winner-name'),
    studioRaffleWinnerBusiness: document.querySelector('#studio-raffle-winner-business'),
    studioRaffleWinnerCode: document.querySelector('#studio-raffle-winner-code'),
    participantSearch: document.querySelector('#participant-search'),
    participantStatus: document.querySelector('#participant-status'),
    participantTableBody: document.querySelector('#participant-table-body'),
    participantEmpty: document.querySelector('#participant-empty'),
    raffleCoupon: document.querySelector('#raffle-coupon'),
    raffleStart: document.querySelector('#raffle-start'),
    raffleName: document.querySelector('#raffle-name'),
    raffleBusiness: document.querySelector('#raffle-business'),
    raffleKicker: document.querySelector('#raffle-kicker'),
    rafflePoolCount: document.querySelector('#raffle-pool-count')
  };

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[character]);
  }

  function initials(name) {
    return String(name).split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  }

  function interestLabel(interest) {
    if (interest.startsWith('Sí')) return 'Contacto directo';
    if (interest.startsWith('Quizás')) return 'Quiere información';
    return 'Solo participa';
  }

  function statusClass(status) {
    return status.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');
  }

  const interestLabels = {
    contactar: 'Sí, quiero que me contacten',
    informacion: 'Quizás, quiero más información',
    solo_sorteo: 'Por ahora solo deseo participar en el sorteo'
  };
  const sourceLabels = {
    expoferia: 'Expoferia',
    ya_conocia: 'Ya conocía VisuaLed',
    redes_sociales: 'Redes sociales',
    recomendacion: 'Recomendación',
    otro: 'Otro'
  };
  const statusLabels = {
    nuevo: 'Nuevo',
    por_contactar: 'Por contactar',
    contactado: 'Contactado',
    calificado: 'Calificado'
  };
  const databaseStatuses = Object.fromEntries(Object.entries(statusLabels).map(([key, value]) => [value, key]));

  function formatPhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '').slice(0, 10);
    return digits.length === 10 ? `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}` : String(phone || '');
  }

  function participantFromDatabase(row) {
    const createdAt = row.created_at ? new Date(row.created_at) : new Date();
    return {
      id: row.id,
      name: row.full_name,
      business: row.business_name,
      phone: formatPhone(row.whatsapp),
      activity: row.business_activity,
      interest: interestLabels[row.plan_interest] || row.plan_interest,
      source: sourceLabels[row.source] || 'No especificado',
      coupon: `${row.coupon_percent}%`,
      status: statusLabels[row.status] || 'Nuevo',
      time: new Intl.DateTimeFormat('es-EC', { hour: '2-digit', minute: '2-digit' }).format(createdAt),
      createdAt: row.created_at,
      isDemo: Boolean(row.is_demo)
    };
  }

  function setMetric(selector, value) {
    const element = document.querySelector(selector);
    if (!element) return;
    element.dataset.count = String(value);
    element.textContent = String(value);
  }

  function updateDashboardSummary() {
    const total = demoParticipants.length;
    const interested = demoParticipants.filter((person) => !person.interest.startsWith('Por ahora')).length;
    const pending = demoParticipants.filter((person) => ['Nuevo', 'Por contactar'].includes(person.status)).length;
    const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const thisWeek = demoParticipants.filter((person) => !person.createdAt || new Date(person.createdAt).getTime() >= weekAgo).length;
    const percentage = (value) => total ? `${((value / total) * 100).toFixed(1)}% del total` : 'Sin registros';

    setMetric('#metric-total-count', total);
    setMetric('#metric-interest-count', interested);
    setMetric('#metric-pending-count', pending);
    setMetric('#metric-coupon-count', total);
    const textValues = {
      '#nav-record-count': total,
      '#metric-week-label': `${thisWeek} ${thisWeek === 1 ? 'registro' : 'registros'} esta semana`,
      '#metric-interest-label': percentage(interested),
      '#metric-pending-label': percentage(pending),
      '#metric-coupon-label': `${total} ${total === 1 ? 'cupón entregado' : 'cupones entregados'}`,
      '#participant-total-label': `${total} ${total === 1 ? 'registro' : 'registros'}`,
      '#pending-total-label': `${pending} ${pending === 1 ? 'pendiente' : 'pendientes'}`,
      '#coupon-total-label': `${total} ${total === 1 ? 'entregado' : 'entregados'}`
    };
    Object.entries(textValues).forEach(([selector, value]) => {
      const target = document.querySelector(selector);
      if (target) target.textContent = value;
    });
  }

  function updateNotificationCount() {
    const badge = document.querySelector('#studio-notification-count');
    if (!badge) return;
    badge.textContent = String(unreadParticipantCount);
    badge.hidden = unreadParticipantCount === 0;
  }

  async function loadParticipants() {
    if (!client) return false;
    const { data, error } = await client
      .from('participants')
      .select('id, full_name, business_name, whatsapp, business_activity, plan_interest, source, coupon_percent, status, is_demo, created_at')
      .order('created_at', { ascending: false });
    if (error) return false;
    demoParticipants = data.map(participantFromDatabase);
    selectedRecordIndex = 0;
    renderStudioModules();
    updateDashboardSummary();
    updateStudioRafflePool();
    return true;
  }

  function subscribeToParticipantChanges() {
    if (!client || participantChannel) return;
    participantChannel = client
      .channel('crm-participant-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'participants' }, (payload) => {
        if (!payload.new?.id || demoParticipants.some((person) => person.id === payload.new.id)) return;
        demoParticipants.unshift(participantFromDatabase(payload.new));
        selectedRecordIndex = 0;
        unreadParticipantCount += 1;
        updateNotificationCount();
        renderStudioModules();
        updateDashboardSummary();
        updateStudioRafflePool();
        showStudioToast(`Nueva participación: ${payload.new.full_name}`);
      })
      .subscribe();
  }

  function renderRecentParticipants() {
    const container = document.querySelector('#recent-participants');
    if (!container) return;
    container.innerHTML = demoParticipants.slice(0, 5).map((person) => `
      <article class="participant-row">
        <span class="participant-avatar">${initials(person.name)}</span>
        <span class="participant-identity"><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(person.business)}</small></span>
        <span class="participant-intent">${escapeHtml(interestLabel(person.interest))}</span>
        <span class="coupon-chip">${escapeHtml(person.coupon)}</span>
        <time>${escapeHtml(person.time)}</time>
      </article>`).join('');
  }

  function renderInterestBars() {
    const container = document.querySelector('#interest-bars');
    if (!container) return;
    const groups = [
      { label: 'Quieren contacto', value: 43, width: 100 },
      { label: 'Piden información', value: 31, width: 72 },
      { label: 'Solo participan', value: 54, width: 80 }
    ];
    container.innerHTML = groups.map((group, index) => `
      <div class="interest-row"><span>${escapeHtml(group.label)}</span><strong>${group.value}</strong><i><b class="interest-bar--${index + 1}"></b></i></div>`).join('');
  }

  function renderCouponOrbit() {
    const container = document.querySelector('#coupon-orbit');
    if (!container) return;
    container.innerHTML = `
      <div class="coupon-orbit__ring"><span><strong>128</strong><small>cupones</small></span></div>
      <ul><li><i class="coupon-dot coupon-dot--10"></i><span>10%</span><strong>46</strong></li><li><i class="coupon-dot coupon-dot--15"></i><span>15%</span><strong>37</strong></li><li><i class="coupon-dot coupon-dot--20"></i><span>20%</span><strong>45</strong></li></ul>`;
  }

  function renderParticipantTable() {
    if (!elements.participantTableBody) return;
    const term = normalizeValue(elements.participantSearch?.value);
    const status = elements.participantStatus?.value || 'all';
    const filtered = demoParticipants.filter((person) => {
      const haystack = normalizeValue(`${person.name} ${person.business} ${person.activity}`);
      return (!term || haystack.includes(term)) && (status === 'all' || person.status === status);
    });

    elements.participantTableBody.innerHTML = filtered.map((person) => `
      <tr>
        <td><span class="table-person"><i>${initials(person.name)}</i><span><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(person.business)} · ${escapeHtml(person.activity)}</small></span></span></td>
        <td><a href="tel:${escapeHtml(person.phone.replace(/\s+/g, ''))}">${escapeHtml(person.phone)}</a></td>
        <td>${escapeHtml(interestLabel(person.interest))}</td>
        <td><span class="coupon-chip">${escapeHtml(person.coupon)}</span></td>
        <td><span class="status-pill status-pill--${statusClass(person.status)}">${escapeHtml(person.status)}</span></td>
      </tr>`).join('');
    elements.participantEmpty.hidden = filtered.length > 0;
  }

  function renderLeadBoard() {
    const container = document.querySelector('#lead-board');
    if (!container) return;
    const columns = [
      { title: 'Contacto directo', description: 'Pidieron una llamada', match: (person) => person.interest.startsWith('Sí') },
      { title: 'En consideración', description: 'Quieren entender los planes', match: (person) => person.interest.startsWith('Quizás') },
      { title: 'Solo sorteo', description: 'Sin seguimiento comercial', match: (person) => person.interest.startsWith('Por ahora') }
    ];
    container.innerHTML = columns.map((column, columnIndex) => {
      const people = demoParticipants.filter(column.match);
      return `<section class="lead-column lead-column--${columnIndex + 1}"><header><span>${String(columnIndex + 1).padStart(2, '0')}</span><div><h4>${column.title}</h4><p>${column.description}</p></div><strong>${people.length}</strong></header><div>${people.map((person) => `<article><i>${initials(person.name)}</i><span><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(person.business)}</small></span><b>${escapeHtml(person.coupon)}</b></article>`).join('')}</div></section>`;
    }).join('');
  }

  function renderCouponDetail() {
    const container = document.querySelector('#coupon-detail');
    if (!container) return;
    const coupons = [
      { value: '10%', count: 46, note: 'Entrada amplia', tone: 'light' },
      { value: '15%', count: 37, note: 'Beneficio medio', tone: 'mid' },
      { value: '20%', count: 45, note: 'Mayor incentivo', tone: 'strong' }
    ];
    container.innerHTML = coupons.map((coupon, index) => `
      <article class="coupon-ticket coupon-ticket--${coupon.tone}"><span class="coupon-ticket__index">0${index + 1}</span><p>${coupon.note}</p><strong>${coupon.value}</strong><small>de descuento</small><footer><span>${coupon.count} entregados</span><i class="coupon-fill--${index + 1}"></i></footer></article>`).join('');
  }

  function renderActivityFeed() {
    const container = document.querySelector('#activity-feed');
    if (!container) return;
    const activities = [
      ['11:42', 'Nueva participación', 'Daniela Mora registró a Mora Café con un cupón del 20%.'],
      ['11:35', 'Interés detectado', 'Norte Studio solicitó más información sobre los planes.'],
      ['11:18', 'Seguimiento actualizado', 'Camila Torres pasó al estado Contactado.'],
      ['10:56', 'Nueva participación', 'Ruta Verde ingresó desde Expoferia.'],
      ['10:40', 'Oportunidad prioritaria', 'Veta Diseño pidió contacto directo del equipo.'],
      ['10:21', 'Cupón registrado', 'Motor Lab seleccionó un cupón del 10%.']
    ];
    container.innerHTML = activities.map(([time, title, copy], index) => `<li><time>${time}</time><i aria-hidden="true">${String(index + 1).padStart(2, '0')}</i><div><strong>${title}</strong><p>${copy}</p></div></li>`).join('');
  }

  function recordMatchesFilter(person) {
    if (activeRecordFilter === 'direct') return person.interest.startsWith('Sí');
    if (activeRecordFilter === 'maybe') return person.interest.startsWith('Quizás');
    if (activeRecordFilter === 'raffle') return person.interest.startsWith('Por ahora');
    return true;
  }

  function studioRecords() {
    const term = normalizeValue(elements.dashboardSearch?.value);
    return demoParticipants
      .map((person, index) => ({ person, index }))
      .filter(({ person }) => {
        const haystack = normalizeValue(`${person.name} ${person.business} ${person.phone} ${person.activity}`);
        return recordMatchesFilter(person) && (!term || haystack.includes(term));
      });
  }

  function renderRecordDetail(index = selectedRecordIndex) {
    const person = demoParticipants[index];
    if (!person) return;
    selectedRecordIndex = index;
    const fields = {
      '#record-detail-avatar': initials(person.name),
      '#record-detail-name': person.name,
      '#record-detail-business': person.business,
      '#record-detail-fullname': person.name,
      '#record-detail-company': person.business,
      '#record-detail-phone': person.phone,
      '#record-detail-activity': person.activity,
      '#record-detail-interest': person.interest,
      '#record-detail-source': person.source,
      '#record-detail-coupon': `${person.coupon} de descuento`
    };
    Object.entries(fields).forEach(([selector, value]) => {
      const target = document.querySelector(selector);
      if (target) target.textContent = value;
    });
    if (elements.recordStatus) elements.recordStatus.value = person.status;
    const whatsapp = document.querySelector('#record-whatsapp');
    if (whatsapp) {
      const localNumber = person.phone.replace(/\D/g, '');
      const internationalNumber = localNumber.startsWith('0') ? `593${localNumber.slice(1)}` : localNumber;
      whatsapp.href = `https://wa.me/${internationalNumber}`;
      whatsapp.setAttribute('aria-label', `Contactar a ${person.name} por WhatsApp`);
    }
    document.querySelectorAll('[data-record-row]').forEach((row) => {
      const selected = Number(row.dataset.recordRow) === index;
      row.classList.toggle('is-selected', selected);
      row.setAttribute('aria-selected', String(selected));
    });
  }

  function renderStudioTable() {
    if (!elements.dashboardTableBody) return;
    const records = studioRecords().slice(0, 8);
    elements.dashboardTableBody.innerHTML = records.map(({ person, index }) => `
      <tr data-record-row="${index}" class="${index === selectedRecordIndex ? 'is-selected' : ''}" aria-selected="${index === selectedRecordIndex}">
        <td data-label="Participante"><button class="studio-record-person" type="button" data-record-select="${index}"><i>${initials(person.name)}</i><span><strong>${escapeHtml(person.name)}</strong></span></button></td>
        <td data-label="Negocio">${escapeHtml(person.business)}</td>
        <td data-label="WhatsApp">${escapeHtml(person.phone)}</td>
        <td data-label="Actividad">${escapeHtml(person.activity)}</td>
        <td data-label="Interés"><span class="record-interest">${escapeHtml(person.interest)}</span></td>
        <td data-label="Origen">${escapeHtml(person.source)}</td>
        <td data-label="Cupón"><strong>${escapeHtml(person.coupon)}</strong></td>
        <td data-label="Estado"><span class="status-pill status-pill--${statusClass(person.status)}">${escapeHtml(person.status)}</span></td>
      </tr>`).join('');
    if (elements.dashboardTableCount) {
      elements.dashboardTableCount.textContent = records.length
        ? `Mostrando ${records.length} de ${demoParticipants.length} ${demoParticipants.length === 1 ? 'registro' : 'registros'}`
        : 'No hay registros que coincidan con la búsqueda';
    }
    if (records.length && !records.some(({ index }) => index === selectedRecordIndex)) {
      selectedRecordIndex = records[0].index;
    }
    renderRecordDetail(selectedRecordIndex);
  }

  function normalizeEcuadorPhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.startsWith('593') && digits.length === 12) return `0${digits.slice(3)}`;
    return digits;
  }

  function collectAddParticipantPayload(form) {
    const data = new FormData(form);
    return {
      full_name: String(data.get('full_name') || '').trim(),
      business_name: String(data.get('business_name') || '').trim(),
      whatsapp: normalizeEcuadorPhone(data.get('whatsapp')),
      business_activity: String(data.get('business_activity') || '').trim(),
      plan_interest: String(data.get('plan_interest') || ''),
      source: String(data.get('source') || '') || null,
      coupon_percent: Number(data.get('coupon')),
      consent: Boolean(data.get('consent')),
      campaign: 'sorteo_un_mes_publicidad'
    };
  }

  function setAddParticipantError(message = '') {
    if (!elements.addParticipantError) return;
    elements.addParticipantError.textContent = message;
    elements.addParticipantError.hidden = !message;
  }

  function resetAddParticipantForm() {
    elements.addParticipantForm?.reset();
    setAddParticipantError();
    if (elements.addParticipantCounter) elements.addParticipantCounter.textContent = '0/240';
    elements.addParticipantForm?.elements.whatsapp?.setCustomValidity('');
  }

  function openAddParticipantDialog() {
    if (!elements.addParticipantDialog || !elements.addParticipantForm) return;
    resetAddParticipantForm();
    elements.addParticipantDialog.showModal();
    elements.addParticipantForm.elements.full_name.focus();
  }

  function closeAddParticipantDialog() {
    if (elements.addParticipantDialog?.open) elements.addParticipantDialog.close();
  }

  async function handleAddParticipant(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const phone = form.elements.whatsapp;
    const payload = collectAddParticipantPayload(form);
    const validPhone = /^09\d{8}$/.test(payload.whatsapp);
    phone.setCustomValidity(validPhone ? '' : 'Ingresa un número ecuatoriano válido de 10 dígitos.');
    if (!form.reportValidity()) return;
    phone.setCustomValidity('');
    if (!client) {
      setAddParticipantError('El servicio de datos no está disponible en este momento.');
      return;
    }

    setBusy(form, true);
    setAddParticipantError();
    try {
      const { data, error } = await client
        .from('participants')
        .insert(payload)
        .select('id, full_name, business_name, whatsapp, business_activity, plan_interest, source, coupon_percent, status, is_demo, created_at')
        .single();
      if (error || !data) throw error || new Error('Participant was not returned.');

      demoParticipants.unshift(participantFromDatabase(data));
      selectedRecordIndex = 0;
      renderStudioModules();
      updateDashboardSummary();
      closeAddParticipantDialog();
      showStudioToast('Participación guardada en Supabase.');
    } catch {
      setAddParticipantError('No pudimos guardar la participación. Revisa los datos e inténtalo nuevamente.');
    } finally {
      setBusy(form, false);
    }
  }

  function exportParticipantsToExcel() {
    if (!demoParticipants.length) {
      showStudioToast('No hay participaciones para descargar.');
      return;
    }
    const columns = [
      ['ID', (person) => person.id || 'Ejemplo local'],
      ['Nombre y apellido', (person) => person.name],
      ['Negocio o emprendimiento', (person) => person.business],
      ['WhatsApp', (person) => person.phone],
      ['¿A qué se dedica?', (person) => person.activity],
      ['Interés en planes publicitarios', (person) => person.interest],
      ['¿Cómo conoció a VisuaLed?', (person) => person.source || 'No especificado'],
      ['Cupón (%)', (person) => person.coupon],
      ['Estado', (person) => person.status],
      ['Consentimiento', () => 'Aceptado'],
      ['Fecha de registro', (person) => person.createdAt ? new Intl.DateTimeFormat('es-EC', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(person.createdAt)) : 'Ejemplo local']
    ];
    const cell = (value, header = false) => `<Cell><Data ss:Type="String">${escapeHtml(value)}</Data></Cell>`;
    const header = columns.map(([label]) => cell(label, true)).join('');
    const rows = demoParticipants.map((person) => `<Row>${columns.map(([, value]) => cell(value(person))).join('')}</Row>`).join('');
    const workbook = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#E7F2FA" ss:Pattern="Solid"/></Style></Styles><Worksheet ss:Name="Participantes"><Table><Row ss:StyleID="Header">${header}</Row>${rows}</Table></Worksheet></Workbook>`;
    const blob = new Blob([`\ufeff${workbook}`], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `visuled-participantes-${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showStudioToast(`${demoParticipants.length} participaciones listas para respaldo en Excel.`);
  }

  function renderStudioParticipantCards() {
    const container = document.querySelector('#studio-participant-cards');
    if (!container) return;
    container.innerHTML = demoParticipants.map((person, index) => `
      <article class="studio-person-card"><span class="studio-avatar">${initials(person.name)}</span><div><h4>${escapeHtml(person.name)}</h4><p>${escapeHtml(person.business)} · ${escapeHtml(person.activity)}</p><button class="text-action" type="button" data-open-record="${index}">Abrir ficha →</button></div></article>`).join('');
  }

  function renderStudioLeads() {
    const container = document.querySelector('#studio-lead-board');
    if (!container) return;
    const columns = [
      ['Contacto directo', (person) => person.interest.startsWith('Sí')],
      ['Más información', (person) => person.interest.startsWith('Quizás')],
      ['Solo sorteo', (person) => person.interest.startsWith('Por ahora')]
    ];
    container.innerHTML = columns.map(([title, matcher]) => {
      const records = demoParticipants.filter(matcher);
      return `<section><header><h4>${title}</h4><span>${records.length}</span></header>${records.map((person) => `<article><span class="studio-avatar">${initials(person.name)}</span><div><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(person.business)}</small></div></article>`).join('')}</section>`;
    }).join('');
  }

  function renderStudioCoupons() {
    const container = document.querySelector('#studio-coupon-board');
    if (!container) return;
    const coupons = [
      ['10%', demoParticipants.filter((person) => person.coupon === '10%').length, 'Entrada amplia'],
      ['15%', demoParticipants.filter((person) => person.coupon === '15%').length, 'Beneficio medio'],
      ['20%', demoParticipants.filter((person) => person.coupon === '20%').length, 'Mayor incentivo']
    ];
    container.innerHTML = coupons.map(([value, count, note]) => `<article class="studio-coupon-card"><p>${note}</p><strong>${value}</strong><span>${count} cupones entregados</span></article>`).join('');
  }

  function renderStudioActivity() {
    const container = document.querySelector('#studio-activity-feed');
    if (!container) return;
    const entries = demoParticipants.slice(0, 8).map((person) => [
      person.time,
      person.isDemo ? 'Registro de demostración' : 'Nueva participación',
      `${person.name} registró a ${person.business} con un cupón del ${person.coupon}.`
    ]);
    container.innerHTML = entries.map(([time, title, copy]) => `<li><time>${time}</time><strong>${title}</strong><p>${copy}</p></li>`).join('');
  }

  function renderStudioModules() {
    renderStudioTable();
    renderStudioParticipantCards();
    renderStudioLeads();
    renderStudioCoupons();
    renderStudioActivity();
  }

  function renderRaffleTape() {
    const tape = document.querySelector('#raffle-tape');
    if (!tape) return;
    tape.innerHTML = demoParticipants.slice(0, 6).map((person) => `<span>${initials(person.name)}</span>`).join('');
    updateRafflePool();
  }

  function renderDashboard() {
    renderRecentParticipants();
    renderInterestBars();
    renderCouponOrbit();
    renderParticipantTable();
    renderLeadBoard();
    renderCouponDetail();
    renderActivityFeed();
    renderRaffleTape();
    renderStudioModules();
    updateStudioRafflePool();
    updateDashboardSummary();
    const date = document.querySelector('#crm-date');
    if (date) date.textContent = new Intl.DateTimeFormat('es-EC', { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date()).replace('.', '');
  }

  function countUpMetrics() {
    document.querySelectorAll('[data-count]').forEach((element) => {
      const target = Number(element.dataset.count);
      const suffix = element.dataset.suffix || '';
      if (reduceMotion) {
        element.textContent = `${target}${suffix}`;
        return;
      }
      const started = performance.now();
      const tick = (now) => {
        const progress = Math.min(1, (now - started) / 850);
        const eased = 1 - Math.pow(1 - progress, 3);
        element.textContent = `${Math.round(target * eased)}${suffix}`;
        if (progress < 1) window.requestAnimationFrame(tick);
      };
      window.requestAnimationFrame(tick);
    });
  }

  function animateDashboardEntrance() {
    countUpMetrics();
    if (reduceMotion || !motion?.waapi?.animate) return;
    motion.waapi.animate('.studio-sidebar', { x: { from: -22 }, opacity: { from: 0 }, duration: 420, ease: 'outCubic' });
    motion.waapi.animate('.studio-topbar', { y: { from: -12 }, opacity: { from: 0 }, duration: 360, delay: 40, ease: 'outCubic' });
    motion.waapi.animate('.studio-metrics article, .studio-toolbar, .studio-records-card, .studio-detail', {
      y: { from: 16 }, opacity: { from: 0 }, duration: 420,
      delay: motion.stagger(45, { start: 90 }), ease: 'outCubic'
    });
  }

  function animatePanel(panel) {
    if (reduceMotion || !motion?.waapi?.animate || !panel) return;
    const targets = panel.querySelectorAll('.studio-section-heading, .studio-person-card, .studio-kanban section, .studio-coupon-card, .studio-raffle > div, .studio-activity li');
    motion.waapi.animate(targets, { y: { from: 14 }, opacity: { from: 0 }, duration: 360, delay: motion.stagger(35), ease: 'outCubic' });
  }

  function navigateCrm(target) {
    document.querySelectorAll('[data-crm-target]').forEach((button) => {
      const active = button.dataset.crmTarget === target;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    let activePanel;
    document.querySelectorAll('[data-crm-panel]').forEach((panel) => {
      const active = panel.dataset.crmPanel === target;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
      if (active) activePanel = panel;
    });
    setNavOpen(false);
    elements.crmContent?.classList.toggle('is-raffle-view', target === 'raffle');
    elements.crmContent?.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    animatePanel(activePanel);
  }

  function setNavOpen(open) {
    const shouldOpen = mobileNavMedia.matches && Boolean(open);
    elements.crmShell?.classList.toggle('is-nav-open', shouldOpen);
    document.querySelector('#studio-menu-toggle')?.setAttribute('aria-expanded', String(shouldOpen));
    const sidebar = document.querySelector('.studio-sidebar');
    const scrim = document.querySelector('#studio-nav-scrim');
    if (sidebar) sidebar.inert = mobileNavMedia.matches && !shouldOpen;
    if (scrim) scrim.hidden = !shouldOpen;
  }

  function showStudioToast(message) {
    const toast = document.querySelector('#studio-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(showStudioToast.timeoutId);
    showStudioToast.timeoutId = window.setTimeout(() => { toast.hidden = true; }, 3200);
  }

  function normalizeRaffleBusiness(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getStudioRafflePool() {
    const coupon = elements.studioRaffleCoupon?.value || 'all';
    const demoMode = studioRaffleMode === 'demo';
    const seenBusinesses = new Set();
    const source = demoParticipants
      .filter((person) => Boolean(person.isDemo) === demoMode)
      .filter((person) => coupon === 'all' || person.coupon === coupon)
      .filter((person) => person.name && person.business && person.activity && person.coupon)
      .sort((first, second) => {
        if (demoMode) return 0;
        const firstDate = first.createdAt ? new Date(first.createdAt).getTime() : Number.MAX_SAFE_INTEGER;
        const secondDate = second.createdAt ? new Date(second.createdAt).getTime() : Number.MAX_SAFE_INTEGER;
        return firstDate - secondDate;
      });

    return source
      .filter((person) => {
        const businessKey = normalizeRaffleBusiness(person.business);
        if (!businessKey || seenBusinesses.has(businessKey)) return false;
        seenBusinesses.add(businessKey);
        return true;
      })
      .map((person, index) => ({ ...person, raffleCode: `VL-${String(index + 1).padStart(4, '0')}` }));
  }

  function updateStudioRaffleText(person, kicker = 'CAMBIANDO SEÑALES') {
    const name = document.querySelector('#studio-raffle-name');
    const business = document.querySelector('#studio-raffle-business');
    const code = document.querySelector('#studio-raffle-code');
    const label = document.querySelector('#studio-raffle-kicker');
    if (label) label.textContent = kicker;
    if (name) name.textContent = person?.name || 'Sorteo VisuaLed';
    if (business) business.textContent = person ? person.business : 'Un mes de publicidad gratis';
    if (code) code.textContent = person?.raffleCode || 'LISTO';
  }

  function renderStudioRaffleTicker(pool) {
    if (!elements.studioRaffleTicker) return;
    elements.studioRaffleTicker.innerHTML = pool.slice(0, 6).map((person) => `
      <span><b>${escapeHtml(person.raffleCode)}</b><small>${escapeHtml(person.business)}</small></span>`).join('');
  }

  function setStudioRaffleState(state) {
    const stage = elements.studioRaffleStage;
    if (!stage) return;
    stage.dataset.raffleState = state;
    ['is-countdown', 'is-spinning', 'is-revealing', 'has-winner', 'is-error'].forEach((className) => stage.classList.remove(className));
    if (state === 'countdown') stage.classList.add('is-countdown');
    if (state === 'spinning') stage.classList.add('is-spinning');
    if (state === 'revealing') stage.classList.add('is-revealing');
    if (state === 'winner') stage.classList.add('has-winner');
    if (state === 'error') stage.classList.add('is-error');
  }

  function updateStudioRafflePool() {
    const pool = getStudioRafflePool();
    const isReal = studioRaffleMode === 'real';
    const canExecuteReal = ['admin', 'agent'].includes(currentMemberRole);
    const countLabel = `${pool.length} ${pool.length === 1 ? 'empresa' : 'empresas'}`;
    const startLabel = 'Iniciar sorteo';

    if (elements.studioRaffleCompanyCount) elements.studioRaffleCompanyCount.textContent = String(pool.length);
    if (elements.studioRaffleTicketCount) elements.studioRaffleTicketCount.textContent = String(pool.length);
    if (elements.studioRafflePoolCount) elements.studioRafflePoolCount.textContent = countLabel;
    if (elements.studioRaffleStatus) {
      elements.studioRaffleStatus.textContent = !isReal
        ? 'Participantes listos para sortear.'
        : !canExecuteReal
          ? 'Solo administradores y agentes pueden ejecutar el sorteo real.'
          : pool.length
            ? 'El resultado real se guarda una sola vez en Supabase.'
            : 'Aún no hay participaciones reales elegibles.';
    }
    if (elements.studioRaffleStart && !raffleBusy) {
      const label = elements.studioRaffleStart.querySelector('span');
      if (label) label.textContent = startLabel;
      elements.studioRaffleStart.disabled = !pool.length || (isReal && !canExecuteReal);
      elements.studioRaffleStart.removeAttribute('aria-busy');
    }
    if (!raffleBusy) {
      setStudioRaffleState(pool.length ? 'idle' : 'error');
      if (elements.studioRaffleWinnerCard) elements.studioRaffleWinnerCard.hidden = true;
      updateStudioRaffleText(pool[0], pool.length ? 'LISTOS PARA PARTICIPAR' : 'SIN PARTICIPACIONES');
      if (!pool.length) updateStudioRaffleText(null, 'SIN PARTICIPACIONES');
    }
    renderStudioRaffleTicker(pool);
  }

  function setStudioRaffleControlsBusy(busy) {
    document.querySelectorAll('[data-studio-raffle-mode]').forEach((button) => { button.disabled = busy; });
    if (elements.studioRaffleCoupon) elements.studioRaffleCoupon.disabled = busy;
    if (elements.studioRaffleStart) {
      elements.studioRaffleStart.disabled = busy;
      elements.studioRaffleStart.setAttribute('aria-busy', String(busy));
    }
  }

  function delay(milliseconds) {
    return new Promise((resolve) => { window.setTimeout(resolve, milliseconds); });
  }

  function spinStudioPool(pool, milliseconds, decelerate = false) {
    return new Promise((resolve) => {
      const startedAt = performance.now();
      let index = 0;
      const tick = () => {
        const elapsed = performance.now() - startedAt;
        if (elapsed >= milliseconds) {
          studioRaffleTimer = null;
          resolve();
          return;
        }
        const current = pool[index % pool.length];
        updateStudioRaffleText(current, decelerate ? 'REDUCIENDO LA SEÑAL' : 'CAMBIANDO SEÑALES');
        index += 1;
        const progress = elapsed / milliseconds;
        const interval = decelerate ? 90 + (progress * 300) : 92;
        studioRaffleTimer = window.setTimeout(tick, interval);
      };
      tick();
    });
  }

  function celebrateStudioWinner(winner) {
    updateStudioRaffleText(winner, 'PARTICIPACIÓN SELECCIONADA');
    if (elements.studioRaffleWinnerName) elements.studioRaffleWinnerName.textContent = winner.name;
    if (elements.studioRaffleWinnerBusiness) elements.studioRaffleWinnerBusiness.textContent = winner.business;
    if (elements.studioRaffleWinnerCode) elements.studioRaffleWinnerCode.textContent = winner.raffleCode;
    if (elements.studioRaffleWinnerCard) elements.studioRaffleWinnerCard.hidden = false;

    const confetti = document.querySelector('#studio-raffle-confetti');
    if (confetti) confetti.innerHTML = '<i></i>'.repeat(18);
    setStudioRaffleState('winner');
    if (!reduceMotion && motion?.waapi?.animate) {
      motion.waapi.animate('.studio-raffle__screen-content', { scale: [{ from: .92 }, { to: 1 }], opacity: [{ from: .3 }, { to: 1 }], duration: 720, ease: 'outElastic(1, .55)' });
      motion.waapi.animate('.studio-raffle__robot', { translateY: [{ from: 18 }, { to: -8 }, { to: 0 }], rotate: [{ from: -2 }, { to: 2 }, { to: 0 }], duration: 980, ease: 'outElastic(1, .55)' });
      motion.waapi.animate('#studio-raffle-confetti i', { translateY: [{ from: -12 }, { to: 120 }], rotate: [{ from: 0 }, { to: 240 }], opacity: [{ from: 1 }, { to: 0 }], delay: motion.stagger(35), duration: 1200, ease: 'inQuad' });
    }
  }

  async function requestRealStudioWinner() {
    if (!client) throw new Error('Service unavailable');
    const value = elements.studioRaffleCoupon?.value || 'all';
    const { data, error } = await client.functions.invoke('execute-real-raffle', {
      body: {
        coupon_percent: value === 'all' ? null : Number(value.replace('%', '')),
        request_id: crypto.randomUUID()
      }
    });
    if (error || !data?.winner) throw new Error('Unable to prepare raffle');
    return {
      id: data.winner.participant_id,
      name: data.winner.full_name,
      business: data.winner.business_name,
      coupon: `${data.winner.coupon_percent}%`,
      raffleCode: data.winner.ticket_code
    };
  }

  async function runStudioRaffle(pool, winner) {
    const timing = reduceMotion
      ? { prepare: 0, countdownStep: 0, spin: 0, decelerate: 0, reveal: 0, celebrate: 0 }
      : studioRaffleTiming;

    setStudioRaffleState('countdown');
    updateStudioRaffleText(null, 'PREPARANDO SORTEO');
    if (!reduceMotion && motion?.waapi?.animate) {
      motion.waapi.animate('.studio-raffle__screen-content', {
        scale: [{ from: .97 }, { to: 1 }],
        opacity: [{ from: .7 }, { to: 1 }],
        duration: 320,
        ease: 'outCubic'
      });
    }
    if (timing.prepare) await delay(timing.prepare);

    for (const number of ['3', '2', '1']) {
      updateStudioRaffleText(null, `COMENZANDO EN ${number}`);
      if (timing.countdownStep) await delay(timing.countdownStep);
    }

    setStudioRaffleState('spinning');
    await spinStudioPool(pool, timing.spin);
    await spinStudioPool(pool, timing.decelerate, true);
    setStudioRaffleState('revealing');
    updateStudioRaffleText(winner, 'RESULTADO LISTO');
    if (timing.reveal) await delay(timing.reveal);
    celebrateStudioWinner(winner);
    if (timing.celebrate) await delay(timing.celebrate);
  }

  async function startStudioRaffle() {
    const pool = getStudioRafflePool();
    if (raffleBusy || !pool.length || (studioRaffleMode === 'real' && !['admin', 'agent'].includes(currentMemberRole))) return;
    raffleBusy = true;
    setStudioRaffleControlsBusy(true);
    setStudioRaffleState('countdown');
    updateStudioRaffleText(null, 'PREPARANDO SORTEO');
    if (elements.studioRaffleWinnerCard) elements.studioRaffleWinnerCard.hidden = true;
    if (elements.studioRaffleStatus) elements.studioRaffleStatus.textContent = studioRaffleMode === 'real' ? 'Preparando el resultado seguro…' : 'El sorteo está en curso.';

    try {
      const winner = studioRaffleMode === 'real'
        ? await requestRealStudioWinner()
        : { ...pool[Math.floor(Math.random() * pool.length)] };
      await runStudioRaffle(pool, winner);
      if (elements.studioRaffleStatus) elements.studioRaffleStatus.textContent = studioRaffleMode === 'real' ? 'Resultado guardado en Supabase.' : 'Sorteo completado.';
    } catch {
      if (studioRaffleTimer) window.clearTimeout(studioRaffleTimer);
      studioRaffleTimer = null;
      setStudioRaffleState('error');
      updateStudioRaffleText(null, 'NO SE PUDO COMPLETAR');
      if (elements.studioRaffleStatus) elements.studioRaffleStatus.textContent = 'No pudimos preparar el sorteo. Inténtalo nuevamente.';
      showStudioToast('No pudimos preparar el sorteo. Inténtalo nuevamente.');
    } finally {
      raffleBusy = false;
      setStudioRaffleControlsBusy(false);
      if (elements.studioRaffleStart) {
        const label = elements.studioRaffleStart.querySelector('span');
        if (label) {
          const failed = elements.studioRaffleStage?.dataset.raffleState === 'error';
          label.textContent = failed ? 'Intentar nuevamente' : studioRaffleMode === 'real' ? 'Realizar nuevo sorteo' : 'Repetir sorteo';
        }
        elements.studioRaffleStart.disabled = !pool.length || (studioRaffleMode === 'real' && !['admin', 'agent'].includes(currentMemberRole));
      }
    }
  }

  function getRafflePool() {
    const coupon = elements.raffleCoupon?.value || 'all';
    return coupon === 'all' ? [...demoParticipants] : demoParticipants.filter((person) => person.coupon === coupon);
  }

  function updateRafflePool() {
    const pool = getRafflePool();
    if (elements.rafflePoolCount) elements.rafflePoolCount.textContent = `${pool.length} elegibles`;
    if (!raffleBusy && elements.raffleName) {
      elements.raffleKicker.textContent = 'LISTOS PARA PARTICIPAR';
      elements.raffleName.textContent = pool.length ? 'Selecciona una categoría' : 'Sin participantes';
      elements.raffleBusiness.textContent = pool.length ? 'La animación comenzará cuando presiones el botón' : 'Cambia el filtro para continuar';
      elements.raffleStart.disabled = pool.length === 0;
    }
  }

  function startRaffle() {
    const pool = getRafflePool();
    if (raffleBusy || !pool.length) return;
    raffleBusy = true;
    elements.raffleStart.disabled = true;
    elements.raffleStart.setAttribute('aria-busy', 'true');
    elements.raffleKicker.textContent = 'LEYENDO SEÑALES';
    document.querySelector('.raffle-stage')?.classList.add('is-scanning');

    if (!reduceMotion && motion?.waapi?.animate) {
      motion.waapi.animate('.raffle-scan', { x: ['-120%', '420%'], duration: 1900, ease: 'inOutQuad' });
      motion.waapi.animate('#raffle-tape span', { y: [{ to: -8 }, { to: 8 }], opacity: [{ to: .45 }, { to: 1 }], duration: 300, delay: motion.stagger(45), loop: 6, alternate: true, ease: 'inOutSine' });
    }

    let frame = 0;
    const totalFrames = reduceMotion ? 1 : 24;
    const interval = window.setInterval(() => {
      const current = pool[frame % pool.length];
      elements.raffleName.textContent = current.name;
      elements.raffleBusiness.textContent = `${current.business} · Cupón ${current.coupon}`;
      frame += 1;
      if (frame < totalFrames) return;

      window.clearInterval(interval);
      const winner = pool[Math.floor(Math.random() * pool.length)];
      elements.raffleKicker.textContent = 'SEÑAL SELECCIONADA';
      elements.raffleName.textContent = winner.name;
      elements.raffleBusiness.textContent = `${winner.business} · Cupón ${winner.coupon}`;
      document.querySelector('.raffle-stage')?.classList.remove('is-scanning');
      document.querySelector('.raffle-stage')?.classList.add('has-winner');
      if (!reduceMotion && motion?.waapi?.animate) {
        motion.waapi.animate('.raffle-display', { scale: [{ from: .94 }, { to: 1 }], opacity: { from: .35 }, duration: 650, ease: 'outElastic(1, .55)' });
      }
      window.setTimeout(() => {
        raffleBusy = false;
        elements.raffleStart.disabled = false;
        elements.raffleStart.removeAttribute('aria-busy');
        elements.raffleStart.querySelector('span').textContent = 'Repetir simulación';
      }, reduceMotion ? 0 : 500);
    }, reduceMotion ? 20 : 78);
  }

  function openProtectedCrm(animated) {
    const reveal = () => {
      showView('view-ready');
      window.requestAnimationFrame(animateDashboardEntrance);
    };
    if (!animated || reduceMotion || !motion?.waapi?.animate) {
      reveal();
      return;
    }
    const exitAnimations = [
      motion.waapi.animate('.intro-panel', { x: -46, opacity: 0, duration: 460, ease: 'inOutCubic' }),
      motion.waapi.animate('.brand-bar', { y: -24, opacity: 0, duration: 380, delay: 40, ease: 'inOutCubic' }),
      motion.waapi.animate('#view-login', { scale: .96, opacity: 0, duration: 460, ease: 'inOutCubic' })
    ];
    Promise.all(exitAnimations.map((animation) => animation.then())).then(() => {
      exitAnimations.forEach((animation) => animation.cancel());
      reveal();
    });
  }

  function showMessage(text, type = 'info') {
    messageBox.textContent = text;
    messageBox.dataset.type = type;
    messageBox.hidden = false;
    if (type === 'error') window.requestAnimationFrame(() => messageBox.focus({ preventScroll: true }));
  }

  function clearMessage() {
    messageBox.textContent = '';
    messageBox.removeAttribute('data-type');
    messageBox.hidden = true;
  }

  function showView(id, options = {}) {
    document.body.classList.toggle('crm-open', id === 'view-ready');
    views.forEach((view) => { view.hidden = view.id !== id; });
    clearMessage();
    if (options.message) showMessage(options.message, options.type);

    window.requestAnimationFrame(() => {
      const view = document.querySelector(`#${id}`);
      const focusTarget = id === 'view-ready'
        ? document.querySelector('#crm-content')
        : view?.querySelector('input:not([type="hidden"]), button');
      focusTarget?.focus({ preventScroll: true });
    });
  }

  function setBusy(form, busy) {
    [...form.elements].forEach((control) => { control.disabled = busy; });
    form.setAttribute('aria-busy', String(busy));
  }

  function normalizeValue(value) {
    return String(value || '').trim().toLowerCase();
  }

  function scrubAuthUrl() {
    if (window.location.pathname !== '/' || window.location.search || window.location.hash) {
      window.history.replaceState({}, document.title, '/');
    }
  }

  function readCallback() {
    const url = new URL(window.location.href);
    const query = url.searchParams;
    const hash = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);

    return {
      code: query.get('code'),
      accessToken: hash.get('access_token'),
      refreshToken: hash.get('refresh_token'),
      hasError: Boolean(query.get('error') || hash.get('error')),
      hasSessionCallback: Boolean(query.get('code') || (hash.get('access_token') && hash.get('refresh_token'))),
      hadAuthData: Boolean(query.get('code') || hash.get('access_token') || query.get('error') || hash.get('error') || query.get('flow'))
    };
  }

  async function consumeCallback() {
    const callback = readCallback();
    if (!callback.hadAuthData) return { handled: false, error: false, hasSessionCallback: false };

    scrubAuthUrl();
    if (callback.hasError) return { handled: true, error: true, hasSessionCallback: false };

    if (callback.code) {
      const { error } = await client.auth.exchangeCodeForSession(callback.code);
      return { handled: true, error: Boolean(error), hasSessionCallback: callback.hasSessionCallback };
    }

    if (callback.accessToken && callback.refreshToken) {
      const { error } = await client.auth.setSession({
        access_token: callback.accessToken,
        refresh_token: callback.refreshToken
      });
      return { handled: true, error: Boolean(error), hasSessionCallback: callback.hasSessionCallback };
    }

    return { handled: true, error: false, hasSessionCallback: false };
  }

  async function getCurrentSession() {
    const { data, error } = await client.auth.getSession();
    if (error) return null;
    return data.session;
  }

  async function showProtectedArea(session) {
    const { data, error } = await client
      .from('crm_members')
      .select('display_name, role')
      .eq('user_id', session.user.id)
      .eq('active', true)
      .maybeSingle();

    if (error || !data) {
      showView('view-denied');
      return;
    }

    const roleLabels = { admin: 'Administrador', agent: 'Agente', viewer: 'Consulta' };
    currentMemberRole = data.role;
    elements.memberName.textContent = data.display_name;
    elements.memberRole.textContent = roleLabels[data.role] || 'Miembro';
    elements.memberAvatar.textContent = initials(data.display_name || 'VisuaLed');
    const participantsLoaded = await loadParticipants();
    subscribeToParticipantChanges();
    openProtectedCrm(animateNextAccess);
    if (!participantsLoaded) {
      window.setTimeout(() => showStudioToast('No pudimos actualizar los registros. Mostramos los tres ejemplos locales.'), 350);
    }
    animateNextAccess = false;
  }

  async function routeSession() {
    if (routingPromise) return routingPromise;

    routingPromise = (async () => {
      const session = await getCurrentSession();
      if (!session) {
        showView('view-login');
        return;
      }

      await showProtectedArea(session);
    })()
      .catch(() => {
        showView('view-login', { message: genericAccessError, type: 'error' });
      })
      .finally(() => { routingPromise = null; });

    return routingPromise;
  }

  function resolveLoginEmails(username) {
    const enteredValue = normalizeValue(username);
    const configuredEmails = (Array.isArray(config.loginEmails) ? config.loginEmails : [config.loginEmail])
      .filter(Boolean);

    if (enteredValue === normalizeValue(config.loginUsername)) return configuredEmails;
    if (configuredEmails.some((email) => normalizeValue(email) === enteredValue)) return [enteredValue];
    return [];
  }

  async function handleLogin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;

    const formData = new FormData(form);
    const emails = resolveLoginEmails(formData.get('username'));
    const password = String(formData.get('password') || '');
    if (form) setBusy(form, true);
    clearMessage();

    try {
      let error = new Error('Invalid credentials');
      for (const email of emails) {
        const response = await client.auth.signInWithPassword({ email, password });
        if (!response.error) {
          error = null;
          break;
        }
      }

      if (error) {
        showMessage(genericAccessError, 'error');
        return;
      }

      animateNextAccess = true;
      form.reset();
      await routeSession();
    } catch {
      showMessage(genericAccessError, 'error');
    } finally {
      if (form) setBusy(form, false);
    }
  }

  async function handleSetPassword(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;

    const formData = new FormData(form);
    const password = String(formData.get('password') || '');
    const confirmation = String(formData.get('password-confirm') || '');
    if (password !== confirmation) {
      showMessage('Las contraseñas no coinciden.', 'error');
      return;
    }

    setBusy(form, true);
    clearMessage();
    try {
      const { error } = await client.auth.updateUser({ password });
      if (error) {
        showMessage(genericAccessError, 'error');
        return;
      }

      form.reset();
      showView('view-loading');
      await routeSession();
    } catch {
      showMessage(genericAccessError, 'error');
    } finally {
      setBusy(form, false);
    }
  }

  async function signOut() {
    clearMessage();
    if (participantChannel) {
      await client.removeChannel(participantChannel);
      participantChannel = null;
    }
    await client.auth.signOut({ scope: 'local' });
    navigateCrm('overview');
    showView('view-login');
  }

  function bindEvents() {
    elements.loginForm.addEventListener('submit', handleLogin);
    elements.setPasswordForm?.addEventListener('submit', handleSetPassword);

    document.querySelectorAll('[data-toggle-password]').forEach((button) => {
      button.addEventListener('click', () => {
        const input = document.getElementById(button.dataset.togglePassword);
        if (!input) return;
        const showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        if (!button.querySelector('svg')) button.textContent = showing ? 'Mostrar' : 'Ocultar';
        button.setAttribute('aria-pressed', String(!showing));
        button.setAttribute('aria-label', showing ? 'Mostrar contraseña' : 'Ocultar contraseña');
      });
    });

    document.querySelector('#password-help')?.addEventListener('click', () => {
      showMessage('Solicita al administrador de VisuaLed una nueva contraseña para tu cuenta.', 'info');
    });

    document.querySelectorAll('.sign-out-action').forEach((button) => {
      button.addEventListener('click', signOut);
    });

    document.querySelectorAll('[data-crm-target]').forEach((button) => {
      button.addEventListener('click', () => navigateCrm(button.dataset.crmTarget));
    });

    document.querySelectorAll('[data-crm-jump]').forEach((button) => {
      button.addEventListener('click', () => navigateCrm(button.dataset.crmJump));
    });

    elements.participantSearch?.addEventListener('input', renderParticipantTable);
    elements.participantStatus?.addEventListener('change', renderParticipantTable);
    elements.dashboardSearch?.addEventListener('input', renderStudioTable);
    elements.dashboardTableBody?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-record-select]');
      if (!button) return;
      renderRecordDetail(Number(button.dataset.recordSelect));
    });
    document.querySelectorAll('[data-record-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        activeRecordFilter = button.dataset.recordFilter;
        document.querySelectorAll('[data-record-filter]').forEach((filter) => {
          const active = filter === button;
          filter.classList.toggle('is-active', active);
          filter.setAttribute('aria-pressed', String(active));
        });
        renderStudioTable();
      });
    });
    elements.recordStatus?.addEventListener('change', async () => {
      const participant = demoParticipants[selectedRecordIndex];
      if (!participant) return;
      const previousStatus = participant.status;
      const nextStatus = elements.recordStatus.value;
      participant.status = nextStatus;
      renderStudioTable();
      updateDashboardSummary();
      if (!participant.id) {
        showStudioToast('Estado actualizado en el ejemplo local.');
        return;
      }
      const { error } = await client
        .from('participants')
        .update({ status: databaseStatuses[nextStatus] })
        .eq('id', participant.id);
      if (error) {
        participant.status = previousStatus;
        renderStudioTable();
        updateDashboardSummary();
        showStudioToast('No pudimos guardar el cambio de estado.');
        return;
      }
      showStudioToast('Estado guardado en Supabase.');
    });
    document.querySelector('#studio-participant-cards')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-open-record]');
      if (!button) return;
      selectedRecordIndex = Number(button.dataset.openRecord);
      navigateCrm('overview');
      renderStudioTable();
      window.requestAnimationFrame(() => document.querySelector('#record-detail-name')?.scrollIntoView({ block: 'nearest' }));
    });
    document.querySelector('#studio-search-action')?.addEventListener('click', () => {
      navigateCrm('overview');
      window.requestAnimationFrame(() => elements.dashboardSearch?.focus());
    });
    elements.addParticipantButton?.addEventListener('click', openAddParticipantDialog);
    elements.exportExcelButton?.addEventListener('click', exportParticipantsToExcel);
    elements.addParticipantForm?.addEventListener('submit', handleAddParticipant);
    elements.addParticipantForm?.elements.business_activity?.addEventListener('input', (event) => {
      if (elements.addParticipantCounter) elements.addParticipantCounter.textContent = `${event.target.value.length}/240`;
    });
    document.querySelectorAll('[data-close-add-participant]').forEach((button) => {
      button.addEventListener('click', closeAddParticipantDialog);
    });
    elements.addParticipantDialog?.addEventListener('click', (event) => {
      if (event.target === elements.addParticipantDialog) closeAddParticipantDialog();
    });
    document.querySelector('#studio-notification-action')?.addEventListener('click', () => {
      const message = unreadParticipantCount
        ? `${unreadParticipantCount} ${unreadParticipantCount === 1 ? 'participación nueva' : 'participaciones nuevas'} desde tu última revisión.`
        : 'No hay participaciones nuevas pendientes de revisar.';
      unreadParticipantCount = 0;
      updateNotificationCount();
      showStudioToast(message);
    });
    document.querySelector('#studio-more-filters')?.addEventListener('click', () => navigateCrm('participants'));
    document.querySelector('#record-history')?.addEventListener('click', () => {
      showStudioToast('El historial completo se habilitará al conectar los registros reales.');
    });
    document.querySelectorAll('.studio-records-card > footer button').forEach((button) => {
      button.addEventListener('click', () => {
        if (!button.classList.contains('is-active')) showStudioToast('La paginación real se activará con la base de participantes.');
      });
    });
    document.querySelector('#studio-profile-action')?.addEventListener('click', () => {
      const menu = document.querySelector('#studio-profile-menu');
      const trigger = document.querySelector('#studio-profile-action');
      if (!menu || !trigger) return;
      const willOpen = menu.hidden;
      menu.hidden = !willOpen;
      trigger.setAttribute('aria-expanded', String(willOpen));
    });
    document.querySelectorAll('[data-studio-raffle-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        if (raffleBusy) return;
        studioRaffleMode = button.dataset.studioRaffleMode === 'real' ? 'real' : 'demo';
        document.querySelectorAll('[data-studio-raffle-mode]').forEach((modeButton) => {
          const active = modeButton === button;
          modeButton.classList.toggle('is-active', active);
          modeButton.setAttribute('aria-pressed', String(active));
        });
        updateStudioRafflePool();
      });
    });
    elements.studioRaffleCoupon?.addEventListener('change', updateStudioRafflePool);
    elements.studioRaffleStart?.addEventListener('click', startStudioRaffle);
    elements.raffleCoupon?.addEventListener('change', () => {
      document.querySelector('.raffle-stage')?.classList.remove('has-winner');
      updateRafflePool();
    });
    elements.raffleStart?.addEventListener('click', startRaffle);

    document.querySelector('#studio-menu-toggle')?.addEventListener('click', () => {
      setNavOpen(!elements.crmShell?.classList.contains('is-nav-open'));
    });
    document.querySelector('#studio-nav-scrim')?.addEventListener('click', () => setNavOpen(false));

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && elements.crmShell?.classList.contains('is-nav-open')) {
        setNavOpen(false);
        document.querySelector('#studio-menu-toggle')?.focus();
      }
      if (event.key === 'Escape') {
        const menu = document.querySelector('#studio-profile-menu');
        const trigger = document.querySelector('#studio-profile-action');
        if (menu && !menu.hidden) {
          menu.hidden = true;
          trigger?.setAttribute('aria-expanded', 'false');
        }
      }
    });
    document.addEventListener('click', (event) => {
      const profile = document.querySelector('.studio-profile');
      const menu = document.querySelector('#studio-profile-menu');
      const trigger = document.querySelector('#studio-profile-action');
      if (profile && menu && !menu.hidden && !profile.contains(event.target)) {
        menu.hidden = true;
        trigger?.setAttribute('aria-expanded', 'false');
      }
    });
    mobileNavMedia.addEventListener('change', () => setNavOpen(false));

  }

  async function initialize() {
    document.querySelector('#current-year').textContent = String(new Date().getFullYear());
    renderDashboard();
    bindEvents();
    setNavOpen(false);

    if (!config?.supabaseUrl || !config?.supabasePublishableKey || !sdk?.createClient) {
      showView('view-login', { message: 'El servicio de acceso no está disponible en este momento.', type: 'error' });
      return;
    }

    client = sdk.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: false,
        persistSession: true,
        autoRefreshToken: true,
        storageKey: config.storageKey
      },
      global: {
        headers: { 'X-Client-Info': 'visualed-crm/1.1.0' }
      }
    });

    client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') window.setTimeout(() => showView('view-login'), 0);
    });

    try {
      const callback = await consumeCallback();
      if (callback.error) {
        await client.auth.signOut({ scope: 'local' });
        showView('view-login', { message: 'El enlace no es válido o ya venció.', type: 'error' });
        return;
      }

      if (callback.hasSessionCallback && await getCurrentSession()) {
        showView('view-set-password');
        return;
      }

      await routeSession();
    } catch {
      scrubAuthUrl();
      showView('view-login', { message: genericAccessError, type: 'error' });
    }
  }

  initialize();
})();
