/* NPI FROTA | Exportação de dados em CSV.
   Arquivo carregado pelo index.html na ordem definida em ESTRUTURA_CODIGO.txt. */

/* =====================================================================
   9. EXPORTAR CSV (abre no Excel, separador ";")
   ===================================================================== */

function exportCsv(source) {
  const labels = fields[source] || [];
  const records = recordsOf(source);
  if (!records.length) { toast('Nenhum registro para exportar.'); return; }

  const quote = value => '"' + String(value ?? '').replace(/"/g, '""') + '"';
  const lines = [
    labels.map(quote).join(';'),
    ...records.map(r => labels.map(l => quote(r[l])).join(';'))
  ];
  const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `npi-frota-${source}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 500);
  toast('CSV exportado.');
}

