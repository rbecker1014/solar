// tabs/settings.js
export async function mount(root, ctx){
  const { state, loadData } = ctx;
  root.innerHTML = `
    <section class="space-y-3">
      <div class="card">
        <h2 class="font-semibold mb-2">Settings</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
           <label class="block"><span class="text-sm text-gray-700">Start date</span><input id="startDate" type="date" class="input" value="${state.startDate}"/></label>
          <label class="block"><span class="text-sm text-gray-700">End date</span><input id="endDate" type="date" class="input" value="${state.endDate}"/></label>
          <label class="block"><span class="text-sm text-gray-700">Import $/kWh</span><input id="importRate" type="number" step="0.0001" class="input" value="${state.importRate}"/></label>
          <label class="block"><span class="text-sm text-gray-700">Export $/kWh</span><input id="exportRate" type="number" step="0.0001" class="input" value="${state.exportRate}"/></label>
          <div class="flex gap-2 col-span-full">
            <button id="applyBtn" class="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm">Apply</button>
            <button id="clearBtn" class="px-3 py-1.5 rounded-lg bg-gray-100 text-sm">Clear</button>
           </div>
        </div>
      </div>
    </section>
  `;
  document.getElementById('applyBtn').addEventListener('click', async ()=>{
        state.startDate = document.getElementById('startDate').value.trim();
    state.endDate = document.getElementById('endDate').value.trim();
    state.importRate = Number(document.getElementById('importRate').value);
    state.exportRate = Number(document.getElementById('exportRate').value);
    await loadData();
    window.__showTab('kpi');
  });
  document.getElementById('clearBtn').addEventListener('click', async ()=>{
    state.startDate = ""; state.endDate = "";
    await loadData(); window.__showTab('kpi');
  });
}
