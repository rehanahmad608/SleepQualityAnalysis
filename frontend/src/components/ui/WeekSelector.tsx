export interface WeekSelectorProps {
  value: 1 | 2;
  onChange: (week: 1 | 2) => void;
  id?: string;
}

export default function WeekSelector({ value, onChange, id = 'week-selector' }: WeekSelectorProps) {
  return (
    <div className="tab-list" role="tablist" aria-label="Week selector">
      <button
        type="button"
        role="tab"
        id={`${id}-w1`}
        aria-selected={value === 1}
        className={`tab-btn ${value === 1 ? 'active' : ''}`}
        onClick={() => onChange(1)}
      >
        Week 1 (Days 1–7)
      </button>
      <button
        type="button"
        role="tab"
        id={`${id}-w2`}
        aria-selected={value === 2}
        className={`tab-btn ${value === 2 ? 'active' : ''}`}
        onClick={() => onChange(2)}
      >
        Week 2 (Days 8–14)
      </button>
    </div>
  );
}
