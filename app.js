// Vibe Tasks — SPA logic
(function(){
  const STORAGE_KEY = 'vibe:tasks'
  const CONFIG_KEY = 'vibe:config'

  // Default thresholds (days)
  const DEFAULT_CONFIG = { mediumDays: 3, highDays: 1 }

  // Elements
  const tasksListEl = document.getElementById('tasks-list')
  const btnNew = document.getElementById('btn-new')
  const modal = document.getElementById('modal')
  const form = document.getElementById('task-form')
  const btnCancel = document.getElementById('btn-cancel')
  const modalConfig = document.getElementById('modal-config')
  const btnConfig = document.getElementById('btn-config')
  const configForm = document.getElementById('config-form')
  const btnConfigCancel = document.getElementById('btn-config-cancel')

  let tasks = loadTasks()
  let config = loadConfig()
  let completedTasks = loadCompletedTasks()

  // ensure config defaults
  config.theme = config.theme || 'dark'
  config.notifications = typeof config.notifications !== 'undefined' ? config.notifications : false

  // Ensure tasks have orderIndex and normalized priority
  tasks = tasks.map((t,i)=> ({...t, orderIndex: typeof t.orderIndex==='number'?t.orderIndex:i, priority: Number(t.priority) || 0}))

  // UI bindings
  btnNew.addEventListener('click', ()=> openModal())
  btnCancel.addEventListener('click', closeModal)
  form.addEventListener('submit', onCreateTask)
  btnConfig.addEventListener('click', openConfig)
  btnConfigCancel.addEventListener('click', closeConfig)
  configForm.addEventListener('submit', onSaveConfig)
  const searchInput = document.getElementById('search')
  const tagFilter = document.getElementById('tag-filter')
  const btnExport = document.getElementById('btn-export')
  const btnImport = document.getElementById('btn-import')
  const importFile = document.getElementById('import-file')
  searchInput && searchInput.addEventListener('input', ()=> render())
  tagFilter && tagFilter.addEventListener('change', ()=> render())
  const btnViewList = document.getElementById('btn-view-list')
  const btnViewCal = document.getElementById('btn-view-cal')
  const btnMore = document.getElementById('btn-more')
  const moreMenu = document.getElementById('more-menu')
  const calendarEl = document.getElementById('calendar')
  let currentView = 'list'
  // track displayed month (first day)
  let calendarDate = new Date()
  btnViewList && btnViewList.addEventListener('click', ()=>{ currentView='list'; updateViewButtons(); render() })
  btnViewCal && btnViewCal.addEventListener('click', ()=>{ currentView='calendar'; updateViewButtons(); render() })
  function updateViewButtons(){
    if(btnViewList) btnViewList.classList.toggle('primary', currentView==='list')
    if(btnViewCal) btnViewCal.classList.toggle('primary', currentView==='calendar')
  }
  // initialize view buttons state
  updateViewButtons()
  btnExport && btnExport.addEventListener('click', exportData)
  btnImport && btnImport.addEventListener('click', ()=> importFile.click())
  importFile && importFile.addEventListener('change', handleImportFile)

  // More menu toggle (header overflow)
  if(btnMore && moreMenu){
    btnMore.addEventListener('click', (e)=>{
      const open = moreMenu.getAttribute('aria-hidden') === 'false'
      moreMenu.setAttribute('aria-hidden', String(!open))
      btnMore.setAttribute('aria-expanded', String(!open))
    })
    // close when clicking outside
    document.addEventListener('click', (ev)=>{
      if(!btnMore.contains(ev.target) && !moreMenu.contains(ev.target)){
        moreMenu.setAttribute('aria-hidden','true')
        btnMore.setAttribute('aria-expanded','false')
      }
    })
    // wire import/menu item to file input
    const menuImport = document.getElementById('btn-import')
    if(menuImport) menuImport.addEventListener('click', ()=> importFile.click())
  }

  // show config values
  function populateConfigForm(){
    configForm.elements['mediumDays'].value = config.mediumDays
    configForm.elements['highDays'].value = config.highDays
    if(configForm.elements['notifications']) configForm.elements['notifications'].checked = !!config.notifications
    if(configForm.elements['lightTheme']) configForm.elements['lightTheme'].checked = (config.theme === 'light')
  }

  // Apply theme
  const btnTheme = document.getElementById('btn-theme')
  function applyTheme(){
    if(config.theme === 'light') document.body.classList.add('light-theme')
    else document.body.classList.remove('light-theme')
  }
  btnTheme && btnTheme.addEventListener('click', ()=>{
    config.theme = config.theme === 'light' ? 'dark' : 'light'
    saveConfig(); applyTheme(); showToast('Tema cambiado a '+config.theme, 'info')
  })
  // initial theme
  applyTheme()

  const submitBtn = document.getElementById('submit-create')
  function openModal(){
    // create mode
    form.reset()
    form.elements['id'].value = ''
    submitBtn.textContent = 'Crear'
    modal.classList.remove('hidden')
  }
  function closeModal(){ form.reset(); form.elements['id'].value = ''; submitBtn.textContent = 'Crear'; modal.classList.add('hidden') }
  function openConfig(){ populateConfigForm(); modalConfig.classList.remove('hidden') }
  function closeConfig(){ modalConfig.classList.add('hidden') }

  function onSaveConfig(e){
    e.preventDefault()
    const medium = Number(configForm.elements['mediumDays'].value)
    const high = Number(configForm.elements['highDays'].value)
    // Basic validation: high should be <= medium
    if(isNaN(medium) || isNaN(high) || high>medium){
      showToast('Valores inválidos: asegúrate que "días para alta" <= "días para media"', 'error')
      return
    }
    config.mediumDays = medium
    config.highDays = high
    // notifications and theme
    config.notifications = !!(configForm.elements['notifications'] && configForm.elements['notifications'].checked)
    config.theme = (configForm.elements['lightTheme'] && configForm.elements['lightTheme'].checked) ? 'light' : 'dark'
    saveConfig()
    closeConfig()
    render()
    applyTheme()
    showToast('Configuración guardada', 'success')
    // if notifications enabled, request permission
    if(config.notifications && typeof Notification !== 'undefined' && Notification.permission !== 'granted'){
      Notification.requestPermission().then(p=>{
        if(p==='granted') showToast('Notificaciones habilitadas', 'success')
        else showToast('Permiso de notificaciones denegado', 'error')
      })
    }
  }

  function onCreateTask(e){
    e.preventDefault()
    const title = form.elements['title'].value.trim()
    if(!title) return
    // Prevent duplicate titles (case-insensitive). If editing, allow same title for same task.
    const titleKey = title.toLowerCase()
    const existingId = form.elements['id'].value || null
    const duplicate = tasks.find(t => t.title && t.title.trim().toLowerCase() === titleKey)
    if(duplicate && (!existingId || duplicate.id !== existingId)){
      showToast('Ya existe una tarea con ese título. Elige otro título.', 'error')
      return
    }
    const description = form.elements['description'].value.trim()
    const dueDate = form.elements['dueDate'].value
    const dueTime = form.elements['dueTime'].value
    // Compose due: if no date -> null. If date but no time -> default 16:00
    let due = null
    if(dueDate){
      const time = dueTime || '16:00'
      // combine into yyyy-mm-ddTHH:MM
      const combined = `${dueDate}T${time}`
      const d = new Date(combined)
      if(!isNaN(d.getTime())) due = d.toISOString()
    }
    const priority = Number(form.elements['priority'].value) || 0
    // parse tags from CSV input
    const tagsRaw = (form.elements['tags'] && form.elements['tags'].value) || ''
    const tags = tagsRaw.split(',').map(s=>s.trim()).filter(Boolean)
    // parse subtasks from textarea (one per line)
    const subtasksRaw = (form.elements['subtasks'] && form.elements['subtasks'].value) || ''
    const subtasks = subtasksRaw.split('\n').map(s=>s.trim()).filter(Boolean).map(s=> ({ title: s, done: false }))
    const recurrence = (form.elements['recurrence'] && form.elements['recurrence'].value) || 'none'

    if(existingId){
      // edit existing task
      const idx = tasks.findIndex(t=>t.id===existingId)
      if(idx>=0){
        tasks[idx].title = title
        tasks[idx].description = description
        tasks[idx].due = due
        tasks[idx].priority = priority
        tasks[idx].tags = tags
        tasks[idx].subtasks = subtasks
        tasks[idx].recurrence = recurrence
        // keep orderIndex and createdAt
      }
    }else{
      const id = 't_'+Date.now()
      const orderIndex = tasks.length? Math.max(...tasks.map(t=>t.orderIndex))+1 : 0
      const task = { id, title, description, due, priority, tags, subtasks, recurrence, createdAt: new Date().toISOString(), orderIndex }
      tasks.push(task)
    }

    saveTasks(); render(); closeModal()
    showToast(existingId? 'Tarea actualizada' : 'Tarea creada', 'success')
  }

  // Persistence
  function loadTasks(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY)
      const arr = raw? JSON.parse(raw) : []
      // normalize fields to avoid type bugs
      return arr.map(t=> ({
        ...t,
        priority: Number(t.priority) || 0,
        orderIndex: typeof t.orderIndex==='number'? t.orderIndex : 0,
        tags: Array.isArray(t.tags)? t.tags : (t.tags? String(t.tags).split(',').map(s=>s.trim()).filter(Boolean):[]),
        subtasks: Array.isArray(t.subtasks)? t.subtasks : (t.subtasks? Array.isArray(t.subtasks)? t.subtasks : String(t.subtasks).split('\n').map(s=>s.trim()).filter(Boolean).map(s=>({title:s,done:false})):[]),
        recurrence: t.recurrence || 'none',
        notifiedAt: t.notifiedAt || null
      }))
    }catch(e){ console.error('load tasks',e); return [] }
  }
  function loadCompletedTasks(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY+':completed')
      const arr = raw? JSON.parse(raw) : []
      return arr.map(t=> ({
        ...t,
        completedAt: t.completedAt || new Date().toISOString()
      }))
    }catch(e){ return [] }
  }
  function saveCompletedTasks(){ localStorage.setItem(STORAGE_KEY+':completed', JSON.stringify(completedTasks)) }
  function saveTasks(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)) }
  function loadConfig(){
    try{
      const raw = localStorage.getItem(CONFIG_KEY)
      return raw? Object.assign({}, DEFAULT_CONFIG, JSON.parse(raw)) : DEFAULT_CONFIG
    }catch(e){ return DEFAULT_CONFIG }
  }
  function saveConfig(){ localStorage.setItem(CONFIG_KEY, JSON.stringify(config)) }

  // Toast helper
  // showToast supports optional undo/action button: showToast(msg, type, ttl, actionLabel, actionFn)
  function showToast(message, type='info', ttl=3500, actionLabel, actionFn){
    const container = document.getElementById('toasts')
    if(!container) return
    const t = document.createElement('div')
    t.className = 'toast ' + (type||'')
    t.innerHTML = `<div class="msg">${message}</div>`
    if(actionLabel && typeof actionFn === 'function'){
      const btn = document.createElement('button')
      btn.textContent = actionLabel
      btn.style.marginLeft = '8px'
      btn.style.background = 'transparent'
      btn.style.border = '1px solid rgba(255,255,255,0.06)'
      btn.style.padding = '4px 8px'
      btn.style.borderRadius = '8px'
      btn.style.cursor = 'pointer'
      btn.addEventListener('click', ()=>{
        try{ actionFn() }catch(e){ console.error(e) }
        // remove toast immediately
        if(t.parentNode) t.parentNode.removeChild(t)
      })
      t.appendChild(btn)
    }
    container.appendChild(t)
    const remover = setTimeout(()=>{
      t.style.transition='opacity 260ms ease, transform 260ms ease'
      t.style.opacity='0'
      t.style.transform='translateY(8px)'
      setTimeout(()=> { if(t.parentNode) t.parentNode.removeChild(t) }, 300)
    }, ttl)
    return ()=>{ clearTimeout(remover); if(t.parentNode) t.parentNode.removeChild(t) }
  }

  // Export / Import helpers
  function exportData(){
    const payload = { tasks, config, completedTasks, exportedAt: new Date().toISOString() }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vibe-tasks-export-${new Date().toISOString().slice(0,10)}.json`
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    showToast('Exportado JSON listo', 'success')
  }

  function handleImportFile(e){
    const f = e.target.files && e.target.files[0]
    if(!f) return
    const reader = new FileReader()
    reader.onload = ()=>{
      try{
        const data = JSON.parse(reader.result)
        if(!data.tasks) throw new Error('Formato inválido')
        // basic validation
        if(!Array.isArray(data.tasks)) throw new Error('Formato inválido: tasks debe ser array')
  // merge or replace? we'll replace in this implementation
  tasks = (data.tasks||[]).map((t,i)=> ({...t, priority: Number(t.priority)||0, orderIndex: typeof t.orderIndex==='number'? t.orderIndex:i, tags: t.tags||[], subtasks: t.subtasks||[], recurrence: t.recurrence||'none'}))
  completedTasks = (data.completedTasks||[]).map(t=> ({...t, completedAt: t.completedAt||new Date().toISOString()}))
  config = Object.assign({}, DEFAULT_CONFIG, data.config||config)
        saveTasks(); saveConfig(); render(); showToast('Importación completada', 'success')
      }catch(err){ showToast('Error al importar: '+err.message, 'error') }
    }
    reader.readAsText(f)
    importFile.value = ''
  }

  // Priority computation (0 low green, 1 medium orange, 2 high red)
  function computedPriority(task){
    // If no due date, use the saved priority
    const base = Number(task.priority) || 0
    if(!task.due) return base

    const now = Date.now()
    const due = new Date(task.due).getTime()
    const msLeft = due - now
    const daysLeft = msLeft / (1000*60*60*24)
    // Determine priority suggested by due date
    let duePrio = 0
    if(msLeft <= 0) duePrio = 2
    else if(daysLeft <= Number(config.highDays)) duePrio = 2
    else if(daysLeft <= Number(config.mediumDays)) duePrio = 1
    else duePrio = 0

    // Do not decrease below the user's selected base priority; allow promotions only
    return Math.max(base, duePrio)
  }

  // Render
  function render(){
    // Build computed list and group by priority for visual dividers
    let withComputed = tasks.map(t=> ({...t, cprio: computedPriority(t)}))
    withComputed.sort((a,b)=> {
      if(a.cprio !== b.cprio) return b.cprio - a.cprio
      return (a.orderIndex||0) - (b.orderIndex||0)
    })

    // Apply search filter
    const q = searchInput && searchInput.value ? searchInput.value.trim().toLowerCase() : ''
    if(q){
      withComputed = withComputed.filter(t => {
        const title = (t.title||'').toLowerCase()
        const desc = (t.description||'').toLowerCase()
        return title.includes(q) || desc.includes(q)
      })
    }

    tasksListEl.innerHTML = ''

    // populate tag filter options
    if(tagFilter){
      const allTags = new Set()
      tasks.forEach(t=> (t.tags||[]).forEach(tag=> allTags.add(tag)))
      const prev = tagFilter.value || 'all'
      tagFilter.innerHTML = '<option value="all">Todas las etiquetas</option>'
      Array.from(allTags).sort().forEach(tag=>{
        const opt = document.createElement('option')
        opt.value = tag
        opt.textContent = tag
        tagFilter.appendChild(opt)
      })
      if(Array.from(tagFilter.options).some(o=>o.value===prev)) tagFilter.value = prev
    }

    // apply tag filtering if selected
    const tagSel = tagFilter && tagFilter.value && tagFilter.value !== 'all' ? tagFilter.value : null
    if(tagSel){
      withComputed = withComputed.filter(t=> (t.tags||[]).includes(tagSel))
    }

    const levels = [2,1,0]
    const labels = {2: 'Alta', 1: 'Media', 0: 'Baja'}

  levels.forEach(level => {
      const group = withComputed.filter(t => t.cprio === level)
      // divider (always render, even if group empty)
      const divider = document.createElement('div')
      divider.className = 'prio-divider'
      divider.dataset.prio = String(level)
      const dot = document.createElement('span')
      dot.className = 'dot ' + (level===2? 'red' : level===1? 'orange' : 'green')
      const lbl = document.createElement('span')
      lbl.className = 'divider-label'
      lbl.textContent = `${labels[level]} (${group.length})`
      divider.appendChild(dot)
      divider.appendChild(lbl)
      // make divider a drop target so user can drop between sections
      divider.addEventListener('dragover', dragOver)
      divider.addEventListener('dragleave', dragLeave)
      divider.addEventListener('drop', function(e){
        e.preventDefault(); this.classList.remove('drag-over')
        const fromId = dragId || (e.dataTransfer && e.dataTransfer.getData('text/plain'))
        if(!fromId) return
        const level = Number(this.dataset.prio)
        reorderTasksAtLevel(fromId, level)
      })
  tasksListEl.appendChild(divider)

      group.forEach((t, idx)=>{
        const el = renderTaskCard(t, idx)
        tasksListEl.appendChild(el)
      })
    })

  // set ARIA role for list
  tasksListEl.setAttribute('role','list')

    // show/hide calendar
    if(calendarEl){
      if(currentView==='calendar'){
        tasksListEl.classList.add('hidden')
        calendarEl.classList.remove('hidden')
        renderCalendar()
      }else{
        tasksListEl.classList.remove('hidden')
        calendarEl.classList.add('hidden')
      }
    }
  }

  // Calendar rendering
  function renderCalendar(){
    if(!calendarEl) return
    calendarEl.innerHTML = ''
    // header with month and controls
    const header = document.createElement('div'); header.className='cal-header'
    const title = document.createElement('div'); title.textContent = calendarDate.toLocaleString(undefined,{month:'long', year:'numeric'})
    const controls = document.createElement('div'); controls.className='cal-controls'
    const prev = document.createElement('button'); prev.className='btn'; prev.textContent='‹'
    const next = document.createElement('button'); next.className='btn'; next.textContent='›'
    prev.addEventListener('click', ()=>{ calendarDate.setMonth(calendarDate.getMonth()-1); renderCalendar() })
    next.addEventListener('click', ()=>{ calendarDate.setMonth(calendarDate.getMonth()+1); renderCalendar() })
    controls.appendChild(prev); controls.appendChild(next)
    header.appendChild(title); header.appendChild(controls)
    calendarEl.appendChild(header)

    const grid = document.createElement('div'); grid.className='cal-grid'
    // first day to show: start of week containing 1st of month
    const firstOfMonth = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1)
    const startDay = new Date(firstOfMonth)
    const weekday = startDay.getDay() // 0-6 Sun..Sat
    startDay.setDate(startDay.getDate() - weekday)
    // build 6 weeks (42 days)
    for(let i=0;i<42;i++){
      const d = new Date(startDay); d.setDate(startDay.getDate()+i)
      const cell = document.createElement('div'); cell.className='cal-cell'
      if(d.getMonth() !== calendarDate.getMonth()) cell.classList.add('other-month')
      cell.dataset.day = d.toISOString()
      const daynum = document.createElement('div'); daynum.className='cal-daynum'; daynum.textContent = d.getDate()
      cell.appendChild(daynum)

      // tasks for this day (match date part)
      const dayTasks = tasks.filter(t=> t.due && (new Date(t.due)).toDateString() === d.toDateString())
      dayTasks.forEach(t=>{
        const ct = document.createElement('div'); ct.className='cal-task'; ct.textContent = t.title
        ct.draggable = true
        ct.dataset.id = t.id
        // allow dragstart
        ct.addEventListener('dragstart', dragStart)
        cell.appendChild(ct)
      })

      // allow dropping tasks onto day cell
      cell.addEventListener('dragover', function(ev){ ev.preventDefault(); this.classList.add('drag-over') })
      cell.addEventListener('dragleave', function(ev){ this.classList.remove('drag-over') })
      cell.addEventListener('drop', function(ev){
        ev.preventDefault(); this.classList.remove('drag-over')
        const fromId = dragId || (ev.dataTransfer && ev.dataTransfer.getData('text/plain'))
        if(!fromId) return
        const dayIso = this.dataset.day
        // set time to existing task time or 16:00
        const existing = tasks.find(x=>x.id===fromId)
        let time = '16:00'
        if(existing && existing.due){ const ex = new Date(existing.due); time = `${String(ex.getHours()).padStart(2,'0')}:${String(ex.getMinutes()).padStart(2,'0')}` }
        const datePart = (new Date(dayIso)).toISOString().slice(0,10)
        const combined = datePart + 'T' + time
        const nd = new Date(combined)
        if(!isNaN(nd.getTime())){
          const t = tasks.find(x=>x.id===fromId)
          if(t){ t.due = nd.toISOString(); saveTasks(); render() }
        }
      })

      grid.appendChild(cell)
    }
    calendarEl.appendChild(grid)
  }

  // Statistics modal handling
  const btnStats = document.getElementById('btn-stats')
  const modalStats = document.getElementById('modal-stats')
  const btnStatsClose = document.getElementById('btn-stats-close')
  const btnExportCSV = document.getElementById('btn-export-csv')
  btnStats && btnStats.addEventListener('click', ()=>{ populateStats(); modalStats.classList.remove('hidden') })
  btnStatsClose && btnStatsClose.addEventListener('click', ()=> modalStats.classList.add('hidden'))
  btnExportCSV && btnExportCSV.addEventListener('click', exportStatsCSV)

  function populateStats(){
    const el = document.getElementById('stats-content')
    if(!el) return
    // compute stats
    const total = tasks.length + completedTasks.length
    const completed = completedTasks.length
    const active = tasks.length
    const byPriority = {0:0,1:0,2:0}
    tasks.forEach(t=> byPriority[computedPriority(t)]++)
    // average completion time (if createdAt and completedAt present)
    let avgMs = 0
    const diffs = completedTasks.map(c=>{
      if(c.createdAt && c.completedAt) return new Date(c.completedAt).getTime() - new Date(c.createdAt).getTime()
      return null
    }).filter(Boolean)
    if(diffs.length) avgMs = Math.round(diffs.reduce((a,b)=>a+b,0)/diffs.length)
    const avgDays = avgMs? Math.round(avgMs / (1000*60*60*24) * 10)/10 : 0
    // completed in last 7 days
    const weekAgo = Date.now() - 7*24*60*60*1000
    const recent = completedTasks.filter(c=> new Date(c.completedAt).getTime() >= weekAgo).length

    el.innerHTML = ''
    const rows = [
      {t:'Tareas totales', v: total},
      {t:'Tareas activas', v: active},
      {t:'Tareas completadas', v: completed},
      {t:'Completadas última semana', v: recent},
      {t:'Por prioridad - Alta', v: byPriority[2]},
      {t:'Por prioridad - Media', v: byPriority[1]},
      {t:'Por prioridad - Baja', v: byPriority[0]},
      {t:'Tiempo medio hasta completar (días)', v: avgDays}
    ]
    rows.forEach(r=>{
      const d = document.createElement('div'); d.className='stats-item'
      d.innerHTML = `<div class="stats-title">${r.t}</div><div class="stats-value">${r.v}</div>`
      el.appendChild(d)
    })
  }

  function exportStatsCSV(){
    // generate CSV of completedTasks
    const rows = [['id','title','createdAt','completedAt','priority','tags','durationDays']]
    completedTasks.forEach(c=>{
      const dur = (c.createdAt && c.completedAt)? ((new Date(c.completedAt).getTime()-new Date(c.createdAt).getTime())/(1000*60*60*24)).toFixed(2) : ''
      rows.push([c.id, '"'+String(c.title).replace(/"/g,'""')+'"', c.createdAt||'', c.completedAt||'', c.priority, '"'+(c.tags||[]).join(',')+'"', dur])
    })
    const csv = rows.map(r=> r.join(',')).join('\n')
    const blob = new Blob([csv], {type:'text/csv'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vibe-tasks-completed-${new Date().toISOString().slice(0,10)}.csv`
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    showToast('CSV exportado', 'success')
  }

  // Insert/move a task at the visual position corresponding to a priority level divider
  function reorderTasksAtLevel(fromId, level){
    // Build the same sorted view
    const view = tasks.map(t=> ({...t, cprio: computedPriority(t)}))
    view.sort((a,b)=> {
      if(a.cprio !== b.cprio) return b.cprio - a.cprio
      return (a.orderIndex||0) - (b.orderIndex||0)
    })
    const idList = view.map(t=>t.id)

    const fromPos = idList.indexOf(fromId)

    // insertion index is number of tasks with cprio > level (i.e., tasks of higher priority)
    let insertionIndex = view.filter(v => v.cprio > level).length

    // If moving from earlier in the list, removing it shifts the insertion index left
    if(fromPos >=0 && fromPos < insertionIndex){
      insertionIndex--
    }

    // Remove if exists
    if(fromPos >= 0){
      idList.splice(fromPos,1)
    }
    idList.splice(insertionIndex,0,fromId)

    // Update tasks' orderIndex according to new visual order
    idList.forEach((id,i)=>{
      const t = tasks.find(x=>x.id===id)
      if(t) t.orderIndex = i
    })

    // Set moved task priority to the divider level
    const movedTask = tasks.find(x=>x.id===fromId)
    if(movedTask){
      movedTask.priority = Number(level)
    }

    saveTasks(); render()
  }

  // Compute next due date based on recurrence rule: 'daily'|'weekly'|'monthly'
  function computeNextDue(iso, recurrence){
    try{
      const d = new Date(iso)
      if(isNaN(d.getTime())) return null
      if(recurrence === 'daily') d.setDate(d.getDate()+1)
      else if(recurrence === 'weekly') d.setDate(d.getDate()+7)
      else if(recurrence === 'monthly') d.setMonth(d.getMonth()+1)
      return d.toISOString()
    }catch(e){ return null }
  }

  function renderTaskCard(task, visibleIndex){
    const card = document.createElement('div')
    card.className = 'task-card'
    card.tabIndex = 0
    card.setAttribute('role','listitem')
    card.setAttribute('aria-grabbed','false')
    card.draggable = true
    card.dataset.id = task.id

    // left color bar: use priority classes; styles are in CSS and driven by variables
    const left = document.createElement('div')
    left.className = 'task-left'
    if(task.cprio === 2) left.classList.add('prio-high')
    else if(task.cprio === 1) left.classList.add('prio-medium')
    else left.classList.add('prio-low')

    const body = document.createElement('div')
    body.className = 'task-body'
    const h = document.createElement('h3'); h.className='task-title'; h.textContent = task.title
    const p = document.createElement('div'); p.className='task-desc'; p.textContent = task.description || ''

    const meta = document.createElement('div'); meta.className='task-meta'
    const due = document.createElement('span')
    due.innerHTML = task.due?'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 10V7M17 10V7M3 6H21M5 22H19C20.1046 22 21 21.1046 21 20V8C21 6.89543 20.1046 6 19 6H5C3.89543 6 3 6.89543 3 8V20C3 21.1046 3.89543 22 5 22Z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg> ' + (new Date(task.due)).toLocaleString() : 'Sin fecha'
    const prio = document.createElement('span')
    prio.innerHTML = task.cprio===2? '<span class="dot red"></span> Alta' : task.cprio===1? '<span class="dot orange"></span> Media' : '<span class="dot green"></span> Baja'

    // tags
    const tagsSpan = document.createElement('span')
    ;(task.tags||[]).forEach(tag=>{
      const c = document.createElement('span')
      c.className = 'tag-chip' + (document.body.classList.contains('light-theme')? ' light':'')
      c.textContent = tag
      tagsSpan.appendChild(c)
    })

    meta.appendChild(due); meta.appendChild(prio); meta.appendChild(tagsSpan)

    // subtasks list and progress
    const subtWrap = document.createElement('div')
    subtWrap.className = 'subtasks'
    const total = (task.subtasks || []).length
    let doneCount = (task.subtasks || []).filter(s=>s.done).length
    if(total>0){
      (task.subtasks||[]).forEach((s,si)=>{
        const it = document.createElement('label')
        it.className = 'subtask-item'
        const cb = document.createElement('input')
        cb.type = 'checkbox'
        cb.checked = !!s.done
        cb.addEventListener('change', ()=>{
          // toggle
          const real = tasks.find(x=>x.id===task.id)
          if(!real) return
          real.subtasks = real.subtasks || []
          real.subtasks[si] = real.subtasks[si] || {title:s.title, done:false}
          real.subtasks[si].done = cb.checked
          saveTasks(); render()
        })
        const span = document.createElement('span')
        span.textContent = s.title
        it.appendChild(cb); it.appendChild(span)
        subtWrap.appendChild(it)
      })

      const prog = document.createElement('div')
      prog.className = 'subtask-progress'
      const bar = document.createElement('i')
      const pct = Math.round((doneCount/total)*100)
      bar.style.width = pct + '%'
      prog.appendChild(bar)
      subtWrap.appendChild(prog)
    }

  const actions = document.createElement('div'); actions.className='task-actions'
  const editBtn = document.createElement('button'); editBtn.className='btn'; editBtn.textContent='Editar'
  editBtn.addEventListener('click', ()=> openEdit(task.id))
  const done = document.createElement('button'); done.className='btn'; done.textContent='Marcar como realizada'
  done.addEventListener('click', ()=>{ markDone(task.id) })
  actions.appendChild(editBtn)
  actions.appendChild(done)

  body.appendChild(h);
  body.appendChild(p);
  // subtasks (if any) should be visible in the card body
  body.appendChild(subtWrap)
  body.appendChild(meta)

    card.appendChild(left); card.appendChild(body); card.appendChild(actions)

    // drag events
    card.addEventListener('dragstart', dragStart)
    card.addEventListener('dragover', dragOver)
    card.addEventListener('dragleave', dragLeave)
    card.addEventListener('drop', drop)
    card.addEventListener('dragend', dragEnd)
    // keyboard accessibility: Enter -> edit, Space -> toggle complete, ArrowUp/ArrowDown -> move
    card.addEventListener('keydown', function(e){
      if(e.key === 'Enter') { openEdit(task.id); e.preventDefault(); }
      else if(e.key === ' ') { markDone(task.id); e.preventDefault(); }
      else if(e.key === 'ArrowUp') { keyboardMove(task.id, -1); e.preventDefault(); }
      else if(e.key === 'ArrowDown') { keyboardMove(task.id, 1); e.preventDefault(); }
    })

    return card
  }

  // Helpers for edit
  function pad(n){ return n<10? '0'+n : String(n) }
  function formatDateInput(iso){
    const d = new Date(iso)
    if(isNaN(d.getTime())) return ''
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
  }
  function formatTimeInput(iso){
    const d = new Date(iso)
    if(isNaN(d.getTime())) return ''
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  function openEdit(id){
    const t = tasks.find(x=>x.id===id)
    if(!t) return
    form.elements['id'].value = t.id
    form.elements['title'].value = t.title
    form.elements['description'].value = t.description || ''
    // fill date/time
    if(t.due){
      form.elements['dueDate'].value = formatDateInput(t.due)
      form.elements['dueTime'].value = formatTimeInput(t.due)
    }else{
      form.elements['dueDate'].value = ''
      form.elements['dueTime'].value = ''
    }
    form.elements['priority'].value = String(Number(t.priority) || 0)
    // fill tags
    form.elements['tags'].value = (t.tags || []).join(', ')
    // fill subtasks (each on new line)
    if(form.elements['subtasks']){
      form.elements['subtasks'].value = (t.subtasks || []).map(s=> s.title + (s.done? ' [x]':'' )).join('\n')
    }
    // fill recurrence
    if(form.elements['recurrence']) form.elements['recurrence'].value = t.recurrence || 'none'
    submitBtn.textContent = 'Guardar cambios'
    modal.classList.remove('hidden')
  }

  // Drag & drop handlers
  let dragId = null
  function dragStart(e){
    dragId = this.dataset.id
    e.dataTransfer.effectAllowed = 'move'
    try{ e.dataTransfer.setData('text/plain', dragId) }catch(err){}
    this.classList.add('dragging')
  }
  function dragOver(e){
    e.preventDefault()
    if(this.classList.contains('drag-over')) return
    this.classList.add('drag-over')
  }
  function dragLeave(e){ this.classList.remove('drag-over') }
  function drop(e){
    e.preventDefault(); this.classList.remove('drag-over')
    const fromId = dragId || (e.dataTransfer && e.dataTransfer.getData('text/plain'))
    const toId = this.dataset.id
    if(!fromId || !toId || fromId===toId) return
    reorderTasksVisual(fromId, toId)
  }
  function dragEnd(e){ document.querySelectorAll('.drag-over').forEach(n=>n.classList.remove('drag-over')) }

  // Reorder using the visual order (what the user sees). This prevents inconsistencies
  // between the internal tasks array and the rendered sorted view.
  function reorderTasksVisual(fromId, toId){
    // Build the same sorted list used to render
    const view = tasks.map(t=> ({...t, cprio: computedPriority(t)}))
    view.sort((a,b)=> {
      if(a.cprio !== b.cprio) return b.cprio - a.cprio
      return (a.orderIndex||0) - (b.orderIndex||0)
    })

    const idList = view.map(t=>t.id)
    const fromPos = idList.indexOf(fromId)
    const toPos = idList.indexOf(toId)
    if(fromPos<0 || toPos<0) return

    // Remove from original visual position and insert at target visual position
    idList.splice(fromPos,1)
    idList.splice(toPos,0,fromId)

    // Update tasks' orderIndex according to new visual order
    idList.forEach((id,i)=>{
      const t = tasks.find(x=>x.id===id)
      if(t) t.orderIndex = i
    })

    // Determine priority adoption: find moved index and the element just below (index+1)
    const newIndex = idList.indexOf(fromId)
    let adoptPriority = null
    if(typeof newIndex === 'number'){
      const belowId = idList[newIndex+1]
      const aboveId = idList[newIndex-1]
      if(belowId){
        const below = view.find(x=>x.id===belowId)
        if(below) adoptPriority = below.cprio
      } else if(aboveId){
        const above = view.find(x=>x.id===aboveId)
        if(above) adoptPriority = above.cprio
      }
    }

    if(adoptPriority !== null){
      const movedTask = tasks.find(x=>x.id===fromId)
      if(movedTask){
        movedTask.priority = Number(adoptPriority)
      }
    }

    saveTasks(); render()
  }

  // Keyboard move: shift task up (-1) or down (+1) within visual list
  function keyboardMove(id, dir){
    const view = tasks.map(t=> ({...t, cprio: computedPriority(t)}))
    view.sort((a,b)=> {
      if(a.cprio !== b.cprio) return b.cprio - a.cprio
      return (a.orderIndex||0) - (b.orderIndex||0)
    })
    const idList = view.map(t=>t.id)
    const pos = idList.indexOf(id)
    if(pos<0) return
    const newPos = Math.max(0, Math.min(idList.length-1, pos + dir))
    if(newPos===pos) return
    // move id within idList
    idList.splice(pos,1)
    idList.splice(newPos,0,id)
    // write back orderIndex
    idList.forEach((tid,i)=>{ const t = tasks.find(x=>x.id===tid); if(t) t.orderIndex = i })
    saveTasks(); render()
  }

  function markDone(id){
    // find and remove, but keep for undo; handle recurrence
    const idx = tasks.findIndex(t=>t.id===id)
    if(idx<0) return
    const [removed] = tasks.splice(idx,1)

    // record as completed with timestamp
    const completed = {...removed, completedAt: new Date().toISOString()}
    completedTasks.push(completed)
    saveCompletedTasks()

    // if recurrence set, create next instance
    let createdId = null
    if(removed.recurrence && removed.recurrence !== 'none' && removed.due){
      const nextDue = computeNextDue(removed.due, removed.recurrence)
      if(nextDue){
        const nid = 't_'+Date.now()+'r'
        const newTask = {...removed, id: nid, due: nextDue, createdAt: new Date().toISOString()}
        // ensure orderIndex appended to end
        newTask.orderIndex = tasks.length? Math.max(...tasks.map(t=>t.orderIndex))+1 : 0
        tasks.push(newTask)
        createdId = nid
      }
    }

    saveTasks(); render()
    // provide undo: will restore removed and remove created recurrence if any, and remove from completedTasks
    showToast('Tarea completada', 'info', 8000, 'Deshacer', ()=>{
      // remove created recurrence if exists
      if(createdId){
        const ci = tasks.findIndex(t=>t.id===createdId)
        if(ci>=0) tasks.splice(ci,1)
      }
      // reinsert removed at original position
      const insertion = Math.min(removed.orderIndex || tasks.length, tasks.length)
      tasks.splice(insertion,0,removed)
      // remove from completedTasks
      const compIdx = completedTasks.findIndex(c=>c.id===removed.id && c.completedAt)
      if(compIdx>=0) completedTasks.splice(compIdx,1)
      // recompute orderIndex
      tasks.forEach((t,i)=> t.orderIndex = i)
      saveTasks(); saveCompletedTasks(); render(); showToast('Completado deshecho', 'success')
    })
  }

  // Periodic promotion check — every minute
  setInterval(()=>{
    // Only need re-render because computedPriority uses config and due dates
    render()
  }, 60*1000)

  // Notifications: check every minute for tasks due soon
  function checkNotifications(){
    if(!config.notifications) return
    if(typeof Notification === 'undefined') return
    if(Notification.permission !== 'granted') return
    const now = Date.now()
    const horizon = 60 * 60 * 1000 // 1 hour
    let changed = false
    tasks.forEach(t=>{
      if(!t.due) return
      const msLeft = new Date(t.due).getTime() - now
      if(msLeft > 0 && msLeft <= horizon){
        // not already notified recently
        if(!t.notifiedAt || (now - t.notifiedAt) > horizon){
          try{
            new Notification(t.title || 'Tarea', {body: t.description || 'Tiene una entrega próxima'})
            t.notifiedAt = now
            changed = true
          }catch(e){ console.warn('notify', e) }
        }
      }
    })
    if(changed) saveTasks()
  }
  setInterval(checkNotifications, 60*1000)
  // also run once on load
  setTimeout(checkNotifications, 2000)

  // initial render
  render()
  // expose for debugging
  window.VibeTasks = { tasks, config, saveTasks, saveConfig }

})();
