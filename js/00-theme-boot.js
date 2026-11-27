/* Define o tema antes da renderização para evitar o flash entre temas. */
try {
  document.documentElement.dataset.theme = localStorage.getItem('npi-frota-tema') || 'dark';
} catch (error) {
  document.documentElement.dataset.theme = 'dark';
}
