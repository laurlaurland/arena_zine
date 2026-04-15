import { useState } from 'react';
import { useZineStore } from '../../store/useZineStore';
import PageSizeSelector from './PageSizeSelector';
import { exportPDF } from '../../lib/exportPDF';

export default function Toolbar() {
  const { document: doc, setDocumentTitle } = useZineStore();
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      await exportPDF(doc);
    } catch (e) {
      console.error('PDF export failed:', e);
      alert('Export failed. See console for details.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <header className="flex items-center justify-between px-4 py-2 bg-white border-b border-stone-200 shrink-0">
      <div className="flex items-center gap-3">
        <input
          value={doc.title}
          onChange={(e) => setDocumentTitle(e.target.value)}
          className="text-sm font-medium text-stone-900 bg-transparent border-b border-transparent hover:border-stone-300 focus:border-stone-500 outline-none px-1 py-0.5 w-48"
          aria-label="Document title"
        />
      </div>

      <div className="flex items-center gap-4">
        <PageSizeSelector />
        <button
          onClick={handleExport}
          disabled={exporting}
          className="bg-stone-900 text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-stone-700 disabled:opacity-40 transition-colors"
        >
          {exporting ? 'Exporting…' : 'Export PDF'}
        </button>
      </div>
    </header>
  );
}
