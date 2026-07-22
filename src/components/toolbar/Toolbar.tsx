import { useState } from 'react';
import { useZineStore } from '../../store/useZineStore';
import PageSizeSelector from './PageSizeSelector';

export default function Toolbar() {
  const { document: doc, setDocumentTitle } = useZineStore();
  const [exporting, setExporting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const hasRiso = doc.pages.some((p) => p.blocks.some((b) => b.riso));

  async function runExport(kind: 'composite' | 'separations') {
    setMenuOpen(false);
    setExporting(true);
    try {
      // Lazy-load so @react-pdf/renderer stays out of the main bundle
      const mod = await import('../../lib/exportPDF');
      if (kind === 'composite') {
        await mod.exportPDF(doc);
      } else {
        await mod.exportRisoSeparations(doc);
      }
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
        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            disabled={exporting}
            className="bg-stone-900 text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-stone-700 disabled:opacity-40 transition-colors"
          >
            {exporting ? 'Exporting…' : 'Export ▾'}
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 w-48 bg-white border border-stone-200 rounded-lg shadow-lg py-1">
                <MenuItem onClick={() => runExport('composite')}>Composite PDF</MenuItem>
                <MenuItem
                  onClick={() => runExport('separations')}
                  disabled={!hasRiso}
                  title={
                    hasRiso
                      ? 'One grayscale PDF per ink, plus a key layer'
                      : 'Add a riso effect to a block first'
                  }
                >
                  Riso separations
                </MenuItem>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function MenuItem({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="w-full text-left px-3 py-1.5 text-sm text-stone-800 hover:bg-stone-100 disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
