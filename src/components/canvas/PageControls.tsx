import { useZineStore } from '../../store/useZineStore';

export default function PageControls() {
  const { document: doc, addPage, removePage } = useZineStore();

  return (
    <div className="flex items-center gap-2 mb-6">
      <button
        onClick={addPage}
        className="text-sm bg-white border border-stone-300 rounded-lg px-3 py-1.5 hover:bg-stone-50 text-stone-700 transition-colors"
      >
        + Add page
      </button>
      {doc.pages.length > 1 && (
        <button
          onClick={() => removePage(doc.pages[doc.pages.length - 1].id)}
          className="text-sm bg-white border border-stone-300 rounded-lg px-3 py-1.5 hover:bg-red-50 hover:border-red-300 text-stone-500 hover:text-red-600 transition-colors"
        >
          Remove last
        </button>
      )}
      <span className="text-xs text-stone-400 ml-2">
        {doc.pages.length} page{doc.pages.length !== 1 ? 's' : ''}
      </span>
    </div>
  );
}
