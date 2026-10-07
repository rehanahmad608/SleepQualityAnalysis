export interface UnitsLabelProps {
  units: string;
  className?: string;
}

export default function UnitsLabel({ units, className = '' }: UnitsLabelProps) {
  return (
    <span className={`metric-units ${className}`.trim()} aria-label={`Units: ${units}`}>
      {units}
    </span>
  );
}
