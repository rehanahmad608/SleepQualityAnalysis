import { useStudy } from '../../api/hooks';
import { getStudyDates, isWithinStudy } from '../../utils/time';
import { formatStudyDateLabel } from '../../utils/format';

export interface DatePickerProps {
  value: string;
  onChange: (date: string) => void;
  id?: string;
  label?: string;
  className?: string;
}

export default function DatePicker({
  value,
  onChange,
  id = 'date-select',
  label = 'Select date',
  className = '',
}: DatePickerProps) {
  const { data: study } = useStudy();

  const dates = study ? getStudyDates(study.start_date, study.days_total) : [];

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="field-label">
          {label}
        </label>
      )}
      <select
        id={id}
        className="select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      >
        {dates.length === 0 && <option value="">Loading study dates…</option>}
        {dates.map((d, idx) => {
          const outOfRange = study ? !isWithinStudy(d, study) : false;
          return (
            <option key={d} value={d} disabled={outOfRange}>
              {formatStudyDateLabel(d, idx + 1)}
              {outOfRange ? ' (outside study)' : ''}
            </option>
          );
        })}
      </select>
    </div>
  );
}
