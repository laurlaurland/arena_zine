import { PAGE_SIZES } from '../../lib/pageSizes';
import { useZineStore } from '../../store/useZineStore';
import type { PageSizeKey } from '../../types/zine';

export default function PageSizeSelector() {
  const { document: doc, setPageSize } = useZineStore();

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-stone-500">Page size</label>
      <select
        value={doc.pageSize}
        onChange={(e) => setPageSize(e.target.value as PageSizeKey)}
        className="border border-stone-300 rounded-md px-2 py-1 text-xs bg-white outline-none focus:border-stone-500"
      >
        {Object.values(PAGE_SIZES).map((ps) => (
          <option key={ps.key} value={ps.key}>
            {ps.label}
          </option>
        ))}
      </select>
    </div>
  );
}
