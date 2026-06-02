import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Link as LinkIcon, Search } from 'lucide-react';

export type LogoOption = {
  name: string;
  url: string;
};

type Props = {
  label: string;
  options: LogoOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

const isRemoteUrl = (value: string) => /^https?:\/\//i.test(value);

export default function LogoSelectField({
  label,
  options,
  value,
  onChange,
  placeholder = 'Search logo...',
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  const selectedOption = useMemo(
    () => options.find(option => option.url === value) || null,
    [options, value]
  );

  useEffect(() => {
    setUseCustom(Boolean(value) && !selectedOption && isRemoteUrl(value));
  }, [selectedOption, value]);

  const filteredOptions = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return options;
    return options.filter(option => option.name.toLowerCase().includes(term));
  }, [options, search]);

  return (
    <div>
      <label className="block text-xs font-bold uppercase text-slate-400 mb-1">{label}</label>
      <div className="space-y-2">
        <button
          type="button"
          className="w-full p-2 border border-slate-300 rounded-lg bg-slate-50 text-left flex items-center justify-between gap-2"
          onClick={() => setIsOpen(open => !open)}
        >
          <span className="truncate text-sm text-slate-700">
            {selectedOption?.name || (value ? 'Custom URL selected' : 'Choose from saved logos...')}
          </span>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div className="border border-slate-200 rounded-lg bg-white shadow-sm p-2 space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                className="w-full p-2 pl-8 border border-slate-300 rounded-lg text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={placeholder}
              />
            </div>
            <div className="max-h-44 overflow-y-auto border border-slate-100 rounded-lg">
              {filteredOptions.length > 0 ? filteredOptions.map(option => (
                <button
                  key={`${option.name}-${option.url}`}
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 border-b border-slate-50 last:border-b-0"
                  onClick={() => {
                    onChange(option.url);
                    setUseCustom(false);
                    setIsOpen(false);
                    setSearch('');
                  }}
                >
                  {option.name}
                </button>
              )) : (
                <div className="px-3 py-2 text-sm text-slate-500">No saved logos found</div>
              )}
            </div>
            <button
              type="button"
              className="text-sm text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-2"
              onClick={() => setUseCustom(custom => !custom)}
            >
              <LinkIcon className="w-4 h-4" />
              {useCustom ? 'Hide custom URL field' : 'Use a custom logo link instead'}
            </button>
          </div>
        )}

        {(useCustom || (value && !selectedOption)) && (
          <input
            type="text"
            className="w-full p-2 border border-slate-300 rounded-lg text-sm"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://..."
          />
        )}
      </div>
    </div>
  );
}
